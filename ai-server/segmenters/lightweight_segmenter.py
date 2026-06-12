import json
import re
from os import getenv
from pathlib import Path
from time import perf_counter

from PIL import Image

from .base import BaseSegmenter, SegmentInput, SegmentResult
from .onnx_utils import (
    MIN_UNPROMPTED_FOREGROUND_RATIO,
    MissingOnnxDependency,
    OnnxSegmentationError,
    get_last_mask_diagnostics,
    get_last_onnx_timings,
    record_postprocess_diagnostics,
    run_onnx_segmentation,
)
from .postprocess import encode_mask_png, normalize_roi, postprocess_mask


MIN_PROMPT_FOREGROUND_RATIO = 0.08
MIN_UNPROMPTED_RELAXED_FOREGROUND_RATIO = 0.04
MIN_BBOX_EDGE_RATIO = 0.08
MIN_REASONABLE_BBOX_AREA_RATIO = 0.035
MIN_REASONABLE_BBOX_WIDTH_RATIO = 0.12
MIN_REASONABLE_BBOX_HEIGHT_RATIO = 0.20
DEFAULT_ROI_FIRST_PADDING_RATIO = 0.08
MIN_ROI_FIRST_PADDING_PX = 32
AI_SERVER_ROOT = Path(__file__).resolve().parents[1]


def _is_env_enabled(name: str, default_value: bool = True) -> bool:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def _sanitize_debug_file_part(value: str | None, fallback: str = "unknown") -> str:
    if not value:
        return fallback

    sanitized = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip()).strip("-")

    return sanitized or fallback


def _get_debug_mask_stats(mask):
    alpha_mask = mask.convert("L")
    image_width, image_height = alpha_mask.size
    pixel_count = max(1, image_width * image_height)
    histogram = alpha_mask.histogram()
    foreground_pixels = sum(histogram[1:])
    bbox = alpha_mask.getbbox()

    return {
        "bbox": (
            {
                "height": bbox[3] - bbox[1],
                "width": bbox[2] - bbox[0],
                "x": bbox[0],
                "y": bbox[1],
            }
            if bbox
            else None
        ),
        "foregroundRatio": foreground_pixels / pixel_count,
        "maskHeight": image_height,
        "maskWidth": image_width,
    }


def _read_float_env(name: str, default_value: float) -> float:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    try:
        return float(raw_value)
    except ValueError:
        return default_value


def _expand_roi_for_inference(roi: dict[str, int], image_width: int, image_height: int) -> dict[str, int]:
    padding_ratio = max(
        0.0,
        _read_float_env("AI_MASK_ROI_PADDING_RATIO", DEFAULT_ROI_FIRST_PADDING_RATIO),
    )
    padding = max(
        MIN_ROI_FIRST_PADDING_PX,
        int(round(max(roi["width"], roi["height"]) * padding_ratio)),
    )
    left = max(0, roi["x"] - padding)
    top = max(0, roi["y"] - padding)
    right = min(image_width, roi["x"] + roi["width"] + padding)
    bottom = min(image_height, roi["y"] + roi["height"] + padding)

    return {
        "height": max(1, bottom - top),
        "width": max(1, right - left),
        "x": left,
        "y": top,
    }


def _debug_mask_to_rgba(mask: Image.Image) -> Image.Image:
    alpha_mask = mask.convert("L")
    transparent_background = Image.new("RGBA", alpha_mask.size, (0, 0, 0, 0))
    white_foreground = Image.new("RGBA", alpha_mask.size, (255, 255, 255, 255))

    return Image.composite(white_foreground, transparent_background, alpha_mask)


def _save_api_crop_debug_image(
    image: Image.Image,
    segment_input: SegmentInput,
    inference_roi: dict[str, int],
) -> None:
    if not _is_env_enabled("AI_DEBUG_SAVE_MASKS", True):
        return

    try:
        sample_id = _sanitize_debug_file_part(segment_input.sample_id)
        debug_dir = AI_SERVER_ROOT / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        crop_path = debug_dir / f"api-input-target-crop-{sample_id}.png"
        image.convert("RGBA").save(crop_path, format="PNG")
        print(
            f"[ai-server] debug save target crop sampleId={segment_input.sample_id or '-'} "
            f"roi={inference_roi} path={crop_path}",
            flush=True,
        )
    except Exception:
        return


def _save_api_crop_mask_debug_image(
    mask: Image.Image,
    segment_input: SegmentInput,
    inference_roi: dict[str, int],
) -> None:
    if not _is_env_enabled("AI_DEBUG_SAVE_MASKS", True):
        return

    try:
        sample_id = _sanitize_debug_file_part(segment_input.sample_id)
        debug_dir = AI_SERVER_ROOT / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        mask_path = debug_dir / f"api-return-target-crop-mask-{sample_id}.png"
        _debug_mask_to_rgba(mask).save(mask_path, format="PNG")
        print(
            f"[ai-server] debug save target crop mask sampleId={segment_input.sample_id or '-'} "
            f"roi={inference_roi} path={mask_path}",
            flush=True,
        )
    except Exception:
        return


def _paste_crop_mask_to_full_image(
    crop_mask: Image.Image,
    image_width: int,
    image_height: int,
    inference_roi: dict[str, int],
) -> Image.Image:
    resized_crop_mask = crop_mask.convert("L")

    if resized_crop_mask.size != (inference_roi["width"], inference_roi["height"]):
        resized_crop_mask = resized_crop_mask.resize(
            (inference_roi["width"], inference_roi["height"]),
            Image.Resampling.BILINEAR,
        )

    full_mask = Image.new("L", (image_width, image_height), 0)
    full_mask.paste(resized_crop_mask, (inference_roi["x"], inference_roi["y"]))

    return full_mask


def _save_api_return_debug_mask(
    mask,
    segment_input: SegmentInput,
    message: str,
    success: bool,
    quality: str | None = None,
    extra_debug: dict[str, object] | None = None,
) -> None:
    if not _is_env_enabled("AI_DEBUG_SAVE_MASKS", True):
        return

    try:
        role = "reference" if segment_input.debug_role == "reference" else "target"
        sample_id = _sanitize_debug_file_part(segment_input.sample_id)
        file_stem = (
            "api-return-reference-mask"
            if role == "reference"
            else f"api-return-target-mask-{sample_id}"
        )
        debug_dir = AI_SERVER_ROOT / "debug"
        alpha_mask = mask.convert("L")
        rgba_mask = _debug_mask_to_rgba(alpha_mask)
        stats = _get_debug_mask_stats(alpha_mask)
        input_width, input_height = segment_input.image.size
        diagnostics = get_last_mask_diagnostics()
        candidate_diagnostics = diagnostics.get("candidateDiagnostics")
        selected_candidate = diagnostics.get("selectedCandidate") or {}
        selected_reason = diagnostics.get("selectedReason") if selected_candidate else None
        debug_payload = {
            "bbox": stats["bbox"],
            "candidateDiagnostics": candidate_diagnostics,
            "foregroundRatio": stats["foregroundRatio"],
            "finalQuality": quality or ("ok" if success else "failed"),
            "imageHeight": segment_input.image_height or input_height,
            "imageWidth": segment_input.image_width or input_width,
            "labels": getenv("AI_LIGHTWEIGHT_CLOTHING_LABELS", "4,5,6,7"),
            "maskDiagnostics": diagnostics,
            "message": message,
            "maskHeight": stats["maskHeight"],
            "maskWidth": stats["maskWidth"],
            "quality": quality,
            "role": role,
            "promptBox": segment_input.prompt_box,
            "roi": segment_input.roi,
            "sampleId": segment_input.sample_id,
            "selectedGamma": selected_candidate.get("gamma"),
            "selectedReason": selected_reason,
            "selectedScore": selected_candidate.get("score"),
            "selectedThreshold": selected_candidate.get("threshold"),
            "success": success,
        }
        if extra_debug:
            debug_payload.update(extra_debug)

        debug_dir.mkdir(parents=True, exist_ok=True)
        mask_path = debug_dir / f"{file_stem}.png"
        json_path = debug_dir / f"{file_stem}.json"
        rgba_mask.save(mask_path, format="PNG")

        with json_path.open("w", encoding="utf-8") as output_file:
            json.dump(debug_payload, output_file, ensure_ascii=False, indent=2, default=str)

        print(
            f"[ai-server] debug save role={role} sampleId={segment_input.sample_id or '-'} "
            f"success={success} quality={quality or '-'} path={mask_path}",
            flush=True,
        )
    except Exception:
        return


def _quality_failure(quality: str, message: str) -> dict[str, str]:
    return {
        "message": message,
        "quality": quality,
    }


def _mask_quality_error(
    mask,
    roi,
    prompt_box,
    debug_role: str | None = None,
    mask_diagnostics: dict[str, object] | None = None,
) -> dict[str, str] | None:
    alpha_mask = mask.convert("L")
    histogram = alpha_mask.histogram()
    foreground_pixels = sum(histogram[1:])
    image_width, image_height = alpha_mask.size
    image_area = max(1, image_width * image_height)
    normalized_roi = normalize_roi(roi or prompt_box, image_width, image_height)
    expected_area = (
        max(1, normalized_roi["width"] * normalized_roi["height"])
        if normalized_roi
        else image_area
    )
    ratio = foreground_pixels / expected_area
    min_ratio = MIN_PROMPT_FOREGROUND_RATIO if normalized_roi else MIN_UNPROMPTED_FOREGROUND_RATIO

    bbox = alpha_mask.getbbox()

    if not bbox:
        return _quality_failure(
            "low_coverage",
            (
                "远程 AI 识别结果异常，未覆盖服饰主体，"
                "请调整 AI_LIGHTWEIGHT_CLOTHING_LABELS 或放宽后处理参数，或回退传统识别。"
            ),
        )

    left, top, right, bottom = bbox
    bbox_width = right - left
    bbox_height = bottom - top
    expected_width = normalized_roi["width"] if normalized_roi else image_width
    expected_height = normalized_roi["height"] if normalized_roi else image_height
    bbox_area_ratio = (bbox_width * bbox_height) / max(1, expected_width * expected_height)
    bbox_width_ratio = bbox_width / max(1, expected_width)
    bbox_height_ratio = bbox_height / max(1, expected_height)
    full_foreground_ratio = foreground_pixels / image_area
    full_bbox_width_ratio = bbox_width / max(1, image_width)
    touches_image_border = (
        left <= 1
        or top <= 1
        or right >= image_width - 1
        or bottom >= image_height - 1
    )
    is_target_without_roi = debug_role == "target" and not normalized_roi
    is_target_with_roi = debug_role == "target" and bool(normalized_roi)
    selected_candidate = (
        (mask_diagnostics or {}).get("selectedCandidate")
        if isinstance(mask_diagnostics, dict)
        else None
    )

    if not isinstance(selected_candidate, dict):
        selected_candidate = {}

    selected_width_ratio = float(selected_candidate.get("widthRatio") or 0.0)
    selected_area_ratio = float(selected_candidate.get("bboxAreaRatio") or 0.0)
    selected_foreground_ratio = float(selected_candidate.get("foregroundRatio") or 0.0)
    selected_touches_border = bool(selected_candidate.get("touchesBorder"))

    if is_target_with_roi and (
        full_bbox_width_ratio >= 0.95
        or (full_foreground_ratio > 0.40 and touches_image_border)
        or (selected_width_ratio >= 0.96 and selected_touches_border)
        or selected_area_ratio >= 0.80
        or (selected_foreground_ratio > 0.50 and selected_touches_border)
        or selected_candidate.get("rejectedReason") == "roi_over_coverage"
    ):
        return _quality_failure(
            "over_coverage",
            (
                "远程 AI 识别范围过大，可能包含背景或道具，请缩小框选范围或手动编辑蒙版。"
                f" foregroundRatio={full_foreground_ratio:.4f}"
                f" bboxWidthRatio={full_bbox_width_ratio:.4f}"
                f" selectedWidthRatio={selected_width_ratio:.4f}"
                f" selectedBboxAreaRatio={selected_area_ratio:.4f}"
                f" touchesBorder={selected_touches_border or touches_image_border}"
            ),
        )

    if is_target_without_roi and (
        (ratio < 0.16 and bbox_area_ratio < 0.28)
        or bbox_width_ratio < 0.55
        or bbox_height_ratio < 0.34
    ):
        return _quality_failure(
            "partial",
            (
                "远程 AI 仅识别到局部服装区域，请框选服装区域或手动编辑蒙版后再校色。"
                f" foregroundRatio={ratio:.4f} bboxAreaRatio={bbox_area_ratio:.4f}"
                f" bboxWidthRatio={bbox_width_ratio:.4f} bboxHeightRatio={bbox_height_ratio:.4f}"
            ),
        )

    if is_target_with_roi and (
        (ratio < 0.14 and bbox_area_ratio < 0.24)
        or bbox_width_ratio < 0.35
        or bbox_height_ratio < 0.30
    ):
        return _quality_failure(
            "partial",
            (
                "远程 AI 在框选区域内仅识别到局部服装区域，请扩大框选区域或手动编辑蒙版。"
                f" foregroundRatio={ratio:.4f} bboxAreaRatio={bbox_area_ratio:.4f}"
                f" bboxWidthRatio={bbox_width_ratio:.4f} bboxHeightRatio={bbox_height_ratio:.4f}"
            ),
        )

    has_reasonable_partial_body = (
        not normalized_roi
        and not is_target_without_roi
        and ratio >= MIN_UNPROMPTED_RELAXED_FOREGROUND_RATIO
        and bbox_area_ratio >= MIN_REASONABLE_BBOX_AREA_RATIO
        and bbox_width_ratio >= MIN_REASONABLE_BBOX_WIDTH_RATIO
        and bbox_height_ratio >= MIN_REASONABLE_BBOX_HEIGHT_RATIO
    )

    if ratio < min_ratio and not has_reasonable_partial_body:
        return _quality_failure(
            "low_coverage",
            (
                "远程 AI 识别结果异常，未覆盖服饰主体，"
                "请调整 AI_LIGHTWEIGHT_CLOTHING_LABELS 或放宽后处理参数，或回退传统识别。"
                f" foregroundRatio={ratio:.4f} bboxAreaRatio={bbox_area_ratio:.4f}"
            ),
        )

    if bbox_width / max(1, expected_width) < MIN_BBOX_EDGE_RATIO or bbox_height / max(1, expected_height) < MIN_BBOX_EDGE_RATIO:
        return _quality_failure(
            "low_coverage",
            (
                "远程 AI 识别结果异常，mask bbox 过小或过窄，"
                "请调整 AI_LIGHTWEIGHT_CLOTHING_LABELS 或放宽后处理参数，或回退传统识别。"
                f" bbox={bbox}"
            ),
        )

    top_band_bottom = (
        normalized_roi["y"] + int(round(normalized_roi["height"] * 0.25))
        if normalized_roi
        else int(round(image_height * 0.25))
    )
    pixels = alpha_mask.load()
    top_foreground_pixels = 0

    for y in range(0, max(0, min(image_height, top_band_bottom))):
        for x in range(image_width):
            if pixels[x, y] > 0:
                top_foreground_pixels += 1

    top_foreground_ratio = top_foreground_pixels / max(1, foreground_pixels)

    if top_foreground_ratio > 0.38 and top / max(1, image_height) < 0.18:
        return _quality_failure(
            "low_confidence",
            (
                "远程 AI 识别结果异常，顶部泄漏过重，"
                "请扩大/清除 ROI、调整 AI_LIGHTWEIGHT_CLOTHING_LABELS，或回退传统识别。"
                f" topForegroundRatio={top_foreground_ratio:.4f}"
            ),
        )

    return None


class LightweightSegmenter(BaseSegmenter):
    name = "lightweight"

    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        segment_started_at = perf_counter()
        crop_ms = 0.0
        model_path = getenv("AI_LIGHTWEIGHT_MODEL_PATH")

        if not model_path:
            return SegmentResult(
                message="轻量分割模型未配置，请设置 AI_LIGHTWEIGHT_MODEL_PATH 或切回 mock",
                success=False,
            )

        resolved_model_path = Path(model_path).expanduser()

        if not resolved_model_path.exists():
            return SegmentResult(
                message=f"轻量分割模型文件不存在：{resolved_model_path}",
                success=False,
            )

        image_width, image_height = segment_input.image.size
        requested_roi = normalize_roi(
            segment_input.roi or segment_input.prompt_box,
            image_width,
            image_height,
        )
        should_use_roi_first = segment_input.debug_role == "target" and requested_roi is not None
        inference_roi = (
            _expand_roi_for_inference(requested_roi, image_width, image_height)
            if should_use_roi_first and requested_roi
            else None
        )
        inference_image = segment_input.image

        if inference_roi:
            crop_started_at = perf_counter()
            inference_image = segment_input.image.crop(
                (
                    inference_roi["x"],
                    inference_roi["y"],
                    inference_roi["x"] + inference_roi["width"],
                    inference_roi["y"] + inference_roi["height"],
                )
            )
            crop_ms = (perf_counter() - crop_started_at) * 1000
            _save_api_crop_debug_image(inference_image, segment_input, inference_roi)

        print(f"[ai-server] roi crop ms={crop_ms:.2f}", flush=True)
        onnx_pipeline_started_at = perf_counter()

        try:
            raw_mask = run_onnx_segmentation(
                resolved_model_path,
                inference_image,
                use_target_candidates=segment_input.debug_role == "target",
            )
        except MissingOnnxDependency as exc:
            print(
                f"[ai-server] total ms={(perf_counter() - segment_started_at) * 1000:.2f}",
                flush=True,
            )
            return SegmentResult(
                message=f"轻量 ONNX 推理依赖未安装：{exc}。请执行 pip install -r requirements-lightweight.txt",
                success=False,
            )
        except OnnxSegmentationError as exc:
            print(
                f"[ai-server] total ms={(perf_counter() - segment_started_at) * 1000:.2f}",
                flush=True,
            )
            return SegmentResult(
                message=f"轻量 ONNX 推理失败：{exc}",
                success=False,
            )
        except Exception as exc:
            print(
                f"[ai-server] total ms={(perf_counter() - segment_started_at) * 1000:.2f}",
                flush=True,
            )
            return SegmentResult(
                message=f"轻量 ONNX 推理出现未预期错误：{exc}",
                success=False,
            )

        onnx_pipeline_ms = (perf_counter() - onnx_pipeline_started_at) * 1000
        onnx_timings = get_last_onnx_timings()
        mask_diagnostics = get_last_mask_diagnostics()
        candidate_scoring_ms = float(mask_diagnostics.get("candidateScoringMs") or 0.0)
        print(
            "[ai-server] session load ms="
            f"{float(onnx_timings.get('sessionLoadMs') or 0.0):.2f} "
            f"cacheHit={bool(onnx_timings.get('sessionCacheHit'))}",
            flush=True,
        )
        print(
            f"[ai-server] onnx inference ms={float(onnx_timings.get('inferenceMs') or 0.0):.2f} "
            f"onnxRuns={int(onnx_timings.get('onnxRunCount') or 0)}",
            flush=True,
        )
        print(
            f"[ai-server] candidate scoring ms={candidate_scoring_ms:.2f} "
            f"candidateCount={len(mask_diagnostics.get('candidateDiagnostics') or [])}",
            flush=True,
        )

        if segment_input.debug_role == "target":
            selected_candidate = mask_diagnostics.get("selectedCandidate") or {}
            if selected_candidate:
                print(
                    "[ai-server] target candidate selected "
                    f"threshold={selected_candidate.get('threshold')} "
                    f"gamma={selected_candidate.get('gamma')} "
                    f"score={selected_candidate.get('score')}",
                    flush=True,
                )

        extra_debug: dict[str, object] = {
            "candidateScoringMs": candidate_scoring_ms,
            "inferenceRoi": inference_roi,
            "onnxPipelineMs": onnx_pipeline_ms,
            "onnxTimings": onnx_timings,
            "requestedRoi": requested_roi,
            "roiFirstInference": bool(inference_roi),
        }

        postprocess_started_at = perf_counter()
        if inference_roi:
            _save_api_crop_mask_debug_image(raw_mask, segment_input, inference_roi)
            raw_mask = _paste_crop_mask_to_full_image(raw_mask, image_width, image_height, inference_roi)
            mask = postprocess_mask(
                raw_mask,
                image_width,
                image_height,
                roi=inference_roi,
            )
        else:
            mask = postprocess_mask(
                raw_mask,
                image_width,
                image_height,
                prompt_box=segment_input.prompt_box,
                roi=segment_input.roi,
            )
        postprocess_ms = (perf_counter() - postprocess_started_at) * 1000
        extra_debug["postprocessMs"] = postprocess_ms
        print(f"[ai-server] postprocess ms={postprocess_ms:.2f}", flush=True)
        record_postprocess_diagnostics(mask)
        quality_error = _mask_quality_error(
            mask,
            segment_input.roi,
            segment_input.prompt_box,
            segment_input.debug_role,
            mask_diagnostics,
        )

        if quality_error:
            _save_api_return_debug_mask(
                mask,
                segment_input,
                quality_error["message"],
                False,
                quality_error["quality"],
                extra_debug,
            )
            print(
                f"[ai-server] total ms={(perf_counter() - segment_started_at) * 1000:.2f}",
                flush=True,
            )
            return SegmentResult(
                message=quality_error["message"],
                quality=quality_error["quality"],
                success=False,
            )

        _save_api_return_debug_mask(mask, segment_input, "lightweight ONNX mask", True, extra_debug=extra_debug)
        print(
            f"[ai-server] total ms={(perf_counter() - segment_started_at) * 1000:.2f}",
            flush=True,
        )

        return SegmentResult(
            confidence=0.6,
            mask=encode_mask_png(mask),
            message="lightweight ONNX mask",
            success=True,
        )

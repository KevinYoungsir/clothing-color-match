import argparse
import base64
import os
import sys
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Iterator, Optional

from PIL import Image


AI_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_ROOT))

from segmenters.base import SegmentInput
from segmenters.lightweight_segmenter import LightweightSegmenter
from segmenters.onnx_utils import get_last_mask_diagnostics, get_last_onnx_timings
from segmenters.postprocess import normalize_roi


DEFAULT_LABELS = "4,5,6,7"
DEFAULT_OUTPUT = "debug/lightweight-mask.png"


@contextmanager
def temporary_env(name: str, value: Optional[str]) -> Iterator[None]:
    previous_value = os.environ.get(name)

    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value

    try:
        yield
    finally:
        if previous_value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = previous_value


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()

    if path.is_absolute():
        return path

    return AI_SERVER_ROOT / path


def parse_roi(value: Optional[str]) -> Optional[dict]:
    if value is None or value.strip() == "":
        return None

    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("--roi must use x,y,width,height format.")

    try:
        x, y, width, height = (int(float(part)) for part in parts)
    except ValueError as exc:
        raise ValueError("--roi values must be numbers.") from exc

    return {"height": height, "width": width, "x": x, "y": y}


def decode_mask(mask_base64: str) -> Image.Image:
    mask_bytes = base64.b64decode(mask_base64)
    mask = Image.open(BytesIO(mask_bytes))
    mask.load()
    return mask.convert("L")


def mask_summary(mask: Image.Image, component_count: Optional[int] = None) -> dict:
    pixels = mask.load()
    foreground_count = 0
    total_count = mask.width * mask.height
    alpha_sum = 0
    min_alpha = 255
    max_alpha = 0
    min_x = mask.width
    min_y = mask.height
    max_x = -1
    max_y = -1

    for y in range(mask.height):
        for x in range(mask.width):
            alpha = pixels[x, y]
            alpha_sum += alpha
            min_alpha = min(min_alpha, alpha)
            max_alpha = max(max_alpha, alpha)

            if alpha > 0:
                foreground_count += 1
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    ratio = foreground_count / total_count if total_count else 0.0
    bbox = (
        None
        if foreground_count == 0
        else {
            "height": max_y - min_y + 1,
            "width": max_x - min_x + 1,
            "x": min_x,
            "y": min_y,
        }
    )

    return {
        "alphaMax": max_alpha,
        "alphaMean": alpha_sum / total_count if total_count else 0.0,
        "alphaMin": min_alpha,
        "bbox": bbox,
        "bboxAreaRatio": (
            (bbox["width"] * bbox["height"]) / total_count
            if bbox and total_count
            else 0.0
        ),
        "bboxHeightRatio": bbox["height"] / mask.height if bbox and mask.height else 0.0,
        "bboxWidthRatio": bbox["width"] / mask.width if bbox and mask.width else 0.0,
        "componentCount": component_count,
        "foregroundPixels": foreground_count,
        "foregroundRatio": ratio,
        "touchesBorder": bool(
            bbox
            and (
                bbox["x"] <= 0
                or bbox["y"] <= 0
                or bbox["x"] + bbox["width"] >= mask.width
                or bbox["y"] + bbox["height"] >= mask.height
            )
        ),
    }


def print_stage_summary(
    stage_name: str,
    summary: Optional[dict],
    image_width: int,
    image_height: int,
) -> None:
    if not summary:
        print(f"{stage_name}: unavailable")
        return

    bbox = summary.get("bbox")
    width = max(1, image_width)
    height = max(1, image_height)
    bbox_width_ratio = bbox["width"] / width if bbox else None
    bbox_height_ratio = bbox["height"] / height if bbox else None
    bbox_area_ratio = (
        (bbox["width"] * bbox["height"]) / (width * height)
        if bbox
        else None
    )

    print(
        f"{stage_name}: foregroundRatio={float(summary.get('foregroundRatio') or 0.0):.6f}, "
        f"bbox={bbox}, bboxWidthRatio={bbox_width_ratio}, "
        f"bboxHeightRatio={bbox_height_ratio}, bboxAreaRatio={bbox_area_ratio}, "
        f"alphaMin={summary.get('minAlpha')}, alphaMax={summary.get('maxAlpha')}, "
        f"alphaMean={float(summary.get('meanAlpha') or 0.0):.3f}, "
        f"componentCount={summary.get('componentCount')}, "
        f"touchesBorder={summary.get('touchesBorder')}"
    )


def assert_roi_limited(mask: Image.Image, roi: dict) -> None:
    normalized_roi = normalize_roi(roi, mask.width, mask.height)

    if not normalized_roi:
        raise RuntimeError("ROI is invalid after normalization.")

    pixels = mask.load()

    for y in range(mask.height):
        for x in range(mask.width):
            inside_roi = (
                normalized_roi["x"] <= x < normalized_roi["x"] + normalized_roi["width"]
                and normalized_roi["y"] <= y < normalized_roi["y"] + normalized_roi["height"]
            )

            if not inside_roi and pixels[x, y] != 0:
                raise RuntimeError(f"Mask has non-black pixel outside ROI at ({x}, {y}).")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the lightweight ONNX segmenter against a real garment image."
    )
    parser.add_argument("--model-path", required=True, help="Local ONNX model path.")
    parser.add_argument("--image-path", required=True, help="Local garment image path.")
    parser.add_argument(
        "--labels",
        default=DEFAULT_LABELS,
        help=f"Comma-separated clothing label ids. Default: {DEFAULT_LABELS}.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Debug mask output path. Default: {DEFAULT_OUTPUT}.",
    )
    parser.add_argument(
        "--roi",
        default=None,
        help="Optional ROI as x,y,width,height. If provided, output mask must be black outside ROI.",
    )
    parser.add_argument(
        "--input-size",
        default=None,
        help="Optional AI_LIGHTWEIGHT_INPUT_SIZE override, for example 512.",
    )
    parser.add_argument(
        "--threshold",
        default=None,
        help="Optional AI_LIGHTWEIGHT_MASK_THRESHOLD override.",
    )
    parser.add_argument(
        "--gamma",
        default=None,
        help="Optional AI_LIGHTWEIGHT_MASK_GAMMA override.",
    )
    parser.add_argument(
        "--blur",
        default=None,
        help="Optional AI_LIGHTWEIGHT_MASK_BLUR override.",
    )
    parser.add_argument(
        "--keep-components",
        default=None,
        help="Optional AI_LIGHTWEIGHT_KEEP_COMPONENTS override.",
    )
    parser.add_argument(
        "--min-component-ratio",
        default=None,
        help="Optional AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO override.",
    )
    parser.add_argument(
        "--body-keep-components",
        default=None,
        help="Optional AI_LIGHTWEIGHT_BODY_KEEP_COMPONENTS override.",
    )
    parser.add_argument(
        "--target-thresholds",
        default=None,
        help="Optional AI_LIGHTWEIGHT_TARGET_CANDIDATE_THRESHOLDS override.",
    )
    parser.add_argument(
        "--target-gammas",
        default=None,
        help="Optional AI_LIGHTWEIGHT_TARGET_CANDIDATE_GAMMAS override.",
    )
    parser.add_argument(
        "--target-normalization",
        default="imagenet",
        choices=("imagenet", "zero-one"),
        help="Target preprocessing normalization. Default: imagenet.",
    )
    parser.add_argument(
        "--sample-id",
        default="verify-lightweight",
        help="Sample id used by target diagnostics.",
    )
    parser.add_argument(
        "--require-success",
        action="store_true",
        help="Exit non-zero when the segmenter returns success:false.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_path = resolve_path(args.model_path)
    image_path = resolve_path(args.image_path)
    output_path = resolve_path(args.output)

    if not model_path.exists():
        print(f"Model file does not exist: {model_path}", file=sys.stderr)
        return 1

    if not image_path.exists():
        print(f"Image file does not exist: {image_path}", file=sys.stderr)
        return 1

    try:
        roi = parse_roi(args.roi)
    except ValueError as exc:
        print(f"Invalid ROI: {exc}", file=sys.stderr)
        return 1

    image = Image.open(image_path).convert("RGB")

    with (
        temporary_env("AI_LIGHTWEIGHT_MODEL_PATH", str(model_path)),
        temporary_env("AI_LIGHTWEIGHT_CLOTHING_LABELS", args.labels),
        temporary_env("AI_LIGHTWEIGHT_INPUT_SIZE", args.input_size),
        temporary_env("AI_LIGHTWEIGHT_MASK_THRESHOLD", args.threshold),
        temporary_env("AI_LIGHTWEIGHT_MASK_GAMMA", args.gamma),
        temporary_env("AI_LIGHTWEIGHT_MASK_BLUR", args.blur),
        temporary_env("AI_LIGHTWEIGHT_KEEP_COMPONENTS", args.keep_components),
        temporary_env("AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO", args.min_component_ratio),
        temporary_env("AI_LIGHTWEIGHT_BODY_KEEP_COMPONENTS", args.body_keep_components),
        temporary_env(
            "AI_LIGHTWEIGHT_TARGET_CANDIDATE_THRESHOLDS",
            args.target_thresholds,
        ),
        temporary_env("AI_LIGHTWEIGHT_TARGET_CANDIDATE_GAMMAS", args.target_gammas),
        temporary_env(
            "AI_LIGHTWEIGHT_TARGET_NORMALIZATION",
            args.target_normalization,
        ),
        temporary_env("AI_DEBUG_SAVE_MASKS", "0"),
    ):
        result = LightweightSegmenter().segment(
            SegmentInput(
                debug_role="target",
                image=image,
                image_height=image.height,
                image_width=image.width,
                prompt_box=roi,
                roi=roi,
                sample_id=args.sample_id,
            )
        )
        mask_diagnostics = get_last_mask_diagnostics()
        onnx_timings = get_last_onnx_timings()

    print(f"success: {result.success}")
    print(f"message: {result.message}")
    print(f"quality: {result.quality or 'none'}")
    print(f"labels: {args.labels}")
    print(f"image size: {image.width} x {image.height}")
    print(f"onnxRunCount: {onnx_timings.get('onnxRunCount', 'n/a')}")
    print(f"sessionCacheHit: {onnx_timings.get('sessionCacheHit', 'n/a')}")
    print(f"normalization: {onnx_timings.get('normalization', 'n/a')}")
    print(f"candidateScoringMs: {mask_diagnostics.get('candidateScoringMs', 'n/a')}")
    print(f"semanticCalibration: {mask_diagnostics.get('semanticCalibration')}")
    print(f"selectedCandidate: {mask_diagnostics.get('selectedCandidate')}")
    print(f"selectedReason: {mask_diagnostics.get('selectedReason')}")
    stage_diagnostics = mask_diagnostics.get("stageDiagnostics") or {}
    stage_dimensions = mask_diagnostics.get("stageDimensions") or {}
    probability_dimensions = stage_dimensions.get("probability") or {}
    final_dimensions = stage_dimensions.get("final") or {}

    for stage_name in (
        "rawProbability",
        "threshold",
        "bodyFilter",
        "components",
        "final",
    ):
        stage_summary = stage_diagnostics.get(stage_name)
        dimensions = final_dimensions if stage_name == "final" else probability_dimensions
        stage_width = int(dimensions.get("width") or image.width)
        stage_height = int(dimensions.get("height") or image.height)
        print_stage_summary(stage_name, stage_summary, stage_width, stage_height)

    print_stage_summary(
        "postprocess",
        mask_diagnostics.get("postprocess"),
        image.width,
        image.height,
    )
    print(f"bodyFilterDiagnostics: {mask_diagnostics.get('bodyFilterDiagnostics')}")

    if not result.success:
        print("mask size: none")
        print("foreground pixels: 0")
        print("foreground ratio: 0.000000")
        print("suggested next checks:")
        print("- Confirm AI_LIGHTWEIGHT_CLOTHING_LABELS matches the model label map.")
        print("- Try labels such as 1,2,3,4,5,6,7 if the label map is unknown.")
        print("- If all labels fail, the model may require ImageNet mean/std normalization.")
        print("- Confirm the image domain matches the model training data.")
        return 1 if args.require_success else 0

    if not result.mask:
        print("Segmenter returned success:true without mask.", file=sys.stderr)
        return 1

    try:
        mask = decode_mask(result.mask)
    except Exception as exc:
        print(f"Could not decode mask: {exc}", file=sys.stderr)
        return 1

    if mask.size != image.size:
        print(f"Mask size mismatch: expected {image.size}, got {mask.size}", file=sys.stderr)
        return 1

    if roi is not None:
        try:
            assert_roi_limited(mask, roi)
        except RuntimeError as exc:
            print(f"ROI validation failed: {exc}", file=sys.stderr)
            return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(output_path, format="PNG")

    summary = mask_summary(
        mask,
        int(mask_diagnostics.get("connectedComponentCount") or 0),
    )
    print(f"mask size: {mask.width} x {mask.height}")
    print(f"mask summary: {summary}")
    print(f"output: {output_path}")

    if roi is None:
        print("roi: none")
    else:
        print(f"roi: {roi['x']},{roi['y']},{roi['width']},{roi['height']}")
        print("roi limited: true")

    return 0


if __name__ == "__main__":
    sys.exit(main())

import argparse
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from PIL import Image


AI_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_ROOT))

from segmenters.lightweight_segmenter import (
    _expand_roi_for_inference,
    _paste_crop_mask_to_full_image,
)
from segmenters.onnx_utils import (
    MissingOnnxDependency,
    OnnxSegmentationError,
    _build_target_closeup_candidate_stages,
    _calibrate_target_semantic_probability,
    get_multiclass_label_probability,
    get_multiclass_label_probability_and_support,
    image_mask_summary,
    parse_clothing_labels_value,
    run_onnx_first_output,
)
from segmenters.postprocess import normalize_roi, postprocess_mask


DEFAULT_LABELS = "4,5,6,7"
DEFAULT_OUTPUT_DIR = "debug/label-masks"


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
    return path if path.is_absolute() else AI_SERVER_ROOT / path


def parse_roi(value: Optional[str]) -> Optional[dict[str, int]]:
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


def parse_label_list(value: str, label_count: int) -> tuple[int, ...]:
    labels = parse_clothing_labels_value(value, default_labels=())
    invalid_labels = [label for label in labels if label < 0 or label >= label_count]

    if invalid_labels:
        raise ValueError(
            f"Labels outside model range 0..{label_count - 1}: {invalid_labels}"
        )

    return labels


def save_probability(probability, output_path: Path, np) -> None:
    probability_array = np.asarray(probability, dtype=np.float32)
    output = Image.fromarray(
        np.clip(probability_array * 255.0, 0, 255).astype(np.uint8),
        mode="L",
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path, format="PNG")


def format_summary(summary: dict, width: int, height: int) -> str:
    bbox = summary.get("bbox")
    bbox_width_ratio = bbox["width"] / width if bbox and width else 0.0
    bbox_height_ratio = bbox["height"] / height if bbox and height else 0.0
    bbox_area_ratio = (
        (bbox["width"] * bbox["height"]) / max(1, width * height)
        if bbox
        else 0.0
    )

    return (
        f"foregroundRatio={float(summary.get('foregroundRatio') or 0.0):.6f}, "
        f"bbox={bbox}, bboxWidthRatio={bbox_width_ratio:.4f}, "
        f"bboxHeightRatio={bbox_height_ratio:.4f}, "
        f"bboxAreaRatio={bbox_area_ratio:.4f}, "
        f"alpha=({summary.get('minAlpha')}, {summary.get('maxAlpha')}, "
        f"{float(summary.get('meanAlpha') or 0.0):.2f}), "
        f"touchesBorder={summary.get('touchesBorder')}, "
        f"components={summary.get('componentCount')}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect selected ONNX labels with one inference run."
    )
    parser.add_argument("--model-path", required=True, help="Local ONNX model path.")
    parser.add_argument("--image-path", required=True, help="Local garment image path.")
    parser.add_argument(
        "--labels",
        default=DEFAULT_LABELS,
        help=f"Combined garment labels. Default: {DEFAULT_LABELS}.",
    )
    parser.add_argument(
        "--inspect-labels",
        default=DEFAULT_LABELS,
        help=f"Limited label ids to export. Default: {DEFAULT_LABELS}.",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Debug output directory. Default: {DEFAULT_OUTPUT_DIR}.",
    )
    parser.add_argument("--roi", default=None, help="Optional ROI as x,y,width,height.")
    parser.add_argument("--input-size", default="512")
    parser.add_argument(
        "--normalization",
        default="imagenet",
        choices=("imagenet", "zero-one"),
        help="Target preprocessing normalization. Default: imagenet.",
    )
    parser.add_argument("--threshold", default=None)
    parser.add_argument("--gamma", default=None)
    parser.add_argument("--blur", default=None)
    parser.add_argument("--keep-components", default=None)
    parser.add_argument("--min-component-ratio", default=None)
    parser.add_argument("--body-keep-components", default=None)
    parser.add_argument("--target-thresholds", default=None)
    parser.add_argument("--target-gammas", default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_path = resolve_path(args.model_path)
    image_path = resolve_path(args.image_path)
    output_dir = resolve_path(args.output_dir)

    if not model_path.exists():
        print(f"Model file does not exist: {model_path}", file=sys.stderr)
        return 1

    if not image_path.exists():
        print(f"Image file does not exist: {image_path}", file=sys.stderr)
        return 1

    try:
        requested_roi = parse_roi(args.roi)
    except ValueError as exc:
        print(f"Invalid ROI: {exc}", file=sys.stderr)
        return 1

    source_image = Image.open(image_path).convert("RGB")
    normalized_roi = normalize_roi(
        requested_roi,
        source_image.width,
        source_image.height,
    )
    inference_roi = (
        _expand_roi_for_inference(
            normalized_roi,
            source_image.width,
            source_image.height,
        )
        if normalized_roi
        else None
    )
    inference_image = source_image

    if inference_roi:
        inference_image = source_image.crop(
            (
                inference_roi["x"],
                inference_roi["y"],
                inference_roi["x"] + inference_roi["width"],
                inference_roi["y"] + inference_roi["height"],
            )
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    inference_image.save(output_dir / "inference-input.png", format="PNG")

    with (
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
        temporary_env("AI_DEBUG_SAVE_MASKS", "0"),
    ):
        try:
            output, np, input_spec = run_onnx_first_output(
                model_path,
                inference_image,
                normalization=args.normalization,
            )
            _probe, label_count, logits_layout = get_multiclass_label_probability(
                output,
                (0,),
                np,
            )
            combined_labels = parse_label_list(args.labels, label_count)
            inspect_labels = parse_label_list(args.inspect_labels, label_count)
        except (MissingOnnxDependency, OnnxSegmentationError, ValueError) as exc:
            print(f"Could not inspect model labels: {exc}", file=sys.stderr)
            return 1

        print(f"image: {image_path}")
        print(f"source size: {source_image.width} x {source_image.height}")
        print(f"requested ROI: {normalized_roi}")
        print(f"inference ROI: {inference_roi}")
        print(f"inference size: {inference_image.width} x {inference_image.height}")
        print(f"input: {input_spec.name}, {input_spec.layout}, {input_spec.width} x {input_spec.height}")
        print(f"logits layout: {logits_layout}")
        print(f"normalization: {args.normalization}")
        print(f"label count: {label_count}")
        print(f"inspect labels: {inspect_labels}")
        print("onnxRunCount: 1")

        for label in inspect_labels:
            probability, _count, _layout = get_multiclass_label_probability(
                output,
                (label,),
                np,
            )
            probability_height, probability_width = probability.shape
            label_dir = output_dir / f"label-{label:02d}"
            save_probability(probability, label_dir / "probability.png", np)
            stages = _build_target_closeup_candidate_stages(
                probability,
                (probability_width, probability_height),
                np,
            )
            stages["finalMask"].save(label_dir / "mask.png", format="PNG")
            print(
                f"label {label}: "
                f"{format_summary(stages['finalSummary'], probability_width, probability_height)}, "
                f"selected={stages.get('selectedCandidate')}"
            )

        (
            combined_probability,
            semantic_support,
            _count,
            _layout,
        ) = get_multiclass_label_probability_and_support(
            output,
            combined_labels,
            np,
        )
        combined_probability, semantic_diagnostics = _calibrate_target_semantic_probability(
            combined_probability,
            semantic_support,
            np,
        )
        combined_stages = _build_target_closeup_candidate_stages(
            combined_probability,
            inference_image.size,
            np,
        )
        save_probability(
            combined_stages["rawProbability"],
            output_dir / "combined-raw-probability.png",
            np,
        )
        for stage_key, file_name in (
            ("thresholdAlpha", "combined-threshold.png"),
            ("bodyFilterAlpha", "combined-body-filter.png"),
            ("componentsAlpha", "combined-components.png"),
        ):
            save_probability(combined_stages[stage_key], output_dir / file_name, np)
        combined_stages["finalMask"].save(
            output_dir / "combined-final-crop.png",
            format="PNG",
        )

        if inference_roi:
            full_mask = _paste_crop_mask_to_full_image(
                combined_stages["finalMask"],
                source_image.width,
                source_image.height,
                inference_roi,
            )
        else:
            full_mask = combined_stages["finalMask"]

        production_postprocessed = postprocess_mask(
            full_mask,
            source_image.width,
            source_image.height,
            roi=normalized_roi,
        )
        production_postprocessed.save(
            output_dir / "combined-postprocess-production.png",
            format="PNG",
        )
        expanded_roi_postprocessed = postprocess_mask(
            full_mask,
            source_image.width,
            source_image.height,
            roi=inference_roi or normalized_roi,
        )
        expanded_roi_postprocessed.save(
            output_dir / "combined-postprocess-expanded-roi.png",
            format="PNG",
        )

        print("\nCombined stages:")
        for stage_name, summary_key in (
            ("rawProbability", "rawSummary"),
            ("threshold", "thresholdSummary"),
            ("bodyFilter", "bodyFilterSummary"),
            ("components", "componentsSummary"),
            ("final", "finalSummary"),
        ):
            summary = combined_stages[summary_key]
            stage_width = (
                inference_image.width
                if stage_name == "final"
                else combined_probability.shape[1]
            )
            stage_height = (
                inference_image.height
                if stage_name == "final"
                else combined_probability.shape[0]
            )
            print(
                f"{stage_name}: {format_summary(summary, stage_width, stage_height)}"
            )

        postprocess_summary = image_mask_summary(
            production_postprocessed,
            np,
            include_component_count=False,
        )
        print(
            "postprocessProduction: "
            f"{format_summary(postprocess_summary, source_image.width, source_image.height)}"
        )
        expanded_roi_summary = image_mask_summary(
            expanded_roi_postprocessed,
            np,
            include_component_count=False,
        )
        print(
            "postprocessExpandedRoi: "
            f"{format_summary(expanded_roi_summary, source_image.width, source_image.height)}"
        )
        print(f"bodyFilterDiagnostics: {combined_stages.get('bodyFilterDiagnostics')}")
        print(f"semanticCalibration: {semantic_diagnostics}")
        print(f"candidateScoringMs: {combined_stages.get('candidateScoringMs')}")
        print(f"selectedCandidate: {combined_stages.get('selectedCandidate')}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

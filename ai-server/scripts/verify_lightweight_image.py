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


def foreground_summary(mask: Image.Image) -> tuple[int, float]:
    pixels = mask.load()
    foreground_count = 0
    total_count = mask.width * mask.height

    for y in range(mask.height):
        for x in range(mask.width):
            if pixels[x, y] > 0:
                foreground_count += 1

    ratio = foreground_count / total_count if total_count else 0.0
    return foreground_count, ratio


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
    ):
        result = LightweightSegmenter().segment(SegmentInput(image=image, roi=roi))

    print(f"success: {result.success}")
    print(f"message: {result.message}")
    print(f"labels: {args.labels}")
    print(f"image size: {image.width} x {image.height}")

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

    foreground_count, foreground_ratio = foreground_summary(mask)
    print(f"mask size: {mask.width} x {mask.height}")
    print(f"foreground pixels: {foreground_count}")
    print(f"foreground ratio: {foreground_ratio:.6f}")
    print(f"output: {output_path}")

    if roi is None:
        print("roi: none")
    else:
        print(f"roi: {roi['x']},{roi['y']},{roi['width']},{roi['height']}")
        print("roi limited: true")

    return 0


if __name__ == "__main__":
    sys.exit(main())

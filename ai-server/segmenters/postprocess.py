import base64
from io import BytesIO
from typing import Any, Dict, Optional

from PIL import Image, ImageChops, ImageDraw


def normalize_roi(value: Any, image_width: int, image_height: int) -> Optional[Dict[str, int]]:
    if not isinstance(value, dict):
        return None

    try:
        x = int(float(value.get("x", 0)))
        y = int(float(value.get("y", 0)))
        width = int(float(value.get("width", 0)))
        height = int(float(value.get("height", 0)))
    except (TypeError, ValueError):
        return None

    left = max(0, min(image_width - 1, x))
    top = max(0, min(image_height - 1, y))
    right = max(left + 1, min(image_width, x + width))
    bottom = max(top + 1, min(image_height, y + height))

    if right <= left or bottom <= top:
        return None

    return {
        "height": bottom - top,
        "width": right - left,
        "x": left,
        "y": top,
    }


def encode_mask_png(mask: Image.Image) -> str:
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def create_roi_mask(image_width: int, image_height: int, roi: Dict[str, int]) -> Image.Image:
    roi_mask = Image.new("L", (image_width, image_height), 0)
    draw = ImageDraw.Draw(roi_mask)
    left = roi["x"]
    top = roi["y"]
    right = left + roi["width"] - 1
    bottom = top + roi["height"] - 1

    draw.rectangle([left, top, right, bottom], fill=255)

    return roi_mask


def postprocess_mask(
    raw_mask: Image.Image,
    image_width: int,
    image_height: int,
    roi: Optional[Dict[str, Any]] = None,
    prompt_box: Optional[Dict[str, Any]] = None,
) -> Image.Image:
    if raw_mask.size != (image_width, image_height):
        raw_mask = raw_mask.resize((image_width, image_height), Image.Resampling.NEAREST)

    processed_mask = raw_mask.convert("L")
    normalized_roi = normalize_roi(roi or prompt_box, image_width, image_height)

    if not normalized_roi:
        return processed_mask

    roi_mask = create_roi_mask(image_width, image_height, normalized_roi)

    return ImageChops.multiply(processed_mask, roi_mask)

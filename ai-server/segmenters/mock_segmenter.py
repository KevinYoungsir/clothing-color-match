import base64
from io import BytesIO
from typing import Any, Dict, Optional

from PIL import Image, ImageDraw

from .base import BaseSegmenter, SegmentInput, SegmentResult


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


class MockSegmenter(BaseSegmenter):
    name = "mock"

    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        image_width, image_height = segment_input.image.size
        normalized_roi = normalize_roi(
            segment_input.roi or segment_input.prompt_box,
            image_width,
            image_height,
        )

        if not normalized_roi:
            return SegmentResult(
                message="需要 roi 或真实 AI 模型",
                success=False,
            )

        mask = Image.new("L", (image_width, image_height), 0)
        draw = ImageDraw.Draw(mask)
        left = normalized_roi["x"]
        top = normalized_roi["y"]
        right = left + normalized_roi["width"] - 1
        bottom = top + normalized_roi["height"] - 1
        draw.rectangle([left, top, right, bottom], fill=255)

        return SegmentResult(
            confidence=0.5,
            mask=encode_mask_png(mask),
            message="mock mask",
            success=True,
        )

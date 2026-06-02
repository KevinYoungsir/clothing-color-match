from PIL import Image

from .base import BaseSegmenter, SegmentInput, SegmentResult
from .postprocess import encode_mask_png, normalize_roi, postprocess_mask


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

        raw_mask = Image.new("L", (image_width, image_height), 255)
        mask = postprocess_mask(
            raw_mask,
            image_width,
            image_height,
            prompt_box=segment_input.prompt_box,
            roi=segment_input.roi,
        )

        return SegmentResult(
            confidence=0.5,
            mask=encode_mask_png(mask),
            message="mock mask",
            success=True,
        )

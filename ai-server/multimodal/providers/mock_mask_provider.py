import base64
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from PIL import Image, ImageDraw

from multimodal.schemas import GarmentMaskInput, GarmentMaskResult, SuggestedRoi


def encode_alpha_mask_png(mask: Image.Image) -> str:
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def default_mock_roi(mask_input: GarmentMaskInput) -> SuggestedRoi:
    image_width, image_height = mask_input.image.size
    x = round(image_width * 0.15)
    y = round(image_height * 0.12)
    width = max(1, round(image_width * 0.7))
    height = max(1, round(image_height * 0.76))

    return SuggestedRoi(
        x=x,
        y=y,
        width=min(width, image_width - x),
        height=min(height, image_height - y),
    )


def infer_category(file_name: str, fallback: Optional[str]) -> str:
    if fallback:
        return fallback

    normalized_name = Path(file_name).stem.lower()
    category_tokens = (
        ("trousers", ("trouser", "pants", "slacks", "裤")),
        ("jacket", ("jacket", "coat", "outerwear", "夹克", "外套")),
        ("polo", ("polo",)),
        ("tshirt", ("tshirt", "t-shirt", "tee", "t恤")),
        ("shirt", ("shirt", "衬衫")),
        ("skirt", ("skirt", "裙")),
        ("dress", ("dress", "连衣裙")),
    )
    for category, tokens in category_tokens:
        if any(token in normalized_name for token in tokens):
            return category

    return "unknown"


def get_mask_quality_flags(roi: SuggestedRoi, image_size: tuple[int, int]) -> tuple[float, List[str]]:
    image_width, image_height = image_size
    image_area = image_width * image_height
    mask_area = roi.width * roi.height
    coverage_ratio = mask_area / image_area if image_area else 0
    flags = ["mock_mask", "needs_manual_confirmation"]

    if coverage_ratio <= 0.02:
        flags.append("small_mask")
    if coverage_ratio >= 0.95:
        flags.append("full_image_mask")
    elif coverage_ratio >= 0.85:
        flags.append("large_mask")
    if (
        roi.x <= 0
        or roi.y <= 0
        or roi.x + roi.width >= image_width
        or roi.y + roi.height >= image_height
    ):
        flags.append("edge_touching_mask")

    return round(coverage_ratio, 6), flags


class MockGarmentMaskProvider:
    name = "mock_mask"

    def generate_mask(self, mask_input: GarmentMaskInput) -> GarmentMaskResult:
        image_width, image_height = mask_input.image.size
        roi = mask_input.roi or default_mock_roi(mask_input)
        mask = Image.new("RGBA", (image_width, image_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(mask)
        draw.rectangle(
            [roi.x, roi.y, roi.x + roi.width - 1, roi.y + roi.height - 1],
            fill=(255, 255, 255, 255),
        )
        coverage_ratio, flags = get_mask_quality_flags(roi, (image_width, image_height))

        return GarmentMaskResult(
            provider=self.name,
            provider_status="ready",
            garment_category=infer_category(mask_input.file_name, mask_input.garment_category),
            raw_garment_category=mask_input.garment_category,
            confidence=0.55,
            suggested_roi=roi,
            mask_png_base64=encode_alpha_mask_png(mask),
            mask_width=image_width,
            mask_height=image_height,
            mask_coverage_ratio=coverage_ratio,
            mask_quality_flags=tuple(flags),
            recommend_manual_refine=True,
            user_message=(
                "mock AI 蒙版已生成，仅用于链路验证。请检查边缘并手动修边后再校色。"
            ),
        )


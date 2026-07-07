from dataclasses import dataclass
from math import isfinite
from typing import Any, Dict, Optional, Tuple

from PIL import Image


@dataclass(frozen=True)
class SuggestedRoi:
    x: int
    y: int
    width: int
    height: int

    def to_response(self) -> Dict[str, int]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }


@dataclass(frozen=True)
class GarmentAnalysisInput:
    image: Image.Image
    file_name: str
    role: str
    roi: Optional[SuggestedRoi]


@dataclass(frozen=True)
class GarmentAnalysisResult:
    provider: str
    garment_category: str
    garment_description: str
    suggested_roi: Optional[SuggestedRoi]
    confidence: float
    risk_tags: Tuple[str, ...]
    contains_hanger: bool
    contains_metal_clip: bool
    edge_touching: bool
    complex_background: bool
    recommend_manual_mask: bool
    user_message: str
    safety_note: str
    success: bool = True
    provider_status: str = "ready"
    fallback_used: bool = False
    error_code: Optional[str] = None
    raw_garment_category: Optional[str] = None
    raw_risk_tags: Tuple[str, ...] = ()
    roi_coverage_ratio: Optional[float] = None
    roi_quality_flags: Tuple[str, ...] = ()

    def to_response(self) -> Dict[str, object]:
        return {
            "success": self.success,
            "provider": self.provider,
            "providerStatus": self.provider_status,
            "fallbackUsed": self.fallback_used,
            "errorCode": self.error_code,
            "garmentCategory": self.garment_category,
            "rawGarmentCategory": self.raw_garment_category,
            "garmentDescription": self.garment_description,
            "suggestedRoi": self.suggested_roi.to_response() if self.suggested_roi else None,
            "confidence": self.confidence,
            "riskTags": list(self.risk_tags),
            "rawRiskTags": list(self.raw_risk_tags),
            "roiCoverageRatio": self.roi_coverage_ratio,
            "roiQualityFlags": list(self.roi_quality_flags),
            "containsHanger": self.contains_hanger,
            "containsMetalClip": self.contains_metal_clip,
            "edgeTouching": self.edge_touching,
            "complexBackground": self.complex_background,
            "recommendManualMask": self.recommend_manual_mask,
            "userMessage": self.user_message,
            "shouldApplyDirectlyToColorTransfer": False,
            "safetyNote": self.safety_note,
        }


def normalize_roi(
    value: Any,
    image_width: int,
    image_height: int,
) -> Optional[SuggestedRoi]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("ROI 必须是包含 x、y、width、height 的 JSON 对象")

    try:
        numbers = [float(value[key]) for key in ("x", "y", "width", "height")]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("ROI 缺少有效的 x、y、width 或 height") from exc

    if not all(isfinite(number) for number in numbers):
        raise ValueError("ROI 坐标必须是有限数值")

    x, y, width, height = numbers
    if width <= 0 or height <= 0:
        raise ValueError("ROI 宽高必须大于 0")

    left = max(0, min(image_width - 1, round(x)))
    top = max(0, min(image_height - 1, round(y)))
    right = max(left + 1, min(image_width, round(x + width)))
    bottom = max(top + 1, min(image_height, round(y + height)))

    return SuggestedRoi(left, top, right - left, bottom - top)

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from PIL import Image


@dataclass(frozen=True)
class SegmentInput:
    image: Image.Image
    roi: Optional[Dict[str, Any]] = None
    prompt_box: Optional[Dict[str, Any]] = None
    prompt_points: Optional[List[Dict[str, Any]]] = None
    debug_role: Optional[str] = None
    sample_id: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None


@dataclass(frozen=True)
class SegmentResult:
    success: bool
    message: str
    mask: Optional[str] = None
    confidence: Optional[float] = None
    quality: Optional[str] = None
    diagnostics: Optional[Dict[str, Any]] = None

    def to_response(self) -> Dict[str, object]:
        response: Dict[str, object] = {
            "message": self.message,
            "success": self.success,
        }

        if self.mask is not None:
            response["mask"] = self.mask

        if self.confidence is not None:
            response["confidence"] = self.confidence

        if self.quality is not None:
            response["quality"] = self.quality

        if self.diagnostics is not None:
            response["diagnostics"] = self.diagnostics

        return response


class BaseSegmenter(ABC):
    name = "base"

    @abstractmethod
    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        raise NotImplementedError

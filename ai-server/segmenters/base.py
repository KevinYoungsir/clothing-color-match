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


@dataclass(frozen=True)
class SegmentResult:
    success: bool
    message: str
    mask: Optional[str] = None
    confidence: Optional[float] = None

    def to_response(self) -> Dict[str, object]:
        response: Dict[str, object] = {
            "message": self.message,
            "success": self.success,
        }

        if self.mask is not None:
            response["mask"] = self.mask

        if self.confidence is not None:
            response["confidence"] = self.confidence

        return response


class BaseSegmenter(ABC):
    name = "base"

    @abstractmethod
    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        raise NotImplementedError

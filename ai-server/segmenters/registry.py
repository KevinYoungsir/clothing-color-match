from .base import BaseSegmenter
from .lightweight_segmenter import LightweightSegmenter
from .mock_segmenter import MockSegmenter
from .sam2_segmenter import Sam2Segmenter


segmenters = {
    LightweightSegmenter.name: LightweightSegmenter,
    MockSegmenter.name: MockSegmenter,
    Sam2Segmenter.name: Sam2Segmenter,
}


def get_segmenter(name: str = "mock") -> BaseSegmenter:
    segmenter_type = segmenters.get(name, MockSegmenter)

    return segmenter_type()

from .base import BaseSegmenter
from .lightweight_segmenter import LightweightSegmenter
from .mock_segmenter import MockSegmenter


segmenters = {
    LightweightSegmenter.name: LightweightSegmenter,
    MockSegmenter.name: MockSegmenter,
}


def get_segmenter(name: str = "mock") -> BaseSegmenter:
    segmenter_type = segmenters.get(name, MockSegmenter)

    return segmenter_type()

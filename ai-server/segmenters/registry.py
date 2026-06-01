from .base import BaseSegmenter
from .mock_segmenter import MockSegmenter


segmenters = {
    MockSegmenter.name: MockSegmenter,
}


def get_segmenter(name: str = "mock") -> BaseSegmenter:
    segmenter_type = segmenters.get(name, MockSegmenter)

    return segmenter_type()

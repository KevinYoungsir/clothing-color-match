from os import getenv
from pathlib import Path

from .base import BaseSegmenter, SegmentInput, SegmentResult


class LightweightSegmenter(BaseSegmenter):
    name = "lightweight"

    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        model_path = getenv("AI_LIGHTWEIGHT_MODEL_PATH")

        if not model_path:
            return SegmentResult(
                message="轻量分割模型未配置，请设置 AI_LIGHTWEIGHT_MODEL_PATH 或切回 mock",
                success=False,
            )

        resolved_model_path = Path(model_path).expanduser()

        if not resolved_model_path.exists():
            return SegmentResult(
                message=f"轻量分割模型文件不存在：{resolved_model_path}",
                success=False,
            )

        return SegmentResult(
            message="轻量分割模型适配已预留，真实推理尚未实现",
            success=False,
        )

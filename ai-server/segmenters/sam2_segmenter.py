from os import getenv
from pathlib import Path

from .base import BaseSegmenter, SegmentInput, SegmentResult


class Sam2Segmenter(BaseSegmenter):
    name = "sam2"

    def segment(self, segment_input: SegmentInput) -> SegmentResult:
        checkpoint_path = getenv("AI_SAM2_CHECKPOINT")
        config_path = getenv("AI_SAM2_CONFIG")

        if not checkpoint_path or not config_path:
            return SegmentResult(
                message="SAM2 高精度分割模型未配置，请设置 AI_SAM2_CHECKPOINT 和 AI_SAM2_CONFIG 或切回 mock",
                success=False,
            )

        resolved_checkpoint_path = Path(checkpoint_path).expanduser()
        resolved_config_path = Path(config_path).expanduser()

        if not resolved_checkpoint_path.exists():
            return SegmentResult(
                message=f"SAM2 checkpoint 文件不存在：{resolved_checkpoint_path}",
                success=False,
            )

        if not resolved_config_path.exists():
            return SegmentResult(
                message=f"SAM2 config 文件不存在：{resolved_config_path}",
                success=False,
            )

        return SegmentResult(
            message="SAM2 高精度模式已预留，真实推理尚未实现",
            success=False,
        )

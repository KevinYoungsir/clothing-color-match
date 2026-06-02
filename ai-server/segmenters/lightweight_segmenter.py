from os import getenv
from pathlib import Path

from .base import BaseSegmenter, SegmentInput, SegmentResult
from .onnx_utils import MissingOnnxDependency, OnnxSegmentationError, run_onnx_segmentation
from .postprocess import encode_mask_png, postprocess_mask


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

        try:
            raw_mask = run_onnx_segmentation(resolved_model_path, segment_input.image)
        except MissingOnnxDependency as exc:
            return SegmentResult(
                message=f"轻量 ONNX 推理依赖未安装：{exc}。请执行 pip install -r requirements-lightweight.txt",
                success=False,
            )
        except OnnxSegmentationError as exc:
            return SegmentResult(
                message=f"轻量 ONNX 推理失败：{exc}",
                success=False,
            )
        except Exception as exc:
            return SegmentResult(
                message=f"轻量 ONNX 推理出现未预期错误：{exc}",
                success=False,
            )

        image_width, image_height = segment_input.image.size
        mask = postprocess_mask(
            raw_mask,
            image_width,
            image_height,
            prompt_box=segment_input.prompt_box,
            roi=segment_input.roi,
        )

        return SegmentResult(
            confidence=0.6,
            mask=encode_mask_png(mask),
            message="lightweight ONNX mask",
            success=True,
        )

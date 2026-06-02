from dataclasses import dataclass
from pathlib import Path
from typing import Any, Tuple

from PIL import Image


class MissingOnnxDependency(Exception):
    pass


class OnnxSegmentationError(Exception):
    pass


@dataclass(frozen=True)
class OnnxInputSpec:
    height: int
    layout: str
    name: str
    width: int


def load_onnx_dependencies() -> Tuple[Any, Any]:
    missing = []

    try:
        import numpy as np
    except ImportError:
        np = None
        missing.append("numpy")

    try:
        import onnxruntime as ort
    except ImportError:
        ort = None
        missing.append("onnxruntime")

    if missing:
        raise MissingOnnxDependency(", ".join(missing))

    return np, ort


def create_onnx_session(model_path: Path, ort: Any) -> Any:
    try:
        return ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    except Exception as exc:
        raise OnnxSegmentationError(f"模型加载失败：{exc}") from exc


def _dimension_to_int(value: Any) -> int:
    if isinstance(value, int):
        return value

    if isinstance(value, str) and value.isdigit():
        return int(value)

    raise OnnxSegmentationError("模型输入尺寸必须是静态 4D 张量，当前无法自动推断")


def get_input_spec(session: Any) -> OnnxInputSpec:
    inputs = session.get_inputs()

    if not inputs:
        raise OnnxSegmentationError("模型没有可用输入")

    model_input = inputs[0]
    shape = list(model_input.shape)

    if len(shape) != 4:
        raise OnnxSegmentationError(f"暂只支持 4D 图像输入，当前输入形状为 {shape}")

    if shape[1] in (1, 3, "1", "3"):
        return OnnxInputSpec(
            height=_dimension_to_int(shape[2]),
            layout="NCHW",
            name=model_input.name,
            width=_dimension_to_int(shape[3]),
        )

    if shape[3] in (1, 3, "1", "3"):
        return OnnxInputSpec(
            height=_dimension_to_int(shape[1]),
            layout="NHWC",
            name=model_input.name,
            width=_dimension_to_int(shape[2]),
        )

    raise OnnxSegmentationError(f"无法识别输入通道位置，当前输入形状为 {shape}")


def preprocess_image(image: Image.Image, spec: OnnxInputSpec, np: Any) -> Any:
    resized = image.convert("RGB").resize((spec.width, spec.height), Image.Resampling.BILINEAR)
    tensor = np.asarray(resized, dtype=np.float32) / 255.0

    if spec.layout == "NCHW":
        tensor = np.transpose(tensor, (2, 0, 1))

    return np.expand_dims(tensor, axis=0).astype(np.float32)


def _sigmoid(array: Any, np: Any) -> Any:
    return 1.0 / (1.0 + np.exp(-array))


def _squeeze_mask_output(output: Any, np: Any) -> Any:
    mask = np.asarray(output)

    if mask.ndim == 4:
        if mask.shape[0] != 1:
            raise OnnxSegmentationError(f"暂只支持 batch size 1 输出，当前输出形状为 {mask.shape}")

        if mask.shape[1] == 1:
            return mask[0, 0]

        if mask.shape[1] == 2:
            return mask[0, 1]

        if mask.shape[3] == 1:
            return mask[0, :, :, 0]

        if mask.shape[3] == 2:
            return mask[0, :, :, 1]

    if mask.ndim == 3:
        if mask.shape[0] == 1:
            return mask[0]

        if mask.shape[0] == 2:
            return mask[1]

        if mask.shape[2] == 1:
            return mask[:, :, 0]

        if mask.shape[2] == 2:
            return mask[:, :, 1]

    if mask.ndim == 2:
        return mask

    raise OnnxSegmentationError(f"无法解析模型输出为 mask，输出形状为 {mask.shape}")


def parse_mask_output(output: Any, image_size: Tuple[int, int], np: Any) -> Image.Image:
    mask = _squeeze_mask_output(output, np).astype(np.float32)

    if mask.size == 0:
        raise OnnxSegmentationError("模型输出为空")

    mask_min = float(np.nanmin(mask))
    mask_max = float(np.nanmax(mask))

    if not np.isfinite(mask_min) or not np.isfinite(mask_max):
        raise OnnxSegmentationError("模型输出包含非有限数值")

    if mask_max > 1.0 and mask_min >= 0.0:
        mask = mask / mask_max
    elif mask_min < 0.0 or mask_max > 1.0:
        mask = _sigmoid(mask, np)

    binary_mask = (mask >= 0.5).astype(np.uint8) * 255

    if int(binary_mask.max()) == 0:
        raise OnnxSegmentationError("模型输出没有可用前景区域")

    pil_mask = Image.fromarray(binary_mask, mode="L")

    if pil_mask.size != image_size:
        pil_mask = pil_mask.resize(image_size, Image.Resampling.NEAREST)

    return pil_mask


def run_onnx_segmentation(model_path: Path, image: Image.Image) -> Image.Image:
    np, ort = load_onnx_dependencies()
    session = create_onnx_session(model_path, ort)
    input_spec = get_input_spec(session)
    input_tensor = preprocess_image(image, input_spec, np)

    try:
        outputs = session.run(None, {input_spec.name: input_tensor})
    except Exception as exc:
        raise OnnxSegmentationError(f"模型推理失败：{exc}") from exc

    if not outputs:
        raise OnnxSegmentationError("模型没有输出")

    return parse_mask_output(outputs[0], image.size, np)

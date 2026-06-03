import argparse
import sys
from pathlib import Path
from typing import Any, List, Sequence


def fail(message: str) -> int:
    print(f"ONNX model inspection failed: {message}", file=sys.stderr)
    return 1


def format_shape(shape: Sequence[Any]) -> str:
    return "[" + ", ".join(str(item) for item in shape) + "]"


def is_static_int(value: Any) -> bool:
    if isinstance(value, int):
        return True

    return isinstance(value, str) and value.isdigit()


def dimension_to_int(value: Any) -> int:
    return int(value)


def detect_image_layout(shape: Sequence[Any]) -> str:
    if len(shape) != 4:
        return "unsupported: expected static 4D image input"

    if not all(is_static_int(value) for value in shape):
        return "unsupported: dynamic input dimensions need a model-specific adapter"

    dimensions = [dimension_to_int(value) for value in shape]

    if dimensions[1] in (1, 3):
        return "compatible candidate: NCHW"

    if dimensions[3] in (1, 3):
        return "compatible candidate: NHWC"

    return "unsupported: channel dimension is not in a common NCHW/NHWC position"


def detect_mask_output(shape: Sequence[Any]) -> str:
    if len(shape) == 2:
        return "compatible candidate: 2D mask"

    if len(shape) == 3:
        if shape[0] in (1, 2, "1", "2") or shape[2] in (1, 2, "1", "2"):
            return "compatible candidate: 3D single-channel or two-class mask"

        return "needs adapter: 3D output is not a common mask layout"

    if len(shape) == 4:
        if shape[0] not in (1, "1"):
            return "needs adapter: only batch size 1 is supported by the current skeleton"

        if shape[1] in (1, 2, "1", "2") or shape[3] in (1, 2, "1", "2"):
            return "compatible candidate: 4D single-channel or two-class mask"

        return "needs adapter: 4D output channel dimension is not in a common mask position"

    return "unsupported: output is not a 2D/3D/4D mask-like tensor"


def print_io_metadata(title: str, values: List[Any]) -> None:
    print(title)

    if not values:
        print("- none")
        return

    for index, value in enumerate(values):
        print(f"- #{index}")
        print(f"  name: {value.name}")
        print(f"  shape: {format_shape(value.shape)}")
        print(f"  type: {value.type}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect an ONNX model input/output contract.")
    parser.add_argument(
        "--model-path",
        required=True,
        help="Path to a local .onnx model file. The model file must not be committed to Git.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_path = Path(args.model_path).expanduser()

    if not model_path.exists():
        return fail(f"model file does not exist: {model_path}")

    if not model_path.is_file():
        return fail(f"model path is not a file: {model_path}")

    try:
        import onnxruntime as ort
    except ImportError:
        return fail("onnxruntime is not installed. Run: pip install -r requirements-lightweight.txt")

    try:
        session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    except Exception as exc:
        return fail(f"could not load ONNX session: {exc}")

    inputs = session.get_inputs()
    outputs = session.get_outputs()

    print(f"Model: {model_path}")
    print(f"Providers: {', '.join(session.get_providers())}")
    print()

    print_io_metadata("Inputs", inputs)
    print()
    print_io_metadata("Outputs", outputs)
    print()

    if inputs:
        print(f"Input compatibility: {detect_image_layout(inputs[0].shape)}")
    else:
        print("Input compatibility: unsupported: model has no inputs")

    if outputs:
        print(f"Output compatibility: {detect_mask_output(outputs[0].shape)}")
    else:
        print("Output compatibility: unsupported: model has no outputs")

    print()
    print("No inference was executed and no mask was generated.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

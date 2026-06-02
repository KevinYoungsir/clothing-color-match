import argparse
import base64
import json
import os
import sys
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterator, Optional, Tuple
from urllib import error, request

from PIL import Image


AI_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_ROOT))

from segmenters.base import SegmentInput, SegmentResult
from segmenters.lightweight_segmenter import LightweightSegmenter


DEFAULT_BASE_URL = "http://localhost:8000"
TEST_WIDTH = 8
TEST_HEIGHT = 6
TEST_ROI = {"x": 2, "y": 1, "width": 4, "height": 3}


def fail(message: str) -> None:
    raise RuntimeError(message)


@contextmanager
def temporary_env(name: str, value: Optional[str]) -> Iterator[None]:
    previous_value = os.environ.get(name)

    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value

    try:
        yield
    finally:
        if previous_value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = previous_value


def make_test_image() -> Image.Image:
    return Image.new("RGB", (TEST_WIDTH, TEST_HEIGHT), (238, 242, 246))


def make_test_png() -> bytes:
    buffer = BytesIO()
    make_test_image().save(buffer, format="PNG")
    return buffer.getvalue()


def assert_clear_failure(result: SegmentResult, label: str, expected_fragment: str) -> None:
    if result.success is not False:
        fail(f"{label}: expected success false, got success true.")

    if result.mask is not None:
        fail(f"{label}: failure response must not include mask.")

    if result.confidence is not None:
        fail(f"{label}: failure response must not include confidence.")

    if not result.message:
        fail(f"{label}: failure response must include a clear message.")

    if expected_fragment not in result.message:
        fail(f"{label}: expected message to include {expected_fragment!r}, got {result.message!r}.")


def decode_mask(mask_base64: str) -> Image.Image:
    try:
        mask_bytes = base64.b64decode(mask_base64)
        mask = Image.open(BytesIO(mask_bytes))
        mask.load()
    except Exception as exc:
        fail(f"Could not decode lightweight mask PNG: {exc}")

    return mask.convert("L")


def assert_mask_is_roi_limited(mask: Image.Image, label: str) -> None:
    if mask.size != (TEST_WIDTH, TEST_HEIGHT):
        fail(f"{label}: expected mask size {(TEST_WIDTH, TEST_HEIGHT)}, got {mask.size}.")

    pixels = mask.load()
    foreground_inside_roi = 0

    for y in range(TEST_HEIGHT):
        for x in range(TEST_WIDTH):
            inside_roi = (
                TEST_ROI["x"] <= x < TEST_ROI["x"] + TEST_ROI["width"]
                and TEST_ROI["y"] <= y < TEST_ROI["y"] + TEST_ROI["height"]
            )
            value = pixels[x, y]

            if inside_roi and value > 0:
                foreground_inside_roi += 1

            if not inside_roi and value != 0:
                fail(f"{label}: expected black pixel outside ROI at ({x}, {y}), got {value}.")

    if foreground_inside_roi == 0:
        fail(f"{label}: expected at least one foreground pixel inside ROI.")


def assert_safe_success_or_failure(result: SegmentResult, label: str) -> None:
    if result.success:
        if not result.mask:
            fail(f"{label}: success response must include mask.")

        mask = decode_mask(result.mask)
        assert_mask_is_roi_limited(mask, label)
        return

    if result.mask is not None:
        fail(f"{label}: failure response must not include mask.")

    if not result.message:
        fail(f"{label}: failure response must include a clear message.")


def call_lightweight(model_path: Optional[str]) -> SegmentResult:
    with temporary_env("AI_LIGHTWEIGHT_MODEL_PATH", model_path):
        return LightweightSegmenter().segment(
            SegmentInput(
                image=make_test_image(),
                roi=TEST_ROI,
            )
        )


def verify_unconfigured_model() -> None:
    result = call_lightweight(None)
    assert_clear_failure(result, "missing AI_LIGHTWEIGHT_MODEL_PATH", "未配置")


def verify_missing_model_path(model_path: Path) -> None:
    if model_path.exists():
        fail(f"Expected missing model path for this check, but it exists: {model_path}")

    result = call_lightweight(str(model_path))
    assert_clear_failure(result, "missing model file", "不存在")


def verify_existing_model_path(model_path: Path) -> None:
    if not model_path.exists():
        fail(f"Expected model path to exist: {model_path}")

    result = call_lightweight(str(model_path))
    assert_safe_success_or_failure(result, "existing model path")

    if not result.success and "requirements-lightweight.txt" in result.message:
        print("- Existing model path check returned dependency guidance, as expected without ONNX deps.")
    elif not result.success:
        print(f"- Existing model path check returned safe failure: {result.message}")
    else:
        print("- Existing model path check returned ROI-limited mask.")


def encode_multipart(
    fields: Dict[str, str],
    files: Dict[str, Tuple[str, str, bytes]],
) -> Tuple[bytes, str]:
    boundary = "codex-lightweight-verify"
    body = BytesIO()

    for name, value in fields.items():
        body.write(f"--{boundary}\r\n".encode("ascii"))
        body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"))
        body.write(value.encode("utf-8"))
        body.write(b"\r\n")

    for name, (filename, content_type, data) in files.items():
        body.write(f"--{boundary}\r\n".encode("ascii"))
        body.write(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(
                "ascii"
            )
        )
        body.write(f"Content-Type: {content_type}\r\n\r\n".encode("ascii"))
        body.write(data)
        body.write(b"\r\n")

    body.write(f"--{boundary}--\r\n".encode("ascii"))

    return body.getvalue(), f"multipart/form-data; boundary={boundary}"


def read_json_response(response: Any) -> Dict[str, Any]:
    body = response.read().decode("utf-8")
    payload = json.loads(body)

    if not isinstance(payload, dict):
        fail("Expected a JSON object response.")

    return payload


def verify_remote_lightweight(base_url: str) -> None:
    fields = {
        "roi": json.dumps(TEST_ROI),
    }
    body, content_type = encode_multipart(
        fields=fields,
        files={"image": ("verify.png", "image/png", make_test_png())},
    )
    http_request = request.Request(
        f"{base_url.rstrip('/')}/segment-garment",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )

    with request.urlopen(http_request, timeout=10) as response:
        payload = read_json_response(response)

    if payload.get("message") == "mock mask":
        fail("Remote server appears to be running mock mode, not lightweight mode.")

    if payload.get("success") is True:
        mask = decode_mask(str(payload.get("mask", "")))
        assert_mask_is_roi_limited(mask, "remote lightweight")
        return

    if payload.get("success") is not False:
        fail(f"Remote lightweight response must include boolean success, got {payload}.")

    if payload.get("mask") is not None:
        fail("Remote lightweight failure response must not include mask.")

    if not payload.get("message"):
        fail("Remote lightweight failure response must include message.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify lightweight ONNX segmenter safety.")
    parser.add_argument(
        "--model-path",
        default=None,
        help="Optional ONNX model path. Existing paths are checked for safe success/failure.",
    )
    parser.add_argument(
        "--expect-missing-model",
        action="store_true",
        help="Require --model-path to be missing and validate the missing-model failure path.",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help=f"Optional FastAPI base URL for a server already running in lightweight mode, e.g. {DEFAULT_BASE_URL}.",
    )
    return parser.parse_args()


def print_python_summary() -> None:
    version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    print(f"Python version: {version}")

    if sys.version_info.major != 3:
        fail("Python 3 is required.")


def main() -> int:
    args = parse_args()
    default_missing_model = AI_SERVER_ROOT / "models" / "__missing_verify_lightweight.onnx"

    try:
        print_python_summary()
        verify_unconfigured_model()

        if args.model_path:
            model_path = Path(args.model_path).expanduser()
            if args.expect_missing_model:
                verify_missing_model_path(model_path)
            elif model_path.exists():
                verify_existing_model_path(model_path)
            else:
                verify_missing_model_path(model_path)
        else:
            verify_missing_model_path(default_missing_model)

        if args.base_url:
            verify_remote_lightweight(args.base_url)
    except (RuntimeError, error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        print(f"Lightweight segment verification failed: {exc}", file=sys.stderr)
        return 1

    print("Lightweight segment verification passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

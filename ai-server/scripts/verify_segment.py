import argparse
import base64
import json
import sys
from io import BytesIO
from typing import Any, Dict, Optional, Tuple
from urllib import error, request

from PIL import Image


DEFAULT_BASE_URL = "http://localhost:8000"
TEST_WIDTH = 8
TEST_HEIGHT = 6
TEST_ROI = {"x": 2, "y": 1, "width": 4, "height": 3}


def fail(message: str) -> None:
    raise RuntimeError(message)


def normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def read_json_response(response: Any) -> Dict[str, Any]:
    body = response.read().decode("utf-8")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        fail(f"Expected JSON response, got: {body!r}")
        raise exc

    if not isinstance(payload, dict):
        fail("Expected a JSON object response.")

    return payload


def get_json(url: str) -> Dict[str, Any]:
    with request.urlopen(url, timeout=10) as response:
        if response.status != 200:
            fail(f"GET {url} returned HTTP {response.status}.")
        return read_json_response(response)


def make_test_png() -> bytes:
    image = Image.new("RGB", (TEST_WIDTH, TEST_HEIGHT), (238, 242, 246))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def encode_multipart(
    fields: Dict[str, str],
    files: Dict[str, Tuple[str, str, bytes]],
) -> Tuple[bytes, str]:
    boundary = "codex-ai-segment-verify"
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


def post_segment(base_url: str, image_bytes: bytes, roi: Optional[Dict[str, int]]) -> Dict[str, Any]:
    fields: Dict[str, str] = {}
    if roi is not None:
        fields["roi"] = json.dumps(roi)

    body, content_type = encode_multipart(
        fields=fields,
        files={"image": ("verify.png", "image/png", image_bytes)},
    )
    http_request = request.Request(
        f"{base_url}/segment-garment",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )

    with request.urlopen(http_request, timeout=10) as response:
        if response.status != 200:
            fail(f"POST /segment-garment returned HTTP {response.status}.")
        return read_json_response(response)


def decode_mask(mask_base64: str) -> Image.Image:
    try:
        mask_bytes = base64.b64decode(mask_base64)
        mask = Image.open(BytesIO(mask_bytes))
        mask.load()
    except Exception as exc:
        fail(f"Could not decode mask PNG: {exc}")

    return mask.convert("L")


def assert_roi_mask(mask: Image.Image, roi: Dict[str, int]) -> None:
    if mask.size != (TEST_WIDTH, TEST_HEIGHT):
        fail(f"Expected mask size {(TEST_WIDTH, TEST_HEIGHT)}, got {mask.size}.")

    pixels = mask.load()
    roi_white_pixels = 0

    for y in range(TEST_HEIGHT):
        for x in range(TEST_WIDTH):
            inside_roi = (
                roi["x"] <= x < roi["x"] + roi["width"]
                and roi["y"] <= y < roi["y"] + roi["height"]
            )
            value = pixels[x, y]

            if inside_roi and value >= 200:
                roi_white_pixels += 1

            if not inside_roi and value != 0:
                fail(f"Expected black pixel outside ROI at ({x}, {y}), got {value}.")

    if roi_white_pixels == 0:
        fail("Expected at least one white pixel inside ROI.")


def verify_health(base_url: str) -> None:
    payload = get_json(f"{base_url}/health")
    if payload.get("ok") is not True:
        fail(f"Expected /health to return {{'ok': true}}, got {payload}.")


def verify_segment_with_roi(base_url: str, image_bytes: bytes) -> None:
    payload = post_segment(base_url, image_bytes, TEST_ROI)

    if payload.get("success") is not True:
        fail(f"Expected ROI segmentation success, got {payload}.")
    if not payload.get("mask"):
        fail("Expected ROI segmentation response to include mask.")
    if "confidence" not in payload:
        fail("Expected ROI segmentation response to include confidence.")
    if "message" not in payload:
        fail("Expected ROI segmentation response to include message.")

    mask = decode_mask(str(payload["mask"]))
    assert_roi_mask(mask, TEST_ROI)


def verify_segment_without_roi(base_url: str, image_bytes: bytes) -> None:
    payload = post_segment(base_url, image_bytes, None)
    if payload.get("success") is not False:
        fail(f"Expected no-ROI segmentation to fail, got {payload}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify the local AI segmentation server.")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"FastAPI server base URL. Defaults to {DEFAULT_BASE_URL}.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base_url = normalize_base_url(args.base_url)
    image_bytes = make_test_png()

    try:
        verify_health(base_url)
        verify_segment_with_roi(base_url, image_bytes)
        verify_segment_without_roi(base_url, image_bytes)
    except (RuntimeError, error.URLError, TimeoutError, OSError) as exc:
        print(f"AI segment verification failed: {exc}", file=sys.stderr)
        return 1

    print("AI segment verification passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

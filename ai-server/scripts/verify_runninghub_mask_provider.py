from __future__ import annotations

import json
import os
import sys
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Iterator

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from multimodal.providers.mock_mask_provider import MockGarmentMaskProvider
from multimodal.providers.runninghub_mask_provider import RunningHubGarmentMaskProvider
from multimodal.schemas import GarmentMaskInput, SuggestedRoi


@contextmanager
def temporary_env(overrides: dict[str, str | None]) -> Iterator[None]:
    previous_values = {key: os.environ.get(key) for key in overrides}
    try:
        for key, value in overrides.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in previous_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def create_test_image() -> Image.Image:
    image = Image.new("RGB", (320, 480), (245, 245, 245))
    return image


def decode_mask(base64_value: str) -> Image.Image:
    import base64

    return Image.open(BytesIO(base64.b64decode(base64_value))).convert("RGBA")


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def verify_mock_mask() -> dict[str, object]:
    image = create_test_image()
    mask_input = GarmentMaskInput(
        garment_category="trousers",
        image=image,
        file_name="trouser_mock.jpg",
        role="target",
        roi=SuggestedRoi(x=40, y=60, width=180, height=300),
    )
    result = MockGarmentMaskProvider().generate_mask(mask_input)

    assert_condition(result.success, "mock mask should succeed")
    assert_condition(result.mask_png_base64 is not None, "mock mask should return base64 png")
    response = result.to_response()
    assert_condition(response["shouldApplyDirectlyToColorTransfer"] is False, "mask must not apply directly")
    assert_condition(result.mask_width == image.width and result.mask_height == image.height, "mask dimensions mismatch")
    assert_condition(result.mask_coverage_ratio is not None, "coverage ratio missing")
    assert_condition(0 < result.mask_coverage_ratio < 1, "coverage ratio must be in 0-1")

    decoded_mask = decode_mask(result.mask_png_base64)
    assert_condition(decoded_mask.size == image.size, "decoded mask size mismatch")

    return {
        "coverageRatio": result.mask_coverage_ratio,
        "maskSize": list(decoded_mask.size),
        "providerStatus": result.provider_status,
        "qualityFlags": list(result.mask_quality_flags),
        "success": result.success,
    }


def verify_runninghub_mask_safe_failure() -> dict[str, object]:
    image = create_test_image()
    mask_input = GarmentMaskInput(
        image=image,
        file_name="runninghub_mask.jpg",
        role="target",
        roi=None,
    )
    with temporary_env(
        {
            "RUNNINGHUB_MASK_ENABLE_REAL_CALL": "true",
            "RUNNINGHUB_MASK_API_KEY": "fake-local-test-key",
            "RUNNINGHUB_API_KEY": None,
            "RUNNINGHUB_MASK_WORKFLOW_ID": None,
            "RUNNINGHUB_MASK_APP_ID": None,
            "RUNNINGHUB_MASK_NODE_INFO": None,
        }
    ):
        result = RunningHubGarmentMaskProvider().generate_mask(mask_input)

    response = result.to_response()
    assert_condition(not result.success, "missing workflow config should fail safely")
    assert_condition(result.recommend_manual_refine, "safe failure should recommend manual refine")
    assert_condition(response["shouldApplyDirectlyToColorTransfer"] is False, "failure must not apply directly")
    assert_condition(result.mask_png_base64 is None, "failed RunningHub skeleton should not return a mask")

    return {
        "errorCode": result.error_code,
        "providerStatus": result.provider_status,
        "qualityFlags": list(result.mask_quality_flags),
        "recommendManualRefine": result.recommend_manual_refine,
        "success": result.success,
    }


def main() -> None:
    payload = {
        "mockMask": verify_mock_mask(),
        "runninghubMaskMissingWorkflow": verify_runninghub_mask_safe_failure(),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

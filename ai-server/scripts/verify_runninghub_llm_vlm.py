import argparse
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Dict, Iterator, Optional
from unittest.mock import patch
from urllib.parse import urlparse

from PIL import Image


AI_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_ROOT))

from multimodal.providers import runninghub_provider
from multimodal.schemas import GarmentAnalysisInput


ENV_NAMES = (
    "RUNNINGHUB_API_KEY",
    "RUNNINGHUB_MODEL_TYPE",
    "RUNNINGHUB_ENABLE_REAL_CALL",
    "RUNNINGHUB_LLM_BASE_URL",
    "RUNNINGHUB_LLM_MODEL",
    "RUNNINGHUB_LLM_MAX_TOKENS",
    "RUNNINGHUB_LLM_TEMPERATURE",
    "RUNNINGHUB_TIMEOUT_SECONDS",
)


@contextmanager
def temporary_env(values: Dict[str, Optional[str]]) -> Iterator[None]:
    previous = {name: os.environ.get(name) for name in ENV_NAMES}
    try:
        for name in ENV_NAMES:
            value = values.get(name)
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        yield
    finally:
        for name, value in previous.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


class FakeOpenAiClient:
    def __init__(self, content: str = "", error: Optional[BaseException] = None) -> None:
        self.content = content
        self.error = error
        self.requests = []
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs):
        self.requests.append(kwargs)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))]
        )


def make_input() -> GarmentAnalysisInput:
    return GarmentAnalysisInput(
        image=Image.new("RGB", (320, 480), (210, 212, 214)),
        file_name="local-verification.jpg",
        role="target",
        roi=None,
    )


def enabled_env(api_key: Optional[str] = "local-verification-key") -> Dict[str, Optional[str]]:
    return {
        "RUNNINGHUB_API_KEY": api_key,
        "RUNNINGHUB_MODEL_TYPE": "llm_vlm",
        "RUNNINGHUB_ENABLE_REAL_CALL": "true",
        "RUNNINGHUB_LLM_BASE_URL": "https://llm.runninghub.cn/v1",
        "RUNNINGHUB_LLM_MODEL": "qwen/qwen3.7-plus",
        "RUNNINGHUB_LLM_MAX_TOKENS": "2048",
        "RUNNINGHUB_LLM_TEMPERATURE": "0.1",
        "RUNNINGHUB_TIMEOUT_SECONDS": "5",
    }


def assert_safe_result(result, expected_status: str) -> None:
    response = result.to_response()
    assert result.success is False
    assert result.provider_status == expected_status
    assert result.recommend_manual_mask is True
    assert result.suggested_roi is None
    assert response["shouldApplyDirectlyToColorTransfer"] is False


def verify_ready() -> Dict[str, object]:
    with temporary_env(enabled_env()):
        config = runninghub_provider.load_runninghub_config()
        runninghub_provider.validate_runninghub_llm_config(config)
    return {
        "status": "ready",
        "baseUrl": config.llm_base_url,
        "model": config.llm_model,
    }


def verify_missing_api_key() -> Dict[str, object]:
    with temporary_env(enabled_env(api_key=None)):
        result = runninghub_provider.RunningHubMultimodalProvider().analyze(make_input())
    assert_safe_result(result, "missing_api_key")
    return {"status": result.provider_status, "errorCode": result.error_code}


def verify_malformed_json() -> Dict[str, object]:
    fake_client = FakeOpenAiClient(content="this is not JSON")
    with temporary_env(enabled_env()), patch.object(
        runninghub_provider,
        "_create_openai_client",
        return_value=fake_client,
    ):
        result = runninghub_provider.RunningHubMultimodalProvider().analyze(make_input())
    assert_safe_result(result, "invalid_response")
    assert result.error_code == "invalid_runninghub_vlm_response"

    missing_fields_client = FakeOpenAiClient(content=json.dumps({"confidence": 0.8}))
    with temporary_env(enabled_env()), patch.object(
        runninghub_provider,
        "_create_openai_client",
        return_value=missing_fields_client,
    ):
        missing_fields_result = runninghub_provider.RunningHubMultimodalProvider().analyze(
            make_input()
        )
    assert_safe_result(missing_fields_result, "invalid_response")
    return {
        "status": "malformed_json",
        "providerStatus": result.provider_status,
        "missingFieldsProviderStatus": missing_fields_result.provider_status,
    }


def verify_timeout() -> Dict[str, object]:
    fake_client = FakeOpenAiClient(error=TimeoutError("local timeout simulation"))
    with temporary_env(enabled_env()), patch.object(
        runninghub_provider,
        "_create_openai_client",
        return_value=fake_client,
    ):
        result = runninghub_provider.RunningHubMultimodalProvider().analyze(make_input())
    assert_safe_result(result, "timeout")
    assert result.error_code == "runninghub_vlm_timeout"
    return {"status": result.provider_status, "errorCode": result.error_code}


def verify_success() -> Dict[str, object]:
    content = json.dumps(
        {
            "garmentCategory": "polo shirt",
            "garmentDescription": "navy striped polo shirt",
            "suggestedRoi": {"x": 40, "y": 60, "width": 220, "height": 360},
            "confidence": 0.88,
            "riskTags": ["striped pattern"],
            "containsHanger": False,
            "containsMetalClip": False,
            "edgeTouching": False,
            "complexBackground": False,
            "recommendManualMask": False,
            "userMessage": "请确认 ROI 和最终蒙版后再校色。",
        }
    )
    fake_client = FakeOpenAiClient(content=content)
    with temporary_env(enabled_env()), patch.object(
        runninghub_provider,
        "_create_openai_client",
        return_value=fake_client,
    ):
        result = runninghub_provider.RunningHubMultimodalProvider().analyze(make_input())

    response = result.to_response()
    assert result.success is True
    assert result.provider_status == "ready"
    assert result.garment_category == "polo"
    assert result.raw_garment_category == "polo shirt"
    assert result.risk_tags == ("striped_pattern",)
    assert result.raw_risk_tags == ("striped pattern",)
    assert result.recommend_manual_mask is False
    assert result.suggested_roi is not None
    assert response["shouldApplyDirectlyToColorTransfer"] is False
    assert len(fake_client.requests) == 1
    image_url = fake_client.requests[0]["messages"][1]["content"][1]["image_url"]["url"]
    assert image_url.startswith("data:image/jpeg;base64,")

    high_risk_payload = json.loads(content)
    high_risk_payload["riskTags"] = ["contains hanger"]
    high_risk_result = runninghub_provider.parse_runninghub_vlm_payload(
        high_risk_payload,
        make_input(),
    )
    assert high_risk_result.risk_tags == ("hanger_present",)
    assert high_risk_result.recommend_manual_mask is True
    return {
        "status": "success",
        "providerStatus": result.provider_status,
        "garmentCategory": result.garment_category,
        "rawGarmentCategory": result.raw_garment_category,
        "riskTags": list(result.risk_tags),
        "rawRiskTags": list(result.raw_risk_tags),
        "suggestedRoi": result.suggested_roi.to_response(),
        "usesImageDataUrl": True,
        "highRiskManualMaskPromoted": True,
    }


def verify_live(image_path: Path) -> None:
    if not image_path.is_file():
        raise FileNotFoundError("Live validation image does not exist")

    config = runninghub_provider.load_runninghub_config()
    with Image.open(image_path) as source_image:
        image = source_image.convert("RGB")
    result = runninghub_provider.RunningHubMultimodalProvider().analyze(
        GarmentAnalysisInput(
            image=image,
            file_name="live-validation-image",
            role="target",
            roi=None,
        )
    )
    response = result.to_response()
    safe_output = {
        "configuration": {
            "apiKey": "configured" if config.api_key else "missing",
            "realCallEnabled": config.enable_real_call,
            "modelType": config.model_type,
            "baseUrlHost": urlparse(config.llm_base_url).hostname,
            "model": config.llm_model,
        },
        "result": {
            key: response[key]
            for key in (
                "success",
                "provider",
                "providerStatus",
                "errorCode",
                "garmentCategory",
                "rawGarmentCategory",
                "suggestedRoi",
                "confidence",
                "riskTags",
                "rawRiskTags",
                "recommendManualMask",
                "shouldApplyDirectlyToColorTransfer",
            )
        },
    }
    print(json.dumps(safe_output, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify RunningHub LLM/VLM advisory provider safety states."
    )
    parser.add_argument("--live", action="store_true", help="Use the configured real provider")
    parser.add_argument("--image", type=Path, help="Local image used only for --live")
    args = parser.parse_args()
    if args.live and args.image is None:
        parser.error("--live requires --image")
    return args


def main() -> None:
    args = parse_args()
    if args.live:
        verify_live(args.image)
        return
    results = {
        "ready": verify_ready(),
        "missing_api_key": verify_missing_api_key(),
        "malformed_json": verify_malformed_json(),
        "timeout": verify_timeout(),
        "success": verify_success(),
    }
    print(json.dumps({"ok": True, "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

import json
from dataclasses import dataclass
from os import getenv
from typing import Any, Dict, List, Optional

from multimodal.provider import MultimodalProvider
from multimodal.schemas import GarmentAnalysisInput, GarmentAnalysisResult, SuggestedRoi


class RunningHubAdapterDisabledError(RuntimeError):
    pass


class RunningHubTaskFailedError(RuntimeError):
    pass


@dataclass(frozen=True)
class RunningHubConfig:
    api_key: str
    base_url: Optional[str]
    workflow_id: Optional[str]
    app_id: Optional[str]
    model_type: str
    timeout_seconds: float
    poll_interval_seconds: float
    max_poll_attempts: int
    node_info_json: Optional[str]
    result_mode: Optional[str]

    def __repr__(self) -> str:
        return (
            "RunningHubConfig("
            "api_key='<redacted>', "
            f"base_url={self.base_url!r}, workflow_id={self.workflow_id!r}, "
            f"app_id={self.app_id!r}, model_type={self.model_type!r}, "
            f"timeout_seconds={self.timeout_seconds!r}, "
            f"poll_interval_seconds={self.poll_interval_seconds!r}, "
            f"max_poll_attempts={self.max_poll_attempts!r}, "
            f"result_mode={self.result_mode!r})"
        )


def _positive_float(raw_value: str, default_value: float) -> float:
    try:
        value = float(raw_value)
    except ValueError:
        return default_value
    return value if value > 0 else default_value


def _positive_int(raw_value: str, default_value: int) -> int:
    try:
        value = int(raw_value)
    except ValueError:
        return default_value
    return value if value > 0 else default_value


def load_runninghub_config() -> RunningHubConfig:
    workflow_id = getenv("RUNNINGHUB_WORKFLOW_ID", "").strip() or None
    app_id = getenv("RUNNINGHUB_APP_ID", "").strip() or None
    configured_model_type = getenv("RUNNINGHUB_MODEL_TYPE", "").strip().lower()
    inferred_model_type = "workflow" if workflow_id else "aiapp" if app_id else "workflow"

    return RunningHubConfig(
        api_key=getenv("RUNNINGHUB_API_KEY", "").strip(),
        base_url=getenv("RUNNINGHUB_BASE_URL", "").strip() or None,
        workflow_id=workflow_id,
        app_id=app_id,
        model_type=configured_model_type or inferred_model_type,
        timeout_seconds=_positive_float(getenv("RUNNINGHUB_TIMEOUT_SECONDS", "60"), 60.0),
        poll_interval_seconds=_positive_float(
            getenv("RUNNINGHUB_POLL_INTERVAL_SECONDS", "2"),
            2.0,
        ),
        max_poll_attempts=_positive_int(getenv("RUNNINGHUB_MAX_POLL_ATTEMPTS", "60"), 60),
        node_info_json=getenv("RUNNINGHUB_NODE_INFO_JSON", "").strip() or None,
        result_mode=getenv("RUNNINGHUB_RESULT_MODE", "").strip() or None,
    )


def _parse_node_info_list(raw_json: Optional[str]) -> List[Dict[str, Any]]:
    if raw_json is None:
        return []

    parsed = json.loads(raw_json)
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        raise ValueError("RUNNINGHUB_NODE_INFO_JSON must be a JSON array of objects")
    return parsed


def build_runninghub_payload(
    config: RunningHubConfig,
    analysis_input: GarmentAnalysisInput,
) -> Dict[str, Any]:
    """Build an internal adapter context, not a guessed RunningHub wire payload."""
    return {
        "modelType": config.model_type,
        "workflowId": config.workflow_id,
        "appId": config.app_id,
        "nodeInfoList": _parse_node_info_list(config.node_info_json),
        "resultMode": config.result_mode,
        "input": {
            "fileName": analysis_input.file_name,
            "role": analysis_input.role,
            "imageWidth": analysis_input.image.size[0],
            "imageHeight": analysis_input.image.size[1],
            "roi": analysis_input.roi.to_response() if analysis_input.roi else None,
        },
    }


def submit_runninghub_task(
    config: RunningHubConfig,
    payload: Dict[str, Any],
) -> str:
    del config, payload
    # Submit endpoint and wire payload are intentionally unknown in this phase.
    # Do not perform a network request until official endpoint details are supplied.
    raise RunningHubAdapterDisabledError


def poll_runninghub_task(config: RunningHubConfig, task_id: str) -> Dict[str, Any]:
    del config, task_id
    # Poll endpoint and terminal task states must be mapped from a real response sample.
    raise RunningHubAdapterDisabledError


def parse_runninghub_result(payload: Dict[str, Any]) -> GarmentAnalysisResult:
    if not isinstance(payload, dict):
        raise ValueError("RunningHub result must be an object")

    confidence = float(payload["confidence"])
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence must be between 0 and 1")

    risk_tags = payload.get("riskTags", [])
    if not isinstance(risk_tags, list):
        raise ValueError("riskTags must be a list")

    roi_payload = payload.get("suggestedRoi")
    suggested_roi = None
    if roi_payload is not None:
        suggested_roi = SuggestedRoi(
            x=int(roi_payload["x"]),
            y=int(roi_payload["y"]),
            width=int(roi_payload["width"]),
            height=int(roi_payload["height"]),
        )

    return GarmentAnalysisResult(
        provider="runninghub",
        provider_status="ready",
        garment_category=str(payload["garmentCategory"]),
        garment_description=str(payload["garmentDescription"]),
        suggested_roi=suggested_roi,
        confidence=confidence,
        risk_tags=tuple(str(tag) for tag in risk_tags),
        contains_hanger=bool(payload.get("containsHanger", False)),
        contains_metal_clip=bool(payload.get("containsMetalClip", False)),
        edge_touching=bool(payload.get("edgeTouching", False)),
        complex_background=bool(payload.get("complexBackground", False)),
        recommend_manual_mask=bool(payload.get("recommendManualMask", False)),
        user_message=str(payload["userMessage"]),
        safety_note=(
            "RunningHub 识别结果仅作为辅助建议，不会直接进入校色。"
            "最终校色范围以用户确认后的 ROI / mask 为准。"
        ),
    )


def analyze_with_runninghub(
    config: RunningHubConfig,
    analysis_input: GarmentAnalysisInput,
) -> GarmentAnalysisResult:
    payload = build_runninghub_payload(config, analysis_input)
    task_id = submit_runninghub_task(config, payload)
    task_result = poll_runninghub_task(config, task_id)
    return parse_runninghub_result(task_result)


class RunningHubMultimodalProvider(MultimodalProvider):
    name = "runninghub"

    def analyze(self, analysis_input: GarmentAnalysisInput) -> GarmentAnalysisResult:
        config = load_runninghub_config()
        if not config.api_key:
            return self._safe_failure(
                provider_status="missing_api_key",
                error_code="runninghub_api_key_missing",
                risk_tag="runninghub_api_key_missing",
                user_message=(
                    "RunningHub API Key 未配置，请在后端环境变量中配置，"
                    "或使用本地 AI mask / 手动蒙版。"
                ),
            )
        if not config.workflow_id and not config.app_id:
            return self._safe_failure(
                provider_status="missing_workflow_config",
                error_code="runninghub_workflow_config_missing",
                risk_tag="runninghub_workflow_config_missing",
                user_message=(
                    "RunningHub 工作流配置未完成，请配置 workflowId / appId 后再试。"
                ),
            )
        if config.model_type == "workflow" and not config.workflow_id:
            return self._safe_failure(
                provider_status="missing_workflow_config",
                error_code="runninghub_workflow_id_missing",
                risk_tag="runninghub_workflow_config_missing",
                user_message="RunningHub workflow 模式缺少 workflowId，请完成后端配置后再试。",
            )
        if config.model_type == "aiapp" and not config.app_id:
            return self._safe_failure(
                provider_status="missing_workflow_config",
                error_code="runninghub_app_id_missing",
                risk_tag="runninghub_workflow_config_missing",
                user_message="RunningHub aiapp 模式缺少 appId，请完成后端配置后再试。",
            )
        if config.model_type not in {"workflow", "aiapp", "standard"}:
            return self._safe_failure(
                provider_status="invalid_config",
                error_code="runninghub_model_type_invalid",
                risk_tag="runninghub_config_invalid",
                user_message="RunningHub 模式配置无效，请检查后端环境变量。",
            )

        try:
            return analyze_with_runninghub(config, analysis_input)
        except TimeoutError:
            return self._safe_failure(
                provider_status="timeout",
                error_code="runninghub_timeout",
                risk_tag="runninghub_timeout",
                user_message="RunningHub 多模态识别超时，请使用本地 AI mask 或手动蒙版。",
            )
        except RunningHubTaskFailedError:
            return self._safe_failure(
                provider_status="task_failed",
                error_code="runninghub_task_failed",
                risk_tag="runninghub_task_failed",
                user_message="RunningHub 任务失败，请使用本地 AI mask 或手动蒙版。",
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return self._safe_failure(
                provider_status="invalid_response",
                error_code="runninghub_invalid_response",
                risk_tag="runninghub_invalid_response",
                user_message="RunningHub 返回格式异常，请使用本地 AI mask 或手动蒙版。",
            )
        except RunningHubAdapterDisabledError:
            return self._safe_failure(
                provider_status="provider_disabled",
                error_code="runninghub_adapter_not_configured",
                risk_tag="runninghub_provider_disabled",
                user_message=(
                    "RunningHub adapter 尚未配置真实 endpoint，请使用本地 AI mask 或手动蒙版。"
                ),
            )
        except Exception:
            return self._safe_failure(
                provider_status="provider_error",
                error_code="runninghub_provider_error",
                risk_tag="runninghub_provider_error",
                user_message="RunningHub 多模态识别失败，请使用本地 AI mask 或手动蒙版。",
            )

    def _safe_failure(
        self,
        provider_status: str,
        error_code: str,
        risk_tag: str,
        user_message: str,
    ) -> GarmentAnalysisResult:
        return GarmentAnalysisResult(
            provider=self.name,
            provider_status=provider_status,
            fallback_used=False,
            error_code=error_code,
            success=False,
            garment_category="unknown",
            garment_description="RunningHub 多模态识别不可用",
            suggested_roi=None,
            confidence=0.0,
            risk_tags=(risk_tag,),
            contains_hanger=False,
            contains_metal_clip=False,
            edge_touching=False,
            complex_background=False,
            recommend_manual_mask=True,
            user_message=user_message,
            safety_note=(
                "RunningHub 失败结果不能直接进入校色；"
                "最终校色范围以用户确认后的 ROI / mask 为准。"
            ),
        )

import json
import socket
from dataclasses import dataclass
from os import getenv
from time import sleep
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from multimodal.provider import MultimodalProvider
from multimodal.schemas import GarmentAnalysisInput, GarmentAnalysisResult, SuggestedRoi


class RunningHubTaskFailedError(RuntimeError):
    pass


class RunningHubHttpError(RuntimeError):
    pass


class RunningHubConfigError(ValueError):
    def __init__(
        self,
        provider_status: str,
        error_code: str,
        risk_tag: str,
        user_message: str,
    ) -> None:
        super().__init__(user_message)
        self.provider_status = provider_status
        self.error_code = error_code
        self.risk_tag = risk_tag
        self.user_message = user_message


@dataclass(frozen=True)
class RunningHubConfig:
    enable_real_call: bool
    api_key: str
    submit_endpoint: Optional[str]
    poll_endpoint: Optional[str]
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
            f"enable_real_call={self.enable_real_call!r}, api_key='<redacted>', "
            f"submit_endpoint={self.submit_endpoint!r}, poll_endpoint={self.poll_endpoint!r}, "
            f"workflow_id={self.workflow_id!r}, app_id={self.app_id!r}, "
            f"model_type={self.model_type!r}, timeout_seconds={self.timeout_seconds!r}, "
            f"poll_interval_seconds={self.poll_interval_seconds!r}, "
            f"max_poll_attempts={self.max_poll_attempts!r}, "
            f"result_mode={self.result_mode!r})"
        )


def _env_enabled(name: str, default_value: bool = False) -> bool:
    raw_value = getenv(name)
    if raw_value is None or not raw_value.strip():
        return default_value
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


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
        enable_real_call=_env_enabled("RUNNINGHUB_ENABLE_REAL_CALL"),
        api_key=getenv("RUNNINGHUB_API_KEY", "").strip(),
        submit_endpoint=getenv("RUNNINGHUB_SUBMIT_ENDPOINT", "").strip() or None,
        poll_endpoint=getenv("RUNNINGHUB_POLL_ENDPOINT", "").strip() or None,
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
        result_mode=getenv("RUNNINGHUB_RESULT_MODE", "").strip().lower() or None,
    )


def _parse_node_info_list(raw_json: Optional[str]) -> List[Dict[str, Any]]:
    if raw_json is None:
        return []
    parsed = json.loads(raw_json)
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        raise ValueError("RUNNINGHUB_NODE_INFO_JSON must be a JSON array of objects")
    return parsed


def _validate_endpoint(endpoint: str, field_name: str) -> None:
    parsed = urlparse(endpoint)
    if not parsed.scheme or not parsed.netloc:
        raise RunningHubConfigError(
            "invalid_config",
            "runninghub_endpoint_invalid",
            "runninghub_config_invalid",
            f"RunningHub {field_name} 格式无效，请检查后端环境变量并确认 ROI / mask。",
        )
    if parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise RunningHubConfigError(
            "invalid_config",
            "runninghub_endpoint_insecure",
            "runninghub_config_invalid",
            f"RunningHub {field_name} 必须使用 HTTPS，请检查后端配置。",
        )


def validate_runninghub_config(config: RunningHubConfig) -> None:
    if not config.api_key:
        raise RunningHubConfigError(
            "missing_api_key",
            "runninghub_api_key_missing",
            "runninghub_api_key_missing",
            "RunningHub API Key 未配置，请在后端环境变量中配置，或使用本地 AI mask / 手动蒙版；最终校色前请确认 ROI / mask。",
        )
    if not config.enable_real_call:
        raise RunningHubConfigError(
            "real_call_disabled",
            "runninghub_real_call_disabled",
            "runninghub_real_call_disabled",
            "RunningHub 真实调用未启用，请使用本地 AI mask / 手动蒙版，并确认最终 ROI / mask。",
        )
    if not config.submit_endpoint or not config.poll_endpoint:
        raise RunningHubConfigError(
            "missing_endpoint",
            "runninghub_endpoint_missing",
            "runninghub_config_missing",
            "RunningHub submit / poll endpoint 未配置，请完成后端配置，并在最终校色前确认 ROI / mask。",
        )
    if not config.workflow_id and not config.app_id:
        raise RunningHubConfigError(
            "missing_workflow_config",
            "runninghub_workflow_config_missing",
            "runninghub_workflow_config_missing",
            "RunningHub 工作流配置未完成，请配置 workflowId / appId，并在最终校色前确认 ROI / mask。",
        )
    if config.model_type == "workflow" and not config.workflow_id:
        raise RunningHubConfigError(
            "missing_workflow_config",
            "runninghub_workflow_id_missing",
            "runninghub_workflow_config_missing",
            "RunningHub workflow 模式缺少 workflowId，请完成后端配置，并在最终校色前确认 ROI / mask。",
        )
    if config.model_type == "aiapp" and not config.app_id:
        raise RunningHubConfigError(
            "missing_workflow_config",
            "runninghub_app_id_missing",
            "runninghub_workflow_config_missing",
            "RunningHub aiapp 模式缺少 appId，请完成后端配置，并在最终校色前确认 ROI / mask。",
        )
    if config.model_type not in {"workflow", "aiapp", "standard"}:
        raise RunningHubConfigError(
            "invalid_config",
            "runninghub_model_type_invalid",
            "runninghub_config_invalid",
            "RunningHub 模式配置无效，请检查后端环境变量并确认 ROI / mask。",
        )

    _validate_endpoint(config.submit_endpoint, "submit endpoint")
    _validate_endpoint(config.poll_endpoint, "poll endpoint")
    try:
        node_info_list = _parse_node_info_list(config.node_info_json)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise RunningHubConfigError(
            "invalid_config",
            "runninghub_node_info_invalid",
            "runninghub_config_invalid",
            "RunningHub nodeInfoList 配置无法解析，请检查后端配置并确认 ROI / mask。",
        ) from exc
    if not node_info_list:
        raise RunningHubConfigError(
            "missing_input_mapping",
            "runninghub_node_info_missing",
            "runninghub_input_mapping_missing",
            "RunningHub 输入节点映射未配置，请设置 nodeInfoList，并在最终校色前确认 ROI / mask。",
        )


def build_runninghub_payload(
    config: RunningHubConfig,
    analysis_input: GarmentAnalysisInput,
) -> Dict[str, Any]:
    node_info_list = _parse_node_info_list(config.node_info_json)
    payload: Dict[str, Any] = {
        "apiKey": config.api_key,
        "nodeInfoList": node_info_list,
    }
    if config.model_type == "aiapp":
        payload["webappId"] = config.app_id
    else:
        payload["workflowId"] = config.workflow_id or config.app_id

    # The local image is not guessed into a wire field. nodeInfoList must contain
    # the approved RunningHub upload/reference mapping for this workflow.
    del analysis_input
    return payload


def _post_json(endpoint: str, payload: Dict[str, Any], timeout_seconds: float) -> Dict[str, Any]:
    request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    api_key = str(payload.get("apiKey", ""))
    request = Request(
        endpoint,
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "clothing-color-match-studio/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as exc:
        raise RunningHubHttpError(f"RunningHub HTTP {exc.code}") from exc
    except (TimeoutError, socket.timeout) as exc:
        raise TimeoutError("RunningHub request timed out") from exc
    except URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            raise TimeoutError("RunningHub request timed out") from exc
        raise RunningHubHttpError("RunningHub request failed") from exc

    if not response_body.strip():
        raise ValueError("RunningHub returned an empty response")
    parsed = json.loads(response_body)
    if not isinstance(parsed, dict):
        raise ValueError("RunningHub response must be a JSON object")
    return parsed


def submit_runninghub_task(config: RunningHubConfig, payload: Dict[str, Any]) -> str:
    if not config.submit_endpoint:
        raise ValueError("submit endpoint is missing")
    response = _post_json(config.submit_endpoint, payload, config.timeout_seconds)
    if response.get("code") not in {0, "0", None}:
        raise RunningHubTaskFailedError("RunningHub rejected the task")
    data = response.get("data")
    if not isinstance(data, dict):
        raise ValueError("RunningHub submit response data is missing")
    task_status = str(data.get("taskStatus", "")).upper()
    if task_status in {"FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED"}:
        raise RunningHubTaskFailedError("RunningHub task failed during submission")
    task_id = data.get("taskId")
    if task_id is None or not str(task_id).strip():
        raise ValueError("RunningHub submit response taskId is missing")
    return str(task_id)


def _task_status(payload: Dict[str, Any]) -> str:
    data = payload.get("data")
    if isinstance(data, dict):
        for field_name in ("taskStatus", "status", "state"):
            if data.get(field_name) is not None:
                return str(data[field_name]).upper()
    if isinstance(data, str):
        return data.upper()
    for field_name in ("taskStatus", "status", "state"):
        if payload.get(field_name) is not None:
            return str(payload[field_name]).upper()
    return ""


def poll_runninghub_task(config: RunningHubConfig, task_id: str) -> Dict[str, Any]:
    if not config.poll_endpoint:
        raise ValueError("poll endpoint is missing")

    for attempt in range(config.max_poll_attempts):
        response = _post_json(
            config.poll_endpoint,
            {"apiKey": config.api_key, "taskId": task_id},
            config.timeout_seconds,
        )
        if response.get("code") not in {0, "0", None}:
            raise RunningHubTaskFailedError("RunningHub poll request reported failure")

        status = _task_status(response)
        if status in {"FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED"}:
            raise RunningHubTaskFailedError("RunningHub task failed")
        if status in {"SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE", "FINISHED", "DONE"}:
            return response

        data = response.get("data")
        if isinstance(data, list) and data:
            return response
        if isinstance(data, dict) and any(key in data for key in ("analysis", "result", "results")):
            return response

        if attempt + 1 < config.max_poll_attempts:
            sleep(config.poll_interval_seconds)

    raise TimeoutError("RunningHub task polling timed out")


def _find_structured_analysis(payload: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    if "garmentCategory" in payload and "garmentDescription" in payload:
        return payload
    for key in ("analysis", "result", "output", "data"):
        nested = payload.get(key)
        found = _find_structured_analysis(nested)
        if found is not None:
            return found
    return None


def _find_natural_language(payload: Any) -> Optional[str]:
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    if not isinstance(payload, dict):
        return None
    for key in ("outputText", "resultText", "content", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for key in ("analysis", "result", "output", "data"):
        found = _find_natural_language(payload.get(key))
        if found:
            return found
    return None


def _natural_language_risk_tags(text: str) -> tuple[str, ...]:
    normalized = text.lower()
    tags: List[str] = ["runninghub_natural_language_result"]
    keyword_tags = (
        ("hanger", ("hanger", "衣架", "挂拍")),
        ("metal_clip", ("metal", "clip", "金属", "夹具")),
        ("edge_touching", ("edge", "touch", "贴边", "边缘")),
        ("complex_background", ("complex background", "复杂背景")),
    )
    for tag, keywords in keyword_tags:
        if any(keyword in normalized for keyword in keywords):
            tags.append(tag)
    return tuple(tags)


def parse_runninghub_result(
    payload: Dict[str, Any],
    result_mode: Optional[str] = None,
) -> GarmentAnalysisResult:
    structured = _find_structured_analysis(payload)
    if structured is not None:
        confidence = float(structured["confidence"])
        if confidence < 0 or confidence > 1:
            raise ValueError("confidence must be between 0 and 1")

        risk_tags = structured.get("riskTags", [])
        if not isinstance(risk_tags, list):
            raise ValueError("riskTags must be a list")

        roi_payload = structured.get("suggestedRoi")
        suggested_roi = None
        if roi_payload is not None:
            suggested_roi = SuggestedRoi(
                x=int(roi_payload["x"]),
                y=int(roi_payload["y"]),
                width=int(roi_payload["width"]),
                height=int(roi_payload["height"]),
            )
            if suggested_roi.width <= 0 or suggested_roi.height <= 0:
                raise ValueError("suggestedRoi dimensions must be positive")

        return GarmentAnalysisResult(
            provider="runninghub",
            provider_status="ready",
            garment_category=str(structured["garmentCategory"]),
            garment_description=str(structured["garmentDescription"]),
            suggested_roi=suggested_roi,
            confidence=confidence,
            risk_tags=tuple(str(tag) for tag in risk_tags),
            contains_hanger=bool(structured.get("containsHanger", False)),
            contains_metal_clip=bool(structured.get("containsMetalClip", False)),
            edge_touching=bool(structured.get("edgeTouching", False)),
            complex_background=bool(structured.get("complexBackground", False)),
            recommend_manual_mask=bool(structured.get("recommendManualMask", False)),
            user_message=str(
                structured.get(
                    "userMessage",
                    "RunningHub 建议已生成，请确认 ROI / mask 后再校色。",
                )
            ),
            safety_note=(
                "RunningHub 识别结果仅作为辅助建议，不会直接进入校色。"
                "最终校色范围以用户确认后的 ROI / mask 为准。"
            ),
        )

    natural_language = _find_natural_language(payload)
    if natural_language and result_mode in {"text", "natural_language"}:
        return GarmentAnalysisResult(
            provider="runninghub",
            provider_status="ready_with_manual_review",
            garment_category="unknown",
            garment_description=natural_language[:1000],
            suggested_roi=None,
            confidence=0.5,
            risk_tags=_natural_language_risk_tags(natural_language),
            contains_hanger=False,
            contains_metal_clip=False,
            edge_touching=False,
            complex_background=False,
            recommend_manual_mask=True,
            user_message="RunningHub 返回自然语言建议，请使用手动蒙版确认最终校色范围。",
            safety_note=(
                "自然语言结果不能直接进入校色；"
                "最终校色范围以用户确认后的 ROI / mask 为准。"
            ),
        )

    raise ValueError("RunningHub result cannot be parsed")


def to_safe_failure(
    provider_status: str,
    error_code: str,
    risk_tag: str,
    user_message: str,
) -> GarmentAnalysisResult:
    return GarmentAnalysisResult(
        provider="runninghub",
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


def analyze_with_runninghub(
    config: RunningHubConfig,
    analysis_input: GarmentAnalysisInput,
) -> GarmentAnalysisResult:
    validate_runninghub_config(config)
    payload = build_runninghub_payload(config, analysis_input)
    task_id = submit_runninghub_task(config, payload)
    task_result = poll_runninghub_task(config, task_id)
    return parse_runninghub_result(task_result, config.result_mode)


class RunningHubMultimodalProvider(MultimodalProvider):
    name = "runninghub"

    def analyze(self, analysis_input: GarmentAnalysisInput) -> GarmentAnalysisResult:
        config = load_runninghub_config()
        try:
            return analyze_with_runninghub(config, analysis_input)
        except RunningHubConfigError as exc:
            return to_safe_failure(
                exc.provider_status,
                exc.error_code,
                exc.risk_tag,
                exc.user_message,
            )
        except TimeoutError:
            return to_safe_failure(
                "timeout",
                "runninghub_timeout",
                "runninghub_timeout",
                "RunningHub 多模态识别超时，请使用本地 AI mask 或手动蒙版，并确认最终 ROI / mask。",
            )
        except RunningHubTaskFailedError:
            return to_safe_failure(
                "task_failed",
                "runninghub_task_failed",
                "runninghub_task_failed",
                "RunningHub 任务失败，请使用本地 AI mask 或手动蒙版，并确认最终 ROI / mask。",
            )
        except RunningHubHttpError:
            return to_safe_failure(
                "http_error",
                "runninghub_http_error",
                "runninghub_http_error",
                "RunningHub 请求失败，请使用本地 AI mask 或手动蒙版，并确认最终 ROI / mask。",
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return to_safe_failure(
                "invalid_response",
                "invalid_runninghub_response",
                "runninghub_invalid_response",
                "RunningHub 识别结果无法解析，请使用本地 AI mask 或手动蒙版。",
            )
        except Exception:
            return to_safe_failure(
                "provider_error",
                "runninghub_provider_error",
                "runninghub_provider_error",
                "RunningHub 多模态识别失败，请使用本地 AI mask 或手动蒙版，并确认最终 ROI / mask。",
            )

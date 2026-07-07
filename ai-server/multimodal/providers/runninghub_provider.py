import base64
import json
import re
from dataclasses import dataclass
from io import BytesIO
from math import isfinite
from os import getenv
from typing import Any, Dict, List, Optional

from multimodal.provider import MultimodalProvider
from multimodal.schemas import GarmentAnalysisInput, GarmentAnalysisResult, SuggestedRoi


class RunningHubAdapterDisabledError(RuntimeError):
    pass


class RunningHubTaskFailedError(RuntimeError):
    pass


class RunningHubLlmRequestError(RuntimeError):
    pass


class RunningHubLlmTimeoutError(TimeoutError):
    pass


class RunningHubLlmInvalidResponseError(ValueError):
    pass


CATEGORY_ALIASES = (
    (("polo shirt", "polo tee", "polo"), "polo"),
    (("short sleeved t shirt", "short sleeve t shirt", "t shirt", "tshirt", "tee"), "tshirt"),
    (("dress shirt", "button shirt", "button down shirt", "shirt"), "shirt"),
    (("denim pants", "denim trousers", "jeans", "jean"), "jeans"),
    (("trousers", "trouser", "pants", "slacks"), "trousers"),
    (("shorts", "short pants"), "shorts"),
    (("hoodie", "hooded sweatshirt", "hooded top"), "hoodie"),
    (("sweatshirt", "sweat shirt"), "sweatshirt"),
    (("knitwear", "sweater", "knit"), "knitwear"),
    (("jacket", "coat", "outerwear"), "jacket"),
    (("vest", "waistcoat"), "vest"),
)

RISK_TAG_ALIASES = (
    (("high contrast stripe", "high contrast pattern", "high contrast"), "high_contrast_pattern"),
    (("horizontal stripe", "striped pattern", "stripes", "stripe"), "striped_pattern"),
    (("chest logo", "logo present", "logo"), "logo_present"),
    (("graphic print", "printed graphic", "graphic motif"), "graphic_print"),
    (("dark fabric", "black garment", "navy garment", "navy"), "dark_fabric"),
    (("light fabric", "white garment", "pale garment"), "light_fabric"),
    (("contains hanger", "hanger present", "hanger"), "hanger_present"),
    (("metal clip present", "metal clips", "metal clip", "clips", "clip"), "metal_clip_present"),
    (("contains metal hook", "metal hook present", "metal hook"), "metal_hook_present"),
    (("touches edge", "edge touching", "cropped"), "edge_touching"),
    (("complex background", "busy background"), "complex_background"),
    (("folded garment", "folded"), "folded_garment"),
    (("wrinkled fabric", "wrinkles", "wrinkled"), "wrinkled_fabric"),
    (("partial garment", "partially visible", "partial view", "partial"), "partial_garment"),
    (("detail shot", "close up", "closeup"), "closeup_detail"),
    (("multiple garments", "multiple clothes"), "multiple_garments"),
    (("collar shadow",), "collar_shadow"),
    (("shadow risk", "strong shadow", "shadow"), "shadow_risk"),
    (("low contrast",), "low_contrast"),
    (("reflective material", "reflective fabric", "reflection"), "reflective_material"),
)

HIGH_RISK_TAGS = frozenset(
    {
        "hanger_present",
        "metal_clip_present",
        "metal_hook_present",
        "edge_touching",
        "complex_background",
        "folded_garment",
        "partial_garment",
        "closeup_detail",
        "multiple_garments",
        "shadow_risk",
        "collar_shadow",
        "low_contrast",
        "high_contrast_pattern",
        "reflective_material",
    }
)


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
    enable_real_call: bool
    llm_base_url: str
    llm_model: str
    llm_max_tokens: int
    llm_temperature: float

    def __repr__(self) -> str:
        return (
            "RunningHubConfig("
            "api_key='<redacted>', "
            f"base_url={self.base_url!r}, workflow_id={self.workflow_id!r}, "
            f"app_id={self.app_id!r}, model_type={self.model_type!r}, "
            f"timeout_seconds={self.timeout_seconds!r}, "
            f"poll_interval_seconds={self.poll_interval_seconds!r}, "
            f"max_poll_attempts={self.max_poll_attempts!r}, "
            f"result_mode={self.result_mode!r}, "
            f"enable_real_call={self.enable_real_call!r}, "
            f"llm_base_url={self.llm_base_url!r}, llm_model={self.llm_model!r}, "
            f"llm_max_tokens={self.llm_max_tokens!r}, "
            f"llm_temperature={self.llm_temperature!r})"
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


def _temperature(raw_value: str, default_value: float) -> float:
    try:
        value = float(raw_value)
    except ValueError:
        return default_value
    return value if 0 <= value <= 2 else default_value


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
        enable_real_call=_env_enabled("RUNNINGHUB_ENABLE_REAL_CALL"),
        llm_base_url=(
            getenv("RUNNINGHUB_LLM_BASE_URL", "https://llm.runninghub.cn/v1").strip()
            or "https://llm.runninghub.cn/v1"
        ),
        llm_model=(
            getenv("RUNNINGHUB_LLM_MODEL", "qwen/qwen3.7-plus").strip()
            or "qwen/qwen3.7-plus"
        ),
        llm_max_tokens=_positive_int(getenv("RUNNINGHUB_LLM_MAX_TOKENS", "2048"), 2048),
        llm_temperature=_temperature(getenv("RUNNINGHUB_LLM_TEMPERATURE", "0.1"), 0.1),
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


RUNNINGHUB_VLM_PROMPT = """You are a garment visual analysis assistant.
Analyze only the primary garment in the supplied image. Do not edit the image, do not
generate an image, and do not propose color-transfer pixels. Return exactly one JSON
object and no Markdown. The JSON must contain these fields:
garmentCategory, garmentDescription, suggestedRoi, confidence, riskTags,
containsHanger, containsMetalClip, edgeTouching, complexBackground,
recommendManualMask, userMessage.

suggestedRoi must be null or an object with x, y, width, height in original-image pixel
coordinates. confidence must be between 0 and 1. riskTags must be an array of short
strings. Be conservative around hangers, clips, skin, complex backgrounds, occlusion,
and edge-touching garments. The result is only advice before garment color calibration.
The user must confirm the final ROI and pixel mask before color transfer. The userMessage
must repeat that confirmation requirement.
"""


def _image_to_data_url(analysis_input: GarmentAnalysisInput) -> str:
    image_buffer = BytesIO()
    analysis_input.image.convert("RGB").save(image_buffer, format="JPEG", quality=90)
    encoded_image = base64.b64encode(image_buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded_image}"


def _extract_chat_content(response: Any) -> str:
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, TypeError) as exc:
        raise RunningHubLlmInvalidResponseError("missing chat completion content") from exc

    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
            elif isinstance(getattr(part, "text", None), str):
                text_parts.append(part.text)
        combined_text = "".join(text_parts).strip()
        if combined_text:
            return combined_text
    raise RunningHubLlmInvalidResponseError("empty chat completion content")


def validate_runninghub_llm_config(config: RunningHubConfig) -> None:
    if config.model_type != "llm_vlm":
        raise ValueError("RUNNINGHUB_MODEL_TYPE must be llm_vlm")
    if not config.api_key:
        raise ValueError("RUNNINGHUB_API_KEY is missing")
    if not config.enable_real_call:
        raise ValueError("RUNNINGHUB_ENABLE_REAL_CALL is disabled")
    if not config.llm_base_url.startswith(("https://", "http://127.0.0.1", "http://localhost")):
        raise ValueError("RUNNINGHUB_LLM_BASE_URL must use HTTPS")
    if not config.llm_model:
        raise ValueError("RUNNINGHUB_LLM_MODEL is missing")


def _create_openai_client(config: RunningHubConfig) -> Any:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RunningHubLlmRequestError("OpenAI-compatible client is not installed") from exc
    return OpenAI(
        api_key=config.api_key,
        base_url=config.llm_base_url,
        timeout=config.timeout_seconds,
        max_retries=0,
    )


def _is_timeout_exception(exc: BaseException) -> bool:
    current: Optional[BaseException] = exc
    for _ in range(4):
        if current is None:
            break
        if isinstance(current, TimeoutError) or current.__class__.__name__ in {
            "APITimeoutError",
            "ConnectTimeout",
            "ReadTimeout",
            "TimeoutException",
        }:
            return True
        current = current.__cause__ or current.__context__
    return False


def _required_bool(payload: Dict[str, Any], field_name: str) -> bool:
    value = payload.get(field_name)
    if not isinstance(value, bool):
        raise RunningHubLlmInvalidResponseError(f"{field_name} must be boolean")
    return value


def _normalized_phrase(value: str) -> str:
    camel_case_split = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", value)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", camel_case_split.lower()).split())


def _contains_phrase(value: str, phrase: str) -> bool:
    return f" {phrase} " in f" {value} "


def normalize_garment_category(value: str, description: str = "") -> str:
    normalized = _normalized_phrase(value)
    description_normalized = _normalized_phrase(description)
    if any(
        _contains_phrase(text, alias)
        for text in (normalized, description_normalized)
        for alias in ("hoodie", "hooded sweatshirt", "hooded top")
    ):
        return "hoodie"
    if normalized in {"unknown", "unclear", "other", ""}:
        return "unknown"
    for aliases, category in CATEGORY_ALIASES:
        if any(_contains_phrase(normalized, alias) for alias in aliases):
            return category
    return "unknown"


def normalize_risk_tags(values: List[str]) -> List[str]:
    normalized_tags: List[str] = []
    for value in values:
        normalized = _normalized_phrase(value)
        mapped = next(
            (
                risk_tag
                for aliases, risk_tag in RISK_TAG_ALIASES
                if any(_contains_phrase(normalized, alias) for alias in aliases)
            ),
            "unknown_risk",
        )
        if mapped not in normalized_tags:
            normalized_tags.append(mapped)
    return normalized_tags


def _append_unique(values: List[str], value: str) -> None:
    if value not in values:
        values.append(value)


def get_roi_quality(
    suggested_roi: Optional[SuggestedRoi],
    image_size: tuple[int, int],
) -> tuple[Optional[float], List[str]]:
    if suggested_roi is None:
        return None, []

    image_width, image_height = image_size
    image_area = image_width * image_height
    roi_area = suggested_roi.width * suggested_roi.height
    coverage_ratio = roi_area / image_area if image_area else 0.0
    flags: List[str] = []
    if coverage_ratio >= 0.95:
        flags.append("full_image_roi")
    elif coverage_ratio >= 0.85:
        flags.append("large_roi")
    if (
        suggested_roi.x == 0
        or suggested_roi.y == 0
        or suggested_roi.x + suggested_roi.width >= image_width
        or suggested_roi.y + suggested_roi.height >= image_height
    ):
        flags.append("edge_touching_roi")
    if coverage_ratio <= 0.05:
        flags.append("small_roi")
    return round(coverage_ratio, 6), flags


def parse_runninghub_vlm_payload(
    payload: Dict[str, Any],
    analysis_input: GarmentAnalysisInput,
) -> GarmentAnalysisResult:
    required_fields = {
        "garmentCategory",
        "garmentDescription",
        "suggestedRoi",
        "confidence",
        "riskTags",
        "containsHanger",
        "containsMetalClip",
        "edgeTouching",
        "complexBackground",
        "recommendManualMask",
        "userMessage",
    }
    missing_fields = sorted(required_fields.difference(payload))
    if missing_fields:
        raise RunningHubLlmInvalidResponseError(
            f"missing required fields: {', '.join(missing_fields)}"
        )

    garment_category = payload["garmentCategory"]
    garment_description = payload["garmentDescription"]
    user_message = payload["userMessage"]
    if not isinstance(garment_category, str) or not garment_category.strip():
        raise RunningHubLlmInvalidResponseError("garmentCategory must be non-empty text")
    if not isinstance(garment_description, str) or not garment_description.strip():
        raise RunningHubLlmInvalidResponseError("garmentDescription must be non-empty text")
    if not isinstance(user_message, str) or not user_message.strip():
        raise RunningHubLlmInvalidResponseError("userMessage must be non-empty text")

    confidence_value = payload["confidence"]
    if isinstance(confidence_value, bool) or not isinstance(confidence_value, (int, float)):
        raise RunningHubLlmInvalidResponseError("confidence must be numeric")
    confidence = float(confidence_value)
    if not isfinite(confidence) or confidence < 0 or confidence > 1:
        raise RunningHubLlmInvalidResponseError("confidence must be between 0 and 1")

    raw_risk_tags = payload["riskTags"]
    if not isinstance(raw_risk_tags, list) or not all(
        isinstance(tag, str) for tag in raw_risk_tags
    ):
        raise RunningHubLlmInvalidResponseError("riskTags must be an array of strings")

    contains_hanger = _required_bool(payload, "containsHanger")
    contains_metal_clip = _required_bool(payload, "containsMetalClip")
    edge_touching = _required_bool(payload, "edgeTouching")
    complex_background = _required_bool(payload, "complexBackground")
    model_recommends_manual_mask = _required_bool(payload, "recommendManualMask")
    normalized_risk_tags = normalize_risk_tags(raw_risk_tags)
    if contains_hanger:
        _append_unique(normalized_risk_tags, "hanger_present")
    if contains_metal_clip:
        _append_unique(normalized_risk_tags, "metal_clip_present")
    if edge_touching:
        _append_unique(normalized_risk_tags, "edge_touching")
    if complex_background:
        _append_unique(normalized_risk_tags, "complex_background")
    high_risk_detected = any(tag in HIGH_RISK_TAGS for tag in normalized_risk_tags)
    recommend_manual_mask = model_recommends_manual_mask or high_risk_detected

    suggested_roi = None
    roi_payload = payload["suggestedRoi"]
    if roi_payload is not None:
        if not isinstance(roi_payload, dict):
            raise RunningHubLlmInvalidResponseError("suggestedRoi must be null or an object")
        try:
            coordinates = [roi_payload[key] for key in ("x", "y", "width", "height")]
        except KeyError as exc:
            raise RunningHubLlmInvalidResponseError("suggestedRoi fields are incomplete") from exc
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in coordinates):
            raise RunningHubLlmInvalidResponseError("suggestedRoi fields must be numeric")
        numeric_coordinates = [float(value) for value in coordinates]
        if not all(isfinite(value) for value in numeric_coordinates):
            raise RunningHubLlmInvalidResponseError("suggestedRoi fields must be finite")
        x, y, width, height = (round(value) for value in numeric_coordinates)
        image_width, image_height = analysis_input.image.size
        if (
            x < 0
            or y < 0
            or width <= 0
            or height <= 0
            or x + width > image_width
            or y + height > image_height
        ):
            raise RunningHubLlmInvalidResponseError("suggestedRoi is outside the source image")
        suggested_roi = SuggestedRoi(x=x, y=y, width=width, height=height)

    roi_coverage_ratio, roi_quality_flags = get_roi_quality(
        suggested_roi,
        analysis_input.image.size,
    )
    risky_roi = any(
        flag in {"large_roi", "full_image_roi", "edge_touching_roi"}
        for flag in roi_quality_flags
    )
    recommend_manual_mask = recommend_manual_mask or risky_roi

    safe_user_message = user_message.strip()
    if high_risk_detected and not model_recommends_manual_mask:
        safe_user_message = (
            f"{safe_user_message} 检测到高风险场景，建议使用手动蒙版确认校色区域。"
        )
    elif "striped_pattern" in normalized_risk_tags:
        safe_user_message = (
            f"{safe_user_message} 请确认主色区域与条纹区域是否都需要校色。"
        )
    if risky_roi:
        safe_user_message = (
            f"{safe_user_message} 建议 ROI 范围较大或贴边，请人工确认后再使用。"
        )
    elif "small_roi" in roi_quality_flags:
        safe_user_message = f"{safe_user_message} 建议 ROI 过小，请检查是否只覆盖了局部服装。"
    if "ROI" not in safe_user_message or not any(
        token in safe_user_message.lower() for token in ("mask", "蒙版")
    ):
        safe_user_message = f"{safe_user_message} 请确认 ROI / 蒙版后再校色。"

    return GarmentAnalysisResult(
        provider="runninghub",
        provider_status="ready",
        garment_category=normalize_garment_category(
            garment_category,
            garment_description,
        ),
        raw_garment_category=garment_category.strip(),
        garment_description=garment_description.strip(),
        suggested_roi=suggested_roi,
        confidence=confidence,
        risk_tags=tuple(normalized_risk_tags),
        raw_risk_tags=tuple(tag.strip() for tag in raw_risk_tags if tag.strip()),
        roi_coverage_ratio=roi_coverage_ratio,
        roi_quality_flags=tuple(roi_quality_flags),
        contains_hanger=contains_hanger,
        contains_metal_clip=contains_metal_clip,
        edge_touching=edge_touching,
        complex_background=complex_background,
        recommend_manual_mask=recommend_manual_mask,
        user_message=safe_user_message,
        safety_note=(
            "RunningHub 识别结果仅作为辅助建议，不会直接进入校色。"
            "最终校色范围以用户确认后的 ROI / mask 为准。"
        ),
    )


def analyze_with_runninghub_llm_vlm(
    config: RunningHubConfig,
    analysis_input: GarmentAnalysisInput,
) -> GarmentAnalysisResult:
    validate_runninghub_llm_config(config)
    roi_context = analysis_input.roi.to_response() if analysis_input.roi else None
    user_text = (
        f"Original image size: {analysis_input.image.size[0]} x {analysis_input.image.size[1]}. "
        f"Role: {analysis_input.role}. Existing ROI: {json.dumps(roi_context)}. "
        "Analyze the primary garment and return the required JSON only."
    )
    try:
        client = _create_openai_client(config)
        response = client.chat.completions.create(
            model=config.llm_model,
            messages=[
                {"role": "system", "content": RUNNINGHUB_VLM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": _image_to_data_url(analysis_input)},
                        },
                    ],
                },
            ],
            max_tokens=config.llm_max_tokens,
            temperature=config.llm_temperature,
        )
    except Exception as exc:
        if _is_timeout_exception(exc):
            raise RunningHubLlmTimeoutError("RunningHub VLM request timed out") from exc
        raise RunningHubLlmRequestError("RunningHub VLM request failed") from exc

    content = _extract_chat_content(response)
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RunningHubLlmInvalidResponseError("RunningHub VLM returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RunningHubLlmInvalidResponseError("RunningHub VLM JSON must be an object")
    return parse_runninghub_vlm_payload(payload, analysis_input)


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
        if config.model_type == "llm_vlm":
            if not config.enable_real_call:
                return self._safe_failure(
                    provider_status="real_call_disabled",
                    error_code="runninghub_real_call_disabled",
                    risk_tag="runninghub_real_call_disabled",
                    user_message=(
                        "RunningHub VLM 真实调用未启用，请使用本地 AI mask / 手动蒙版，"
                        "并在最终校色前确认 ROI / mask。"
                    ),
                )
            try:
                return analyze_with_runninghub_llm_vlm(config, analysis_input)
            except RunningHubLlmTimeoutError:
                return self._safe_failure(
                    provider_status="timeout",
                    error_code="runninghub_vlm_timeout",
                    risk_tag="runninghub_timeout",
                    user_message=(
                        "RunningHub VLM 请求超时，请使用本地 AI mask / 手动蒙版，"
                        "并在最终校色前确认 ROI / mask。"
                    ),
                )
            except RunningHubLlmInvalidResponseError:
                return self._safe_failure(
                    provider_status="invalid_response",
                    error_code="invalid_runninghub_vlm_response",
                    risk_tag="runninghub_vlm_invalid_response",
                    user_message=(
                        "RunningHub 识别结果无法解析，请使用本地 AI mask 或手动蒙版。"
                    ),
                )
            except RunningHubLlmRequestError:
                return self._safe_failure(
                    provider_status="request_failed",
                    error_code="runninghub_vlm_request_failed",
                    risk_tag="runninghub_vlm_request_failed",
                    user_message=(
                        "RunningHub VLM 请求失败，请使用本地 AI mask / 手动蒙版，"
                        "并在最终校色前确认 ROI / mask。"
                    ),
                )
            except ValueError:
                return self._safe_failure(
                    provider_status="invalid_config",
                    error_code="runninghub_llm_config_invalid",
                    risk_tag="runninghub_config_invalid",
                    user_message=(
                        "RunningHub VLM 配置无效，请检查后端环境变量，"
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

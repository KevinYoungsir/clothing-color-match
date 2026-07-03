from dataclasses import dataclass
from os import getenv
from typing import Any, Dict, Optional

from multimodal.provider import MultimodalProvider
from multimodal.schemas import GarmentAnalysisInput, GarmentAnalysisResult, SuggestedRoi


class ExternalProviderDisabledError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExternalProviderConfig:
    provider_name: str
    api_key: str
    base_url: Optional[str]
    model: Optional[str]
    timeout_seconds: float

    def __repr__(self) -> str:
        return (
            "ExternalProviderConfig("
            f"provider_name={self.provider_name!r}, api_key='<redacted>', "
            f"base_url={self.base_url!r}, model={self.model!r}, "
            f"timeout_seconds={self.timeout_seconds!r})"
        )


class ExternalMultimodalProvider(MultimodalProvider):
    name = "external"

    def analyze(self, analysis_input: GarmentAnalysisInput) -> GarmentAnalysisResult:
        config = self._load_config()
        if not config.api_key:
            return self._safe_failure(
                provider_status="missing_api_key",
                error_code="missing_api_key",
                risk_tag="api_key_missing",
                user_message="多模态 API Key 未配置，请使用本地 AI mask 或手动蒙版。",
            )

        try:
            raw_response = self._request_external(config, analysis_input)
            return self._parse_provider_response(raw_response)
        except TimeoutError:
            return self._safe_failure(
                provider_status="timeout",
                error_code="provider_timeout",
                risk_tag="api_timeout",
                user_message="多模态识别超时，请使用本地 AI mask 或手动蒙版。",
            )
        except (KeyError, TypeError, ValueError):
            return self._safe_failure(
                provider_status="invalid_response",
                error_code="invalid_provider_response",
                risk_tag="invalid_provider_response",
                user_message="多模态服务返回格式异常，请使用本地 AI mask 或手动蒙版。",
            )
        except ExternalProviderDisabledError:
            return self._safe_failure(
                provider_status="provider_disabled",
                error_code="external_provider_not_implemented",
                risk_tag="external_provider_disabled",
                user_message="真实多模态 provider 当前未启用，请使用本地 AI mask 或手动蒙版。",
            )
        except Exception:
            return self._safe_failure(
                provider_status="provider_error",
                error_code="external_provider_error",
                risk_tag="external_provider_error",
                user_message="多模态识别失败，请使用本地 AI mask 或手动蒙版。",
            )

    @staticmethod
    def _load_config() -> ExternalProviderConfig:
        raw_timeout = getenv("MULTIMODAL_AI_TIMEOUT_SECONDS", "30").strip()
        try:
            timeout_seconds = float(raw_timeout)
        except ValueError:
            timeout_seconds = 30.0
        if timeout_seconds <= 0:
            timeout_seconds = 30.0

        return ExternalProviderConfig(
            provider_name=getenv("MULTIMODAL_AI_PROVIDER", "external").strip() or "external",
            api_key=getenv("MULTIMODAL_AI_API_KEY", "").strip(),
            base_url=getenv("MULTIMODAL_AI_BASE_URL") or None,
            model=getenv("MULTIMODAL_AI_MODEL") or None,
            timeout_seconds=timeout_seconds,
        )

    @staticmethod
    def _request_external(
        config: ExternalProviderConfig,
        analysis_input: GarmentAnalysisInput,
    ) -> Dict[str, Any]:
        del config, analysis_input
        # Phase 1 intentionally performs no network request. A later provider adapter
        # will implement this method with an approved HTTP client and timeout policy.
        raise ExternalProviderDisabledError

    def _parse_provider_response(self, payload: Dict[str, Any]) -> GarmentAnalysisResult:
        if not isinstance(payload, dict):
            raise ValueError("provider response must be an object")

        confidence = float(payload["confidence"])
        if confidence < 0 or confidence > 1:
            raise ValueError("confidence must be between 0 and 1")

        roi_payload = payload.get("suggestedRoi")
        suggested_roi = None
        if roi_payload is not None:
            suggested_roi = SuggestedRoi(
                x=int(roi_payload["x"]),
                y=int(roi_payload["y"]),
                width=int(roi_payload["width"]),
                height=int(roi_payload["height"]),
            )

        risk_tags = payload.get("riskTags", [])
        if not isinstance(risk_tags, list):
            raise ValueError("riskTags must be a list")

        return GarmentAnalysisResult(
            provider=self.name,
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
            safety_note="多模态识别仅用于辅助判断，不会直接进入校色。",
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
            garment_description="真实多模态识别不可用",
            suggested_roi=None,
            confidence=0.0,
            risk_tags=(risk_tag,),
            contains_hanger=False,
            contains_metal_clip=False,
            edge_touching=False,
            complex_background=False,
            recommend_manual_mask=True,
            user_message=user_message,
            safety_note="失败结果不能直接进入校色；请使用本地 AI mask 或手动蒙版。",
        )

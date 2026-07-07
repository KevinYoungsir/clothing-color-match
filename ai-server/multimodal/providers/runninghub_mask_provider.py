from dataclasses import dataclass
from os import getenv
from typing import Optional

from multimodal.schemas import GarmentMaskInput, GarmentMaskResult


def env_enabled(name: str, default_value: bool = False) -> bool:
    raw_value = getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default_value

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def positive_float(raw_value: str, default_value: float) -> float:
    try:
        value = float(raw_value)
    except ValueError:
        return default_value

    return value if value > 0 else default_value


@dataclass(frozen=True)
class RunningHubMaskConfig:
    api_key: str
    base_url: Optional[str]
    workflow_id: Optional[str]
    app_id: Optional[str]
    node_info: Optional[str]
    timeout_seconds: float
    enable_real_call: bool


def load_runninghub_mask_config() -> RunningHubMaskConfig:
    return RunningHubMaskConfig(
        api_key=(
            getenv("RUNNINGHUB_MASK_API_KEY", "").strip()
            or getenv("RUNNINGHUB_API_KEY", "").strip()
        ),
        base_url=getenv("RUNNINGHUB_MASK_BASE_URL", "").strip() or None,
        workflow_id=getenv("RUNNINGHUB_MASK_WORKFLOW_ID", "").strip() or None,
        app_id=getenv("RUNNINGHUB_MASK_APP_ID", "").strip() or None,
        node_info=getenv("RUNNINGHUB_MASK_NODE_INFO", "").strip() or None,
        timeout_seconds=positive_float(getenv("RUNNINGHUB_MASK_TIMEOUT_SECONDS", "60"), 60.0),
        enable_real_call=env_enabled("RUNNINGHUB_MASK_ENABLE_REAL_CALL"),
    )


class RunningHubGarmentMaskProvider:
    name = "runninghub_mask"

    def generate_mask(self, mask_input: GarmentMaskInput) -> GarmentMaskResult:
        config = load_runninghub_mask_config()
        image_width, image_height = mask_input.image.size

        if not config.enable_real_call:
            return self._safe_failure(
                image_width,
                image_height,
                provider_status="real_call_disabled",
                error_code="runninghub_mask_real_call_disabled",
                quality_flag="runninghub_mask_real_call_disabled",
                user_message=(
                    "RunningHub AI 蒙版真实调用未启用。本阶段仅提供 mock/offline 蒙版链路，"
                    "请使用 mock AI 蒙版或手动蒙版。"
                ),
            )

        if not config.api_key:
            return self._safe_failure(
                image_width,
                image_height,
                provider_status="missing_api_key",
                error_code="runninghub_mask_api_key_missing",
                quality_flag="runninghub_mask_api_key_missing",
                user_message=(
                    "RunningHub mask API Key 未配置。Key 只能放在后端环境变量中，"
                    "请使用 mock AI 蒙版或手动蒙版。"
                ),
            )

        if not (config.workflow_id or config.app_id) or not config.node_info:
            return self._safe_failure(
                image_width,
                image_height,
                provider_status="missing_workflow_config",
                error_code="runninghub_mask_workflow_config_missing",
                quality_flag="runninghub_mask_workflow_config_missing",
                user_message=(
                    "RunningHub segmentation workflow 尚未配置，不能生成真实 AI 蒙版。"
                    "请配置 workflow/app/nodeInfo 后再接入真实调用。"
                ),
            )

        # TODO: Wire the real RunningHub segmentation workflow after a validated
        # workflow contract, upload payload, polling states, and mask output shape
        # are available. Never return a fake success from this branch.
        return self._safe_failure(
            image_width,
            image_height,
            provider_status="request_failed",
            error_code="runninghub_mask_workflow_not_implemented",
            quality_flag="runninghub_mask_workflow_not_implemented",
            user_message=(
                "RunningHub mask workflow 已配置但真实调用适配尚未实现，"
                "不会伪装成功。请使用 mock AI 蒙版或手动蒙版。"
            ),
        )

    def _safe_failure(
        self,
        image_width: int,
        image_height: int,
        provider_status: str,
        error_code: str,
        quality_flag: str,
        user_message: str,
    ) -> GarmentMaskResult:
        return GarmentMaskResult(
            success=False,
            provider=self.name,
            provider_status=provider_status,
            error_code=error_code,
            garment_category="unknown",
            confidence=0.0,
            mask_png_base64=None,
            mask_width=image_width,
            mask_height=image_height,
            mask_coverage_ratio=None,
            mask_quality_flags=(quality_flag, "needs_manual_confirmation"),
            recommend_manual_refine=True,
            user_message=user_message,
        )


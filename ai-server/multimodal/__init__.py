from .provider import MultimodalProvider
from .providers import (
    ExternalMultimodalProvider,
    MockGarmentMaskProvider,
    MockMultimodalProvider,
    RunningHubGarmentMaskProvider,
    RunningHubMultimodalProvider,
)


def get_multimodal_provider(name: str) -> MultimodalProvider:
    normalized_name = name.strip().lower()
    if normalized_name == "mock":
        return MockMultimodalProvider()
    if normalized_name == "external":
        return ExternalMultimodalProvider()
    if normalized_name == "runninghub":
        return RunningHubMultimodalProvider()
    raise ValueError(f"不支持的多模态 provider: {name}")


def get_garment_mask_provider(name: str):
    normalized_name = name.strip().lower()
    if normalized_name in {"mock", "mock_mask"}:
        return MockGarmentMaskProvider()
    if normalized_name in {"runninghub", "runninghub_mask"}:
        return RunningHubGarmentMaskProvider()
    raise ValueError(f"不支持的 AI 蒙版 provider: {name}")


__all__ = ["MultimodalProvider", "get_multimodal_provider", "get_garment_mask_provider"]

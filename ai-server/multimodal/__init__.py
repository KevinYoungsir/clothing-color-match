from .provider import MultimodalProvider
from .providers import ExternalMultimodalProvider, MockMultimodalProvider


def get_multimodal_provider(name: str) -> MultimodalProvider:
    normalized_name = name.strip().lower()
    if normalized_name == "mock":
        return MockMultimodalProvider()
    if normalized_name == "external":
        return ExternalMultimodalProvider()
    raise ValueError(f"不支持的多模态 provider: {name}")


__all__ = ["MultimodalProvider", "get_multimodal_provider"]

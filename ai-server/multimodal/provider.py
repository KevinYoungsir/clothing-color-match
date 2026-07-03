from abc import ABC, abstractmethod

from .schemas import GarmentAnalysisInput, GarmentAnalysisResult


class MultimodalProvider(ABC):
    name: str

    @abstractmethod
    def analyze(self, analysis_input: GarmentAnalysisInput) -> GarmentAnalysisResult:
        raise NotImplementedError

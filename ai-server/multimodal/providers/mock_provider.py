from pathlib import Path
from typing import List

from multimodal.provider import MultimodalProvider
from multimodal.schemas import GarmentAnalysisInput, GarmentAnalysisResult, SuggestedRoi


class MockMultimodalProvider(MultimodalProvider):
    name = "mock"

    def analyze(self, analysis_input: GarmentAnalysisInput) -> GarmentAnalysisResult:
        file_name = Path(analysis_input.file_name).stem.lower()
        category = self._detect_category(file_name)
        contains_hanger = "hanger" in file_name or "挂拍" in file_name or "衣架" in file_name
        contains_metal_clip = any(token in file_name for token in ("clip", "metal", "夹具", "金属"))
        edge_touching = any(token in file_name for token in ("edge", "touch", "贴边", "边缘"))
        complex_background = any(
            token in file_name for token in ("complex", "background", "scene", "复杂", "场景")
        )
        risk_tags: List[str] = []

        if contains_hanger:
            risk_tags.append("hanger")
        if contains_metal_clip:
            risk_tags.append("metal_clip")
        if edge_touching:
            risk_tags.append("edge_touching")
        if complex_background:
            risk_tags.append("complex_background")

        recommend_manual_mask = bool(risk_tags)
        suggested_roi = analysis_input.roi or self._default_roi(analysis_input)
        confidence = 0.62 if recommend_manual_mask else 0.82
        user_message = (
            "检测到挂拍、衣架、金属夹具、边缘贴图或复杂背景风险，建议使用手动蒙版精修校色区域。"
            if recommend_manual_mask
            else "识别建议仅供参考，需要用户确认 ROI 和蒙版后再校色。"
        )

        return GarmentAnalysisResult(
            provider=self.name,
            garment_category=category,
            garment_description=f"mock 分析：{self._category_label(category)}",
            suggested_roi=suggested_roi,
            confidence=confidence,
            risk_tags=tuple(risk_tags),
            contains_hanger=contains_hanger,
            contains_metal_clip=contains_metal_clip,
            edge_touching=edge_touching,
            complex_background=complex_background,
            recommend_manual_mask=recommend_manual_mask,
            user_message=user_message,
            safety_note="多模态识别仅用于辅助判断，不会生成最终蒙版或直接进入校色。",
        )

    @staticmethod
    def _detect_category(file_name: str) -> str:
        category_tokens = (
            ("trouser", ("trouser", "pants", "裤")),
            ("jacket", ("jacket", "coat", "夹克", "外套")),
            ("polo", ("polo",)),
            ("tshirt", ("tshirt", "t-shirt", "tee", "t恤")),
            ("shirt", ("shirt", "衬衫")),
            ("dress", ("dress", "连衣裙")),
            ("skirt", ("skirt", "半身裙")),
        )
        for category, tokens in category_tokens:
            if any(token in file_name for token in tokens):
                return category
        return "unknown"

    @staticmethod
    def _category_label(category: str) -> str:
        return {
            "trouser": "裤装",
            "jacket": "夹克",
            "polo": "Polo 衫",
            "tshirt": "T 恤",
            "shirt": "衬衫",
            "dress": "连衣裙",
            "skirt": "半身裙",
            "unknown": "服装类别待确认",
        }[category]

    @staticmethod
    def _default_roi(analysis_input: GarmentAnalysisInput) -> SuggestedRoi:
        image_width, image_height = analysis_input.image.size
        x = round(image_width * 0.12)
        y = round(image_height * 0.08)
        width = max(1, round(image_width * 0.76))
        height = max(1, round(image_height * 0.84))
        return SuggestedRoi(x, y, min(width, image_width - x), min(height, image_height - y))

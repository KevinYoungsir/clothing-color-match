import type { GarmentRoi, UploadedImage } from "../types";

export type MultimodalAnalysisResult = {
  provider: string;
  garmentCategory: string;
  garmentDescription: string;
  suggestedRoi: GarmentRoi | null;
  confidence: number;
  riskTags: string[];
  containsHanger: boolean;
  containsMetalClip: boolean;
  edgeTouching: boolean;
  complexBackground: boolean;
  recommendManualMask: boolean;
  userMessage: string;
  shouldApplyDirectlyToColorTransfer: false;
  safetyNote: string;
};

type MultimodalAnalysisInput = {
  image: UploadedImage;
  provider?: "mock";
  role: "source" | "target";
  roi?: GarmentRoi | null;
};

type MultimodalResponse = Partial<MultimodalAnalysisResult> & {
  success?: boolean;
  message?: string;
};

function getMultimodalEndpoint() {
  const configuredEndpoint = import.meta.env.VITE_MULTIMODAL_ANALYSIS_API?.trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const segmentationEndpoint = import.meta.env.VITE_AI_SEGMENTATION_API?.trim();
  if (segmentationEndpoint) {
    return segmentationEndpoint.replace(/\/segment-garment\/?$/, "/analyze-garment");
  }

  throw new Error("多模态识别接口未配置，请设置 VITE_MULTIMODAL_ANALYSIS_API");
}

function normalizeSuggestedRoi(value: unknown, image: UploadedImage): GarmentRoi | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawRoi = value as Partial<GarmentRoi>;
  const values = [rawRoi.x, rawRoi.y, rawRoi.width, rawRoi.height];
  if (!values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error("多模态服务返回了无效的建议 ROI");
  }

  const x = Math.max(0, Math.min(image.width - 1, Math.round(rawRoi.x!)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(rawRoi.y!)));
  const right = Math.max(x + 1, Math.min(image.width, Math.round(rawRoi.x! + rawRoi.width!)));
  const bottom = Math.max(y + 1, Math.min(image.height, Math.round(rawRoi.y! + rawRoi.height!)));

  return { x, y, width: right - x, height: bottom - y };
}

export async function analyzeGarment(
  input: MultimodalAnalysisInput
): Promise<MultimodalAnalysisResult> {
  const imageResponse = await fetch(input.image.url);
  if (!imageResponse.ok) {
    throw new Error("无法读取待分析图片");
  }

  const imageBlob = await imageResponse.blob();
  const formData = new FormData();
  formData.append(
    "image",
    new File([imageBlob], input.image.fileName, {
      type: input.image.fileType || imageBlob.type || "application/octet-stream"
    })
  );
  formData.append("role", input.role);
  formData.append("provider", input.provider ?? "mock");
  if (input.roi) {
    formData.append("roi", JSON.stringify(input.roi));
  }

  const response = await fetch(getMultimodalEndpoint(), {
    method: "POST",
    body: formData
  });
  const payload = (await response.json().catch(() => null)) as MultimodalResponse | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `多模态识别请求失败 (${response.status})`);
  }
  if (payload.shouldApplyDirectlyToColorTransfer !== false) {
    throw new Error("多模态服务返回了不安全的直接校色标记");
  }

  return {
    provider: String(payload.provider ?? "mock"),
    garmentCategory: String(payload.garmentCategory ?? "unknown"),
    garmentDescription: String(payload.garmentDescription ?? "服装类别待确认"),
    suggestedRoi: normalizeSuggestedRoi(payload.suggestedRoi, input.image),
    confidence: Math.max(0, Math.min(1, Number(payload.confidence ?? 0))),
    riskTags: Array.isArray(payload.riskTags) ? payload.riskTags.map(String) : [],
    containsHanger: payload.containsHanger === true,
    containsMetalClip: payload.containsMetalClip === true,
    edgeTouching: payload.edgeTouching === true,
    complexBackground: payload.complexBackground === true,
    recommendManualMask: payload.recommendManualMask === true,
    userMessage: String(payload.userMessage ?? "识别建议仅供参考，请确认蒙版后再校色。"),
    shouldApplyDirectlyToColorTransfer: false,
    safetyNote: String(payload.safetyNote ?? "多模态结果不会直接进入校色。")
  };
}

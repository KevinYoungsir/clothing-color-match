import type { GarmentRoi, UploadedImage } from "../types";
import { maskBase64ToImageData } from "./imageCodec";

export type GarmentMaskProviderType = "mock_mask" | "runninghub_mask";

export type GarmentMaskResult = {
  success: boolean;
  provider: string;
  providerStatus: string;
  mode: "mask";
  errorCode: string | null;
  garmentCategory: string;
  rawGarmentCategory: string | null;
  confidence: number;
  suggestedRoi: GarmentRoi | null;
  maskPngBase64: string | null;
  maskWidth: number;
  maskHeight: number;
  maskCoverageRatio: number | null;
  maskQualityFlags: string[];
  recommendManualRefine: boolean;
  shouldApplyDirectlyToColorTransfer: false;
  userMessage: string;
};

type GenerateGarmentMaskInput = {
  garmentCategory?: string | null;
  image: UploadedImage;
  provider?: GarmentMaskProviderType;
  roi?: GarmentRoi | null;
  role?: "source" | "target";
};

type GarmentMaskResponse = Partial<GarmentMaskResult> & {
  message?: string;
};

function getMaskEndpoint() {
  const configuredEndpoint = import.meta.env.VITE_GARMENT_MASK_API?.trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const segmentationEndpoint = import.meta.env.VITE_AI_SEGMENTATION_API?.trim();
  if (segmentationEndpoint) {
    return segmentationEndpoint.replace(/\/segment-garment\/?$/, "/generate-garment-mask");
  }

  const multimodalEndpoint = import.meta.env.VITE_MULTIMODAL_ANALYSIS_API?.trim();
  if (multimodalEndpoint) {
    return multimodalEndpoint.replace(/\/analyze-garment\/?$/, "/generate-garment-mask");
  }

  throw new Error("AI 蒙版接口未配置，请设置 VITE_GARMENT_MASK_API 或 VITE_AI_SEGMENTATION_API");
}

function normalizeSuggestedRoi(value: unknown, image: UploadedImage): GarmentRoi | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawRoi = value as Partial<GarmentRoi>;
  const values = [rawRoi.x, rawRoi.y, rawRoi.width, rawRoi.height];
  if (!values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return null;
  }

  const x = Math.max(0, Math.min(image.width - 1, Math.round(rawRoi.x!)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(rawRoi.y!)));
  const right = Math.max(x + 1, Math.min(image.width, Math.round(rawRoi.x! + rawRoi.width!)));
  const bottom = Math.max(y + 1, Math.min(image.height, Math.round(rawRoi.y! + rawRoi.height!)));

  return { x, y, width: right - x, height: bottom - y };
}

export async function generateGarmentMask(
  input: GenerateGarmentMaskInput
): Promise<GarmentMaskResult> {
  const imageResponse = await fetch(input.image.url);
  if (!imageResponse.ok) {
    throw new Error("无法读取待生成蒙版图片");
  }

  const imageBlob = await imageResponse.blob();
  const formData = new FormData();
  formData.append(
    "image",
    new File([imageBlob], input.image.fileName, {
      type: input.image.fileType || imageBlob.type || "application/octet-stream"
    })
  );
  formData.append("provider", input.provider ?? "mock_mask");
  formData.append("role", input.role ?? "target");
  if (input.roi) {
    formData.append("roi", JSON.stringify(input.roi));
  }
  if (input.garmentCategory) {
    formData.append("garmentCategory", input.garmentCategory);
  }

  const response = await fetch(getMaskEndpoint(), {
    method: "POST",
    body: formData
  });
  const payload = (await response.json().catch(() => null)) as GarmentMaskResponse | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message || `AI 蒙版生成请求失败 (${response.status})`);
  }
  if (payload.shouldApplyDirectlyToColorTransfer !== false) {
    throw new Error("AI 蒙版服务返回了不安全的直接校色标记");
  }

  return {
    success: payload.success === true,
    provider: String(payload.provider ?? input.provider ?? "mock_mask"),
    providerStatus: String(payload.providerStatus ?? (payload.success ? "ready" : "provider_error")),
    mode: "mask",
    errorCode: payload.errorCode ? String(payload.errorCode) : null,
    garmentCategory: String(payload.garmentCategory ?? "unknown"),
    rawGarmentCategory: payload.rawGarmentCategory ? String(payload.rawGarmentCategory) : null,
    confidence: Math.max(0, Math.min(1, Number(payload.confidence ?? 0))),
    suggestedRoi: normalizeSuggestedRoi(payload.suggestedRoi, input.image),
    maskPngBase64: typeof payload.maskPngBase64 === "string" ? payload.maskPngBase64 : null,
    maskWidth: Number(payload.maskWidth ?? input.image.width),
    maskHeight: Number(payload.maskHeight ?? input.image.height),
    maskCoverageRatio:
      typeof payload.maskCoverageRatio === "number" && Number.isFinite(payload.maskCoverageRatio)
        ? payload.maskCoverageRatio
        : null,
    maskQualityFlags: Array.isArray(payload.maskQualityFlags)
      ? payload.maskQualityFlags.map(String)
      : [],
    recommendManualRefine: payload.recommendManualRefine !== false,
    shouldApplyDirectlyToColorTransfer: false,
    userMessage: String(payload.userMessage ?? payload.message ?? "AI 蒙版仅作为辅助，请确认后再校色。")
  };
}

export async function decodeGarmentMaskResultToImageData(
  result: GarmentMaskResult,
  image: UploadedImage
) {
  if (!result.success || !result.maskPngBase64) {
    throw new Error(result.userMessage || "当前没有可应用的 AI 蒙版");
  }

  return maskBase64ToImageData(result.maskPngBase64, image.width, image.height);
}


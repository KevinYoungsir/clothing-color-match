import { generateAutoGarmentMask, type AutoMaskOptions, type AutoMaskResult } from "./autoMask";
import type { GarmentRoi, MaskPoint, SegmentationProviderType } from "../types";

export type SegmentationInput = {
  imageData: ImageData;
  roi?: GarmentRoi | null;
  promptPoints?: MaskPoint[];
  promptBox?: GarmentRoi | null;
  mode?: "garment" | "reference";
  options?: Omit<AutoMaskOptions, "roi">;
};

export type SegmentationResult = AutoMaskResult & {
  provider: SegmentationProviderType;
  requestedProvider: SegmentationProviderType;
  fallbackProvider?: SegmentationProviderType;
  message?: string;
};

const aiPlaceholderFallbackMessage = "AI 分割接口已预留，尚未接入模型，已回退到传统识别。";
const remoteAiFallbackMessage = "远程 AI 分割服务接口已预留，尚未配置服务，已回退到传统识别。";

function runTraditionalSegmentation(
  input: SegmentationInput,
  requestedProvider: SegmentationProviderType = "traditional",
  message?: string
): SegmentationResult {
  const maskResult = generateAutoGarmentMask(input.imageData, {
    ...input.options,
    roi: input.roi ?? input.promptBox ?? null
  });

  return {
    ...maskResult,
    fallbackProvider: requestedProvider === "traditional" ? undefined : "traditional",
    message,
    provider: "traditional",
    requestedProvider
  };
}

export async function runGarmentSegmentation(
  input: SegmentationInput,
  providerType: SegmentationProviderType
): Promise<SegmentationResult> {
  if (providerType === "traditional") {
    return runTraditionalSegmentation(input);
  }

  if (providerType === "ai-placeholder") {
    return runTraditionalSegmentation(input, providerType, aiPlaceholderFallbackMessage);
  }

  return runTraditionalSegmentation(input, providerType, remoteAiFallbackMessage);
}

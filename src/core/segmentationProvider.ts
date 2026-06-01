import { generateAutoGarmentMask, type AutoMaskOptions, type AutoMaskResult } from "./autoMask";
import { imageDataToPngBase64, maskBase64ToImageData } from "./imageCodec";
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
const remoteAiNotConfiguredMessage = "未配置远程 AI 分割服务，已回退到传统识别。";
const remoteAiFailedMessage = "AI识别失败，已回退到传统识别。";
const remoteAiTimeoutMs = 15000;

type RemoteAiSegmentationResponse = {
  confidence?: number;
  mask?: string;
  message?: string;
  success?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRemoteAiEndpoint() {
  const endpoint = import.meta.env.VITE_AI_SEGMENTATION_API;

  return typeof endpoint === "string" && endpoint.trim().length > 0 ? endpoint.trim() : null;
}

function getMaskStats(mask: ImageData) {
  const pixelCount = mask.width * mask.height;
  const borderPixelCount = Math.max(1, mask.width * 2 + Math.max(0, mask.height - 2) * 2);
  let maskPixelCount = 0;
  let touchedBorderPixelCount = 0;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const index = (y * mask.width + x) * 4;

      if (mask.data[index + 3] <= 0) {
        continue;
      }

      maskPixelCount += 1;

      if (x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1) {
        touchedBorderPixelCount += 1;
      }
    }
  }

  const coverageRatio = pixelCount > 0 ? maskPixelCount / pixelCount : 0;

  return {
    coverageRatio,
    foregroundRatio: coverageRatio,
    touchesBorderRatio: touchedBorderPixelCount / borderPixelCount
  };
}

function createRemoteRequestBody(input: SegmentationInput) {
  const promptBox = input.promptBox ?? input.roi ?? null;

  return {
    image: imageDataToPngBase64(input.imageData),
    imageHeight: input.imageData.height,
    imageMimeType: "image/png",
    imageWidth: input.imageData.width,
    mode: input.mode ?? "garment",
    promptBox,
    promptPoints: input.promptPoints ?? [],
    roi: input.roi ?? null
  };
}

async function fetchRemoteAiMask(
  input: SegmentationInput,
  endpoint: string
): Promise<SegmentationResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), remoteAiTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify(createRemoteRequestBody(input)),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RemoteAiSegmentationResponse;

    if (!payload.success) {
      throw new Error(payload.message || "远程 AI 分割服务返回失败");
    }

    if (typeof payload.mask !== "string" || payload.mask.trim().length === 0) {
      throw new Error("远程 AI 分割服务未返回有效 mask");
    }

    const mask = await maskBase64ToImageData(
      payload.mask,
      input.imageData.width,
      input.imageData.height
    );
    const maskStats = getMaskStats(mask);
    const confidence =
      typeof payload.confidence === "number" && Number.isFinite(payload.confidence)
        ? clamp(payload.confidence, 0, 1)
        : 0.75;

    return {
      confidence,
      mask,
      message: payload.message && payload.message !== "ok" ? payload.message : "远程 AI 识别完成。",
      provider: "remote-ai",
      requestedProvider: "remote-ai",
      ...maskStats
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getRemoteAiFallbackMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `${remoteAiFailedMessage} 远程 AI 请求超时。`;
  }

  if (error instanceof Error && error.message) {
    return `${remoteAiFailedMessage} ${error.message}`;
  }

  return remoteAiFailedMessage;
}

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

  const remoteAiEndpoint = getRemoteAiEndpoint();

  if (!remoteAiEndpoint) {
    return runTraditionalSegmentation(input, providerType, remoteAiNotConfiguredMessage);
  }

  try {
    return await fetchRemoteAiMask(input, remoteAiEndpoint);
  } catch (error) {
    return runTraditionalSegmentation(input, providerType, getRemoteAiFallbackMessage(error));
  }
}

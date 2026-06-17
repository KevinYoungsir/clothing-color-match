import { generateAutoGarmentMask, type AutoMaskOptions, type AutoMaskResult } from "./autoMask";
import { downloadAlphaMaskDebugPng, imageDataToPngBlob, maskBase64ToImageData } from "./imageCodec";
import type { GarmentRoi, MaskPoint, SegmentationProviderType } from "../types";

export type SegmentationInput = {
  debugRole?: "reference" | "target";
  imageData: ImageData;
  roi?: GarmentRoi | null;
  promptPoints?: MaskPoint[];
  promptBox?: GarmentRoi | null;
  mode?: "garment" | "reference";
  options?: Omit<AutoMaskOptions, "roi">;
  sampleId?: string | null;
};

export type SegmentationResult = AutoMaskResult & {
  diagnostics?: RemoteAiDiagnostics;
  provider: SegmentationProviderType;
  requestedProvider: SegmentationProviderType;
  fallbackProvider?: SegmentationProviderType;
  message?: string;
};

const aiPlaceholderFallbackMessage = "AI 分割接口已预留，尚未接入模型，已回退到传统识别。";
const remoteAiNotConfiguredMessage = "未配置远程 AI 分割服务，已回退到传统识别。";
const remoteAiFailedMessage = "AI识别失败，已回退到传统识别。";
const defaultRemoteAiTimeoutMs = 60000;

type RemoteAiSegmentationResponse = {
  confidence?: number;
  diagnostics?: RemoteAiDiagnostics;
  mask?: string;
  message?: string;
  quality?: string;
  success?: boolean;
};

type RemoteAiDiagnostics = {
  bboxAreaRatio?: number;
  bboxWidthRatio?: number;
  lowCoverageReason?: string | null;
  partialCoverageRisk?: boolean;
  roiHeightRatio?: number;
  roiLikelyTooWide?: boolean;
  roiMaskAreaCoverage?: number;
  roiMaskForegroundCoverage?: number;
  roiMaskHeightCoverage?: number;
  roiMaskWidthCoverage?: number;
  roiTouchesImageBorder?: boolean;
  roiWidthRatio?: number;
  selectedCandidate?: {
    bboxAreaRatio?: number;
    fillRatio?: number;
    foregroundRatio?: number;
    heightRatio?: number;
    rejectedReason?: string | null;
    score?: number;
    threshold?: number;
    touchesBorder?: boolean;
    widthRatio?: number;
  };
  selectedThresholdRisk?: boolean;
  selectedTouchesBoundaryRisk?: boolean;
  touchesRoiLeftOrRight?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRemoteAiEndpoint() {
  const endpoint = import.meta.env.VITE_AI_SEGMENTATION_API;

  return typeof endpoint === "string" && endpoint.trim().length > 0 ? endpoint.trim() : null;
}

function getRemoteAiTimeoutMs() {
  const configuredValue = Number(import.meta.env.VITE_AI_SEGMENTATION_TIMEOUT_MS);

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? Math.round(configuredValue)
    : defaultRemoteAiTimeoutMs;
}

function normalizeRoi(roi: GarmentRoi | null | undefined, width: number, height: number) {
  if (!roi) {
    return null;
  }

  const x = clamp(Math.round(roi.x), 0, Math.max(0, width - 1));
  const y = clamp(Math.round(roi.y), 0, Math.max(0, height - 1));
  const right = clamp(Math.round(roi.x + roi.width), x + 1, width);
  const bottom = clamp(Math.round(roi.y + roi.height), y + 1, height);

  return {
    height: bottom - y,
    width: right - x,
    x,
    y
  };
}

function getMaskStats(mask: ImageData, roi?: GarmentRoi | null) {
  const pixelCount = mask.width * mask.height;
  const borderPixelCount = Math.max(1, mask.width * 2 + Math.max(0, mask.height - 2) * 2);
  const normalizedRoi = normalizeRoi(roi, mask.width, mask.height);
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  let minAlpha = 255;
  let maxAlpha = 0;
  let alphaSum = 0;
  let maskPixelCount = 0;
  let strongMaskPixelCount = 0;
  let touchedBorderPixelCount = 0;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const index = (y * mask.width + x) * 4;
      const alpha = mask.data[index + 3];

      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
      alphaSum += alpha;

      if (alpha <= 0) {
        continue;
      }

      maskPixelCount += 1;
      if (alpha > 128) {
        strongMaskPixelCount += 1;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1) {
        touchedBorderPixelCount += 1;
      }
    }
  }

  const coverageRatio = pixelCount > 0 ? maskPixelCount / pixelCount : 0;
  const boundingBox =
    maskPixelCount > 0
      ? {
          height: maxY - minY + 1,
          width: maxX - minX + 1,
          x: minX,
          y: minY
        }
      : null;
  const touchesRoiBoundary = Boolean(
    normalizedRoi &&
      boundingBox &&
      (boundingBox.x <= normalizedRoi.x + 2 ||
        boundingBox.y <= normalizedRoi.y + 2 ||
        boundingBox.x + boundingBox.width >= normalizedRoi.x + normalizedRoi.width - 2 ||
        boundingBox.y + boundingBox.height >= normalizedRoi.y + normalizedRoi.height - 2)
  );

  return {
    boundingBox,
    coverageRatio,
    foregroundRatio: coverageRatio,
    maxAlpha,
    meanAlpha: pixelCount > 0 ? alphaSum / pixelCount : 0,
    minAlpha,
    roi: normalizedRoi,
    strongForegroundRatio: pixelCount > 0 ? strongMaskPixelCount / pixelCount : 0,
    touchesBorderRatio: touchedBorderPixelCount / borderPixelCount,
    touchesRoiBoundary
  };
}

function appendJsonField(formData: FormData, name: string, value: unknown) {
  if (value === null || value === undefined) {
    return;
  }

  formData.append(name, JSON.stringify(value));
}

function getDebugRole(input: SegmentationInput) {
  return input.debugRole ?? (input.mode === "reference" ? "reference" : "target");
}

function sanitizeDebugFilePart(value: string | null | undefined, fallback = "unknown") {
  const normalized = value?.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function shouldDownloadDecodedRemoteMaskDebug() {
  if (!import.meta.env.DEV) {
    return false;
  }

  try {
    return (
      import.meta.env.VITE_DEBUG_REMOTE_MASK_DOWNLOAD === "1" ||
      window.localStorage.getItem("debugRemoteMaskDownload") === "1"
    );
  } catch {
    return import.meta.env.VITE_DEBUG_REMOTE_MASK_DOWNLOAD === "1";
  }
}

function downloadDecodedRemoteMaskDebug(mask: ImageData, input: SegmentationInput) {
  if (!shouldDownloadDecodedRemoteMaskDebug()) {
    return;
  }

  const role = getDebugRole(input);
  const sampleId = sanitizeDebugFilePart(input.sampleId);
  const fileName =
    role === "reference"
      ? "decoded-reference-mask.png"
      : `decoded-target-mask-${sampleId}.png`;

  try {
    downloadAlphaMaskDebugPng(mask, fileName);
  } catch (error) {
    console.warn("[remote-ai] decoded mask debug download failed", error);
  }
}

function getRemoteTargetMaskQualityIssue(
  maskStats: ReturnType<typeof getMaskStats>,
  input: SegmentationInput,
  diagnostics?: RemoteAiDiagnostics
) {
  const boundingBox = maskStats.boundingBox;

  if (!boundingBox) {
    return "远程 AI 未能可靠识别服装主体，未得到有效蒙版。";
  }

  const roi = maskStats.roi;
  const imageWidthRatio = boundingBox.width / Math.max(1, input.imageData.width);
  const imageAreaRatio =
    (boundingBox.width * boundingBox.height) /
    Math.max(1, input.imageData.width * input.imageData.height);
  const touchesImageBorder =
    boundingBox.x <= 2 ||
    boundingBox.y <= 2 ||
    boundingBox.x + boundingBox.width >= input.imageData.width - 2 ||
    boundingBox.y + boundingBox.height >= input.imageData.height - 2;
  const overCoverageMessage =
    "远程 AI 识别范围过大，可能包含背景或道具，请缩小框选范围或手动编辑蒙版。";

  if (
    imageWidthRatio >= 0.95 ||
    imageAreaRatio >= 0.8 ||
    (maskStats.foregroundRatio > 0.4 && touchesImageBorder)
  ) {
    return overCoverageMessage;
  }

  if (roi) {
    const roiWidthRatio = roi.width / Math.max(1, input.imageData.width);
    const bboxWidthRatio = boundingBox.width / Math.max(1, roi.width);
    const bboxHeightRatio = boundingBox.height / Math.max(1, roi.height);
    const bboxAreaRatio =
      (boundingBox.width * boundingBox.height) / Math.max(1, roi.width * roi.height);
    const selectedCandidate = diagnostics?.selectedCandidate;
    const selectedTouchesBorder = Boolean(selectedCandidate?.touchesBorder);
    const selectedWidthRatio = Number(selectedCandidate?.widthRatio ?? 0);
    const selectedHeightRatio = Number(selectedCandidate?.heightRatio ?? 0);
    const selectedAreaRatio = Number(selectedCandidate?.bboxAreaRatio ?? 0);
    const selectedThreshold = Number(selectedCandidate?.threshold ?? 1);
    const roiLikelyTooWide =
      diagnostics?.roiLikelyTooWide === true || roiWidthRatio > 0.92;
    const unreliableRoiMessage =
      "框选区域过宽或 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。";

    if (
      (roiLikelyTooWide &&
        (maskStats.touchesRoiBoundary ||
          selectedTouchesBorder ||
          selectedWidthRatio > 0.8 ||
          selectedAreaRatio > 0.65)) ||
      (selectedTouchesBorder && selectedWidthRatio > 0.8) ||
      selectedAreaRatio > 0.65 ||
      (maskStats.touchesRoiBoundary && bboxWidthRatio > 0.8)
    ) {
      return unreliableRoiMessage;
    }

    if (
      bboxAreaRatio >= 0.8 ||
      (bboxWidthRatio >= 0.96 && maskStats.touchesRoiBoundary)
    ) {
      return overCoverageMessage;
    }

    if (
      diagnostics?.partialCoverageRisk === true ||
      maskStats.foregroundRatio < 0.06 ||
      (selectedThreshold <= 0.35 &&
        selectedTouchesBorder &&
        selectedHeightRatio >= 0.95) ||
      (bboxWidthRatio < 0.55 && maskStats.foregroundRatio < 0.08)
    ) {
      return "AI 只识别到局部裤面，自动校色不可靠，请调整框选范围或手动编辑校色区域。";
    }

    if (
      (maskStats.foregroundRatio < 0.025 && bboxAreaRatio < 0.18) ||
      bboxWidthRatio < 0.28 ||
      bboxHeightRatio < 0.24
    ) {
      return "远程 AI 未能可靠识别服装主体，请扩大框选区域或手动编辑校色范围。";
    }
  } else {
    const bboxWidthRatio = boundingBox.width / Math.max(1, input.imageData.width);
    const bboxHeightRatio = boundingBox.height / Math.max(1, input.imageData.height);
    const bboxAreaRatio =
      (boundingBox.width * boundingBox.height) /
      Math.max(1, input.imageData.width * input.imageData.height);

    if (
      (maskStats.foregroundRatio < 0.1 && bboxAreaRatio < 0.28) ||
      bboxWidthRatio < 0.38 ||
      bboxHeightRatio < 0.32
    ) {
      return "远程 AI 仅识别到局部服装区域，请框选服装区域或手动编辑蒙版后再校色。";
    }
  }

  return null;
}

async function createRemoteRequestBody(input: SegmentationInput) {
  const promptBox = input.promptBox ?? input.roi ?? null;
  const formData = new FormData();
  const imageBlob = await imageDataToPngBlob(input.imageData);
  const debugRole = getDebugRole(input);
  const sampleId = input.sampleId ?? "";

  if (import.meta.env.DEV) {
    console.info("[remote-ai] request", {
      debugRole,
      imageHeight: input.imageData.height,
      imageWidth: input.imageData.width,
      promptBox,
      roi: input.roi ?? null,
      role: debugRole,
      sampleId: sampleId || null
    });
  }

  formData.append("debugRole", debugRole);
  formData.append("image", imageBlob, "garment.png");
  formData.append("imageHeight", String(input.imageData.height));
  formData.append("imageWidth", String(input.imageData.width));
  formData.append("mode", input.mode ?? "garment");
  formData.append("sampleId", sampleId);
  appendJsonField(formData, "promptBox", promptBox);
  appendJsonField(formData, "promptPoints", input.promptPoints ?? []);
  appendJsonField(formData, "roi", input.roi ?? null);

  return formData;
}

async function fetchRemoteAiMask(
  input: SegmentationInput,
  endpoint: string
): Promise<SegmentationResult> {
  const controller = new AbortController();
  const timeoutMs = getRemoteAiTimeoutMs();
  const startedAt = performance.now();
  const debugRole = getDebugRole(input);
  const sampleId = input.sampleId ?? null;
  const promptBox = input.promptBox ?? input.roi ?? null;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (import.meta.env.DEV) {
    console.info(
      `[remote-ai] request start role=${debugRole} sampleId=${sampleId ?? "-"} roi=${JSON.stringify(
        input.roi ?? null
      )} promptBox=${JSON.stringify(promptBox)}`
    );
    console.info(`[remote-ai] request timeoutMs=${timeoutMs}`);
  }

  try {
    if (debugRole === "target" && !sampleId?.trim()) {
      throw new Error("远程 AI 样品图标识缺失，不会使用不可靠蒙版继续校色。");
    }

    const response = await fetch(endpoint, {
      body: await createRemoteRequestBody(input),
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RemoteAiSegmentationResponse;

    if (
      payload.success &&
      payload.quality &&
      ["partial", "low_coverage", "low_confidence", "over_coverage", "roi_too_wide"].includes(
        payload.quality
      )
    ) {
      throw new Error(`${payload.message || "远程 AI 分割服务返回低质量 mask"} quality=${payload.quality}`);
    }

    if (!payload.success) {
      const qualitySuffix = payload.quality ? ` quality=${payload.quality}` : "";

      throw new Error(`${payload.message || "远程 AI 分割服务返回失败"}${qualitySuffix}`);
    }

    if (typeof payload.mask !== "string" || payload.mask.trim().length === 0) {
      throw new Error("远程 AI 分割服务未返回有效 mask");
    }

    const mask = await maskBase64ToImageData(
      payload.mask,
      input.imageData.width,
      input.imageData.height
    );
    downloadDecodedRemoteMaskDebug(mask, input);
    const maskStats = getMaskStats(mask, input.roi ?? input.promptBox ?? null);
    const remoteTargetQualityIssue =
      debugRole === "target"
        ? getRemoteTargetMaskQualityIssue(maskStats, input, payload.diagnostics)
        : null;

    if (
      import.meta.env.DEV &&
      debugRole === "target" &&
      (mask.width !== input.imageData.width || mask.height !== input.imageData.height)
    ) {
      console.warn("[mask-debug] target backend/frontend dimension mismatch", {
        imageHeight: input.imageData.height,
        imageWidth: input.imageData.width,
        maskHeight: mask.height,
        maskWidth: mask.width,
        role: debugRole,
        sampleId
      });
    }
    const confidence =
      typeof payload.confidence === "number" && Number.isFinite(payload.confidence)
        ? clamp(payload.confidence, 0, 1)
        : 0.75;
    const remoteMessage =
      payload.message && payload.message !== "ok" ? payload.message : "远程 AI 识别完成。";
    const boundaryWarning = maskStats.touchesRoiBoundary
      ? "AI 识别结果触碰框选边界，建议扩大框选区域或清除框选区域后重试。"
      : null;

    if (import.meta.env.DEV) {
      console.debug("[remote-ai] mask decoded", {
        boundingBox: maskStats.boundingBox,
        confidence,
        fallbackProvider: null,
        foregroundRatio: maskStats.foregroundRatio,
        imageHeight: input.imageData.height,
        imageWidth: input.imageData.width,
        maskHeight: mask.height,
        maskWidth: mask.width,
        maxAlpha: maskStats.maxAlpha,
        meanAlpha: maskStats.meanAlpha,
        minAlpha: maskStats.minAlpha,
        requestedProvider: "remote-ai",
        role: debugRole,
        roi: maskStats.roi,
        sampleId,
        strongForegroundRatio: maskStats.strongForegroundRatio,
        touchesRoiBoundary: maskStats.touchesRoiBoundary
      });
    }

    if (remoteTargetQualityIssue) {
      throw new Error(remoteTargetQualityIssue);
    }

    if (import.meta.env.DEV) {
      console.info(
        `[remote-ai] request finished durationMs=${Math.round(performance.now() - startedAt)}`
      );
    }

    return {
      confidence,
      diagnostics: payload.diagnostics,
      mask,
      message: [remoteMessage, boundaryWarning].filter(Boolean).join(" "),
      provider: "remote-ai",
      requestedProvider: "remote-ai",
      ...maskStats
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      const reason =
        error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : error instanceof Error
            ? error.message
            : String(error);
      console.warn(
        `[remote-ai] request failed durationMs=${Math.round(
          performance.now() - startedAt
        )} reason=${reason}`
      );
    }

    throw error;
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

function getFallbackMaskQualityIssue(result: SegmentationResult, input: SegmentationInput) {
  const maskStats = getMaskStats(result.mask, input.roi ?? input.promptBox ?? null);
  const boundingBox = maskStats.boundingBox;
  const bboxAreaRatio = boundingBox
    ? (boundingBox.width * boundingBox.height) / Math.max(1, result.mask.width * result.mask.height)
    : 0;

  if (!boundingBox || maskStats.foregroundRatio <= 0) {
    return "传统识别没有得到有效前景。";
  }

  if (maskStats.foregroundRatio > 0.65) {
    return `传统识别前景比例过大（${maskStats.foregroundRatio.toFixed(3)}）。`;
  }

  if (bboxAreaRatio > 0.78) {
    return `传统识别 bbox 过大（${bboxAreaRatio.toFixed(3)}）。`;
  }

  if (maskStats.touchesBorderRatio > 0.24) {
    return `传统识别严重触边（${maskStats.touchesBorderRatio.toFixed(3)}）。`;
  }

  if (boundingBox.width / Math.max(1, result.mask.width) > 0.92) {
    return "传统识别横向覆盖过宽。";
  }

  return null;
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
    const errorMessage = error instanceof Error ? error.message : "";
    const debugRole = getDebugRole(input);
    const isRemoteMaskQualityFailure =
      debugRole === "target" &&
      /仅识别到局部服装区域|未覆盖服饰主体|识别结果异常|识别范围过大|框选区域过宽|蒙版不可靠|样品图标识缺失|mask bbox|未能可靠识别服装主体|partial|low_coverage|low_confidence|over_coverage|roi_too_wide/.test(
        errorMessage
      );

    if (isRemoteMaskQualityFailure) {
      throw new Error(
        `${errorMessage || "远程 AI 仅得到低质量服装蒙版。"} 不会使用该蒙版继续校色；请缩小框选范围或手动编辑蒙版。`
      );
    }

    const fallbackMessage = getRemoteAiFallbackMessage(error);
    const fallbackResult = runTraditionalSegmentation(input, providerType, fallbackMessage);
    const fallbackIssue = getFallbackMaskQualityIssue(fallbackResult, input);

    if (fallbackIssue) {
      throw new Error(
        `${fallbackMessage} ${fallbackIssue} 远程 AI 与传统识别均未得到可靠服装蒙版，请手动编辑校色范围或框选服装区域。`
      );
    }

    return fallbackResult;
  }
}

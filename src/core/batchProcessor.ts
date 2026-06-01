import {
  applyImageAdjustments,
  isDefaultAdjustmentParams,
  type AdjustmentParams
} from "./adjustment";
import { runGarmentSegmentation, type SegmentationResult } from "./segmentationProvider";
import { transferLabColor } from "./colorTransfer";
import { loadImageDataFromUrl } from "./imageLoader";
import { hasMaskPixels } from "./maskUtils";
import type {
  ColorCorrectionScope,
  GarmentRoi,
  MaskRecognitionStatus,
  MaskState,
  SampleProcessStatus,
  SegmentationProviderType,
  UploadedImage
} from "../types";

export type AutoColorParams = {
  colorStrength: number;
  colorCorrectionScope: ColorCorrectionScope;
  lightnessBlend: number;
  shadowProtection: number;
  highlightProtection: number;
  maskFeather: number;
  segmentationProviderType: SegmentationProviderType;
};

export type BatchImageStatus = Exclude<SampleProcessStatus, "idle" | "selected" | "recognition-failed">;

export type BatchItemStatus = {
  imageId: string;
  fileName: string;
  status: BatchImageStatus;
  message?: string;
};

export type ProcessedSampleResult = {
  image: UploadedImage;
  originalImageData: ImageData;
  colorTransferredImageData: ImageData;
  finalImageData: ImageData;
};

export type BatchProcessResult = BatchItemStatus & {
  result?: ProcessedSampleResult;
};

type ProcessSampleImageOptions = {
  adjustmentParams: AdjustmentParams;
  autoParams: AutoColorParams;
  referenceImageData: ImageData;
  referenceMask?: ImageData | null;
  sampleImage: UploadedImage;
  targetMask?: ImageData | null;
};

type ProcessBatchImagesOptions = {
  adjustmentParams: AdjustmentParams;
  autoParams: AutoColorParams;
  masks: Record<string, MaskState>;
  maskStatuses?: Record<string, MaskRecognitionStatus>;
  onStatusChange?: (status: BatchItemStatus) => void;
  referenceImageData: ImageData;
  referenceMask?: ImageData | null;
  samples: UploadedImage[];
  autoMaskFeather?: number;
  garmentRois?: Record<string, GarmentRoi>;
  minAutoMaskConfidence?: number;
  onAutoMaskGenerated?: (image: UploadedImage, result: SegmentationResult) => void;
};

function createStatus(
  image: UploadedImage,
  status: BatchImageStatus,
  message?: string
): BatchItemStatus {
  return {
    fileName: image.fileName,
    imageId: image.id,
    message,
    status
  };
}

function createFullImageMask(width: number, height: number) {
  const mask = new ImageData(width, height);

  for (let index = 3; index < mask.data.length; index += 4) {
    mask.data[index] = 255;
  }

  return mask;
}

function hasUsableMask(mask: ImageData | null | undefined) {
  return Boolean(mask && hasMaskPixels(mask));
}

function isAutoMaskResultUsable(result: SegmentationResult, minConfidence: number) {
  const hasUnsafeCoverage = result.coverageRatio > 0.65;
  const hasUnsafeBorderTouch =
    result.touchesBorderRatio > 0.26 ||
    (result.coverageRatio > 0.5 && result.touchesBorderRatio > 0.16);

  return (
    hasMaskPixels(result.mask) &&
    result.confidence >= minConfidence &&
    !hasUnsafeCoverage &&
    !hasUnsafeBorderTouch
  );
}

export async function processSampleImage({
  adjustmentParams,
  autoParams,
  referenceImageData,
  referenceMask,
  sampleImage,
  targetMask
}: ProcessSampleImageOptions): Promise<ProcessedSampleResult> {
  const isFullImageScope = autoParams.colorCorrectionScope === "full-image";

  if (!isFullImageScope && !hasUsableMask(referenceMask)) {
    throw new Error("请先选择标准图衣服参考区域");
  }

  if (!isFullImageScope && !hasUsableMask(targetMask)) {
    throw new Error("缺少样品图衣服蒙版");
  }

  const originalImageData = await loadImageDataFromUrl(sampleImage.url, sampleImage.width, sampleImage.height);
  const transferResult = transferLabColor({
    ...autoParams,
    fullImageMode: isFullImageScope,
    referenceImageData,
    referenceMask: hasUsableMask(referenceMask) ? referenceMask : null,
    targetImageData: originalImageData,
    targetMask: isFullImageScope ? null : targetMask
  });
  const adjustmentMask = isFullImageScope
    ? createFullImageMask(originalImageData.width, originalImageData.height)
    : targetMask!;
  const finalImageData = isDefaultAdjustmentParams(adjustmentParams)
    ? transferResult.imageData
    : applyImageAdjustments({
        baseImageData: transferResult.imageData,
        originalImageData,
        params: adjustmentParams,
        targetMask: adjustmentMask
      });

  return {
    colorTransferredImageData: transferResult.imageData,
    finalImageData,
    image: sampleImage,
    originalImageData
  };
}

function processLoadedSampleImage(
  sampleImage: UploadedImage,
  originalImageData: ImageData,
  referenceImageData: ImageData,
  referenceMask: ImageData | null | undefined,
  targetMask: ImageData | null | undefined,
  autoParams: AutoColorParams,
  adjustmentParams: AdjustmentParams
): ProcessedSampleResult {
  const isFullImageScope = autoParams.colorCorrectionScope === "full-image";
  const transferResult = transferLabColor({
    ...autoParams,
    fullImageMode: isFullImageScope,
    referenceImageData,
    referenceMask: hasUsableMask(referenceMask) ? referenceMask : null,
    targetImageData: originalImageData,
    targetMask: isFullImageScope ? null : targetMask
  });
  const adjustmentMask = isFullImageScope
    ? createFullImageMask(originalImageData.width, originalImageData.height)
    : targetMask!;
  const finalImageData = isDefaultAdjustmentParams(adjustmentParams)
    ? transferResult.imageData
    : applyImageAdjustments({
        baseImageData: transferResult.imageData,
        originalImageData,
        params: adjustmentParams,
        targetMask: adjustmentMask
      });

  return {
    colorTransferredImageData: transferResult.imageData,
    finalImageData,
    image: sampleImage,
    originalImageData
  };
}

export async function processBatchImages({
  adjustmentParams,
  autoParams,
  autoMaskFeather = 2,
  garmentRois = {},
  masks,
  maskStatuses = {},
  minAutoMaskConfidence = 0.45,
  onAutoMaskGenerated,
  onStatusChange,
  referenceImageData,
  referenceMask,
  samples
}: ProcessBatchImagesOptions): Promise<BatchProcessResult[]> {
  const results: BatchProcessResult[] = [];
  const scope = autoParams.colorCorrectionScope;

  for (const sample of samples) {
    const maskState = masks[sample.id];
    const maskStatus = maskStatuses[sample.id] ?? "unrecognized";
    const garmentRoi = garmentRois[sample.id] ?? null;
    let targetMask: ImageData | null = maskState?.imageData ?? null;

    onStatusChange?.(createStatus(sample, "processing", "处理中"));

    try {
      const originalImageData = await loadImageDataFromUrl(sample.url, sample.width, sample.height);
      const hasCurrentTargetMask = Boolean(targetMask && hasMaskPixels(targetMask));
      const shouldUseCurrentMask = hasCurrentTargetMask && (!garmentRoi || maskStatus === "manual");

      if (scope === "full-image") {
        targetMask = null;
      } else if (scope === "manual-mask") {
        if (!hasCurrentTargetMask) {
          const status = createStatus(sample, "missing-mask", "缺少蒙版");
          onStatusChange?.(status);
          results.push(status);
          continue;
        }
      } else if (!shouldUseCurrentMask) {
        const autoMaskResult = await runGarmentSegmentation(
          {
            imageData: originalImageData,
            mode: "garment",
            options: {
              feather: autoMaskFeather
            },
            roi: garmentRoi
          },
          autoParams.segmentationProviderType
        );

        if (!isAutoMaskResultUsable(autoMaskResult, minAutoMaskConfidence)) {
          const status = createStatus(sample, "needs-manual-fix", "需手动修正");
          onStatusChange?.(status);
          results.push(status);
          continue;
        }

        targetMask = autoMaskResult.mask;
        onAutoMaskGenerated?.(sample, autoMaskResult);
      }

      const result = processLoadedSampleImage(
        sample,
        originalImageData,
        referenceImageData,
        referenceMask,
        targetMask,
        autoParams,
        adjustmentParams
      );
      const status = createStatus(sample, "done", "已完成");

      onStatusChange?.(status);
      results.push({
        ...status,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "处理失败";
      const status = createStatus(sample, "failed", message);

      onStatusChange?.(status);
      results.push(status);
    }
  }

  return results;
}

import {
  applyImageAdjustments,
  isDefaultAdjustmentParams,
  type AdjustmentParams
} from "./adjustment";
import { generateAutoGarmentMask, type AutoMaskResult } from "./autoMask";
import { transferLabColor } from "./colorTransfer";
import { loadImageDataFromUrl } from "./imageLoader";
import { hasMaskPixels } from "./maskUtils";
import type { MaskState, UploadedImage } from "../types";

export type AutoColorParams = {
  colorStrength: number;
  shadowProtection: number;
  highlightProtection: number;
  maskFeather: number;
};

export type BatchImageStatus = "queued" | "processing" | "done" | "missing-mask" | "failed";

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
  referenceMask: ImageData;
  sampleImage: UploadedImage;
  targetMask: ImageData;
};

type ProcessBatchImagesOptions = {
  adjustmentParams: AdjustmentParams;
  autoParams: AutoColorParams;
  masks: Record<string, MaskState>;
  onStatusChange?: (status: BatchItemStatus) => void;
  referenceImageData: ImageData;
  referenceMask: ImageData;
  samples: UploadedImage[];
  autoMaskFeather?: number;
  minAutoMaskConfidence?: number;
  onAutoMaskGenerated?: (image: UploadedImage, result: AutoMaskResult) => void;
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

export async function processSampleImage({
  adjustmentParams,
  autoParams,
  referenceImageData,
  referenceMask,
  sampleImage,
  targetMask
}: ProcessSampleImageOptions): Promise<ProcessedSampleResult> {
  if (!hasMaskPixels(referenceMask)) {
    throw new Error("请先选择标准图衣服参考区域");
  }

  if (!hasMaskPixels(targetMask)) {
    throw new Error("缺少样品图衣服蒙版");
  }

  const originalImageData = await loadImageDataFromUrl(sampleImage.url, sampleImage.width, sampleImage.height);
  const transferResult = transferLabColor({
    ...autoParams,
    referenceImageData,
    referenceMask,
    targetImageData: originalImageData,
    targetMask
  });
  const finalImageData = isDefaultAdjustmentParams(adjustmentParams)
    ? transferResult.imageData
    : applyImageAdjustments({
        baseImageData: transferResult.imageData,
        originalImageData,
        params: adjustmentParams,
        targetMask
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
  referenceMask: ImageData,
  targetMask: ImageData,
  autoParams: AutoColorParams,
  adjustmentParams: AdjustmentParams
): ProcessedSampleResult {
  const transferResult = transferLabColor({
    ...autoParams,
    referenceImageData,
    referenceMask,
    targetImageData: originalImageData,
    targetMask
  });
  const finalImageData = isDefaultAdjustmentParams(adjustmentParams)
    ? transferResult.imageData
    : applyImageAdjustments({
        baseImageData: transferResult.imageData,
        originalImageData,
        params: adjustmentParams,
        targetMask
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
  masks,
  minAutoMaskConfidence = 0.25,
  onAutoMaskGenerated,
  onStatusChange,
  referenceImageData,
  referenceMask,
  samples
}: ProcessBatchImagesOptions): Promise<BatchProcessResult[]> {
  const results: BatchProcessResult[] = [];

  for (const sample of samples) {
    const maskState = masks[sample.id];
    let targetMask = maskState?.imageData ?? null;

    onStatusChange?.(createStatus(sample, "processing", "处理中"));

    try {
      const originalImageData = await loadImageDataFromUrl(sample.url, sample.width, sample.height);

      if (!targetMask || !hasMaskPixels(targetMask)) {
        const autoMaskResult = generateAutoGarmentMask(originalImageData, { feather: autoMaskFeather });

        if (!hasMaskPixels(autoMaskResult.mask) || autoMaskResult.confidence < minAutoMaskConfidence) {
          const status = createStatus(sample, "missing-mask", "缺少蒙版 / 识别失败");
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

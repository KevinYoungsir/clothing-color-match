import {
  applyImageAdjustments,
  isDefaultAdjustmentParams,
  type AdjustmentParams
} from "./adjustment";
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

export async function processBatchImages({
  adjustmentParams,
  autoParams,
  masks,
  onStatusChange,
  referenceImageData,
  referenceMask,
  samples
}: ProcessBatchImagesOptions): Promise<BatchProcessResult[]> {
  const results: BatchProcessResult[] = [];

  for (const sample of samples) {
    const maskState = masks[sample.id];

    if (!maskState || !hasMaskPixels(maskState.imageData)) {
      const status = createStatus(sample, "missing-mask", "缺少蒙版");
      onStatusChange?.(status);
      results.push(status);
      continue;
    }

    onStatusChange?.(createStatus(sample, "processing", "处理中"));

    try {
      const result = await processSampleImage({
        adjustmentParams,
        autoParams,
        referenceImageData,
        referenceMask,
        sampleImage: sample,
        targetMask: maskState.imageData
      });
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

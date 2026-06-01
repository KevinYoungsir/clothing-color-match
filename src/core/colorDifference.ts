import { rgbToLab, type LabColor } from "./labColor";
import type { ColorDifferenceResult } from "../types";

export type ColorDifferenceOptions = {
  referenceImageData: ImageData;
  referenceMask?: ImageData | null;
  targetBeforeImageData: ImageData;
  targetAfterImageData: ImageData;
  targetMask?: ImageData | null;
  fullImageMode?: boolean;
};

type LabSample = LabColor & {
  weight: number;
};

type RepresentativeLab = LabColor & {
  pixelCount: number;
};

function assertSameSize(imageData: ImageData, mask: ImageData, label: string) {
  if (imageData.width !== mask.width || imageData.height !== mask.height) {
    throw new Error(`${label}尺寸和图片尺寸不一致`);
  }
}

function hasMaskAlpha(mask: ImageData | null | undefined) {
  if (!mask) {
    return false;
  }

  for (let index = 3; index < mask.data.length; index += 4) {
    if (mask.data[index] > 0) {
      return true;
    }
  }

  return false;
}

function getMaskAlpha(mask: ImageData | null | undefined, index: number) {
  if (!mask) {
    return 1;
  }

  return mask.data[index + 3] / 255;
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return Number.NaN;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function calculateRepresentativeLab(imageData: ImageData, mask?: ImageData | null): RepresentativeLab {
  if (mask) {
    assertSameSize(imageData, mask, "色差蒙版");
  }

  const samples: LabSample[] = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    const imageAlpha = imageData.data[index + 3] / 255;

    if (imageAlpha <= 0) {
      continue;
    }

    const maskAlpha = getMaskAlpha(mask, index);
    const weight = imageAlpha * maskAlpha;

    if (weight < 0.55) {
      continue;
    }

    const lab = rgbToLab(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);

    if (lab.l <= 4 || lab.l >= 98) {
      continue;
    }

    samples.push({
      ...lab,
      weight
    });
  }

  if (samples.length === 0) {
    throw new Error("没有足够的有效像素用于色差计算");
  }

  const sortedByLightness = [...samples].sort((a, b) => a.l - b.l);
  const trimCount = samples.length >= 30 ? Math.floor(samples.length * 0.1) : 0;
  const trimmedSamples = sortedByLightness.slice(trimCount, sortedByLightness.length - trimCount);
  const usableSamples = trimmedSamples.length > 0 ? trimmedSamples : samples;

  return {
    a: getMedian(usableSamples.map((sample) => sample.a)),
    b: getMedian(usableSamples.map((sample) => sample.b)),
    l: getMedian(usableSamples.map((sample) => sample.l)),
    pixelCount: usableSamples.reduce((total, sample) => total + sample.weight, 0)
  };
}

export function calculateDeltaE76(first: LabColor, second: LabColor) {
  const deltaL = first.l - second.l;
  const deltaA = first.a - second.a;
  const deltaB = first.b - second.b;

  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

function getAssessment(deltaEAfter: number): ColorDifferenceResult["assessment"] {
  if (deltaEAfter < 3) {
    return "very-close";
  }

  if (deltaEAfter <= 6) {
    return "acceptable";
  }

  return "visible-difference";
}

export function calculateColorDifference({
  referenceImageData,
  referenceMask,
  targetBeforeImageData,
  targetAfterImageData,
  targetMask,
  fullImageMode = false
}: ColorDifferenceOptions): ColorDifferenceResult {
  if (
    targetBeforeImageData.width !== targetAfterImageData.width ||
    targetBeforeImageData.height !== targetAfterImageData.height
  ) {
    throw new Error("校色前后图片尺寸不一致，无法计算色差");
  }

  const effectiveReferenceMask = hasMaskAlpha(referenceMask) ? referenceMask : null;
  const effectiveTargetMask = fullImageMode ? null : targetMask;

  if (!fullImageMode && !hasMaskAlpha(effectiveTargetMask)) {
    throw new Error("缺少样品图有效校色范围，无法计算色差");
  }

  const referenceLab = calculateRepresentativeLab(referenceImageData, effectiveReferenceMask);
  const targetBeforeLab = calculateRepresentativeLab(targetBeforeImageData, effectiveTargetMask);
  const targetAfterLab = calculateRepresentativeLab(targetAfterImageData, effectiveTargetMask);
  const deltaEBefore = calculateDeltaE76(referenceLab, targetBeforeLab);
  const deltaEAfter = calculateDeltaE76(referenceLab, targetAfterLab);
  const improvementPercent =
    deltaEBefore > 0 ? ((deltaEBefore - deltaEAfter) / deltaEBefore) * 100 : 0;

  return {
    assessment: getAssessment(deltaEAfter),
    deltaEAfter,
    deltaEBefore,
    improvementPercent,
    isFullImageScope: fullImageMode,
    referencePixelCount: referenceLab.pixelCount,
    targetPixelCount: targetAfterLab.pixelCount,
    warning: fullImageMode ? "整图模式色差会受背景影响" : undefined
  };
}

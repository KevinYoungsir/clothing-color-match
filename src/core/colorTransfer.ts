import { labToRgb, rgbToLab } from "./labColor";

export type ColorTransferOptions = {
  referenceImageData: ImageData;
  referenceMask?: ImageData | null;
  targetImageData: ImageData;
  targetMask: ImageData;
  colorStrength: number;
  shadowProtection: number;
  highlightProtection: number;
  maskFeather: number;
  lightnessBlend?: number;
};

export type ColorTransferStats = {
  referencePixelCount: number;
  targetPixelCount: number;
  referenceA: number;
  referenceB: number;
  referenceL: number;
  targetA: number;
  targetB: number;
  targetL: number;
  targetAfterA: number;
  targetAfterB: number;
  targetAfterL: number;
  deltaA: number;
  deltaB: number;
  deltaEBefore: number;
  deltaEAfter: number;
};

export type ColorTransferResult = {
  imageData: ImageData;
  stats: ColorTransferStats;
};

const emptyResultMessage = "请先在样品图衣服区域绘制蒙版";
const emptyReferenceMessage = "请先选择标准图衣服参考区域";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPixelOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function getMaskAlpha(mask: ImageData | null | undefined, index: number) {
  if (!mask) {
    return 1;
  }

  return mask.data[index + 3] / 255;
}

function assertSameSize(imageData: ImageData, mask: ImageData, label: string) {
  if (imageData.width !== mask.width || imageData.height !== mask.height) {
    throw new Error(`${label}尺寸和图片尺寸不一致`);
  }
}

type LabSample = {
  l: number;
  a: number;
  b: number;
};

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

function getDeltaE(first: LabSample, second: LabSample) {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function calculateMaskedLabStats(imageData: ImageData, mask?: ImageData | null) {
  if (mask) {
    assertSameSize(imageData, mask, "蒙版");
  }

  const samples: LabSample[] = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3] / 255;

    if (alpha <= 0) {
      continue;
    }

    const maskAlpha = getMaskAlpha(mask, index);

    if (maskAlpha < 0.55) {
      continue;
    }

    const lab = rgbToLab(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
    samples.push(lab);
  }

  if (samples.length === 0) {
    return {
      medianA: Number.NaN,
      medianB: Number.NaN,
      medianL: Number.NaN,
      pixelCount: 0
    };
  }

  const sortedByLightness = [...samples].sort((first, second) => first.l - second.l);
  const trimCount = Math.floor(sortedByLightness.length * 0.1);
  const trimmedSamples = sortedByLightness
    .slice(trimCount, Math.max(trimCount + 1, sortedByLightness.length - trimCount))
    .filter((sample) => sample.l >= 6 && sample.l <= 96);
  const robustSamples = trimmedSamples.length >= Math.max(12, samples.length * 0.35)
    ? trimmedSamples
    : sortedByLightness;

  return {
    medianA: getMedian(robustSamples.map((sample) => sample.a)),
    medianB: getMedian(robustSamples.map((sample) => sample.b)),
    medianL: getMedian(robustSamples.map((sample) => sample.l)),
    pixelCount: robustSamples.length
  };
}

function calculateMaskedLabAverage(imageData: ImageData, mask?: ImageData | null) {
  const stats = calculateMaskedLabStats(imageData, mask);

  return {
    averageA: stats.medianA,
    averageB: stats.medianB,
    averageL: stats.medianL,
    pixelCount: stats.pixelCount
  };
}

function calculateToneAwareLabStats(imageData: ImageData, mask?: ImageData | null) {
  const stats = calculateMaskedLabStats(imageData, mask);

  return {
    a: stats.medianA,
    b: stats.medianB,
    l: stats.medianL,
    pixelCount: stats.pixelCount
  }
}

function createMaskWeights(mask: ImageData, featherRadius: number) {
  const width = mask.width;
  const height = mask.height;
  const baseWeights = new Float32Array(width * height);

  for (let index = 0; index < baseWeights.length; index += 1) {
    baseWeights[index] = mask.data[index * 4 + 3] / 255;
  }

  if (featherRadius <= 0) {
    return baseWeights;
  }

  const radius = Math.round(clamp(featherRadius, 0, 40));
  const horizontalWeights = new Float32Array(baseWeights.length);
  const blurredWeights = new Float32Array(baseWeights.length);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let count = 0;

    for (let sampleX = 0; sampleX <= Math.min(width - 1, radius); sampleX += 1) {
      sum += baseWeights[y * width + sampleX];
      count += 1;
    }

    for (let x = 0; x < width; x += 1) {
      horizontalWeights[y * width + x] = sum / count;

      const addX = x + radius + 1;
      const removeX = x - radius;

      if (addX < width) {
        sum += baseWeights[y * width + addX];
        count += 1;
      }

      if (removeX >= 0) {
        sum -= baseWeights[y * width + removeX];
        count -= 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;

    for (let sampleY = 0; sampleY <= Math.min(height - 1, radius); sampleY += 1) {
      sum += horizontalWeights[sampleY * width + x];
      count += 1;
    }

    for (let y = 0; y < height; y += 1) {
      const index = y * width + x;
      blurredWeights[index] = baseWeights[index] * (sum / count);

      const addY = y + radius + 1;
      const removeY = y - radius;

      if (addY < height) {
        sum += horizontalWeights[addY * width + x];
        count += 1;
      }

      if (removeY >= 0) {
        sum -= horizontalWeights[removeY * width + x];
        count -= 1;
      }
    }
  }

  return blurredWeights;
}

function getToneProtectionFactor(luminance: number, shadowProtection: number, highlightProtection: number) {
  const shadowAmount = luminance < 35 ? (35 - luminance) / 35 : 0;
  const highlightAmount = luminance > 75 ? (luminance - 75) / 25 : 0;
  const shadowFactor = 1 - clamp(shadowProtection, 0, 100) / 100 * clamp(shadowAmount, 0, 1);
  const highlightFactor = 1 - clamp(highlightProtection, 0, 100) / 100 * clamp(highlightAmount, 0, 1);

  return clamp(shadowFactor * highlightFactor, 0, 1);
}

export function transferLabColor(options: ColorTransferOptions): ColorTransferResult {
  const {
    referenceImageData,
    referenceMask,
    targetImageData,
    targetMask,
    colorStrength,
    shadowProtection,
    highlightProtection,
    maskFeather,
    lightnessBlend = 0.14
  } = options;

  assertSameSize(targetImageData, targetMask, "目标蒙版");

  if (!referenceMask) {
    throw new Error(emptyReferenceMessage);
  }

  assertSameSize(referenceImageData, referenceMask, "标准图蒙版");

  const referenceStats = calculateToneAwareLabStats(referenceImageData, referenceMask);
  const targetStats = calculateToneAwareLabStats(targetImageData, targetMask);

  if (!Number.isFinite(referenceStats.a) || !Number.isFinite(referenceStats.b)) {
    throw new Error(emptyReferenceMessage);
  }

  if (!Number.isFinite(targetStats.a) || !Number.isFinite(targetStats.b)) {
    throw new Error(emptyResultMessage);
  }

  const deltaA = referenceStats.a - targetStats.a;
  const deltaB = referenceStats.b - targetStats.b;
  const deltaL = referenceStats.l - targetStats.l;
  const output = new ImageData(new Uint8ClampedArray(targetImageData.data), targetImageData.width, targetImageData.height);
  const maskWeights = createMaskWeights(targetMask, maskFeather);
  const baseStrength = clamp((colorStrength / 100) * 1.15, 0, 1);

  for (let y = 0; y < targetImageData.height; y += 1) {
    for (let x = 0; x < targetImageData.width; x += 1) {
      const maskIndex = y * targetImageData.width + x;
      const maskWeight = maskWeights[maskIndex];

      if (maskWeight <= 0) {
        continue;
      }

      const pixelIndex = getPixelOffset(x, y, targetImageData.width);

      if (targetImageData.data[pixelIndex + 3] <= 0) {
        continue;
      }

      const lab = rgbToLab(
        targetImageData.data[pixelIndex],
        targetImageData.data[pixelIndex + 1],
        targetImageData.data[pixelIndex + 2]
      );
      const toneFactor = 0.35 + getToneProtectionFactor(lab.l, shadowProtection, highlightProtection) * 0.65;
      const strength = baseStrength * maskWeight * toneFactor;

      if (strength <= 0) {
        continue;
      }

      const correctedLab = {
        l: lab.l + deltaL * clamp(lightnessBlend, 0, 0.35) * strength,
        a: lab.a + deltaA * strength,
        b: lab.b + deltaB * strength
      };
      const rgb = labToRgb(correctedLab);

      output.data[pixelIndex] = rgb.red;
      output.data[pixelIndex + 1] = rgb.green;
      output.data[pixelIndex + 2] = rgb.blue;
    }
  }

  const targetAfterStats = calculateToneAwareLabStats(output, targetMask);
  const deltaEBefore = getDeltaE(referenceStats, targetStats);
  const deltaEAfter = getDeltaE(referenceStats, targetAfterStats);
  const stats = {
    deltaA,
    deltaB,
    deltaEAfter,
    deltaEBefore,
    referenceA: referenceStats.a,
    referenceB: referenceStats.b,
    referenceL: referenceStats.l,
    referencePixelCount: referenceStats.pixelCount,
    targetA: targetStats.a,
    targetAfterA: targetAfterStats.a,
    targetAfterB: targetAfterStats.b,
    targetAfterL: targetAfterStats.l,
    targetB: targetStats.b,
    targetL: targetStats.l,
    targetPixelCount: targetStats.pixelCount
  };

  console.debug("Lab color transfer", {
    deltaEAfter,
    deltaEBefore,
    referenceLabMedian: { l: stats.referenceL, a: stats.referenceA, b: stats.referenceB },
    targetAfterLabMedian: { l: stats.targetAfterL, a: stats.targetAfterA, b: stats.targetAfterB },
    targetBeforeLabMedian: { l: stats.targetL, a: stats.targetA, b: stats.targetB },
    transferDelta: { a: deltaA, b: deltaB }
  });

  return {
    imageData: output,
    stats
  };
}

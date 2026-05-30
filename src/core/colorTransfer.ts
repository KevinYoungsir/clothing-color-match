import { labToRgb, rgbToLab, type LabColor } from "./labColor";

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
  referenceL: number;
  referenceA: number;
  referenceB: number;
  targetL: number;
  targetA: number;
  targetB: number;
  targetAfterL: number;
  targetAfterA: number;
  targetAfterB: number;
  deltaL: number;
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

type LabSample = LabColor & {
  weight: number;
};

type MaskedLabStats = {
  medianL: number;
  medianA: number;
  medianB: number;
  pixelCount: number;
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

function getDeltaE(first: LabColor, second: LabColor) {
  const deltaL = first.l - second.l;
  const deltaA = first.a - second.a;
  const deltaB = first.b - second.b;

  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

function calculateMaskedLabStats(imageData: ImageData, mask?: ImageData | null): MaskedLabStats {
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
    const weight = alpha * maskAlpha;

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
    return {
      medianA: Number.NaN,
      medianB: Number.NaN,
      medianL: Number.NaN,
      pixelCount: 0
    };
  }

  const sortedByLightness = [...samples].sort((a, b) => a.l - b.l);
  const trimCount = samples.length >= 30 ? Math.floor(samples.length * 0.1) : 0;
  const trimmedSamples = sortedByLightness.slice(trimCount, sortedByLightness.length - trimCount);
  const usableSamples = trimmedSamples.length > 0 ? trimmedSamples : samples;

  return {
    medianA: getMedian(usableSamples.map((sample) => sample.a)),
    medianB: getMedian(usableSamples.map((sample) => sample.b)),
    medianL: getMedian(usableSamples.map((sample) => sample.l)),
    pixelCount: usableSamples.reduce((total, sample) => total + sample.weight, 0)
  };
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
    lightnessBlend = 0.12
  } = options;

  assertSameSize(targetImageData, targetMask, "目标蒙版");

  if (!referenceMask) {
    throw new Error(emptyReferenceMessage);
  }

  assertSameSize(referenceImageData, referenceMask, "标准图蒙版");

  const referenceStats = calculateMaskedLabStats(referenceImageData, referenceMask);
  const targetStats = calculateMaskedLabStats(targetImageData, targetMask);

  if (
    !Number.isFinite(referenceStats.medianL) ||
    !Number.isFinite(referenceStats.medianA) ||
    !Number.isFinite(referenceStats.medianB)
  ) {
    throw new Error(emptyReferenceMessage);
  }

  if (
    !Number.isFinite(targetStats.medianL) ||
    !Number.isFinite(targetStats.medianA) ||
    !Number.isFinite(targetStats.medianB)
  ) {
    throw new Error(emptyResultMessage);
  }

  const deltaL = referenceStats.medianL - targetStats.medianL;
  const deltaA = referenceStats.medianA - targetStats.medianA;
  const deltaB = referenceStats.medianB - targetStats.medianB;
  const output = new ImageData(new Uint8ClampedArray(targetImageData.data), targetImageData.width, targetImageData.height);
  const maskWeights = createMaskWeights(targetMask, maskFeather);
  const baseStrength = clamp((colorStrength / 100) * 1.25, 0, 1);
  const lightnessStrength = clamp(lightnessBlend, 0, 0.25);

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
      const toneFactor = 0.45 + getToneProtectionFactor(lab.l, shadowProtection, highlightProtection) * 0.55;
      const strength = baseStrength * maskWeight * toneFactor;

      if (strength <= 0) {
        continue;
      }

      const correctedLab = {
        l: lab.l + deltaL * lightnessStrength * strength,
        a: lab.a + deltaA * strength,
        b: lab.b + deltaB * strength
      };
      const rgb = labToRgb(correctedLab);

      output.data[pixelIndex] = rgb.red;
      output.data[pixelIndex + 1] = rgb.green;
      output.data[pixelIndex + 2] = rgb.blue;
    }
  }

  const targetAfterStats = calculateMaskedLabStats(output, targetMask);
  const referenceLab = {
    a: referenceStats.medianA,
    b: referenceStats.medianB,
    l: referenceStats.medianL
  };
  const targetBeforeLab = {
    a: targetStats.medianA,
    b: targetStats.medianB,
    l: targetStats.medianL
  };
  const targetAfterLab = {
    a: targetAfterStats.medianA,
    b: targetAfterStats.medianB,
    l: targetAfterStats.medianL
  };
  const stats = {
    deltaL,
    deltaA,
    deltaB,
    deltaEAfter: getDeltaE(referenceLab, targetAfterLab),
    deltaEBefore: getDeltaE(referenceLab, targetBeforeLab),
    referenceA: referenceStats.medianA,
    referenceB: referenceStats.medianB,
    referenceL: referenceStats.medianL,
    referencePixelCount: referenceStats.pixelCount,
    targetA: targetStats.medianA,
    targetAfterA: targetAfterStats.medianA,
    targetAfterB: targetAfterStats.medianB,
    targetAfterL: targetAfterStats.medianL,
    targetB: targetStats.medianB,
    targetL: targetStats.medianL,
    targetPixelCount: targetStats.pixelCount
  };

  console.debug("Lab color transfer", {
    deltaEAfter: stats.deltaEAfter,
    deltaEBefore: stats.deltaEBefore,
    referenceLab,
    targetAfterLab,
    targetBeforeLab,
    transferDelta: {
      deltaA,
      deltaB,
      deltaL
    }
  });

  return {
    imageData: output,
    stats
  };
}

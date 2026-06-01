import { labToRgb, rgbToLab, type LabColor } from "./labColor";
import { calculateDeltaE76 } from "./colorDifference";

export type SmartColorMatchOptions = {
  baseImageData: ImageData;
  referenceImageData: ImageData;
  referenceMask?: ImageData | null;
  sourceImageData: ImageData;
  targetMask?: ImageData | null;
  colorStrength: number;
  fullImageMode?: boolean;
  highlightProtection: number;
  lightnessBlend?: number;
  maskFeather: number;
  shadowProtection: number;
};

export type SmartColorMatchStats = {
  deltaEBefore: number;
  deltaEAfter: number;
  iterationCount: number;
  referenceLab: LabColor;
  targetBeforeLab: LabColor;
  targetAfterLab: LabColor;
};

export type SmartColorMatchResult = {
  imageData: ImageData;
  stats: SmartColorMatchStats;
};

type LabSample = LabColor & {
  weight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

function calculateRepresentativeLab(imageData: ImageData, mask?: ImageData | null): LabColor {
  if (mask) {
    assertSameSize(imageData, mask, "智能校色蒙版");
  }

  const samples: LabSample[] = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    const imageAlpha = imageData.data[index + 3] / 255;

    if (imageAlpha <= 0) {
      continue;
    }

    const maskAlpha = getMaskAlpha(mask, index);
    const weight = imageAlpha * maskAlpha;

    if (weight < 0.62) {
      continue;
    }

    const lab = rgbToLab(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);

    if (lab.l <= 6 || lab.l >= 96) {
      continue;
    }

    samples.push({
      ...lab,
      weight
    });
  }

  if (samples.length === 0) {
    throw new Error("没有足够的有效像素用于智能校色优化");
  }

  const sortedByLightness = [...samples].sort((a, b) => a.l - b.l);
  const trimCount = samples.length >= 30 ? Math.floor(samples.length * 0.12) : 0;
  const trimmedSamples = sortedByLightness.slice(trimCount, sortedByLightness.length - trimCount);
  const usableSamples = trimmedSamples.length > 0 ? trimmedSamples : samples;

  return {
    a: getMedian(usableSamples.map((sample) => sample.a)),
    b: getMedian(usableSamples.map((sample) => sample.b)),
    l: getMedian(usableSamples.map((sample) => sample.l))
  };
}

function createMaskWeights(
  mask: ImageData | null | undefined,
  width: number,
  height: number,
  featherRadius: number
) {
  if (!mask) {
    const fullWeights = new Float32Array(width * height);
    fullWeights.fill(1);

    return fullWeights;
  }

  const baseWeights = new Float32Array(width * height);

  for (let index = 0; index < baseWeights.length; index += 1) {
    baseWeights[index] = mask.data[index * 4 + 3] / 255;
  }

  const radius = Math.round(clamp(featherRadius, 0, 24));

  if (radius <= 0) {
    return baseWeights;
  }

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

function getPixelOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function getToneProtectionFactor(luminance: number, shadowProtection: number, highlightProtection: number) {
  const shadowAmount = luminance < 35 ? (35 - luminance) / 35 : 0;
  const highlightAmount = luminance > 75 ? (luminance - 75) / 25 : 0;
  const shadowFactor = 1 - clamp(shadowProtection, 0, 100) / 100 * clamp(shadowAmount, 0, 1);
  const highlightFactor = 1 - clamp(highlightProtection, 0, 100) / 100 * clamp(highlightAmount, 0, 1);

  return clamp(shadowFactor * highlightFactor, 0, 1);
}

function cloneImageData(imageData: ImageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function applyResidualLabShift(
  currentImageData: ImageData,
  sourceImageData: ImageData,
  targetMask: ImageData | null,
  residual: LabColor,
  options: SmartColorMatchOptions,
  iterationIndex: number
) {
  const output = cloneImageData(currentImageData);
  const maskWeights = createMaskWeights(
    targetMask,
    currentImageData.width,
    currentImageData.height,
    options.maskFeather
  );
  const smartStrength = clamp(0.28 + options.colorStrength / 100 * 0.32, 0.28, 0.6);
  const iterationDamping = Math.max(0.46, 1 - iterationIndex * 0.18);
  const lightnessStrength = clamp(options.lightnessBlend ?? 0.08, 0, 0.18) * 0.65;

  for (let y = 0; y < currentImageData.height; y += 1) {
    for (let x = 0; x < currentImageData.width; x += 1) {
      const maskIndex = y * currentImageData.width + x;
      const maskWeight = maskWeights[maskIndex];

      if (maskWeight <= 0) {
        continue;
      }

      const pixelIndex = getPixelOffset(x, y, currentImageData.width);

      if (currentImageData.data[pixelIndex + 3] <= 0) {
        continue;
      }

      const currentLab = rgbToLab(
        currentImageData.data[pixelIndex],
        currentImageData.data[pixelIndex + 1],
        currentImageData.data[pixelIndex + 2]
      );
      const sourceLab = rgbToLab(
        sourceImageData.data[pixelIndex],
        sourceImageData.data[pixelIndex + 1],
        sourceImageData.data[pixelIndex + 2]
      );
      const toneFactor = 0.5 + getToneProtectionFactor(
        sourceLab.l,
        options.shadowProtection,
        options.highlightProtection
      ) * 0.5;
      const strength = smartStrength * iterationDamping * toneFactor * maskWeight;

      if (strength <= 0) {
        continue;
      }

      const correctedLab = {
        a: currentLab.a + residual.a * strength,
        b: currentLab.b + residual.b * strength,
        l: currentLab.l + residual.l * lightnessStrength * strength
      };
      const rgb = labToRgb(correctedLab);

      output.data[pixelIndex] = rgb.red;
      output.data[pixelIndex + 1] = rgb.green;
      output.data[pixelIndex + 2] = rgb.blue;
    }
  }

  return output;
}

export function optimizeSmartColorMatch(options: SmartColorMatchOptions): SmartColorMatchResult {
  const {
    baseImageData,
    fullImageMode = false,
    referenceImageData,
    referenceMask,
    sourceImageData,
    targetMask
  } = options;

  if (
    sourceImageData.width !== baseImageData.width ||
    sourceImageData.height !== baseImageData.height
  ) {
    throw new Error("智能校色优化的原图和结果图尺寸不一致");
  }

  const effectiveReferenceMask = hasMaskAlpha(referenceMask) ? referenceMask : null;
  const effectiveTargetMask = fullImageMode ? null : targetMask ?? null;

  if (!fullImageMode && !hasMaskAlpha(effectiveTargetMask)) {
    throw new Error("缺少样品图有效校色范围，无法执行智能校色优化");
  }

  const referenceLab = calculateRepresentativeLab(referenceImageData, effectiveReferenceMask);
  const targetBeforeLab = calculateRepresentativeLab(baseImageData, effectiveTargetMask);
  let bestImageData = cloneImageData(baseImageData);
  let bestLab = targetBeforeLab;
  let bestDeltaE = calculateDeltaE76(referenceLab, targetBeforeLab);
  const deltaEBefore = bestDeltaE;
  let iterationCount = 0;

  for (let iterationIndex = 0; iterationIndex < 3; iterationIndex += 1) {
    const residual = {
      a: referenceLab.a - bestLab.a,
      b: referenceLab.b - bestLab.b,
      l: referenceLab.l - bestLab.l
    };

    if (calculateDeltaE76(referenceLab, bestLab) < 0.8) {
      break;
    }

    const candidateImageData = applyResidualLabShift(
      bestImageData,
      sourceImageData,
      effectiveTargetMask,
      residual,
      options,
      iterationIndex
    );
    const candidateLab = calculateRepresentativeLab(candidateImageData, effectiveTargetMask);
    const candidateDeltaE = calculateDeltaE76(referenceLab, candidateLab);

    if (candidateDeltaE >= bestDeltaE - 0.05) {
      break;
    }

    bestImageData = candidateImageData;
    bestLab = candidateLab;
    bestDeltaE = candidateDeltaE;
    iterationCount += 1;
  }

  console.debug("Smart color match optimization", {
    deltaEAfter: bestDeltaE,
    deltaEBefore,
    iterationCount,
    referenceLab,
    targetAfterLab: bestLab,
    targetBeforeLab
  });

  return {
    imageData: bestImageData,
    stats: {
      deltaEAfter: bestDeltaE,
      deltaEBefore,
      iterationCount,
      referenceLab,
      targetAfterLab: bestLab,
      targetBeforeLab
    }
  };
}

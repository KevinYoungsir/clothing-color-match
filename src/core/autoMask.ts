import type { GarmentRoi } from "../types";

export type AutoMaskOptions = {
  alphaThreshold?: number;
  backgroundDifferenceThreshold?: number;
  feather?: number;
  minAreaRatio?: number;
  roi?: GarmentRoi | null;
};

export type AutoMaskResult = {
  mask: ImageData;
  confidence: number;
  coverageRatio: number;
  foregroundRatio: number;
  touchesBorderRatio: number;
  reason?: string;
  warning?: string;
};

type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

const maskRed = 20;
const maskGreen = 184;
const maskBlue = 166;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function getPixelCount(imageData: ImageData) {
  return imageData.width * imageData.height;
}

function getMaskArea(mask: ImageData) {
  let area = 0;

  for (let index = 3; index < mask.data.length; index += 4) {
    if (mask.data[index] > 0) {
      area += 1;
    }
  }

  return area;
}

function createEmptyMask(width: number, height: number) {
  return new ImageData(width, height);
}

function normalizeRoi(roi: GarmentRoi | null | undefined, width: number, height: number) {
  if (!roi) {
    return null;
  }

  const x = clamp(Math.floor(roi.x), 0, width - 1);
  const y = clamp(Math.floor(roi.y), 0, height - 1);
  const right = clamp(Math.ceil(roi.x + roi.width), x + 1, width);
  const bottom = clamp(Math.ceil(roi.y + roi.height), y + 1, height);

  return {
    height: bottom - y,
    width: right - x,
    x,
    y
  };
}

function applyRoiToMask(mask: ImageData, roi: GarmentRoi | null) {
  if (!roi) {
    return mask;
  }

  const alphaValues = new Uint8ClampedArray(mask.width * mask.height);
  const right = roi.x + roi.width;
  const bottom = roi.y + roi.height;

  for (let y = roi.y; y < bottom; y += 1) {
    for (let x = roi.x; x < right; x += 1) {
      const pixelIndex = y * mask.width + x;
      alphaValues[pixelIndex] = mask.data[pixelIndex * 4 + 3];
    }
  }

  return createMaskFromAlpha(mask.width, mask.height, alphaValues);
}

function getMaskCoverageRatio(mask: ImageData) {
  return getMaskArea(mask) / getPixelCount(mask);
}

function getTouchesBorderRatio(mask: ImageData) {
  const width = mask.width;
  const height = mask.height;
  let borderPixels = 0;
  let touchedPixels = 0;

  for (let x = 0; x < width; x += 1) {
    touchedPixels += mask.data[getOffset(x, 0, width) + 3] > 0 ? 1 : 0;
    touchedPixels += mask.data[getOffset(x, height - 1, width) + 3] > 0 ? 1 : 0;
    borderPixels += 2;
  }

  for (let y = 1; y < height - 1; y += 1) {
    touchedPixels += mask.data[getOffset(0, y, width) + 3] > 0 ? 1 : 0;
    touchedPixels += mask.data[getOffset(width - 1, y, width) + 3] > 0 ? 1 : 0;
    borderPixels += 2;
  }

  return borderPixels > 0 ? touchedPixels / borderPixels : 0;
}

function createMaskFromAlpha(width: number, height: number, alphaValues: Uint8ClampedArray) {
  const mask = new ImageData(width, height);

  for (let pixelIndex = 0; pixelIndex < alphaValues.length; pixelIndex += 1) {
    const outputIndex = pixelIndex * 4;
    const alpha = alphaValues[pixelIndex];

    if (alpha <= 0) {
      continue;
    }

    mask.data[outputIndex] = maskRed;
    mask.data[outputIndex + 1] = maskGreen;
    mask.data[outputIndex + 2] = maskBlue;
    mask.data[outputIndex + 3] = alpha;
  }

  return mask;
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 255;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  return sortedValues[Math.floor(sortedValues.length / 2)];
}

function getColorDistance(red: number, green: number, blue: number, background: RgbColor) {
  const redDelta = red - background.red;
  const greenDelta = green - background.green;
  const blueDelta = blue - background.blue;

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function getLuminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function getChannelSpread(red: number, green: number, blue: number) {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function isLikelyNeutralBackgroundShadow(
  red: number,
  green: number,
  blue: number,
  background: RgbColor,
  distance: number,
  threshold: number
) {
  const backgroundSpread = getChannelSpread(background.red, background.green, background.blue);
  const pixelSpread = getChannelSpread(red, green, blue);

  if (backgroundSpread > 22 || pixelSpread > 24) {
    return false;
  }

  const luminanceDelta = Math.abs(
    getLuminance(red, green, blue) - getLuminance(background.red, background.green, background.blue)
  );

  return distance < threshold * 1.8 && luminanceDelta < 72;
}

function hasTransparentBackground(imageData: ImageData, alphaThreshold: number) {
  const width = imageData.width;
  const height = imageData.height;
  let transparentEdgePixels = 0;
  let edgePixels = 0;

  for (let x = 0; x < width; x += 1) {
    const topAlpha = imageData.data[getOffset(x, 0, width) + 3];
    const bottomAlpha = imageData.data[getOffset(x, height - 1, width) + 3];

    transparentEdgePixels += topAlpha <= alphaThreshold ? 1 : 0;
    transparentEdgePixels += bottomAlpha <= alphaThreshold ? 1 : 0;
    edgePixels += 2;
  }

  for (let y = 1; y < height - 1; y += 1) {
    const leftAlpha = imageData.data[getOffset(0, y, width) + 3];
    const rightAlpha = imageData.data[getOffset(width - 1, y, width) + 3];

    transparentEdgePixels += leftAlpha <= alphaThreshold ? 1 : 0;
    transparentEdgePixels += rightAlpha <= alphaThreshold ? 1 : 0;
    edgePixels += 2;
  }

  return edgePixels > 0 && transparentEdgePixels / edgePixels > 0.08;
}

export function estimateBackgroundColor(imageData: ImageData): RgbColor {
  const width = imageData.width;
  const height = imageData.height;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 80));
  const redValues: number[] = [];
  const greenValues: number[] = [];
  const blueValues: number[] = [];

  function collectPixel(x: number, y: number) {
    const index = getOffset(x, y, width);

    if (imageData.data[index + 3] < 200) {
      return;
    }

    redValues.push(imageData.data[index]);
    greenValues.push(imageData.data[index + 1]);
    blueValues.push(imageData.data[index + 2]);
  }

  for (let x = 0; x < width; x += stride) {
    collectPixel(x, 0);
    collectPixel(x, height - 1);
  }

  for (let y = 0; y < height; y += stride) {
    collectPixel(0, y);
    collectPixel(width - 1, y);
  }

  const cornerSize = Math.max(2, Math.floor(Math.min(width, height) * 0.04));
  const cornerStarts = [
    { x: 0, y: 0 },
    { x: Math.max(0, width - cornerSize), y: 0 },
    { x: 0, y: Math.max(0, height - cornerSize) },
    { x: Math.max(0, width - cornerSize), y: Math.max(0, height - cornerSize) }
  ];

  cornerStarts.forEach((start) => {
    for (let y = start.y; y < Math.min(height, start.y + cornerSize); y += stride) {
      for (let x = start.x; x < Math.min(width, start.x + cornerSize); x += stride) {
        collectPixel(x, y);
      }
    }
  });

  return {
    blue: getMedian(blueValues),
    green: getMedian(greenValues),
    red: getMedian(redValues)
  };
}

export function createForegroundMaskByBackgroundDifference(
  imageData: ImageData,
  options: AutoMaskOptions = {}
) {
  const background = estimateBackgroundColor(imageData);
  const threshold = options.backgroundDifferenceThreshold ?? 34;
  const alphaThreshold = options.alphaThreshold ?? 12;
  const alphaValues = new Uint8ClampedArray(getPixelCount(imageData));

  for (let pixelIndex = 0; pixelIndex < alphaValues.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;

    if (imageData.data[dataIndex + 3] <= alphaThreshold) {
      continue;
    }

    const distance = getColorDistance(
      imageData.data[dataIndex],
      imageData.data[dataIndex + 1],
      imageData.data[dataIndex + 2],
      background
    );

    if (
      distance >= threshold &&
      !isLikelyNeutralBackgroundShadow(
        imageData.data[dataIndex],
        imageData.data[dataIndex + 1],
        imageData.data[dataIndex + 2],
        background,
        distance,
        threshold
      )
    ) {
      alphaValues[pixelIndex] = 255;
    }
  }

  return createMaskFromAlpha(imageData.width, imageData.height, alphaValues);
}

function createAlphaMaskFromTransparency(imageData: ImageData, alphaThreshold: number) {
  const alphaValues = new Uint8ClampedArray(getPixelCount(imageData));

  for (let pixelIndex = 0; pixelIndex < alphaValues.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    alphaValues[pixelIndex] = imageData.data[dataIndex + 3] > alphaThreshold ? 255 : 0;
  }

  return createMaskFromAlpha(imageData.width, imageData.height, alphaValues);
}

export function keepLargestConnectedComponent(mask: ImageData) {
  const width = mask.width;
  const height = mask.height;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const largestComponent = new Uint8Array(pixelCount);
  let largestArea = 0;

  for (let startIndex = 0; startIndex < pixelCount; startIndex += 1) {
    if (visited[startIndex] || mask.data[startIndex * 4 + 3] === 0) {
      continue;
    }

    const stack = [startIndex];
    const component: number[] = [];
    visited[startIndex] = 1;

    while (stack.length > 0) {
      const currentIndex = stack.pop()!;
      const x = currentIndex % width;
      const y = Math.floor(currentIndex / width);

      component.push(currentIndex);

      const neighbors = [
        x > 0 ? currentIndex - 1 : -1,
        x < width - 1 ? currentIndex + 1 : -1,
        y > 0 ? currentIndex - width : -1,
        y < height - 1 ? currentIndex + width : -1
      ];

      neighbors.forEach((neighborIndex) => {
        if (
          neighborIndex >= 0 &&
          !visited[neighborIndex] &&
          mask.data[neighborIndex * 4 + 3] > 0
        ) {
          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        }
      });
    }

    if (component.length > largestArea) {
      largestArea = component.length;
      largestComponent.fill(0);
      component.forEach((componentIndex) => {
        largestComponent[componentIndex] = 255;
      });
    }
  }

  return createMaskFromAlpha(width, height, new Uint8ClampedArray(largestComponent));
}

function removeBorderConnectedForeground(mask: ImageData) {
  const width = mask.width;
  const height = mask.height;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const stack: number[] = [];
  let removedArea = 0;

  function addPixel(index: number) {
    if (visited[index] || mask.data[index * 4 + 3] === 0) {
      return;
    }

    visited[index] = 1;
    stack.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    addPixel(x);
    addPixel((height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    addPixel(y * width);
    addPixel(y * width + width - 1);
  }

  while (stack.length > 0) {
    const currentIndex = stack.pop()!;
    const x = currentIndex % width;
    const y = Math.floor(currentIndex / width);

    removedArea += 1;

    if (x > 0) {
      addPixel(currentIndex - 1);
    }

    if (x < width - 1) {
      addPixel(currentIndex + 1);
    }

    if (y > 0) {
      addPixel(currentIndex - width);
    }

    if (y < height - 1) {
      addPixel(currentIndex + width);
    }
  }

  const alphaValues = new Uint8ClampedArray(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    alphaValues[pixelIndex] =
      mask.data[pixelIndex * 4 + 3] > 0 && !visited[pixelIndex]
        ? mask.data[pixelIndex * 4 + 3]
        : 0;
  }

  return {
    mask: createMaskFromAlpha(width, height, alphaValues),
    removedArea
  };
}

export function fillMaskHoles(mask: ImageData) {
  const width = mask.width;
  const height = mask.height;
  const pixelCount = width * height;
  const visitedBackground = new Uint8Array(pixelCount);
  const stack: number[] = [];

  function addBackgroundPixel(index: number) {
    if (visitedBackground[index] || mask.data[index * 4 + 3] > 0) {
      return;
    }

    visitedBackground[index] = 1;
    stack.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    addBackgroundPixel(x);
    addBackgroundPixel((height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    addBackgroundPixel(y * width);
    addBackgroundPixel(y * width + width - 1);
  }

  while (stack.length > 0) {
    const currentIndex = stack.pop()!;
    const x = currentIndex % width;
    const y = Math.floor(currentIndex / width);

    if (x > 0) {
      addBackgroundPixel(currentIndex - 1);
    }

    if (x < width - 1) {
      addBackgroundPixel(currentIndex + 1);
    }

    if (y > 0) {
      addBackgroundPixel(currentIndex - width);
    }

    if (y < height - 1) {
      addBackgroundPixel(currentIndex + width);
    }
  }

  const alphaValues = new Uint8ClampedArray(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const isForeground = mask.data[pixelIndex * 4 + 3] > 0;
    const isHole = !isForeground && !visitedBackground[pixelIndex];
    alphaValues[pixelIndex] = isForeground || isHole ? 255 : 0;
  }

  return createMaskFromAlpha(width, height, alphaValues);
}

export function softenMaskEdge(mask: ImageData, feather: number) {
  const radius = Math.round(clamp(feather, 0, 16));

  if (radius <= 0) {
    return mask;
  }

  const width = mask.width;
  const height = mask.height;
  const sourceAlpha = new Uint8ClampedArray(width * height);
  const horizontalAlpha = new Float32Array(width * height);
  const blurredAlpha = new Uint8ClampedArray(width * height);

  for (let pixelIndex = 0; pixelIndex < sourceAlpha.length; pixelIndex += 1) {
    sourceAlpha[pixelIndex] = mask.data[pixelIndex * 4 + 3];
  }

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let count = 0;

    for (let sampleX = 0; sampleX <= Math.min(width - 1, radius); sampleX += 1) {
      sum += sourceAlpha[y * width + sampleX];
      count += 1;
    }

    for (let x = 0; x < width; x += 1) {
      horizontalAlpha[y * width + x] = sum / count;

      const addX = x + radius + 1;
      const removeX = x - radius;

      if (addX < width) {
        sum += sourceAlpha[y * width + addX];
        count += 1;
      }

      if (removeX >= 0) {
        sum -= sourceAlpha[y * width + removeX];
        count -= 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;

    for (let sampleY = 0; sampleY <= Math.min(height - 1, radius); sampleY += 1) {
      sum += horizontalAlpha[sampleY * width + x];
      count += 1;
    }

    for (let y = 0; y < height; y += 1) {
      const pixelIndex = y * width + x;
      blurredAlpha[pixelIndex] = Math.round(sum / count);

      const addY = y + radius + 1;
      const removeY = y - radius;

      if (addY < height) {
        sum += horizontalAlpha[addY * width + x];
        count += 1;
      }

      if (removeY >= 0) {
        sum -= horizontalAlpha[removeY * width + x];
        count -= 1;
      }
    }
  }

  return createMaskFromAlpha(width, height, blurredAlpha);
}

export function generateAutoGarmentMask(
  imageData: ImageData,
  options: AutoMaskOptions = {}
): AutoMaskResult {
  const alphaThreshold = options.alphaThreshold ?? 12;
  const minAreaRatio = options.minAreaRatio ?? 0.01;
  const pixelCount = getPixelCount(imageData);
  const roi = normalizeRoi(options.roi, imageData.width, imageData.height);
  const analysisPixelCount = roi ? roi.width * roi.height : pixelCount;
  const hasTransparentEdges = hasTransparentBackground(imageData, alphaThreshold);
  const initialMaskWithoutRoi = hasTransparentEdges
    ? createAlphaMaskFromTransparency(imageData, alphaThreshold)
    : createForegroundMaskByBackgroundDifference(imageData, options);
  const initialMask = applyRoiToMask(initialMaskWithoutRoi, roi);
  const candidateArea = getMaskArea(initialMask);
  const candidateCoverageRatio = candidateArea / analysisPixelCount;
  const initialTouchesBorderRatio = getTouchesBorderRatio(initialMask);
  const borderPrunedResult =
    candidateCoverageRatio > 0.45 || initialTouchesBorderRatio > 0.16
      ? removeBorderConnectedForeground(initialMask)
      : null;
  const borderPrunedArea = borderPrunedResult ? getMaskArea(borderPrunedResult.mask) : 0;
  const shouldUseBorderPrunedMask = Boolean(
    borderPrunedResult &&
      borderPrunedArea / analysisPixelCount >= minAreaRatio &&
      borderPrunedArea >= candidateArea * 0.06 &&
      borderPrunedArea < candidateArea
  );
  const foregroundMask = shouldUseBorderPrunedMask ? borderPrunedResult!.mask : initialMask;
  const largestMask = keepLargestConnectedComponent(foregroundMask);
  const largestArea = getMaskArea(largestMask);
  const filledMask = fillMaskHoles(largestMask);
  const filledArea = getMaskArea(filledMask);
  const softenedMask = applyRoiToMask(softenMaskEdge(filledMask, options.feather ?? 2), roi);
  const foregroundRatio = largestArea / pixelCount;
  const coverageRatio = filledArea / pixelCount;
  const analysisCoverageRatio = filledArea / analysisPixelCount;
  const touchesBorderRatio = getTouchesBorderRatio(filledMask);
  const componentPurity = candidateArea > 0 ? largestArea / candidateArea : 0;
  const areaConfidence =
    analysisCoverageRatio < minAreaRatio || analysisCoverageRatio > 0.72
      ? 0.14
      : analysisCoverageRatio < 0.035 || analysisCoverageRatio > 0.58
        ? 0.42
        : 0.84;
  const borderConfidence =
    touchesBorderRatio > 0.32
      ? 0.14
      : touchesBorderRatio > 0.2
        ? 0.34
        : touchesBorderRatio > 0.12
          ? 0.62
          : 1;
  const sourceConfidence = hasTransparentEdges ? 0.92 : 0.74;
  const pruningConfidence = shouldUseBorderPrunedMask ? 0.92 : initialTouchesBorderRatio > 0.2 ? 0.72 : 1;
  const confidence = clamp(
    sourceConfidence * areaConfidence * borderConfidence * pruningConfidence * clamp(componentPurity, 0.3, 1),
    0,
    1
  );
  const shouldDiscardMask = coverageRatio > 0.82 || touchesBorderRatio > 0.48;
  const warning =
    largestArea === 0 || shouldDiscardMask
      ? "自动识别失败，请手动绘制校色范围"
      : confidence < 0.45
        ? "自动识别不确定，请点击编辑校色范围手动修正。"
        : undefined;

  return {
    confidence,
    coverageRatio,
    foregroundRatio,
    mask: shouldDiscardMask ? createEmptyMask(imageData.width, imageData.height) : softenedMask,
    reason: warning,
    touchesBorderRatio,
    warning
  };
}

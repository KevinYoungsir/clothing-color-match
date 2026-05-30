export type AutoMaskOptions = {
  alphaThreshold?: number;
  backgroundDifferenceThreshold?: number;
  feather?: number;
  minAreaRatio?: number;
};

export type AutoMaskResult = {
  mask: ImageData;
  confidence: number;
  foregroundRatio: number;
  reason?: string;
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

    if (distance >= threshold) {
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
  const hasTransparentEdges = hasTransparentBackground(imageData, alphaThreshold);
  const initialMask = hasTransparentEdges
    ? createAlphaMaskFromTransparency(imageData, alphaThreshold)
    : createForegroundMaskByBackgroundDifference(imageData, options);
  const candidateArea = getMaskArea(initialMask);
  const largestMask = keepLargestConnectedComponent(initialMask);
  const largestArea = getMaskArea(largestMask);
  const filledMask = fillMaskHoles(largestMask);
  const softenedMask = softenMaskEdge(filledMask, options.feather ?? 2);
  const foregroundRatio = largestArea / getPixelCount(imageData);
  const componentPurity = candidateArea > 0 ? largestArea / candidateArea : 0;
  const areaConfidence =
    foregroundRatio < minAreaRatio || foregroundRatio > 0.92
      ? 0.18
      : foregroundRatio < 0.04 || foregroundRatio > 0.78
        ? 0.48
        : 0.82;
  const sourceConfidence = hasTransparentEdges ? 0.94 : 0.72;
  const confidence = clamp(sourceConfidence * areaConfidence * clamp(componentPurity, 0.35, 1), 0, 1);

  return {
    confidence,
    foregroundRatio,
    mask: softenedMask,
    reason: confidence < 0.45 ? "自动识别不确定，请手动修正蒙版" : undefined
  };
}

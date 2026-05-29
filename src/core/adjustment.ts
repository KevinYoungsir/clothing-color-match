export type AdjustmentParams = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  exposure: number;
  shadows: number;
  highlights: number;
  whiteBalance: number;
  temperature: number;
  colorStrength: number;
  texturePreserve: number;
};

export const defaultAdjustmentParams: AdjustmentParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  whiteBalance: 0,
  temperature: 0,
  colorStrength: 100,
  texturePreserve: 70
};

export type AdjustmentKey = keyof AdjustmentParams;

export type ApplyAdjustmentsOptions = {
  baseImageData: ImageData;
  originalImageData: ImageData;
  params: AdjustmentParams;
  targetMask: ImageData;
};

type HslColor = {
  h: number;
  s: number;
  l: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLuminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rgbToHsl(red: number, green: number, blue: number): HslColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (max === normalizedRed) {
    hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
  } else if (max === normalizedGreen) {
    hue = (normalizedBlue - normalizedRed) / delta + 2;
  } else {
    hue = (normalizedRed - normalizedGreen) / delta + 4;
  }

  return {
    h: ((hue * 60 + 360) % 360) / 360,
    s: saturation,
    l: lightness
  };
}

function hueToRgb(p: number, q: number, t: number) {
  let hue = t;

  if (hue < 0) {
    hue += 1;
  }

  if (hue > 1) {
    hue -= 1;
  }

  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue;
  }

  if (hue < 1 / 2) {
    return q;
  }

  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6;
  }

  return p;
}

function hslToRgb({ h, s, l }: HslColor) {
  if (s === 0) {
    const value = Math.round(l * 255);
    return { red: value, green: value, blue: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    red: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    green: Math.round(hueToRgb(p, q, h) * 255),
    blue: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
  };
}

function applyRgbAdjustments(red: number, green: number, blue: number, params: AdjustmentParams) {
  let adjustedRed = red * 2 ** (params.exposure / 100);
  let adjustedGreen = green * 2 ** (params.exposure / 100);
  let adjustedBlue = blue * 2 ** (params.exposure / 100);

  const luminance = getLuminance(red, green, blue) / 255;
  const shadowWeight = (1 - luminance) ** 2;
  const highlightWeight = luminance ** 2;
  const toneOffset = params.shadows * 1.35 * shadowWeight + params.highlights * 1.2 * highlightWeight;

  adjustedRed += params.brightness * 1.2 + toneOffset;
  adjustedGreen += params.brightness * 1.2 + toneOffset;
  adjustedBlue += params.brightness * 1.2 + toneOffset;

  const contrastValue = params.contrast * 2.55;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));

  adjustedRed = contrastFactor * (adjustedRed - 128) + 128;
  adjustedGreen = contrastFactor * (adjustedGreen - 128) + 128;
  adjustedBlue = contrastFactor * (adjustedBlue - 128) + 128;

  adjustedRed += params.temperature * 0.85 + params.whiteBalance * 0.35;
  adjustedGreen -= params.whiteBalance * 0.45;
  adjustedBlue -= params.temperature * 0.85;
  adjustedBlue += params.whiteBalance * 0.35;

  const hsl = rgbToHsl(
    clamp(adjustedRed, 0, 255),
    clamp(adjustedGreen, 0, 255),
    clamp(adjustedBlue, 0, 255)
  );
  hsl.h = (hsl.h + params.hue / 360 + 1) % 1;
  hsl.s = clamp(hsl.s * (1 + params.saturation / 100), 0, 1);

  return hslToRgb(hsl);
}

export function isDefaultAdjustmentParams(params: AdjustmentParams) {
  return (Object.keys(defaultAdjustmentParams) as AdjustmentKey[]).every(
    (key) => params[key] === defaultAdjustmentParams[key]
  );
}

export function applyImageAdjustments({
  baseImageData,
  originalImageData,
  params,
  targetMask
}: ApplyAdjustmentsOptions) {
  if (
    baseImageData.width !== targetMask.width ||
    baseImageData.height !== targetMask.height ||
    originalImageData.width !== targetMask.width ||
    originalImageData.height !== targetMask.height
  ) {
    throw new Error("样品图、原图和蒙版尺寸不一致");
  }

  const output = new ImageData(new Uint8ClampedArray(baseImageData.data), baseImageData.width, baseImageData.height);
  const manualStrength = clamp(params.colorStrength, 0, 100) / 100;
  const textureStrength = clamp(params.texturePreserve, 0, 100) / 100;

  for (let index = 0; index < baseImageData.data.length; index += 4) {
    const maskWeight = targetMask.data[index + 3] / 255;

    if (maskWeight <= 0 || baseImageData.data[index + 3] <= 0) {
      continue;
    }

    const baseRed = baseImageData.data[index];
    const baseGreen = baseImageData.data[index + 1];
    const baseBlue = baseImageData.data[index + 2];
    const adjusted = applyRgbAdjustments(baseRed, baseGreen, baseBlue, params);
    const baseLuminance = getLuminance(baseRed, baseGreen, baseBlue);
    const originalLuminance = getLuminance(
      originalImageData.data[index],
      originalImageData.data[index + 1],
      originalImageData.data[index + 2]
    );
    const adjustedLuminance = getLuminance(adjusted.red, adjusted.green, adjusted.blue);
    const preservedLuminance = originalLuminance + (adjustedLuminance - baseLuminance);
    const luminanceRatio =
      adjustedLuminance > 0 ? 1 + (preservedLuminance / adjustedLuminance - 1) * textureStrength : 1;

    const finalRed = clamp(adjusted.red * luminanceRatio, 0, 255);
    const finalGreen = clamp(adjusted.green * luminanceRatio, 0, 255);
    const finalBlue = clamp(adjusted.blue * luminanceRatio, 0, 255);
    const blendWeight = maskWeight * manualStrength;

    output.data[index] = Math.round(baseRed + (finalRed - baseRed) * blendWeight);
    output.data[index + 1] = Math.round(baseGreen + (finalGreen - baseGreen) * blendWeight);
    output.data[index + 2] = Math.round(baseBlue + (finalBlue - baseBlue) * blendWeight);
  }

  return output;
}

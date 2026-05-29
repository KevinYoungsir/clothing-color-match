export type LabColor = {
  l: number;
  a: number;
  b: number;
};

const referenceX = 95.047;
const referenceY = 100;
const referenceZ = 108.883;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function srgbToLinear(value: number) {
  const channel = value / 255;
  return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92;
}

function linearToSrgb(value: number) {
  const channel = value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : value * 12.92;
  return Math.round(clamp(channel, 0, 1) * 255);
}

function xyzToLabPivot(value: number) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function labToXyzPivot(value: number) {
  const cubed = value ** 3;
  return cubed > 0.008856 ? cubed : (value - 16 / 116) / 7.787;
}

export function rgbToLab(red: number, green: number, blue: number): LabColor {
  const linearRed = srgbToLinear(red);
  const linearGreen = srgbToLinear(green);
  const linearBlue = srgbToLinear(blue);

  const x = (linearRed * 0.4124 + linearGreen * 0.3576 + linearBlue * 0.1805) * 100;
  const y = (linearRed * 0.2126 + linearGreen * 0.7152 + linearBlue * 0.0722) * 100;
  const z = (linearRed * 0.0193 + linearGreen * 0.1192 + linearBlue * 0.9505) * 100;

  const pivotX = xyzToLabPivot(x / referenceX);
  const pivotY = xyzToLabPivot(y / referenceY);
  const pivotZ = xyzToLabPivot(z / referenceZ);

  return {
    l: 116 * pivotY - 16,
    a: 500 * (pivotX - pivotY),
    b: 200 * (pivotY - pivotZ)
  };
}

export function labToRgb({ l, a, b }: LabColor) {
  const pivotY = (l + 16) / 116;
  const pivotX = a / 500 + pivotY;
  const pivotZ = pivotY - b / 200;

  const x = referenceX * labToXyzPivot(pivotX);
  const y = referenceY * labToXyzPivot(pivotY);
  const z = referenceZ * labToXyzPivot(pivotZ);

  const normalizedX = x / 100;
  const normalizedY = y / 100;
  const normalizedZ = z / 100;

  const linearRed = normalizedX * 3.2406 + normalizedY * -1.5372 + normalizedZ * -0.4986;
  const linearGreen = normalizedX * -0.9689 + normalizedY * 1.8758 + normalizedZ * 0.0415;
  const linearBlue = normalizedX * 0.0557 + normalizedY * -0.204 + normalizedZ * 1.057;

  return {
    red: linearToSrgb(linearRed),
    green: linearToSrgb(linearGreen),
    blue: linearToSrgb(linearBlue)
  };
}

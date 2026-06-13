function stripDataUrlPrefix(value: string) {
  const commaIndex = value.indexOf(",");

  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("无法创建图片编码画布");
  }

  return context;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64Data = ""] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function isEncodedImageBytes(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  return isPng || isJpeg || isWebp;
}

export function imageDataToPngBase64(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);

  canvas.width = imageData.width;
  canvas.height = imageData.height;
  context.putImageData(imageData, 0, 0);

  return stripDataUrlPrefix(canvas.toDataURL("image/png"));
}

export function imageDataToPngBlob(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);

  canvas.width = imageData.width;
  canvas.height = imageData.height;
  context.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法编码远程 AI 请求图片"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

export function decodeMaskImageDataToAlphaMask(sourceImageData: ImageData) {
  const mask = new ImageData(sourceImageData.width, sourceImageData.height);
  let minAlpha = 255;
  let maxAlpha = 0;
  let minLuminance = 255;
  let maxLuminance = 0;

  for (let index = 0; index < sourceImageData.data.length; index += 4) {
    const alpha = sourceImageData.data[index + 3];
    const luminance = Math.max(
      sourceImageData.data[index],
      sourceImageData.data[index + 1],
      sourceImageData.data[index + 2]
    );

    minAlpha = Math.min(minAlpha, alpha);
    maxAlpha = Math.max(maxAlpha, alpha);
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
  }

  const hasLuminanceSignal = maxLuminance - minLuminance > 2;
  const hasAlphaSignal = maxAlpha - minAlpha > 2;
  const shouldUseLuminance = hasLuminanceSignal && (!hasAlphaSignal || minAlpha > 252);

  for (let index = 0; index < sourceImageData.data.length; index += 4) {
    const alpha = sourceImageData.data[index + 3];
    const luminance = Math.max(
      sourceImageData.data[index],
      sourceImageData.data[index + 1],
      sourceImageData.data[index + 2]
    );

    mask.data[index + 3] = shouldUseLuminance ? luminance : hasAlphaSignal ? alpha : 0;
  }

  return mask;
}

function createWhiteAlphaMaskImageData(mask: ImageData) {
  const output = new ImageData(mask.width, mask.height);

  for (let index = 0; index < mask.data.length; index += 4) {
    output.data[index] = 255;
    output.data[index + 1] = 255;
    output.data[index + 2] = 255;
    output.data[index + 3] = mask.data[index + 3];
  }

  return output;
}

export function downloadAlphaMaskDebugPng(mask: ImageData, fileName: string) {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const link = document.createElement("a");

  canvas.width = mask.width;
  canvas.height = mask.height;
  context.putImageData(createWhiteAlphaMaskImageData(mask), 0, 0);

  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function createAlphaMaskFromBytes(bytes: Uint8Array, width: number, height: number) {
  const pixelCount = width * height;

  if (bytes.length === pixelCount) {
    const mask = new ImageData(width, height);

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      mask.data[pixelIndex * 4 + 3] = bytes[pixelIndex];
    }

    return mask;
  }

  if (bytes.length === pixelCount * 4) {
    const sourceImageData = new ImageData(new Uint8ClampedArray(bytes), width, height);

    return decodeMaskImageDataToAlphaMask(sourceImageData);
  }

  return null;
}

function resizeAlphaMask(mask: ImageData, width: number, height: number) {
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = getCanvasContext(sourceCanvas);
  const targetCanvas = document.createElement("canvas");
  const targetContext = getCanvasContext(targetCanvas);

  sourceCanvas.width = mask.width;
  sourceCanvas.height = mask.height;
  sourceContext.putImageData(mask, 0, 0);
  targetCanvas.width = width;
  targetCanvas.height = height;
  targetContext.clearRect(0, 0, width, height);
  targetContext.drawImage(sourceCanvas, 0, 0, width, height);

  return decodeMaskImageDataToAlphaMask(targetContext.getImageData(0, 0, width, height));
}

async function decodeImageElementFromBase64(base64Value: string) {
  const normalizedDataUrl = base64Value.startsWith("data:")
    ? base64Value
    : `data:image/png;base64,${base64Value}`;
  const blob = dataUrlToBlob(normalizedDataUrl);
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("远程 AI 返回的 mask 图片无法解码"));
      image.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function maskBase64ToImageData(maskValue: string, width: number, height: number) {
  const base64Data = stripDataUrlPrefix(maskValue.trim());
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const isEncodedImage = isEncodedImageBytes(bytes) || maskValue.trim().startsWith("data:image/");
  const rawMask = isEncodedImage ? null : createAlphaMaskFromBytes(bytes, width, height);

  if (rawMask) {
    return rawMask;
  }

  const decodedImage = await decodeImageElementFromBase64(maskValue);
  const decodedWidth = decodedImage.naturalWidth || decodedImage.width;
  const decodedHeight = decodedImage.naturalHeight || decodedImage.height;
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);

  canvas.width = decodedWidth;
  canvas.height = decodedHeight;
  context.clearRect(0, 0, decodedWidth, decodedHeight);
  context.drawImage(decodedImage, 0, 0, decodedWidth, decodedHeight);

  const decodedMask = decodeMaskImageDataToAlphaMask(context.getImageData(0, 0, decodedWidth, decodedHeight));

  if (decodedWidth !== width || decodedHeight !== height) {
    console.warn("[mask-debug] dimension mismatch", {
      decodedMask: {
        height: decodedHeight,
        width: decodedWidth
      },
      expectedImage: {
        height,
        width
      }
    });

    return resizeAlphaMask(decodedMask, width, height);
  }

  return decodedMask;
}

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

export function imageDataToPngBase64(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);

  canvas.width = imageData.width;
  canvas.height = imageData.height;
  context.putImageData(imageData, 0, 0);

  return stripDataUrlPrefix(canvas.toDataURL("image/png"));
}

function createAlphaMaskFromBytes(bytes: Uint8Array, width: number, height: number) {
  const pixelCount = width * height;
  const mask = new ImageData(width, height);

  if (bytes.length === pixelCount) {
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      mask.data[pixelIndex * 4 + 3] = bytes[pixelIndex];
    }

    return mask;
  }

  if (bytes.length === pixelCount * 4) {
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const sourceIndex = pixelIndex * 4;
      const alpha = bytes[sourceIndex + 3];
      const luminance = Math.max(bytes[sourceIndex], bytes[sourceIndex + 1], bytes[sourceIndex + 2]);

      mask.data[sourceIndex + 3] = alpha > 0 ? alpha : luminance;
    }

    return mask;
  }

  return null;
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

  const rawMask = createAlphaMaskFromBytes(bytes, width, height);

  if (rawMask) {
    return rawMask;
  }

  const decodedImage = await decodeImageElementFromBase64(maskValue);
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(decodedImage, 0, 0, width, height);

  const decodedImageData = context.getImageData(0, 0, width, height);
  const mask = new ImageData(width, height);
  let maxLuminance = 0;

  for (let index = 0; index < decodedImageData.data.length; index += 4) {
    maxLuminance = Math.max(
      maxLuminance,
      decodedImageData.data[index],
      decodedImageData.data[index + 1],
      decodedImageData.data[index + 2]
    );
  }

  for (let index = 0; index < decodedImageData.data.length; index += 4) {
    const sourceAlpha = decodedImageData.data[index + 3];
    const luminance = Math.max(
      decodedImageData.data[index],
      decodedImageData.data[index + 1],
      decodedImageData.data[index + 2]
    );

    mask.data[index + 3] = maxLuminance > 0 ? luminance : sourceAlpha;
  }

  return mask;
}

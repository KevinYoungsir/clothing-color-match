export type ExportSize = "original" | "2k" | "4k";

export const exportSizeLabels: Record<ExportSize, string> = {
  original: "原尺寸",
  "2k": "2K",
  "4k": "4K"
};

const exportLongEdges: Record<ExportSize, number | null> = {
  original: null,
  "2k": 2048,
  "4k": 4096
};

export type ExportDimensions = {
  width: number;
  height: number;
  isUpscaled: boolean;
};

function clampDimension(value: number) {
  return Math.max(1, Math.round(value));
}

export function getExportLongEdge(size: ExportSize) {
  return exportLongEdges[size];
}

export function getExportDimensions(width: number, height: number, size: ExportSize): ExportDimensions {
  const targetLongEdge = getExportLongEdge(size);

  if (!targetLongEdge) {
    return {
      height,
      isUpscaled: false,
      width
    };
  }

  const currentLongEdge = Math.max(width, height);
  const scale = targetLongEdge / currentLongEdge;

  return {
    height: clampDimension(height * scale),
    isUpscaled: scale > 1,
    width: clampDimension(width * scale)
  };
}

export function getExportFileName(fileName: string, size: ExportSize) {
  const baseName = fileName.replace(/\.[^/.\\]+$/, "") || "image";
  return `${baseName}_colorfixed_${size}.jpg`;
}

export function imageDataToCanvas(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法创建导出画布");
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function exportImageDataToJpegBlob(imageData: ImageData, size: ExportSize, quality = 0.92) {
  const sourceCanvas = imageDataToCanvas(imageData);
  const dimensions = getExportDimensions(imageData.width, imageData.height, size);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = dimensions.width;
  outputCanvas.height = dimensions.height;

  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("无法创建导出画布");
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片导出失败"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

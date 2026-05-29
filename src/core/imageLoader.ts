import type { UploadedImage } from "../types";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedFileExtension = /\.(jpe?g|png|webp)$/i;

function createImageId(file: File) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

export function isSupportedImageFile(file: File) {
  return acceptedMimeTypes.has(file.type) || acceptedFileExtension.test(file.name);
}

export function getUnsupportedImageMessage(file: File) {
  return `仅支持 JPG、PNG、WebP：${file.name}`;
}

export function loadImageFile(file: File): Promise<UploadedImage> {
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        id: createImageId(file),
        fileName: file.name,
        fileType: file.type || "image/unknown",
        url,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };

    image.src = url;
  });
}

export function loadImageDataFromUrl(url: string, width: number, height: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("无法创建图片处理画布"));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(context.getImageData(0, 0, width, height));
    };

    image.onerror = () => {
      reject(new Error("无法读取图片像素"));
    };

    image.src = url;
  });
}

import { useEffect, useRef } from "react";
import type { UploadedImage } from "../types";

type CanvasWorkspaceProps = {
  selectedImage: UploadedImage | null;
};

const canvasWidth = 1440;
const canvasHeight = 900;

export function CanvasWorkspace({ selectedImage }: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!selectedImage) {
      return;
    }

    let isCancelled = false;
    const image = new Image();

    image.onload = () => {
      if (isCancelled) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const offsetX = (canvas.width - drawWidth) / 2;
      const offsetY = (canvas.height - drawHeight) / 2;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    };

    image.src = selectedImage.url;

    return () => {
      isCancelled = true;
    };
  }, [selectedImage]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-rose-700">Preview</p>
          <h2 className="mt-1 text-base font-semibold">画布预览</h2>
          {selectedImage ? (
            <p className="mt-1 max-w-[52vw] truncate text-xs text-zinc-500">
              {selectedImage.fileName} · {selectedImage.width} x {selectedImage.height}px
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-teal-500" />
          <span className="h-3 w-3 rounded-sm bg-rose-500" />
          <span className="h-3 w-3 rounded-sm bg-amber-400" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="canvas-checker relative w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-200 p-5">
          <canvas
            aria-label={selectedImage ? `当前图片预览：${selectedImage.fileName}` : "当前图片预览"}
            className="block aspect-[16/10] w-full rounded-md border border-zinc-300 bg-white"
            height={canvasHeight}
            ref={canvasRef}
            width={canvasWidth}
          />
          {!selectedImage ? (
            <div className="pointer-events-none absolute inset-5 grid place-items-center">
              <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-semibold text-zinc-700">未加载样品图</p>
                <p className="mt-1 text-xs text-zinc-400">上传样品图后在这里预览</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

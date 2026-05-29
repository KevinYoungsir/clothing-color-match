import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getContainLayout } from "../core/maskUtils";
import type { MaskEditMode, MaskPoint, MaskState, UploadedImage } from "../types";

type CanvasWorkspaceProps = {
  brushSize: number;
  isMaskVisible: boolean;
  maskOpacity: number;
  maskState: MaskState | null;
  mode: MaskEditMode;
  onMaskStroke: (from: MaskPoint, to: MaskPoint, brushSizeInImagePixels: number) => void;
  onMaskStrokeStart: () => void;
  processedImageData: ImageData | null;
  selectedImage: UploadedImage | null;
};

const canvasWidth = 1440;
const canvasHeight = 900;

export function CanvasWorkspace({
  brushSize,
  isMaskVisible,
  maskOpacity,
  maskState,
  mode,
  onMaskStroke,
  onMaskStrokeStart,
  processedImageData,
  selectedImage
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const previousPointRef = useRef<MaskPoint | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    function drawPreview(source: CanvasImageSource) {
      if (!canvas || !context || !selectedImage) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const layout = getContainLayout(
        canvas.width,
        canvas.height,
        selectedImage.width,
        selectedImage.height
      );

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, layout.x, layout.y, layout.width, layout.height);

      if (isMaskVisible && maskState) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = maskState.imageData.width;
        maskCanvas.height = maskState.imageData.height;

        const maskContext = maskCanvas.getContext("2d");

        if (maskContext) {
          maskContext.putImageData(maskState.imageData, 0, 0);
          context.save();
          context.globalAlpha = maskOpacity / 100;
          context.drawImage(maskCanvas, layout.x, layout.y, layout.width, layout.height);
          context.restore();
        }
      }
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!selectedImage) {
      return;
    }

    if (processedImageData) {
      const processedCanvas = document.createElement("canvas");
      processedCanvas.width = processedImageData.width;
      processedCanvas.height = processedImageData.height;

      const processedContext = processedCanvas.getContext("2d");

      if (processedContext) {
        processedContext.putImageData(processedImageData, 0, 0);
        drawPreview(processedCanvas);
      }

      return;
    }

    if (imageRef.current && imageUrlRef.current === selectedImage.url) {
      drawPreview(imageRef.current);
      return;
    }

    let isCancelled = false;
    const image = new Image();

    image.onload = () => {
      if (isCancelled) {
        return;
      }

      imageRef.current = image;
      imageUrlRef.current = selectedImage.url;
      drawPreview(image);
    };

    image.src = selectedImage.url;

    return () => {
      isCancelled = true;
    };
  }, [isMaskVisible, maskOpacity, maskState, processedImageData, selectedImage]);

  function getMaskPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !selectedImage) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const layout = getContainLayout(canvas.width, canvas.height, selectedImage.width, selectedImage.height);

    if (
      canvasX < layout.x ||
      canvasX > layout.x + layout.width ||
      canvasY < layout.y ||
      canvasY > layout.y + layout.height
    ) {
      return null;
    }

    return {
      brushSizeInImagePixels: Math.max(1, brushSize / layout.scale),
      point: {
        x: ((canvasX - layout.x) / layout.width) * selectedImage.width,
        y: ((canvasY - layout.y) / layout.height) * selectedImage.height
      }
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || !selectedImage) {
      return;
    }

    const maskPoint = getMaskPoint(event);

    if (!maskPoint) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    onMaskStrokeStart();
    onMaskStroke(maskPoint.point, maskPoint.point, maskPoint.brushSizeInImagePixels);
    previousPointRef.current = maskPoint.point;
    setIsDrawing(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !selectedImage) {
      return;
    }

    const maskPoint = getMaskPoint(event);

    if (!maskPoint) {
      previousPointRef.current = null;
      return;
    }

    const previousPoint = previousPointRef.current ?? maskPoint.point;
    onMaskStroke(previousPoint, maskPoint.point, maskPoint.brushSizeInImagePixels);
    previousPointRef.current = maskPoint.point;
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    previousPointRef.current = null;
    setIsDrawing(false);
  }

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-rose-700">Preview</p>
          <h2 className="mt-1 text-base font-semibold">
            {mode === "reference"
              ? "标准图取色区域"
              : processedImageData
                ? "校色结果预览"
                : "画布预览"}
          </h2>
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
            className={`block aspect-[16/10] w-full rounded-md border border-zinc-300 bg-white ${
              selectedImage ? "cursor-crosshair touch-none" : ""
            }`}
            height={canvasHeight}
            onPointerCancel={stopDrawing}
            onPointerDown={handlePointerDown}
            onPointerLeave={stopDrawing}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            ref={canvasRef}
            width={canvasWidth}
          />
          {!selectedImage ? (
            <div className="pointer-events-none absolute inset-5 grid place-items-center">
              <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-semibold text-zinc-700">
                  {mode === "reference" ? "未加载标准图" : "未加载样品图"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {mode === "reference" ? "上传标准图后在这里编辑取色区域" : "上传样品图后在这里预览"}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

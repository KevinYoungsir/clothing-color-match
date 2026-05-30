import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getContainLayout } from "../core/maskUtils";
import type { MaskEditMode, MaskPoint, MaskState, UploadedImage } from "../types";

type CompareMode = "single" | "sideBySide" | "split";

type CanvasWorkspaceProps = {
  brushSize: number;
  isMaskEditingActive: boolean;
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
const zoomLevels = [1, 1.5, 2, 3];

export function CanvasWorkspace({
  brushSize,
  isMaskEditingActive,
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
  const [compareMode, setCompareMode] = useState<CompareMode>("single");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoomIndex, setZoomIndex] = useState(0);

  const isTargetMode = mode === "target";
  const canCompare = Boolean(isTargetMode && processedImageData && selectedImage);
  const canEditMask = Boolean(
    isMaskEditingActive && selectedImage && (!isTargetMode || compareMode === "single")
  );
  const shouldDrawMaskOverlay = Boolean(isMaskEditingActive && isMaskVisible);
  const zoom = zoomLevels[zoomIndex];
  const previewTitle =
    mode === "reference"
      ? "标准图取色区域"
      : isHoldingOriginal
        ? "原图临时预览"
        : canCompare && compareMode !== "single"
          ? "前后对比"
          : processedImageData
            ? "校色结果预览"
            : "画布预览";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isFormElement =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "BUTTON";

      if (event.code === "Space" && isTargetMode && selectedImage && !isFormElement) {
        event.preventDefault();
        setIsHoldingOriginal(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsHoldingOriginal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isTargetMode, selectedImage]);

  useEffect(() => {
    if (!canCompare && compareMode !== "single") {
      setCompareMode("single");
    }
  }, [canCompare, compareMode]);

  useEffect(() => {
    if (isMaskEditingActive && compareMode !== "single") {
      setCompareMode("single");
    }
  }, [compareMode, isMaskEditingActive]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const drawCanvas = canvas;
    const drawContext = context;

    function clearCanvas() {
      drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      drawContext.fillStyle = "#ffffff";
      drawContext.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    }

    function drawSourceInRect(
      source: CanvasImageSource,
      rect: { x: number; y: number; width: number; height: number }
    ) {
      if (!selectedImage) {
        return;
      }

      const layout = getContainLayout(rect.width, rect.height, selectedImage.width, selectedImage.height);
      const drawWidth = layout.width * zoom;
      const drawHeight = layout.height * zoom;
      const drawX = rect.x + (rect.width - drawWidth) / 2;
      const drawY = rect.y + (rect.height - drawHeight) / 2;

      drawContext.imageSmoothingEnabled = true;
      drawContext.imageSmoothingQuality = "high";
      drawContext.drawImage(source, drawX, drawY, drawWidth, drawHeight);
    }

    function drawMaskOverlay(
      rect: { x: number; y: number; width: number; height: number },
      clipRect?: { x: number; y: number; width: number; height: number }
    ) {
      if (!selectedImage || !maskState || !shouldDrawMaskOverlay) {
        return;
      }

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = maskState.imageData.width;
      maskCanvas.height = maskState.imageData.height;

      const maskContext = maskCanvas.getContext("2d");

      if (!maskContext) {
        return;
      }

      maskContext.putImageData(maskState.imageData, 0, 0);
      drawContext.save();

      if (clipRect) {
        drawContext.beginPath();
        drawContext.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
        drawContext.clip();
      }

      drawContext.globalAlpha = maskOpacity / 100;
      drawSourceInRect(maskCanvas, rect);
      drawContext.restore();
    }

    function drawLabel(text: string, x: number, y: number) {
      drawContext.save();
      drawContext.fillStyle = "rgba(24, 24, 27, 0.72)";
      drawContext.fillRect(x, y, 88, 28);
      drawContext.fillStyle = "#ffffff";
      drawContext.font = "600 15px sans-serif";
      drawContext.fillText(text, x + 12, y + 19);
      drawContext.restore();
    }

    function drawPreview(originalSource: CanvasImageSource, resultSource: CanvasImageSource) {
      const fullRect = { x: 0, y: 0, width: drawCanvas.width, height: drawCanvas.height };
      const shouldCompare = Boolean(isTargetMode && processedImageData && !isHoldingOriginal);
      const activeCompareMode = shouldCompare ? compareMode : "single";

      clearCanvas();

      if (activeCompareMode === "sideBySide") {
        const leftRect = { x: 0, y: 0, width: drawCanvas.width / 2, height: drawCanvas.height };
        const rightRect = { x: drawCanvas.width / 2, y: 0, width: drawCanvas.width / 2, height: drawCanvas.height };

        drawSourceInRect(originalSource, leftRect);
        drawSourceInRect(resultSource, rightRect);
        drawContext.save();
        drawContext.strokeStyle = "#e4e4e7";
        drawContext.lineWidth = 2;
        drawContext.beginPath();
        drawContext.moveTo(drawCanvas.width / 2, 0);
        drawContext.lineTo(drawCanvas.width / 2, drawCanvas.height);
        drawContext.stroke();
        drawContext.restore();

        drawLabel("原图", 18, 18);
        drawLabel("结果", drawCanvas.width / 2 + 18, 18);
        return;
      }

      if (activeCompareMode === "split") {
        const splitX = (drawCanvas.width * splitPosition) / 100;

        drawSourceInRect(resultSource, fullRect);

        drawContext.save();
        drawContext.beginPath();
        drawContext.rect(0, 0, splitX, drawCanvas.height);
        drawContext.clip();
        drawSourceInRect(originalSource, fullRect);
        drawContext.restore();

        drawContext.save();
        drawContext.strokeStyle = "#14b8a6";
        drawContext.lineWidth = 4;
        drawContext.beginPath();
        drawContext.moveTo(splitX, 0);
        drawContext.lineTo(splitX, drawCanvas.height);
        drawContext.stroke();
        drawContext.restore();

        drawLabel("原图", 18, 18);
        drawLabel("结果", drawCanvas.width - 106, 18);
        return;
      }

      drawSourceInRect(isHoldingOriginal ? originalSource : resultSource, fullRect);

      if (activeCompareMode === "single") {
        drawMaskOverlay(fullRect);
      }
    }

    clearCanvas();

    if (!selectedImage) {
      return;
    }

    function drawWhenOriginalReady(originalImage: HTMLImageElement) {
      if (processedImageData && isTargetMode) {
        const processedCanvas = document.createElement("canvas");
        processedCanvas.width = processedImageData.width;
        processedCanvas.height = processedImageData.height;

        const processedContext = processedCanvas.getContext("2d");

        if (processedContext) {
          processedContext.putImageData(processedImageData, 0, 0);
          drawPreview(originalImage, processedCanvas);
        }

        return;
      }

      drawPreview(originalImage, originalImage);
    }

    if (imageRef.current && imageUrlRef.current === selectedImage.url) {
      drawWhenOriginalReady(imageRef.current);
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
      drawWhenOriginalReady(image);
    };

    image.src = selectedImage.url;

    return () => {
      isCancelled = true;
    };
  }, [
    compareMode,
    isHoldingOriginal,
    isMaskEditingActive,
    isMaskVisible,
    isTargetMode,
    maskOpacity,
    maskState,
    processedImageData,
    selectedImage,
    splitPosition,
    zoom
  ]);

  function getSplitPosition(event: PointerEvent<HTMLElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return splitPosition;
    }

    const rect = canvas.getBoundingClientRect();
    return Math.min(95, Math.max(5, ((event.clientX - rect.left) / rect.width) * 100));
  }

  function handleSplitPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingSplit(true);
    setSplitPosition(getSplitPosition(event));
  }

  function handleSplitPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDraggingSplit) {
      return;
    }

    setSplitPosition(getSplitPosition(event));
  }

  function stopSplitDragging(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDraggingSplit(false);
  }

  function getMaskPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !selectedImage || !isMaskEditingActive || (isTargetMode && compareMode !== "single")) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const baseLayout = getContainLayout(canvas.width, canvas.height, selectedImage.width, selectedImage.height);
    const layout = {
      x: (canvas.width - baseLayout.width * zoom) / 2,
      y: (canvas.height - baseLayout.height * zoom) / 2,
      width: baseLayout.width * zoom,
      height: baseLayout.height * zoom,
      scale: baseLayout.scale * zoom
    };

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
    if (
      event.button !== 0 ||
      !selectedImage ||
      !isMaskEditingActive ||
      (isTargetMode && compareMode !== "single")
    ) {
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-rose-700">Preview</p>
          <h2 className="mt-1 text-base font-semibold">{previewTitle}</h2>
          {selectedImage ? (
            <p className="mt-1 max-w-[52vw] truncate text-xs text-zinc-500">
              {selectedImage.fileName} · {selectedImage.width} x {selectedImage.height}px
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isTargetMode ? (
            <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
              {[
                { label: "单图", value: "single" },
                { label: "左右", value: "sideBySide" },
                { label: "分割", value: "split" }
              ].map((item) => (
                <button
                  className={`rounded px-3 py-2 text-sm font-semibold ${
                    compareMode === item.value ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
                  }`}
                  disabled={item.value !== "single" && !canCompare}
                  key={item.value}
                  onClick={() => setCompareMode(item.value as CompareMode)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center rounded-md border border-zinc-200 bg-zinc-50 p-1">
            <button
              className="rounded px-3 py-2 text-sm font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!selectedImage || zoomIndex === 0}
              onClick={() => setZoomIndex((currentIndex) => Math.max(0, currentIndex - 1))}
              type="button"
            >
              -
            </button>
            <span className="min-w-12 px-2 text-center text-sm font-semibold text-zinc-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="rounded px-3 py-2 text-sm font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!selectedImage || zoomIndex === zoomLevels.length - 1}
              onClick={() => setZoomIndex((currentIndex) => Math.min(zoomLevels.length - 1, currentIndex + 1))}
              type="button"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="canvas-checker relative w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-200 p-5">
          <canvas
            aria-label={selectedImage ? `当前图片预览：${selectedImage.fileName}` : "当前图片预览"}
            className={`block aspect-[16/10] w-full rounded-md border border-zinc-300 bg-white ${
              canEditMask ? "cursor-crosshair touch-none" : ""
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

          {canCompare && compareMode === "split" && !isHoldingOriginal ? (
            <div className="pointer-events-none absolute inset-5">
              <div
                aria-label="拖动分割线"
                className="pointer-events-auto absolute top-0 h-full w-5 -translate-x-1/2 cursor-ew-resize"
                onPointerCancel={stopSplitDragging}
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={stopSplitDragging}
                role="separator"
                style={{ left: `${splitPosition}%` }}
                tabIndex={0}
              >
                <span className="absolute left-1/2 top-1/2 h-11 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-teal-500 shadow-md" />
              </div>
            </div>
          ) : null}

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

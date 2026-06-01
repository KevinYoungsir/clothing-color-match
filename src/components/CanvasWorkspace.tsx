import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getContainLayout } from "../core/maskUtils";
import type { GarmentRoi, MaskEditMode, MaskPoint, MaskState, MaskTool, UploadedImage } from "../types";

type CompareMode = "single" | "sideBySide" | "split";

type CanvasWorkspaceProps = {
  brushSize: number;
  garmentRoi: GarmentRoi | null;
  isMaskEditingActive: boolean;
  isMaskVisible: boolean;
  isRoiSelectionActive: boolean;
  maskTool: MaskTool;
  maskOpacity: number;
  maskState: MaskState | null;
  mode: MaskEditMode;
  onMaskStroke: (from: MaskPoint, to: MaskPoint, brushSizeInImagePixels: number) => void;
  onMaskStrokeStart: () => void;
  onGarmentRoiChange: (roi: GarmentRoi) => void;
  processedImageData: ImageData | null;
  selectedImage: UploadedImage | null;
};

const canvasWidth = 1440;
const canvasHeight = 900;
const zoomLevels = [1, 1.5, 2, 3];

export function CanvasWorkspace({
  brushSize,
  garmentRoi,
  isMaskEditingActive,
  isMaskVisible,
  isRoiSelectionActive,
  maskTool,
  maskOpacity,
  maskState,
  mode,
  onMaskStroke,
  onMaskStrokeStart,
  onGarmentRoiChange,
  processedImageData,
  selectedImage
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const previousPointRef = useRef<MaskPoint | null>(null);
  const roiStartPointRef = useRef<MaskPoint | null>(null);
  const previousCompareModeBeforeRoiRef = useRef<CompareMode | null>(null);
  const wasRoiSelectionActiveRef = useRef(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("single");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingRoi, setIsDrawingRoi] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState(false);
  const [roiDraft, setRoiDraft] = useState<GarmentRoi | null>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [brushCursor, setBrushCursor] = useState<{
    size: number;
    x: number;
    y: number;
  } | null>(null);

  const isTargetMode = mode === "target";
  const canCompare = Boolean(isTargetMode && processedImageData && selectedImage);
  const canEditMask = Boolean(
    isMaskEditingActive && selectedImage && (!isTargetMode || compareMode === "single")
  );
  const canSelectRoi = Boolean(isTargetMode && isRoiSelectionActive && selectedImage && compareMode === "single");
  const shouldDrawMaskOverlay = Boolean(isMaskEditingActive && isMaskVisible);
  const visibleRoi = roiDraft ?? garmentRoi;
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
    const wasRoiSelectionActive = wasRoiSelectionActiveRef.current;

    if (isRoiSelectionActive && !wasRoiSelectionActive) {
      previousCompareModeBeforeRoiRef.current = compareMode;

      if (compareMode !== "single") {
        setCompareMode("single");
      }
    }

    if (!isRoiSelectionActive && wasRoiSelectionActive) {
      const previousCompareMode = previousCompareModeBeforeRoiRef.current;

      previousCompareModeBeforeRoiRef.current = null;

      if (
        previousCompareMode &&
        previousCompareMode !== "single" &&
        canCompare &&
        !isMaskEditingActive
      ) {
        setCompareMode(previousCompareMode);
      }
    }

    wasRoiSelectionActiveRef.current = isRoiSelectionActive;
  }, [canCompare, compareMode, isMaskEditingActive, isRoiSelectionActive]);

  useEffect(() => {
    if (!canEditMask) {
      setBrushCursor(null);
    }
  }, [canEditMask]);

  useEffect(() => {
    setBrushCursor((currentCursor) => {
      const canvas = canvasRef.current;

      if (!currentCursor || !canvas) {
        return currentCursor;
      }

      const rect = canvas.getBoundingClientRect();

      return {
        ...currentCursor,
        size: Math.max(4, brushSize * (rect.width / canvas.width))
      };
    });
  }, [brushSize, zoom]);

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

  function getImagePoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !selectedImage) {
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
      x: ((canvasX - layout.x) / layout.width) * selectedImage.width,
      y: ((canvasY - layout.y) / layout.height) * selectedImage.height
    };
  }

  function getMaskPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !selectedImage || !isMaskEditingActive || (isTargetMode && compareMode !== "single")) {
      return null;
    }

    const imagePoint = getImagePoint(event);

    if (!imagePoint) {
      return null;
    }

    const baseLayout = getContainLayout(canvas.width, canvas.height, selectedImage.width, selectedImage.height);
    const layout = {
      scale: baseLayout.scale * zoom
    };

    return {
      brushSizeInImagePixels: Math.max(1, brushSize / layout.scale),
      point: imagePoint
    };
  }

  function createRoiFromPoints(startPoint: MaskPoint, endPoint: MaskPoint) {
    if (!selectedImage) {
      return null;
    }

    const x = Math.max(0, Math.min(startPoint.x, endPoint.x));
    const y = Math.max(0, Math.min(startPoint.y, endPoint.y));
    const right = Math.min(selectedImage.width, Math.max(startPoint.x, endPoint.x));
    const bottom = Math.min(selectedImage.height, Math.max(startPoint.y, endPoint.y));
    const width = right - x;
    const height = bottom - y;

    if (width < 2 || height < 2) {
      return null;
    }

    return {
      height,
      width,
      x,
      y
    };
  }

  function getRoiOverlayStyle(roi: GarmentRoi) {
    const canvas = canvasRef.current;
    const canvasShell = canvas?.parentElement;

    if (!canvas || !canvasShell || !selectedImage) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const shellRect = canvasShell.getBoundingClientRect();
    const baseLayout = getContainLayout(canvas.width, canvas.height, selectedImage.width, selectedImage.height);
    const layout = {
      x: (canvas.width - baseLayout.width * zoom) / 2,
      y: (canvas.height - baseLayout.height * zoom) / 2,
      scale: baseLayout.scale * zoom
    };
    const canvasScaleX = canvasRect.width / canvas.width;
    const canvasScaleY = canvasRect.height / canvas.height;

    return {
      height: `${roi.height * layout.scale * canvasScaleY}px`,
      left: `${canvasRect.left - shellRect.left + (layout.x + roi.x * layout.scale) * canvasScaleX}px`,
      top: `${canvasRect.top - shellRect.top + (layout.y + roi.y * layout.scale) * canvasScaleY}px`,
      width: `${roi.width * layout.scale * canvasScaleX}px`
    };
  }

  function handleRoiPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || !canSelectRoi) {
      return false;
    }

    const startPoint = getImagePoint(event);

    if (!startPoint) {
      return false;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    roiStartPointRef.current = startPoint;
    setRoiDraft({
      height: 1,
      width: 1,
      x: startPoint.x,
      y: startPoint.y
    });
    setIsDrawingRoi(true);

    return true;
  }

  function handleRoiPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRoi || !roiStartPointRef.current) {
      return false;
    }

    const currentPoint = getImagePoint(event);
    const draftRoi = currentPoint ? createRoiFromPoints(roiStartPointRef.current, currentPoint) : null;

    if (draftRoi) {
      setRoiDraft(draftRoi);
    }

    return true;
  }

  function stopRoiSelection(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRoi) {
      return false;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const currentPoint = getImagePoint(event);
    const finalRoi =
      currentPoint && roiStartPointRef.current
        ? createRoiFromPoints(roiStartPointRef.current, currentPoint)
        : roiDraft;

    if (finalRoi && finalRoi.width >= 8 && finalRoi.height >= 8) {
      onGarmentRoiChange(finalRoi);
    }

    roiStartPointRef.current = null;
    setIsDrawingRoi(false);
    setRoiDraft(null);

    return true;
  }

  function updateBrushCursor(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const canvasShell = canvas?.parentElement;
    const maskPoint = getMaskPoint(event);

    if (!canvas || !canvasShell || !maskPoint) {
      setBrushCursor(null);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const shellRect = canvasShell.getBoundingClientRect();

    setBrushCursor({
      size: Math.max(4, brushSize * (canvasRect.width / canvas.width)),
      x: event.clientX - shellRect.left,
      y: event.clientY - shellRect.top
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (handleRoiPointerDown(event)) {
      setBrushCursor(null);
      return;
    }

    if (
      event.button !== 0 ||
      !selectedImage ||
      !isMaskEditingActive ||
      (isTargetMode && compareMode !== "single")
    ) {
      return;
    }

    updateBrushCursor(event);
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
    if (handleRoiPointerMove(event)) {
      setBrushCursor(null);
      return;
    }

    updateBrushCursor(event);

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
    if (stopRoiSelection(event)) {
      setBrushCursor(null);
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    previousPointRef.current = null;
    setIsDrawing(false);

    if (event.type === "pointerleave" || event.type === "pointercancel") {
      setBrushCursor(null);
    }
  }

  const roiOverlayStyle = visibleRoi ? getRoiOverlayStyle(visibleRoi) : null;

  return (
    <section className="flex min-h-[560px] min-w-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel lg:min-h-[calc(100vh-220px)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5">
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

      <div className="grid min-h-0 flex-1 place-items-center p-3 lg:p-4">
        <div className="canvas-checker relative w-full max-w-[1440px] overflow-hidden rounded-lg border border-zinc-200 p-3 lg:p-4">
          <canvas
            aria-label={selectedImage ? `当前图片预览：${selectedImage.fileName}` : "当前图片预览"}
            className={`block aspect-[16/10] w-full rounded-md border border-zinc-300 bg-white ${
              canEditMask || canSelectRoi ? "cursor-crosshair touch-none" : ""
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

          {visibleRoi && roiOverlayStyle ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-400/10 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]"
              style={roiOverlayStyle}
            >
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                服装框选
              </span>
            </div>
          ) : null}

          {brushCursor ? (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                maskTool === "eraser"
                  ? "border-rose-500 bg-rose-500/10"
                  : "border-teal-500 bg-teal-500/10"
              }`}
              style={{
                height: `${brushCursor.size}px`,
                left: `${brushCursor.x}px`,
                top: `${brushCursor.y}px`,
                width: `${brushCursor.size}px`
              }}
            />
          ) : null}

          {canCompare && compareMode === "split" && !isHoldingOriginal ? (
            <div className="pointer-events-none absolute inset-3 lg:inset-4">
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
            <div className="pointer-events-none absolute inset-3 grid place-items-center lg:inset-4">
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

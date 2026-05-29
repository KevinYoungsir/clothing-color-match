import type { MaskPoint, MaskState, MaskTool } from "../types";

const maskColor = "rgba(20, 184, 166, 1)";
const maxHistorySteps = 30;

export type ContainLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function getContainLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ContainLayout {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
    scale
  };
}

export function createEmptyMask(width: number, height: number) {
  return new ImageData(width, height);
}

export function createMaskState(width: number, height: number): MaskState {
  return {
    imageData: createEmptyMask(width, height),
    redoStack: [],
    undoStack: []
  };
}

export function cloneImageData(imageData: ImageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

export function pushUndoSnapshot(maskState: MaskState): MaskState {
  return {
    ...maskState,
    redoStack: [],
    undoStack: [...maskState.undoStack, cloneImageData(maskState.imageData)].slice(-maxHistorySteps)
  };
}

export function drawMaskStroke(
  imageData: ImageData,
  from: MaskPoint,
  to: MaskPoint,
  brushSize: number,
  tool: MaskTool
) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const context = canvas.getContext("2d");

  if (!context) {
    return imageData;
  }

  context.putImageData(imageData, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = brushSize;
  context.strokeStyle = maskColor;
  context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";

  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();

  context.beginPath();
  context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
  context.fillStyle = maskColor;
  context.fill();

  return context.getImageData(0, 0, imageData.width, imageData.height);
}

export function clearMask(maskState: MaskState): MaskState {
  return {
    imageData: createEmptyMask(maskState.imageData.width, maskState.imageData.height),
    redoStack: [],
    undoStack: [...maskState.undoStack, cloneImageData(maskState.imageData)].slice(-maxHistorySteps)
  };
}

export function undoMask(maskState: MaskState): MaskState {
  if (maskState.undoStack.length === 0) {
    return maskState;
  }

  const previousImageData = maskState.undoStack[maskState.undoStack.length - 1];

  return {
    imageData: cloneImageData(previousImageData),
    redoStack: [cloneImageData(maskState.imageData), ...maskState.redoStack].slice(0, maxHistorySteps),
    undoStack: maskState.undoStack.slice(0, -1)
  };
}

export function redoMask(maskState: MaskState): MaskState {
  if (maskState.redoStack.length === 0) {
    return maskState;
  }

  const nextImageData = maskState.redoStack[0];

  return {
    imageData: cloneImageData(nextImageData),
    redoStack: maskState.redoStack.slice(1),
    undoStack: [...maskState.undoStack, cloneImageData(maskState.imageData)].slice(-maxHistorySteps)
  };
}

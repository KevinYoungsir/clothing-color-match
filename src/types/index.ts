export type UploadedImage = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
  width: number;
  height: number;
};

export type MaskTool = "brush" | "eraser";

export type MaskPoint = {
  x: number;
  y: number;
};

export type MaskState = {
  imageData: ImageData;
  undoStack: ImageData[];
  redoStack: ImageData[];
};

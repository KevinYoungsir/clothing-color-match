export type UploadedImage = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
  width: number;
  height: number;
};

export type MaskTool = "brush" | "eraser";

export type MaskEditMode = "reference" | "target";

export type MaskRecognitionStatus = "unrecognized" | "auto" | "manual" | "colored";

export type ColorCorrectionScope = "auto-garment" | "full-image" | "manual-mask";

export type ColorMatchMode = "natural" | "accurate" | "strong";

export type GarmentRoi = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ColorDifferenceAssessment = "very-close" | "acceptable" | "visible-difference";

export type ColorDifferenceResult = {
  deltaEBefore: number;
  deltaEAfter: number;
  improvementPercent: number;
  assessment: ColorDifferenceAssessment;
  referencePixelCount: number;
  targetPixelCount: number;
  isFullImageScope: boolean;
  warning?: string;
};

export type SampleProcessStatus =
  | "idle"
  | "selected"
  | "queued"
  | "processing"
  | "done"
  | "needs-manual-fix"
  | "missing-mask"
  | "recognition-failed"
  | "failed";

export type MaskPoint = {
  x: number;
  y: number;
};

export type MaskState = {
  imageData: ImageData;
  undoStack: ImageData[];
  redoStack: ImageData[];
};

import { useEffect, useMemo, useRef, useState } from "react";
import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { ExportBar } from "./components/ExportBar";
import { ImageSidebar } from "./components/ImageSidebar";
import { TopToolbar } from "./components/TopToolbar";
import {
  getUnsupportedImageMessage,
  isSupportedImageFile,
  loadImageDataFromUrl,
  loadImageFile
} from "./core/imageLoader";
import {
  cloneImageData,
  clearMask,
  createMaskState,
  drawMaskStroke,
  hasMaskPixels,
  pushUndoSnapshot,
  redoMask,
  undoMask
} from "./core/maskUtils";
import { transferLabColor } from "./core/colorTransfer";
import {
  applyImageAdjustments,
  defaultAdjustmentParams,
  isDefaultAdjustmentParams,
  type AdjustmentKey,
  type AdjustmentParams
} from "./core/adjustment";
import {
  processBatchImages,
  processSampleImage,
  type AutoColorParams,
  type BatchProcessResult,
  type BatchItemStatus,
  type ProcessedSampleResult
} from "./core/batchProcessor";
import { generateAutoGarmentMask, type AutoMaskResult } from "./core/autoMask";
import type {
  ColorCorrectionScope,
  GarmentRoi,
  MaskEditMode,
  MaskPoint,
  MaskRecognitionStatus,
  MaskState,
  MaskTool,
  SampleProcessStatus,
  UploadedImage
} from "./types";
import {
  downloadBlob,
  exportImageDataToJpegBlob,
  getExportFileName,
  getExportLongEdge,
  type ExportSize
} from "./core/exportImage";
import { createZipBlob } from "./core/simpleZip";

export default function App() {
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sampleImages, setSampleImages] = useState<UploadedImage[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [referenceMaskState, setReferenceMaskState] = useState<MaskState | null>(null);
  const [maskStates, setMaskStates] = useState<Record<string, MaskState>>({});
  const [referenceMaskStatus, setReferenceMaskStatus] =
    useState<MaskRecognitionStatus>("unrecognized");
  const [sampleMaskStatuses, setSampleMaskStatuses] = useState<Record<string, MaskRecognitionStatus>>({});
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [sampleProcessStatuses, setSampleProcessStatuses] = useState<Record<string, SampleProcessStatus>>({});
  const [sampleProcessMessages, setSampleProcessMessages] = useState<Record<string, string>>({});
  const [garmentRoiMap, setGarmentRoiMap] = useState<Record<string, GarmentRoi>>({});
  const [isRoiSelectionActive, setIsRoiSelectionActive] = useState(false);
  const [colorCorrectionScope, setColorCorrectionScope] =
    useState<ColorCorrectionScope>("auto-garment");
  const [maskEditMode, setMaskEditMode] = useState<MaskEditMode>("target");
  const [isMaskEditingActive, setIsMaskEditingActive] = useState(false);
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(32);
  const [maskOpacity, setMaskOpacity] = useState(55);
  const [isMaskVisible, setIsMaskVisible] = useState(false);
  const [colorStrength, setColorStrength] = useState(70);
  const [shadowProtection, setShadowProtection] = useState(35);
  const [highlightProtection, setHighlightProtection] = useState(35);
  const [maskFeather, setMaskFeather] = useState(4);
  const [processedImages, setProcessedImages] = useState<Record<string, ImageData>>({});
  const [adjustedImages, setAdjustedImages] = useState<Record<string, ImageData>>({});
  const [adjustmentParams, setAdjustmentParams] = useState<AdjustmentParams>(defaultAdjustmentParams);
  const [colorTransferError, setColorTransferError] = useState<string | null>(null);
  const [autoMaskNotice, setAutoMaskNotice] = useState<string | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [isColorTransferRunning, setIsColorTransferRunning] = useState(false);
  const [isBatchColoring, setIsBatchColoring] = useState(false);
  const [batchColorProgress, setBatchColorProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchColorMessage, setBatchColorMessage] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<ExportSize>("original");
  const [batchStatuses, setBatchStatuses] = useState<Record<string, BatchItemStatus>>({});
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const referenceImageRef = useRef<UploadedImage | null>(null);
  const sampleImagesRef = useRef<UploadedImage[]>([]);

  const selectedSample = useMemo(
    () => sampleImages.find((image) => image.id === selectedSampleId) ?? null,
    [sampleImages, selectedSampleId]
  );
  const selectedSampleIdSet = useMemo(() => new Set(selectedSampleIds), [selectedSampleIds]);
  const selectedSamplesForBatch = useMemo(
    () => sampleImages.filter((image) => selectedSampleIdSet.has(image.id)),
    [sampleImages, selectedSampleIdSet]
  );
  const selectedMaskState = selectedSampleId ? maskStates[selectedSampleId] ?? null : null;
  const selectedSampleMaskStatus = selectedSampleId
    ? sampleMaskStatuses[selectedSampleId] ?? "unrecognized"
    : "unrecognized";
  const selectedGarmentRoi = selectedSampleId ? garmentRoiMap[selectedSampleId] ?? null : null;
  const activeImage = maskEditMode === "reference" ? referenceImage : selectedSample;
  const activeMaskState = maskEditMode === "reference" ? referenceMaskState : selectedMaskState;
  const activeGarmentRoi = maskEditMode === "target" ? selectedGarmentRoi : null;
  const selectedProcessedImageData =
    maskEditMode === "target" && selectedSampleId ? processedImages[selectedSampleId] ?? null : null;
  const selectedAdjustedImageData =
    maskEditMode === "target" && selectedSampleId ? adjustedImages[selectedSampleId] ?? null : null;
  const selectedPreviewImageData = selectedAdjustedImageData ?? selectedProcessedImageData;
  const canUndoMask = (activeMaskState?.undoStack.length ?? 0) > 0;
  const canRedoMask = (activeMaskState?.redoStack.length ?? 0) > 0;
  const canApplyColorTransfer = Boolean(referenceImage && selectedSample);
  const autoColorParams = useMemo<AutoColorParams>(
    () => ({
      colorStrength,
      colorCorrectionScope,
      highlightProtection,
      maskFeather,
      shadowProtection
    }),
    [colorCorrectionScope, colorStrength, highlightProtection, maskFeather, shadowProtection]
  );
  const showUpscaleWarning = useMemo(() => {
    const targetLongEdge = getExportLongEdge(exportSize);

    if (!targetLongEdge) {
      return false;
    }

    return sampleImages.some((image) => Math.max(image.width, image.height) < targetLongEdge);
  }, [exportSize, sampleImages]);

  useEffect(() => {
    if (!selectedSampleId || !selectedSample) {
      setAdjustmentError(null);
      return;
    }

    if (isDefaultAdjustmentParams(adjustmentParams)) {
      setAdjustmentError(null);
      setAdjustedImages((currentImages) => {
        const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
        return remainingImages;
      });
      return;
    }

    if (
      colorCorrectionScope !== "full-image" &&
      (!selectedMaskState || !hasMaskPixels(selectedMaskState.imageData))
    ) {
      setAdjustmentError("请先自动识别并校色，或点击编辑校色范围后修正蒙版");
      setAdjustedImages((currentImages) => {
        const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
        return remainingImages;
      });
      return;
    }

    let isCancelled = false;

    loadImageDataFromUrl(selectedSample.url, selectedSample.width, selectedSample.height)
      .then((originalImageData) => {
        if (isCancelled) {
          return;
        }

        const baseImageData = selectedProcessedImageData ?? originalImageData;
        const adjustmentMask =
          colorCorrectionScope === "full-image"
            ? createFullImageMask(selectedSample.width, selectedSample.height)
            : selectedMaskState!.imageData;
        const adjustedImageData = applyImageAdjustments({
          baseImageData,
          originalImageData,
          params: adjustmentParams,
          targetMask: adjustmentMask
        });

        setAdjustedImages((currentImages) => ({
          ...currentImages,
          [selectedSampleId]: adjustedImageData
        }));
        setAdjustmentError(null);
      })
      .catch((error) => {
        if (!isCancelled) {
          setAdjustmentError(error instanceof Error ? error.message : "人工调整失败");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    adjustmentParams,
    colorCorrectionScope,
    selectedMaskState,
    selectedProcessedImageData,
    selectedSample,
    selectedSampleId
  ]);

  useEffect(() => {
    referenceImageRef.current = referenceImage;
  }, [referenceImage]);

  useEffect(() => {
    sampleImagesRef.current = sampleImages;
  }, [sampleImages]);

  useEffect(() => {
    return () => {
      if (referenceImageRef.current) {
        URL.revokeObjectURL(referenceImageRef.current.url);
      }

      sampleImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, []);

  async function handleReferenceUpload(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    if (!isSupportedImageFile(file)) {
      setUploadError(getUnsupportedImageMessage(file));
      return;
    }

    try {
      const image = await loadImageFile(file);

      setReferenceImage((currentImage) => {
        if (currentImage) {
          URL.revokeObjectURL(currentImage.url);
        }

        return image;
      });
      setReferenceMaskState(createMaskState(image.width, image.height));
      setReferenceMaskStatus("unrecognized");
      setMaskEditMode("reference");
      setIsMaskEditingActive(false);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(false);
      setProcessedImages({});
      setAdjustedImages({});
      setSampleProcessStatuses({});
      setSampleProcessMessages({});
      setUploadError(null);
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setAdjustmentError(null);
      setBatchStatuses({});
      setBatchColorMessage(null);
      setBatchColorProgress(null);
      setExportMessage(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "标准图读取失败");
    }
  }

  async function handleSampleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter(isSupportedImageFile);
    const unsupportedMessages = files
      .filter((file) => !isSupportedImageFile(file))
      .map(getUnsupportedImageMessage);

    const results = await Promise.allSettled(supportedFiles.map(loadImageFile));
    const loadedImages = results
      .filter((result): result is PromiseFulfilledResult<UploadedImage> => result.status === "fulfilled")
      .map((result) => result.value);
    const failedMessages = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : "样品图读取失败"));

    if (loadedImages.length > 0) {
      setSampleImages((currentImages) => [...currentImages, ...loadedImages]);
      setGarmentRoiMap((currentRois) => {
        const nextRois = { ...currentRois };

        loadedImages.forEach((image) => {
          delete nextRois[image.id];
        });

        return nextRois;
      });
      setMaskStates((currentMasks) => {
        const nextMasks = { ...currentMasks };

        loadedImages.forEach((image) => {
          nextMasks[image.id] = createMaskState(image.width, image.height);
        });

        return nextMasks;
      });
      setSampleMaskStatuses((currentStatuses) => {
        const nextStatuses = { ...currentStatuses };

        loadedImages.forEach((image) => {
          nextStatuses[image.id] = "unrecognized";
        });

        return nextStatuses;
      });
      setSampleProcessStatuses((currentStatuses) => {
        const nextStatuses = { ...currentStatuses };

        loadedImages.forEach((image) => {
          nextStatuses[image.id] = "idle";
        });

        return nextStatuses;
      });
      setSampleProcessMessages((currentMessages) => {
        const nextMessages = { ...currentMessages };

        loadedImages.forEach((image) => {
          delete nextMessages[image.id];
        });

        return nextMessages;
      });
      setSelectedSampleId((currentId) => currentId ?? loadedImages[0].id);
      setMaskEditMode("target");
      setIsMaskEditingActive(false);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(false);
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setAdjustmentError(null);
      setBatchStatuses({});
      setBatchColorMessage(null);
      setBatchColorProgress(null);
      setExportMessage(null);
    }

    const messages = [...unsupportedMessages, ...failedMessages];
    setUploadError(messages.length > 0 ? messages.join("\n") : null);
  }

  function handleMaskStrokeStart() {
    if (maskEditMode === "reference") {
      if (!referenceImage) {
        return;
      }

      setReferenceMaskState((currentMask) =>
        pushUndoSnapshot(currentMask ?? createMaskState(referenceImage.width, referenceImage.height))
      );
      setIsMaskEditingActive(true);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(true);
      setReferenceMaskStatus("manual");
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (!selectedSample || colorCorrectionScope === "full-image") {
      return;
    }

    setMaskStates((currentMasks) => {
      const currentMask =
        currentMasks[selectedSample.id] ?? createMaskState(selectedSample.width, selectedSample.height);

      return {
        ...currentMasks,
        [selectedSample.id]: pushUndoSnapshot(currentMask)
      };
    });
    setSampleMaskStatuses((currentStatuses) => ({
      ...currentStatuses,
      [selectedSample.id]: "manual"
    }));
    setIsMaskEditingActive(true);
    setIsMaskVisible(true);
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setProcessedImages((currentImages) => {
      const { [selectedSample.id]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustedImages((currentImages) => {
      const { [selectedSample.id]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustmentError(null);
  }

  function handleMaskStroke(from: MaskPoint, to: MaskPoint, brushSizeInImagePixels: number) {
    if (maskEditMode === "reference") {
      if (!referenceImage) {
        return;
      }

      setReferenceMaskState((currentMask) => {
        const mask = currentMask ?? createMaskState(referenceImage.width, referenceImage.height);

        return {
          ...mask,
          imageData: drawMaskStroke(mask.imageData, from, to, brushSizeInImagePixels, maskTool)
        };
      });
      return;
    }

    if (!selectedSample || colorCorrectionScope === "full-image") {
      return;
    }

    setMaskStates((currentMasks) => {
      const currentMask =
        currentMasks[selectedSample.id] ?? createMaskState(selectedSample.width, selectedSample.height);

      return {
        ...currentMasks,
        [selectedSample.id]: {
          ...currentMask,
          imageData: drawMaskStroke(
            currentMask.imageData,
            from,
            to,
            brushSizeInImagePixels,
            maskTool
          )
        }
      };
    });
  }

  function handleUndoMask() {
    if (maskEditMode === "reference") {
      setReferenceMaskState((currentMask) => (currentMask ? undoMask(currentMask) : currentMask));
      setReferenceMaskStatus("manual");
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (!selectedSampleId) {
      return;
    }

    setMaskStates((currentMasks) => {
      const currentMask = currentMasks[selectedSampleId];

      if (!currentMask) {
        return currentMasks;
      }

      return {
        ...currentMasks,
        [selectedSampleId]: undoMask(currentMask)
      };
    });
    setSampleMaskStatuses((currentStatuses) => ({
      ...currentStatuses,
      [selectedSampleId]: "manual"
    }));
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setProcessedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustmentError(null);
  }

  function handleRedoMask() {
    if (maskEditMode === "reference") {
      setReferenceMaskState((currentMask) => (currentMask ? redoMask(currentMask) : currentMask));
      setReferenceMaskStatus("manual");
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (!selectedSampleId) {
      return;
    }

    setMaskStates((currentMasks) => {
      const currentMask = currentMasks[selectedSampleId];

      if (!currentMask) {
        return currentMasks;
      }

      return {
        ...currentMasks,
        [selectedSampleId]: redoMask(currentMask)
      };
    });
    setSampleMaskStatuses((currentStatuses) => ({
      ...currentStatuses,
      [selectedSampleId]: "manual"
    }));
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setProcessedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustmentError(null);
  }

  function handleClearMask() {
    if (maskEditMode === "reference") {
      setReferenceMaskState((currentMask) => (currentMask ? clearMask(currentMask) : currentMask));
      setReferenceMaskStatus("unrecognized");
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (!selectedSampleId) {
      return;
    }

    setMaskStates((currentMasks) => {
      const currentMask = currentMasks[selectedSampleId];

      if (!currentMask) {
        return currentMasks;
      }

      return {
        ...currentMasks,
        [selectedSampleId]: clearMask(currentMask)
      };
    });
    setSampleMaskStatuses((currentStatuses) => ({
      ...currentStatuses,
      [selectedSampleId]: "unrecognized"
    }));
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setProcessedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustedImages((currentImages) => {
      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustmentError(null);
  }

  function handleAdjustmentParamChange(key: AdjustmentKey, value: number) {
    if (!selectedSample) {
      return;
    }

    if (
      colorCorrectionScope !== "full-image" &&
      (!selectedMaskState || !hasMaskPixels(selectedMaskState.imageData))
    ) {
      setAdjustmentError("请先自动识别并校色，或点击编辑校色范围后修正蒙版");
      setMaskEditMode("target");
    }

    setAdjustmentParams((currentParams) => ({
      ...currentParams,
      [key]: value
    }));
  }

  function handleResetAdjustmentParam(key: AdjustmentKey) {
    setAdjustmentParams((currentParams) => ({
      ...currentParams,
      [key]: defaultAdjustmentParams[key]
    }));
  }

  function handleResetAllAdjustments() {
    setAdjustmentParams(defaultAdjustmentParams);
    setAdjustmentError(null);
    setAdjustedImages((currentImages) => {
      if (!selectedSampleId) {
        return currentImages;
      }

      const { [selectedSampleId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
  }

  function createAutoMaskState(mask: ImageData, currentMask?: MaskState | null): MaskState {
    const undoStack =
      currentMask && hasMaskPixels(currentMask.imageData)
        ? [...currentMask.undoStack, cloneImageData(currentMask.imageData)].slice(-30)
        : [];

    return {
      imageData: mask,
      redoStack: [],
      undoStack
    };
  }

  function createFullImageMask(width: number, height: number) {
    const mask = new ImageData(width, height);

    for (let index = 3; index < mask.data.length; index += 4) {
      mask.data[index] = 255;
    }

    return mask;
  }

  function getAutoMaskNotice(label: string, result: AutoMaskResult) {
    const message = result.warning ?? result.reason;

    if (message) {
      return `${label}：${message}`;
    }

    return null;
  }

  function storeAutoTargetMask(image: UploadedImage, result: AutoMaskResult) {
    setMaskStates((currentMasks) => ({
      ...currentMasks,
      [image.id]: createAutoMaskState(result.mask, currentMasks[image.id])
    }));
    setSampleMaskStatuses((currentStatuses) => ({
      ...currentStatuses,
      [image.id]: "auto"
    }));
  }

  function clearSampleResult(imageId: string) {
    setProcessedImages((currentImages) => {
      const { [imageId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setAdjustedImages((currentImages) => {
      const { [imageId]: _removedImage, ...remainingImages } = currentImages;
      return remainingImages;
    });
    setSampleProcessStatuses((currentStatuses) => ({
      ...currentStatuses,
      [imageId]: selectedSampleIdSet.has(imageId) ? "selected" : "idle"
    }));
    setSampleProcessMessages((currentMessages) => {
      const { [imageId]: _removedMessage, ...remainingMessages } = currentMessages;
      return remainingMessages;
    });
  }

  function handleStartGarmentRoiSelection() {
    if (!selectedSample) {
      setAutoMaskNotice("请先选择样品图");
      return;
    }

    setMaskEditMode("target");
    setIsMaskEditingActive(false);
    setIsMaskVisible(false);
    setIsRoiSelectionActive(true);
    setAutoMaskNotice("请在画布上拖拽矩形框，圈出服装主体区域。");
  }

  function handleGarmentRoiChange(roi: GarmentRoi) {
    if (!selectedSample) {
      return;
    }

    setGarmentRoiMap((currentRois) => ({
      ...currentRois,
      [selectedSample.id]: roi
    }));
    clearSampleResult(selectedSample.id);
    setSampleMaskStatuses((currentStatuses) =>
      currentStatuses[selectedSample.id] === "manual"
        ? currentStatuses
        : {
            ...currentStatuses,
            [selectedSample.id]: "unrecognized"
          }
    );
    setIsRoiSelectionActive(false);
    setMaskEditMode("target");
    setAutoMaskNotice("已保存服装框选区域，自动识别将只在框选范围内运行。");
  }

  function handleClearGarmentRoi() {
    if (!selectedSampleId) {
      return;
    }

    setGarmentRoiMap((currentRois) => {
      const { [selectedSampleId]: _removedRoi, ...remainingRois } = currentRois;
      return remainingRois;
    });
    clearSampleResult(selectedSampleId);
    setIsRoiSelectionActive(false);
    setAutoMaskNotice("已清除当前样品图的服装框选区域。");
  }

  function handleSampleSelectionChange(imageId: string, isSelected: boolean) {
    setSelectedSampleIds((currentIds) => {
      if (isSelected) {
        return currentIds.includes(imageId) ? currentIds : [...currentIds, imageId];
      }

      return currentIds.filter((id) => id !== imageId);
    });

    setSampleProcessStatuses((currentStatuses) => {
      const currentStatus = currentStatuses[imageId];

      if (!isSelected && currentStatus === "selected") {
        return {
          ...currentStatuses,
          [imageId]: "idle"
        };
      }

      if (isSelected && (!currentStatus || currentStatus === "idle")) {
        return {
          ...currentStatuses,
          [imageId]: "selected"
        };
      }

      return currentStatuses;
    });
  }

  function handleSelectAllSamples() {
    setSelectedSampleIds(sampleImages.map((image) => image.id));
    setSampleProcessStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };

      sampleImages.forEach((image) => {
        const currentStatus = nextStatuses[image.id];

        if (!currentStatus || currentStatus === "idle" || currentStatus === "selected") {
          nextStatuses[image.id] = "selected";
        }
      });

      return nextStatuses;
    });
  }

  function handleClearSampleSelection() {
    setSelectedSampleIds([]);
    setSampleProcessStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };

      sampleImages.forEach((image) => {
        if (nextStatuses[image.id] === "selected" || nextStatuses[image.id] === "queued") {
          nextStatuses[image.id] = "idle";
        }
      });

      return nextStatuses;
    });
  }

  function handleColorCorrectionScopeChange(scope: ColorCorrectionScope) {
    setColorCorrectionScope(scope);
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setAdjustmentError(null);
    setProcessedImages({});
    setAdjustedImages({});
    setSampleProcessStatuses({});
    setSampleProcessMessages({});
    setBatchStatuses({});
    setBatchColorMessage(null);
    setBatchColorProgress(null);
    setExportMessage(null);
    setIsRoiSelectionActive(false);

    if (scope === "full-image") {
      setMaskEditMode("target");
      setIsMaskEditingActive(false);
      setIsMaskVisible(false);
      return;
    }

    if (scope === "manual-mask") {
      setMaskEditMode("target");
      setIsMaskEditingActive(true);
      setIsMaskVisible(true);
      return;
    }

    setMaskEditMode("target");
    setIsMaskEditingActive(false);
    setIsMaskVisible(false);
  }

  function ensureMaskConfidence(label: string, result: AutoMaskResult) {
    if (!hasMaskPixels(result.mask)) {
      throw new Error(`${label}自动识别失败，请点击编辑校色范围手动修正。`);
    }

    const hasUnsafeCoverage = result.coverageRatio > 0.65;
    const hasUnsafeBorderTouch =
      result.touchesBorderRatio > 0.26 ||
      (result.coverageRatio > 0.5 && result.touchesBorderRatio > 0.16);

    if (result.confidence < 0.45 || hasUnsafeCoverage || hasUnsafeBorderTouch) {
      throw new Error(`${label}自动识别不确定，请点击编辑校色范围手动修正。`);
    }
  }

  function enterMaskCorrectionMode(message: string) {
    if (message.startsWith("标准图")) {
      setMaskEditMode("reference");
    } else if (message.startsWith("样品图")) {
      setMaskEditMode("target");
    }

    setIsMaskEditingActive(true);
    setIsRoiSelectionActive(false);
    setIsMaskVisible(true);
    setAutoMaskNotice(message);
  }

  function ensureReferenceMask(referenceImageData: ImageData) {
    if (referenceMaskState && hasMaskPixels(referenceMaskState.imageData)) {
      return referenceMaskState.imageData;
    }

    const autoMaskResult = generateAutoGarmentMask(referenceImageData, { feather: 2 });
    ensureMaskConfidence("标准图", autoMaskResult);

    setReferenceMaskState((currentMask) => createAutoMaskState(autoMaskResult.mask, currentMask));
    setReferenceMaskStatus("auto");
    setAutoMaskNotice(getAutoMaskNotice("标准图", autoMaskResult));

    return autoMaskResult.mask;
  }

  function getReferenceMaskForScope(referenceImageData: ImageData) {
    if (colorCorrectionScope === "full-image") {
      return referenceMaskState && hasMaskPixels(referenceMaskState.imageData)
        ? referenceMaskState.imageData
        : null;
    }

    return ensureReferenceMask(referenceImageData);
  }

  function ensureTargetMask(sample: UploadedImage, targetImageData: ImageData) {
    if (colorCorrectionScope === "full-image") {
      return null;
    }

    const currentMask = maskStates[sample.id];

    if (
      currentMask &&
      hasMaskPixels(currentMask.imageData) &&
      (!garmentRoiMap[sample.id] || sampleMaskStatuses[sample.id] === "manual")
    ) {
      return currentMask.imageData;
    }

    if (colorCorrectionScope === "manual-mask") {
      throw new Error("样品图缺少手动蒙版，请点击编辑校色范围手动绘制。");
    }

    const autoMaskResult = generateAutoGarmentMask(targetImageData, {
      feather: 2,
      roi: garmentRoiMap[sample.id] ?? null
    });
    ensureMaskConfidence("样品图", autoMaskResult);
    storeAutoTargetMask(sample, autoMaskResult);
    setAutoMaskNotice(getAutoMaskNotice("样品图", autoMaskResult));

    return autoMaskResult.mask;
  }

  async function loadReferenceForProcessing() {
    if (!referenceImage) {
      throw new Error("请先上传标准图");
    }

    const referenceImageData = await loadImageDataFromUrl(referenceImage.url, referenceImage.width, referenceImage.height);
    const referenceMask = getReferenceMaskForScope(referenceImageData);

    return {
      referenceImageData,
      referenceMask
    };
  }

  async function handleRegenerateAutoMask() {
    setColorTransferError(null);
    setAutoMaskNotice(null);

    if (colorCorrectionScope === "full-image") {
      setIsMaskEditingActive(false);
      setIsMaskVisible(false);
      setAutoMaskNotice("整张样品图模式不需要自动识别样品蒙版。");
      return;
    }

    if (colorCorrectionScope === "manual-mask") {
      setMaskEditMode("target");
      setIsMaskEditingActive(true);
      setIsMaskVisible(true);
      setAutoMaskNotice("手动蒙版模式请使用画笔绘制样品图校色范围。");
      return;
    }

    try {
      if (maskEditMode === "reference") {
        if (!referenceImage) {
          setAutoMaskNotice("请先上传标准图");
          return;
        }

        const referenceImageData = await loadImageDataFromUrl(
          referenceImage.url,
          referenceImage.width,
          referenceImage.height
        );
        const autoMaskResult = generateAutoGarmentMask(referenceImageData, { feather: 2 });
        ensureMaskConfidence("标准图", autoMaskResult);

        setReferenceMaskState((currentMask) => createAutoMaskState(autoMaskResult.mask, currentMask));
        setReferenceMaskStatus("auto");
        setIsMaskEditingActive(true);
        setIsMaskVisible(true);
        setProcessedImages({});
        setAdjustedImages({});
        setAutoMaskNotice(getAutoMaskNotice("标准图", autoMaskResult));
        return;
      }

      if (!selectedSample) {
        setAutoMaskNotice("请先选择样品图");
        return;
      }

      const targetImageData = await loadImageDataFromUrl(
        selectedSample.url,
        selectedSample.width,
        selectedSample.height
      );
      const autoMaskResult = generateAutoGarmentMask(targetImageData, {
        feather: 2,
        roi: garmentRoiMap[selectedSample.id] ?? null
      });
      ensureMaskConfidence("样品图", autoMaskResult);

      storeAutoTargetMask(selectedSample, autoMaskResult);
      setIsMaskEditingActive(true);
      setIsMaskVisible(true);
      clearSampleResult(selectedSample.id);
      setAutoMaskNotice(getAutoMaskNotice("样品图", autoMaskResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动识别失败，请手动修正蒙版";

      enterMaskCorrectionMode(message);
    }
  }

  function handleEditColorRange() {
    if (colorCorrectionScope === "full-image") {
      setColorCorrectionScope("manual-mask");
      setMaskEditMode("target");
      setIsMaskEditingActive(true);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(true);
      setAutoMaskNotice("已切换到手动蒙版模式，请绘制样品图校色范围。");
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (selectedSample) {
      setMaskEditMode("target");
    } else if (referenceImage) {
      setMaskEditMode("reference");
    }

    setIsMaskEditingActive(true);
    setIsRoiSelectionActive(false);
    setIsMaskVisible(true);
  }

  function handleMaskEditModeChange(mode: MaskEditMode) {
    if (colorCorrectionScope === "full-image" && mode === "target") {
      setMaskEditMode("target");
      setIsMaskEditingActive(false);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(false);
      setAutoMaskNotice("整张样品图模式不需要样品蒙版。");
      return;
    }

    setMaskEditMode(mode);
    setIsMaskEditingActive(true);
    setIsRoiSelectionActive(false);
    setIsMaskVisible(true);
  }

  function handleToggleMaskVisible(isVisible: boolean) {
    if (colorCorrectionScope === "full-image" && maskEditMode === "target" && isVisible) {
      setIsMaskEditingActive(false);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(false);
      setAutoMaskNotice("整张样品图模式不需要显示样品蒙版。");
      return;
    }

    setIsMaskVisible(isVisible);

    if (isVisible) {
      setIsMaskEditingActive(true);
      setIsRoiSelectionActive(false);
    }
  }

  function storeProcessedResults(results: ProcessedSampleResult[]) {
    setProcessedImages((currentImages) => {
      const nextImages = { ...currentImages };

      results.forEach((result) => {
        nextImages[result.image.id] = result.colorTransferredImageData;
      });

      return nextImages;
    });

    setAdjustedImages((currentImages) => {
      const nextImages = { ...currentImages };

      results.forEach((result) => {
        if (isDefaultAdjustmentParams(adjustmentParams)) {
          delete nextImages[result.image.id];
          return;
        }

        nextImages[result.image.id] = result.finalImageData;
      });

      return nextImages;
    });
    setSampleMaskStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };

      results.forEach((result) => {
        nextStatuses[result.image.id] = "colored";
      });

      return nextStatuses;
    });
    setSampleProcessStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };

      results.forEach((result) => {
        nextStatuses[result.image.id] = "done";
      });

      return nextStatuses;
    });
    setSampleProcessMessages((currentMessages) => {
      const nextMessages = { ...currentMessages };

      results.forEach((result) => {
        nextMessages[result.image.id] = "已校色";
      });

      return nextMessages;
    });
  }

  function setBatchStatus(status: BatchItemStatus) {
    setBatchStatuses((currentStatuses) => ({
      ...currentStatuses,
      [status.imageId]: status
    }));
    updateSampleProcessStatus(status);
  }

  function updateSampleProcessStatus(status: BatchItemStatus) {
    setSampleProcessStatuses((currentStatuses) => ({
      ...currentStatuses,
      [status.imageId]: status.status
    }));
    setSampleProcessMessages((currentMessages) => ({
      ...currentMessages,
      [status.imageId]: status.message ?? status.status
    }));
  }

  async function handleProcessSelectedSamples() {
    if (selectedSamplesForBatch.length === 0) {
      setBatchColorMessage("请先选择样品图");
      return;
    }

    if (!referenceImage) {
      setColorTransferError("请先上传标准图");
      setBatchColorMessage("请先上传标准图");
      return;
    }

    setIsBatchColoring(true);
    setColorTransferError(null);
    setAutoMaskNotice(null);
    setAdjustmentError(null);
    setBatchColorProgress({ current: 0, total: selectedSamplesForBatch.length });
    setBatchColorMessage(`准备校色 ${selectedSamplesForBatch.length} 张样品`);

    selectedSamplesForBatch.forEach((image) => {
      const queuedStatus: BatchItemStatus = {
        fileName: image.fileName,
        imageId: image.id,
        message: "等待",
        status: "queued"
      };

      setBatchStatus(queuedStatus);
    });

    try {
      const { referenceImageData, referenceMask } = await loadReferenceForProcessing();
      let completedCount = 0;

      const results = await processBatchImages({
        adjustmentParams,
        autoParams: autoColorParams,
        autoMaskFeather: 2,
        garmentRois: garmentRoiMap,
        masks: maskStates,
        maskStatuses: sampleMaskStatuses,
        onAutoMaskGenerated: (image, result) => {
          storeAutoTargetMask(image, result);
        },
        onStatusChange: (status) => {
          setBatchStatus(status);

          if (status.status === "processing") {
            setBatchColorProgress({
              current: Math.min(completedCount + 1, selectedSamplesForBatch.length),
              total: selectedSamplesForBatch.length
            });
            setBatchColorMessage(`正在处理 ${Math.min(completedCount + 1, selectedSamplesForBatch.length)} / ${selectedSamplesForBatch.length}`);
            return;
          }

          completedCount += 1;
          setBatchColorProgress({
            current: completedCount,
            total: selectedSamplesForBatch.length
          });
        },
        referenceImageData,
        referenceMask,
        samples: selectedSamplesForBatch
      });
      const processedResults = results
        .map((item) => item.result)
        .filter((item): item is ProcessedSampleResult => Boolean(item));
      const doneCount = results.filter((item) => item.status === "done").length;
      const manualFixCount = results.filter((item) => item.status === "needs-manual-fix").length;
      const missingMaskCount = results.filter((item) => item.status === "missing-mask").length;
      const failedCount = results.filter((item) => item.status === "failed").length;

      storeProcessedResults(processedResults);
      setBatchColorMessage(
        `一键校色完成：已校色 ${doneCount} 张，需手动修正 ${manualFixCount} 张，缺少蒙版 ${missingMaskCount} 张，失败 ${failedCount} 张。`
      );

      if (processedResults.length > 0 && !selectedSampleIdSet.has(selectedSampleId ?? "")) {
        setSelectedSampleId(processedResults[0].image.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "一键批量校色失败";

      setColorTransferError(message);
      setBatchColorMessage(message);

      if (message.includes("自动识别不确定") || message.includes("自动识别失败")) {
        enterMaskCorrectionMode(message);
      }
    } finally {
      setIsBatchColoring(false);
    }
  }

  async function handleCurrentDownload() {
    if (!selectedSample) {
      setExportMessage("请先选择一张样品图");
      return;
    }

    setIsExporting(true);
    setExportMessage("正在处理当前图片");
    setBatchStatus({
      fileName: selectedSample.fileName,
      imageId: selectedSample.id,
      message: "处理中",
      status: "processing"
    });

    try {
      const { referenceImageData, referenceMask } = await loadReferenceForProcessing();
      const targetImageData = await loadImageDataFromUrl(
        selectedSample.url,
        selectedSample.width,
        selectedSample.height
      );
      const targetMask = ensureTargetMask(selectedSample, targetImageData);
      const result = await processSampleImage({
        adjustmentParams,
        autoParams: autoColorParams,
        referenceImageData,
        referenceMask,
        sampleImage: selectedSample,
        targetMask
      });
      const blob = await exportImageDataToJpegBlob(result.finalImageData, exportSize);
      const fileName = getExportFileName(selectedSample.fileName, exportSize);

      storeProcessedResults([result]);
      downloadBlob(blob, fileName);
      setBatchStatus({
        fileName: selectedSample.fileName,
        imageId: selectedSample.id,
        message: "已下载",
        status: "done"
      });
      setExportMessage(`已下载：${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "单张导出失败";

      setBatchStatus({
        fileName: selectedSample.fileName,
        imageId: selectedSample.id,
        message,
        status: "failed"
      });
      setExportMessage(message);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleBatchDownload() {
    if (sampleImages.length === 0) {
      setExportMessage("请先上传样品图");
      return;
    }

    setIsExporting(true);
    setExportMessage("正在准备批量导出");

    try {
      const existingResults = sampleImages
        .map((image) => {
          const finalImageData = adjustedImages[image.id] ?? processedImages[image.id] ?? null;

          return finalImageData
            ? {
                finalImageData,
                image
              }
            : null;
        })
        .filter((item): item is { finalImageData: ImageData; image: UploadedImage } => Boolean(item));
      const existingResultIds = new Set(existingResults.map((item) => item.image.id));
      const samplesToProcess = sampleImages.filter((image) => !existingResultIds.has(image.id));
      let processedResults: ProcessedSampleResult[] = [];
      let results: BatchProcessResult[] = [];

      setBatchStatuses(
        Object.fromEntries(
          sampleImages.map((image) => [
            image.id,
            {
              fileName: image.fileName,
              imageId: image.id,
              message: existingResultIds.has(image.id) ? "使用已校色结果" : "等待",
              status: existingResultIds.has(image.id) ? "done" : "queued"
            } satisfies BatchItemStatus
          ])
        )
      );

      existingResults.forEach((item) => {
        setBatchStatus({
          fileName: item.image.fileName,
          imageId: item.image.id,
          message: "使用已校色结果",
          status: "done"
        });
      });

      if (samplesToProcess.length > 0) {
        setExportMessage("正在批量处理未校色样品图");
        const { referenceImageData, referenceMask } = await loadReferenceForProcessing();

        results = await processBatchImages({
          adjustmentParams,
          autoParams: autoColorParams,
          autoMaskFeather: 2,
          garmentRois: garmentRoiMap,
          masks: maskStates,
          maskStatuses: sampleMaskStatuses,
          onAutoMaskGenerated: (image, result) => {
            storeAutoTargetMask(image, result);
          },
          onStatusChange: setBatchStatus,
          referenceImageData,
          referenceMask,
          samples: samplesToProcess
        });
        processedResults = results
          .map((item) => item.result)
          .filter((item): item is ProcessedSampleResult => Boolean(item));

        storeProcessedResults(processedResults);
      }

      const files = await Promise.all(
        [...existingResults, ...processedResults].map(async (result) => ({
          blob: await exportImageDataToJpegBlob(result.finalImageData, exportSize),
          name: getExportFileName(result.image.fileName, exportSize)
        }))
      );

      if (files.length === 0) {
        throw new Error("没有可导出的图片，请检查样品图蒙版");
      }

      const zipBlob = await createZipBlob(files);
      const zipName = `colorfixed_${exportSize}.zip`;
      const skippedCount = results.filter((item) => item.status === "missing-mask").length;
      const manualFixCount = results.filter((item) => item.status === "needs-manual-fix").length;
      const failedCount = results.filter((item) => item.status === "failed").length;

      downloadBlob(zipBlob, zipName);
      setExportMessage(
        `已生成：${zipName}。成功 ${files.length} 张，需手动修正 ${manualFixCount} 张，缺少蒙版 ${skippedCount} 张，失败 ${failedCount} 张。`
      );
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "批量导出失败");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleApplyColorTransfer() {
    if (!referenceImage || !selectedSample) {
      setColorTransferError("请先上传标准图和样品图");
      return;
    }

    setIsColorTransferRunning(true);
    setColorTransferError(null);
    setAutoMaskNotice(null);

    try {
      const [referenceImageData, targetImageData] = await Promise.all([
        loadImageDataFromUrl(referenceImage.url, referenceImage.width, referenceImage.height),
        loadImageDataFromUrl(selectedSample.url, selectedSample.width, selectedSample.height)
      ]);
      const referenceMask = getReferenceMaskForScope(referenceImageData);
      const targetMask = ensureTargetMask(selectedSample, targetImageData);
      const result = transferLabColor({
        colorStrength,
        fullImageMode: colorCorrectionScope === "full-image",
        highlightProtection,
        maskFeather,
        referenceImageData,
        referenceMask,
        shadowProtection,
        targetImageData,
        targetMask
      });

      setProcessedImages((currentImages) => ({
        ...currentImages,
        [selectedSample.id]: result.imageData
      }));
      setSampleMaskStatuses((currentStatuses) => ({
        ...currentStatuses,
        [selectedSample.id]: "colored"
      }));
      setMaskEditMode("target");
      setIsMaskEditingActive(false);
      setIsRoiSelectionActive(false);
      setIsMaskVisible(false);
      setAutoMaskNotice(
        colorCorrectionScope === "full-image"
          ? "已完成整张样品图校色。"
          : colorCorrectionScope === "manual-mask"
            ? "已使用当前手动蒙版完成校色。"
            : "已完成自动识别与校色，可点击编辑校色范围进行修正。"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动校色失败";

      setColorTransferError(message);

      if (message.includes("自动识别不确定") || message.includes("自动识别失败")) {
        enterMaskCorrectionMode(message);
      }
    } finally {
      setIsColorTransferRunning(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f4f5f7] text-zinc-950">
      <div className="flex min-h-screen w-full flex-col">
        <TopToolbar />

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-[240px_minmax(0,1fr)_300px] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <ImageSidebar
            isBatchColoring={isBatchColoring}
            onClearSampleSelection={handleClearSampleSelection}
            onProcessSelectedSamples={handleProcessSelectedSamples}
            onReferenceUpload={handleReferenceUpload}
            onSampleSelect={setSelectedSampleId}
            onSampleSelectionChange={handleSampleSelectionChange}
            onSampleUpload={handleSampleUpload}
            onSelectAllSamples={handleSelectAllSamples}
            referenceImage={referenceImage}
            sampleImages={sampleImages}
            sampleMaskStatuses={sampleMaskStatuses}
            sampleProcessMessages={sampleProcessMessages}
            sampleProcessStatuses={sampleProcessStatuses}
            selectedSampleIds={selectedSampleIds}
            selectedSampleId={selectedSampleId}
            uploadError={uploadError}
          />
          <CanvasWorkspace
            brushSize={brushSize}
            garmentRoi={activeGarmentRoi}
            isMaskEditingActive={isMaskEditingActive}
            isMaskVisible={isMaskVisible}
            isRoiSelectionActive={isRoiSelectionActive}
            maskTool={maskTool}
            maskOpacity={maskOpacity}
            maskState={activeMaskState}
            mode={maskEditMode}
            onGarmentRoiChange={handleGarmentRoiChange}
            onMaskStroke={handleMaskStroke}
            onMaskStrokeStart={handleMaskStrokeStart}
            processedImageData={selectedPreviewImageData}
            selectedImage={activeImage}
          />
          <AdjustmentPanel
            adjustmentError={adjustmentError}
            adjustmentParams={adjustmentParams}
            batchColorMessage={batchColorMessage}
            batchColorProgress={batchColorProgress}
            brushSize={brushSize}
            canApplyColorTransfer={canApplyColorTransfer}
            canRedoMask={canRedoMask}
            canUndoMask={canUndoMask}
            colorCorrectionScope={colorCorrectionScope}
            colorStrength={colorStrength}
            colorTransferError={colorTransferError}
            autoMaskNotice={autoMaskNotice}
            hasGarmentRoi={Boolean(selectedGarmentRoi)}
            hasColorResult={Boolean(
              selectedPreviewImageData ||
                (colorCorrectionScope !== "full-image" && selectedSampleMaskStatus !== "unrecognized")
            )}
            hasReferenceImage={Boolean(referenceImage)}
            hasSelectedImage={Boolean(selectedSample)}
            highlightProtection={highlightProtection}
            isBatchColoring={isBatchColoring}
            isMaskVisible={isMaskVisible}
            isColorTransferRunning={isColorTransferRunning}
            maskEditMode={maskEditMode}
            maskOpacity={maskOpacity}
            maskFeather={maskFeather}
            maskTool={maskTool}
            referenceMaskStatus={referenceMaskStatus}
            selectedSampleMaskStatus={selectedSampleMaskStatus}
            onBrushSizeChange={setBrushSize}
            onColorCorrectionScopeChange={handleColorCorrectionScopeChange}
            onColorStrengthChange={setColorStrength}
            onClearGarmentRoi={handleClearGarmentRoi}
            onClearMask={handleClearMask}
            onEditColorRange={handleEditColorRange}
            onHighlightProtectionChange={setHighlightProtection}
            onApplyColorTransfer={handleApplyColorTransfer}
            onAdjustmentParamChange={handleAdjustmentParamChange}
            onMaskOpacityChange={setMaskOpacity}
            onMaskEditModeChange={handleMaskEditModeChange}
            onMaskFeatherChange={setMaskFeather}
            onMaskToolChange={setMaskTool}
            onRedoMask={handleRedoMask}
            onRegenerateAutoMask={handleRegenerateAutoMask}
            onResetAdjustmentParam={handleResetAdjustmentParam}
            onResetAllAdjustments={handleResetAllAdjustments}
            onShadowProtectionChange={setShadowProtection}
            onStartGarmentRoiSelection={handleStartGarmentRoiSelection}
            onToggleMaskVisible={handleToggleMaskVisible}
            onUndoMask={handleUndoMask}
            shadowProtection={shadowProtection}
          />
        </section>

        <ExportBar
          batchStatuses={batchStatuses}
          exportMessage={exportMessage}
          exportSize={exportSize}
          isExporting={isExporting}
          onBatchDownload={handleBatchDownload}
          onCurrentDownload={handleCurrentDownload}
          onExportSizeChange={setExportSize}
          sampleImages={sampleImages}
          selectedImage={selectedSample}
          showUpscaleWarning={showUpscaleWarning}
        />
      </div>
    </main>
  );
}

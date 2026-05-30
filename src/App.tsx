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
  type BatchItemStatus,
  type ProcessedSampleResult
} from "./core/batchProcessor";
import { generateAutoGarmentMask, type AutoMaskResult } from "./core/autoMask";
import type {
  MaskEditMode,
  MaskPoint,
  MaskRecognitionStatus,
  MaskState,
  MaskTool,
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
  const selectedMaskState = selectedSampleId ? maskStates[selectedSampleId] ?? null : null;
  const selectedSampleMaskStatus = selectedSampleId
    ? sampleMaskStatuses[selectedSampleId] ?? "unrecognized"
    : "unrecognized";
  const activeImage = maskEditMode === "reference" ? referenceImage : selectedSample;
  const activeMaskState = maskEditMode === "reference" ? referenceMaskState : selectedMaskState;
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
      highlightProtection,
      maskFeather,
      shadowProtection
    }),
    [colorStrength, highlightProtection, maskFeather, shadowProtection]
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

    if (!selectedMaskState || !hasMaskPixels(selectedMaskState.imageData)) {
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
        const adjustedImageData = applyImageAdjustments({
          baseImageData,
          originalImageData,
          params: adjustmentParams,
          targetMask: selectedMaskState.imageData
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
  }, [adjustmentParams, selectedMaskState, selectedProcessedImageData, selectedSample, selectedSampleId]);

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
      setIsMaskVisible(false);
      setProcessedImages({});
      setAdjustedImages({});
      setUploadError(null);
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setAdjustmentError(null);
      setBatchStatuses({});
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
      setSelectedSampleId((currentId) => currentId ?? loadedImages[0].id);
      setMaskEditMode("target");
      setIsMaskEditingActive(false);
      setIsMaskVisible(false);
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setAdjustmentError(null);
      setBatchStatuses({});
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
      setIsMaskVisible(true);
      setReferenceMaskStatus("manual");
      setColorTransferError(null);
      setAutoMaskNotice(null);
      setProcessedImages({});
      setAdjustedImages({});
      return;
    }

    if (!selectedSample) {
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

    if (!selectedSample) {
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

    if (!selectedMaskState || !hasMaskPixels(selectedMaskState.imageData)) {
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

  function ensureTargetMask(sample: UploadedImage, targetImageData: ImageData) {
    const currentMask = maskStates[sample.id];

    if (currentMask && hasMaskPixels(currentMask.imageData)) {
      return currentMask.imageData;
    }

    const autoMaskResult = generateAutoGarmentMask(targetImageData, { feather: 2 });
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
    const referenceMask = ensureReferenceMask(referenceImageData);

    return {
      referenceImageData,
      referenceMask
    };
  }

  async function handleRegenerateAutoMask() {
    setColorTransferError(null);
    setAutoMaskNotice(null);

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
      const autoMaskResult = generateAutoGarmentMask(targetImageData, { feather: 2 });
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
    if (selectedSample) {
      setMaskEditMode("target");
    } else if (referenceImage) {
      setMaskEditMode("reference");
    }

    setIsMaskEditingActive(true);
    setIsMaskVisible(true);
  }

  function handleMaskEditModeChange(mode: MaskEditMode) {
    setMaskEditMode(mode);
    setIsMaskEditingActive(true);
    setIsMaskVisible(true);
  }

  function handleToggleMaskVisible(isVisible: boolean) {
    setIsMaskVisible(isVisible);

    if (isVisible) {
      setIsMaskEditingActive(true);
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
  }

  function setBatchStatus(status: BatchItemStatus) {
    setBatchStatuses((currentStatuses) => ({
      ...currentStatuses,
      [status.imageId]: status
    }));
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
    setExportMessage("正在读取标准图和参考区域");

    try {
      const { referenceImageData, referenceMask } = await loadReferenceForProcessing();

      setExportMessage("正在批量处理样品图");
      setBatchStatuses(
        Object.fromEntries(
          sampleImages.map((image) => [
            image.id,
            {
              fileName: image.fileName,
              imageId: image.id,
              message: "等待",
              status: "queued"
            } satisfies BatchItemStatus
          ])
        )
      );

      const results = await processBatchImages({
        adjustmentParams,
        autoParams: autoColorParams,
        autoMaskFeather: 2,
        masks: maskStates,
        onAutoMaskGenerated: (image, result) => {
          storeAutoTargetMask(image, result);
        },
        onStatusChange: setBatchStatus,
        referenceImageData,
        referenceMask,
        samples: sampleImages
      });
      const processedResults = results
        .map((item) => item.result)
        .filter((item): item is ProcessedSampleResult => Boolean(item));

      storeProcessedResults(processedResults);

      const files = await Promise.all(
        processedResults.map(async (result) => ({
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
      const failedCount = results.filter((item) => item.status === "failed").length;

      downloadBlob(zipBlob, zipName);
      setExportMessage(`已生成：${zipName}。成功 ${files.length} 张，缺少蒙版 ${skippedCount} 张，失败 ${failedCount} 张。`);
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
      const referenceMask = ensureReferenceMask(referenceImageData);
      const targetMask = ensureTargetMask(selectedSample, targetImageData);
      const result = transferLabColor({
        colorStrength,
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
      setIsMaskVisible(false);
      setAutoMaskNotice("已完成自动识别与校色，可点击编辑校色范围进行修正。");
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
            onReferenceUpload={handleReferenceUpload}
            onSampleSelect={setSelectedSampleId}
            onSampleUpload={handleSampleUpload}
            referenceImage={referenceImage}
            sampleImages={sampleImages}
            sampleMaskStatuses={sampleMaskStatuses}
            selectedSampleId={selectedSampleId}
            uploadError={uploadError}
          />
          <CanvasWorkspace
            brushSize={brushSize}
            isMaskEditingActive={isMaskEditingActive}
            isMaskVisible={isMaskVisible}
            maskTool={maskTool}
            maskOpacity={maskOpacity}
            maskState={activeMaskState}
            mode={maskEditMode}
            onMaskStroke={handleMaskStroke}
            onMaskStrokeStart={handleMaskStrokeStart}
            processedImageData={selectedPreviewImageData}
            selectedImage={activeImage}
          />
          <AdjustmentPanel
            adjustmentError={adjustmentError}
            adjustmentParams={adjustmentParams}
            brushSize={brushSize}
            canApplyColorTransfer={canApplyColorTransfer}
            canRedoMask={canRedoMask}
            canUndoMask={canUndoMask}
            colorStrength={colorStrength}
            colorTransferError={colorTransferError}
            autoMaskNotice={autoMaskNotice}
            hasColorResult={Boolean(selectedPreviewImageData || selectedSampleMaskStatus !== "unrecognized")}
            hasReferenceImage={Boolean(referenceImage)}
            hasSelectedImage={Boolean(selectedSample)}
            highlightProtection={highlightProtection}
            isMaskVisible={isMaskVisible}
            isColorTransferRunning={isColorTransferRunning}
            maskEditMode={maskEditMode}
            maskOpacity={maskOpacity}
            maskFeather={maskFeather}
            maskTool={maskTool}
            referenceMaskStatus={referenceMaskStatus}
            selectedSampleMaskStatus={selectedSampleMaskStatus}
            onBrushSizeChange={setBrushSize}
            onColorStrengthChange={setColorStrength}
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

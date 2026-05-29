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
import type { MaskEditMode, MaskPoint, MaskState, MaskTool, UploadedImage } from "./types";

export default function App() {
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sampleImages, setSampleImages] = useState<UploadedImage[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [referenceMaskState, setReferenceMaskState] = useState<MaskState | null>(null);
  const [maskStates, setMaskStates] = useState<Record<string, MaskState>>({});
  const [maskEditMode, setMaskEditMode] = useState<MaskEditMode>("target");
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(32);
  const [maskOpacity, setMaskOpacity] = useState(55);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const [colorStrength, setColorStrength] = useState(70);
  const [shadowProtection, setShadowProtection] = useState(35);
  const [highlightProtection, setHighlightProtection] = useState(35);
  const [maskFeather, setMaskFeather] = useState(4);
  const [processedImages, setProcessedImages] = useState<Record<string, ImageData>>({});
  const [adjustedImages, setAdjustedImages] = useState<Record<string, ImageData>>({});
  const [adjustmentParams, setAdjustmentParams] = useState<AdjustmentParams>(defaultAdjustmentParams);
  const [colorTransferError, setColorTransferError] = useState<string | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [isColorTransferRunning, setIsColorTransferRunning] = useState(false);
  const referenceImageRef = useRef<UploadedImage | null>(null);
  const sampleImagesRef = useRef<UploadedImage[]>([]);

  const selectedSample = useMemo(
    () => sampleImages.find((image) => image.id === selectedSampleId) ?? null,
    [sampleImages, selectedSampleId]
  );
  const selectedMaskState = selectedSampleId ? maskStates[selectedSampleId] ?? null : null;
  const activeImage = maskEditMode === "reference" ? referenceImage : selectedSample;
  const activeMaskState = maskEditMode === "reference" ? referenceMaskState : selectedMaskState;
  const selectedProcessedImageData =
    maskEditMode === "target" && selectedSampleId ? processedImages[selectedSampleId] ?? null : null;
  const selectedAdjustedImageData =
    maskEditMode === "target" && selectedSampleId ? adjustedImages[selectedSampleId] ?? null : null;
  const selectedPreviewImageData = selectedAdjustedImageData ?? selectedProcessedImageData;
  const canUndoMask = (activeMaskState?.undoStack.length ?? 0) > 0;
  const canRedoMask = (activeMaskState?.redoStack.length ?? 0) > 0;
  const canApplyColorTransfer = Boolean(referenceImage && selectedSample && selectedMaskState);

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
      setAdjustmentError("请先绘制样品图衣服蒙版");
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
      setMaskEditMode("reference");
      setProcessedImages({});
      setAdjustedImages({});
      setUploadError(null);
      setColorTransferError(null);
      setAdjustmentError(null);
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
      setSelectedSampleId((currentId) => currentId ?? loadedImages[0].id);
      setColorTransferError(null);
      setAdjustmentError(null);
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
      setColorTransferError(null);
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
    setColorTransferError(null);
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
      setColorTransferError(null);
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
    setColorTransferError(null);
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
      setColorTransferError(null);
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
    setColorTransferError(null);
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
      setColorTransferError(null);
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
    setColorTransferError(null);
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
      setAdjustmentError("请先绘制样品图衣服蒙版");
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

  async function handleApplyColorTransfer() {
    if (!referenceImage || !selectedSample || !selectedMaskState) {
      setColorTransferError("请先上传标准图、样品图，并绘制样品图蒙版");
      return;
    }

    if (!referenceMaskState || !hasMaskPixels(referenceMaskState.imageData)) {
      setColorTransferError("请先选择标准图衣服参考区域");
      setMaskEditMode("reference");
      return;
    }

    if (!hasMaskPixels(selectedMaskState.imageData)) {
      setColorTransferError("请先在样品图衣服区域绘制蒙版");
      setMaskEditMode("target");
      return;
    }

    setIsColorTransferRunning(true);
    setColorTransferError(null);

    try {
      const [referenceImageData, targetImageData] = await Promise.all([
        loadImageDataFromUrl(referenceImage.url, referenceImage.width, referenceImage.height),
        loadImageDataFromUrl(selectedSample.url, selectedSample.width, selectedSample.height)
      ]);
      const result = transferLabColor({
        colorStrength,
        highlightProtection,
        maskFeather,
        referenceImageData,
        referenceMask: referenceMaskState.imageData,
        shadowProtection,
        targetImageData,
        targetMask: selectedMaskState.imageData
      });

      setProcessedImages((currentImages) => ({
        ...currentImages,
        [selectedSample.id]: result.imageData
      }));
    } catch (error) {
      setColorTransferError(error instanceof Error ? error.message : "自动校色失败");
    } finally {
      setIsColorTransferRunning(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f4f5f7] text-zinc-950">
      <div className="flex min-h-screen w-full flex-col">
        <TopToolbar />

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
          <ImageSidebar
            onReferenceUpload={handleReferenceUpload}
            onSampleSelect={setSelectedSampleId}
            onSampleUpload={handleSampleUpload}
            referenceImage={referenceImage}
            sampleImages={sampleImages}
            selectedSampleId={selectedSampleId}
            uploadError={uploadError}
          />
          <CanvasWorkspace
            brushSize={brushSize}
            isMaskVisible={isMaskVisible}
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
            hasReferenceImage={Boolean(referenceImage)}
            hasSelectedImage={Boolean(selectedSample)}
            highlightProtection={highlightProtection}
            isMaskVisible={isMaskVisible}
            isColorTransferRunning={isColorTransferRunning}
            maskEditMode={maskEditMode}
            maskOpacity={maskOpacity}
            maskFeather={maskFeather}
            maskTool={maskTool}
            onBrushSizeChange={setBrushSize}
            onColorStrengthChange={setColorStrength}
            onClearMask={handleClearMask}
            onHighlightProtectionChange={setHighlightProtection}
            onApplyColorTransfer={handleApplyColorTransfer}
            onAdjustmentParamChange={handleAdjustmentParamChange}
            onMaskOpacityChange={setMaskOpacity}
            onMaskEditModeChange={setMaskEditMode}
            onMaskFeatherChange={setMaskFeather}
            onMaskToolChange={setMaskTool}
            onRedoMask={handleRedoMask}
            onResetAdjustmentParam={handleResetAdjustmentParam}
            onResetAllAdjustments={handleResetAllAdjustments}
            onShadowProtectionChange={setShadowProtection}
            onToggleMaskVisible={setIsMaskVisible}
            onUndoMask={handleUndoMask}
            shadowProtection={shadowProtection}
          />
        </section>

        <ExportBar />
      </div>
    </main>
  );
}

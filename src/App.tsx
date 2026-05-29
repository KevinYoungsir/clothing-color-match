import { useEffect, useMemo, useRef, useState } from "react";
import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { ExportBar } from "./components/ExportBar";
import { ImageSidebar } from "./components/ImageSidebar";
import { TopToolbar } from "./components/TopToolbar";
import {
  getUnsupportedImageMessage,
  isSupportedImageFile,
  loadImageFile
} from "./core/imageLoader";
import {
  clearMask,
  createMaskState,
  drawMaskStroke,
  pushUndoSnapshot,
  redoMask,
  undoMask
} from "./core/maskUtils";
import type { MaskPoint, MaskState, MaskTool, UploadedImage } from "./types";

export default function App() {
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sampleImages, setSampleImages] = useState<UploadedImage[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maskStates, setMaskStates] = useState<Record<string, MaskState>>({});
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(32);
  const [maskOpacity, setMaskOpacity] = useState(55);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const referenceImageRef = useRef<UploadedImage | null>(null);
  const sampleImagesRef = useRef<UploadedImage[]>([]);

  const selectedSample = useMemo(
    () => sampleImages.find((image) => image.id === selectedSampleId) ?? null,
    [sampleImages, selectedSampleId]
  );
  const selectedMaskState = selectedSampleId ? maskStates[selectedSampleId] ?? null : null;
  const canUndoMask = (selectedMaskState?.undoStack.length ?? 0) > 0;
  const canRedoMask = (selectedMaskState?.redoStack.length ?? 0) > 0;

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
      setUploadError(null);
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
    }

    const messages = [...unsupportedMessages, ...failedMessages];
    setUploadError(messages.length > 0 ? messages.join("\n") : null);
  }

  function handleMaskStrokeStart() {
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
  }

  function handleMaskStroke(from: MaskPoint, to: MaskPoint, brushSizeInImagePixels: number) {
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
  }

  function handleRedoMask() {
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
  }

  function handleClearMask() {
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
            maskState={selectedMaskState}
            onMaskStroke={handleMaskStroke}
            onMaskStrokeStart={handleMaskStrokeStart}
            selectedImage={selectedSample}
          />
          <AdjustmentPanel
            brushSize={brushSize}
            canRedoMask={canRedoMask}
            canUndoMask={canUndoMask}
            hasSelectedImage={Boolean(selectedSample)}
            isMaskVisible={isMaskVisible}
            maskOpacity={maskOpacity}
            maskTool={maskTool}
            onBrushSizeChange={setBrushSize}
            onClearMask={handleClearMask}
            onMaskOpacityChange={setMaskOpacity}
            onMaskToolChange={setMaskTool}
            onRedoMask={handleRedoMask}
            onToggleMaskVisible={setIsMaskVisible}
            onUndoMask={handleUndoMask}
          />
        </section>

        <ExportBar />
      </div>
    </main>
  );
}

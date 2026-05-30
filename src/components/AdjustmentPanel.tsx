import type { AdjustmentKey, AdjustmentParams } from "../core/adjustment";
import type { MaskEditMode, MaskRecognitionStatus, MaskTool } from "../types";

type AdjustmentPanelProps = {
  adjustmentError: string | null;
  adjustmentParams: AdjustmentParams;
  autoMaskNotice: string | null;
  brushSize: number;
  canApplyColorTransfer: boolean;
  canRedoMask: boolean;
  canUndoMask: boolean;
  colorStrength: number;
  colorTransferError: string | null;
  hasColorResult: boolean;
  hasReferenceImage: boolean;
  hasSelectedImage: boolean;
  highlightProtection: number;
  isMaskVisible: boolean;
  isColorTransferRunning: boolean;
  maskEditMode: MaskEditMode;
  maskFeather: number;
  maskOpacity: number;
  maskTool: MaskTool;
  referenceMaskStatus: MaskRecognitionStatus;
  selectedSampleMaskStatus: MaskRecognitionStatus;
  onBrushSizeChange: (value: number) => void;
  onColorStrengthChange: (value: number) => void;
  onApplyColorTransfer: () => void;
  onAdjustmentParamChange: (key: AdjustmentKey, value: number) => void;
  onClearMask: () => void;
  onEditColorRange: () => void;
  onHighlightProtectionChange: (value: number) => void;
  onMaskEditModeChange: (mode: MaskEditMode) => void;
  onMaskFeatherChange: (value: number) => void;
  onMaskOpacityChange: (value: number) => void;
  onMaskToolChange: (tool: MaskTool) => void;
  onRedoMask: () => void;
  onRegenerateAutoMask: () => void;
  onResetAdjustmentParam: (key: AdjustmentKey) => void;
  onResetAllAdjustments: () => void;
  onShadowProtectionChange: (value: number) => void;
  onToggleMaskVisible: (isVisible: boolean) => void;
  onUndoMask: () => void;
  shadowProtection: number;
};

const adjustmentControls: Array<{
  key: AdjustmentKey;
  label: string;
  max: number;
  min: number;
  suffix: string;
}> = [
  { key: "brightness", label: "亮度", max: 100, min: -100, suffix: "" },
  { key: "contrast", label: "对比度", max: 100, min: -100, suffix: "" },
  { key: "saturation", label: "饱和度", max: 100, min: -100, suffix: "" },
  { key: "hue", label: "色相", max: 180, min: -180, suffix: "°" },
  { key: "exposure", label: "曝光", max: 100, min: -100, suffix: "" },
  { key: "shadows", label: "阴影", max: 100, min: -100, suffix: "" },
  { key: "highlights", label: "高光", max: 100, min: -100, suffix: "" },
  { key: "whiteBalance", label: "白平衡", max: 100, min: -100, suffix: "" },
  { key: "temperature", label: "色温", max: 100, min: -100, suffix: "" },
  { key: "colorStrength", label: "校色强度", max: 100, min: 0, suffix: "%" },
  { key: "texturePreserve", label: "纹理保留强度", max: 100, min: 0, suffix: "%" }
];

const maskStatusLabels: Record<MaskRecognitionStatus, string> = {
  auto: "自动识别",
  colored: "已校色",
  manual: "手动修正",
  unrecognized: "未识别"
};

export function AdjustmentPanel({
  adjustmentError,
  adjustmentParams,
  autoMaskNotice,
  brushSize,
  canApplyColorTransfer,
  canRedoMask,
  canUndoMask,
  colorStrength,
  colorTransferError,
  hasColorResult,
  hasReferenceImage,
  hasSelectedImage,
  highlightProtection,
  isMaskVisible,
  isColorTransferRunning,
  maskEditMode,
  maskFeather,
  maskOpacity,
  maskTool,
  referenceMaskStatus,
  selectedSampleMaskStatus,
  onBrushSizeChange,
  onColorStrengthChange,
  onApplyColorTransfer,
  onAdjustmentParamChange,
  onClearMask,
  onEditColorRange,
  onHighlightProtectionChange,
  onMaskEditModeChange,
  onMaskFeatherChange,
  onMaskOpacityChange,
  onMaskToolChange,
  onRedoMask,
  onRegenerateAutoMask,
  onResetAdjustmentParam,
  onResetAllAdjustments,
  onShadowProtectionChange,
  onToggleMaskVisible,
  onUndoMask,
  shadowProtection
}: AdjustmentPanelProps) {
  const hasEditableImage = maskEditMode === "reference" ? hasReferenceImage : hasSelectedImage;

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">Controls</p>
        <h2 className="mt-1 text-base font-semibold">参数调整</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <section>
          <h3 className="text-sm font-semibold text-zinc-800">自动校色</h3>
          <p className="mt-2 rounded-md bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800">
            上传标准图和样品图后可直接自动识别并校色。自动识别适合白底图、透明底图、服装主体清晰的图片；如果识别不准确，可用画笔和橡皮擦修正。
          </p>

          <label className="mt-3 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>Lab 校色强度</span>
              <span>{colorStrength}%</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              max={100}
              min={0}
              onChange={(event) => onColorStrengthChange(Number(event.currentTarget.value))}
              type="range"
              value={colorStrength}
            />
          </label>

          <label className="mt-4 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>阴影保护</span>
              <span>{shadowProtection}%</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              max={100}
              min={0}
              onChange={(event) => onShadowProtectionChange(Number(event.currentTarget.value))}
              type="range"
              value={shadowProtection}
            />
          </label>

          <label className="mt-4 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>高光保护</span>
              <span>{highlightProtection}%</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              max={100}
              min={0}
              onChange={(event) => onHighlightProtectionChange(Number(event.currentTarget.value))}
              type="range"
              value={highlightProtection}
            />
          </label>

          <label className="mt-4 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>蒙版羽化</span>
              <span>{maskFeather}px</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              max={24}
              min={0}
              onChange={(event) => onMaskFeatherChange(Number(event.currentTarget.value))}
              type="range"
              value={maskFeather}
            />
          </label>

          <button
            className="mt-4 w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={!canApplyColorTransfer || isColorTransferRunning}
            onClick={onApplyColorTransfer}
            type="button"
          >
            {isColorTransferRunning ? "处理中..." : hasColorResult ? "重新校色" : "自动识别并校色"}
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasEditableImage || isColorTransferRunning}
              onClick={onRegenerateAutoMask}
              type="button"
            >
              重新自动识别蒙版
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasReferenceImage && !hasSelectedImage}
              onClick={onEditColorRange}
              type="button"
            >
              编辑校色范围
            </button>
          </div>

          {colorTransferError ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {colorTransferError}
            </p>
          ) : null}

          {autoMaskNotice ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              {autoMaskNotice}
            </p>
          ) : null}

          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
            标准图参考区域：{maskStatusLabels[referenceMaskStatus]}；当前样品校色范围：
            {maskStatusLabels[selectedSampleMaskStatus]}
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-800">人工调整</h3>
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasSelectedImage}
              onClick={onResetAllAdjustments}
              type="button"
            >
              全部重置
            </button>
          </div>

          <div className="mt-3 space-y-4">
            {adjustmentControls.map((control) => (
              <label className="block" key={control.key}>
                <span className="flex items-center justify-between gap-3 text-xs font-medium text-zinc-500">
                  <span>{control.label}</span>
                  <span className="flex items-center gap-2">
                    <span>
                      {adjustmentParams[control.key]}
                      {control.suffix}
                    </span>
                    <button
                      className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!hasSelectedImage}
                      onClick={(event) => {
                        event.preventDefault();
                        onResetAdjustmentParam(control.key);
                      }}
                      type="button"
                    >
                      重置
                    </button>
                  </span>
                </span>
                <input
                  className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
                  disabled={!hasSelectedImage}
                  max={control.max}
                  min={control.min}
                  onChange={(event) => onAdjustmentParamChange(control.key, Number(event.currentTarget.value))}
                  type="range"
                  value={adjustmentParams[control.key]}
                />
              </label>
            ))}
          </div>

          {adjustmentError ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {adjustmentError}
            </p>
          ) : null}
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-800">蒙版</h3>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
              <input
                checked={isMaskVisible}
                className="accent-teal-600"
                disabled={!hasEditableImage}
                onChange={(event) => onToggleMaskVisible(event.currentTarget.checked)}
                type="checkbox"
              />
              显示
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 rounded-md border border-zinc-200 bg-zinc-50 p-1">
            {(["reference", "target"] as const).map((mode) => (
              <button
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  maskEditMode === mode ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
                }`}
                disabled={mode === "reference" ? !hasReferenceImage : !hasSelectedImage}
                key={mode}
                onClick={() => onMaskEditModeChange(mode)}
                type="button"
              >
                {mode === "reference" ? "标准图取色" : "样品蒙版"}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 rounded-md border border-zinc-200 bg-zinc-50 p-1">
            {(["brush", "eraser"] as const).map((tool) => (
              <button
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  maskTool === tool ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
                }`}
                disabled={!hasEditableImage}
                key={tool}
                onClick={() => onMaskToolChange(tool)}
                type="button"
              >
                {tool === "brush" ? "画笔" : "橡皮擦"}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>画笔大小</span>
              <span>{brushSize}px</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              disabled={!hasEditableImage}
              max={120}
              min={4}
              onChange={(event) => onBrushSizeChange(Number(event.currentTarget.value))}
              type="range"
              value={brushSize}
            />
          </label>

          <label className="mt-4 block">
            <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>蒙版透明度</span>
              <span>{maskOpacity}%</span>
            </span>
            <input
              className="mt-2 h-2 w-full appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed"
              disabled={!hasEditableImage}
              max={100}
              min={10}
              onChange={(event) => onMaskOpacityChange(Number(event.currentTarget.value))}
              type="range"
              value={maskOpacity}
            />
          </label>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasEditableImage || !canUndoMask}
              onClick={onUndoMask}
              type="button"
            >
              撤销
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasEditableImage || !canRedoMask}
              onClick={onRedoMask}
              type="button"
            >
              重做
            </button>
            <button
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasEditableImage}
              onClick={onClearMask}
              type="button"
            >
              清空
            </button>
          </div>

          {!hasEditableImage ? (
            <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              {maskEditMode === "reference"
                ? "上传标准图后可以选择衣服参考区域。"
                : "上传并选择样品图后可以编辑蒙版。"}
            </p>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

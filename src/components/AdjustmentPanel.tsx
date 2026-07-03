import type { AdjustmentKey, AdjustmentParams } from "../core/adjustment";
import type { MultimodalAnalysisResult } from "../core/multimodalAnalysis";
import { MultimodalAnalysisPanel } from "./MultimodalAnalysisPanel";
import type {
  ColorCorrectionScope,
  ColorDifferenceResult,
  ColorMatchMode,
  MaskEditMode,
  MaskRecognitionStatus,
  MaskTool,
  SegmentationProviderType
} from "../types";

type AdjustmentPanelProps = {
  adjustmentError: string | null;
  adjustmentParams: AdjustmentParams;
  autoMaskNotice: string | null;
  brushSize: number;
  batchColorMessage: string | null;
  batchColorProgress: { current: number; total: number } | null;
  canApplyColorTransfer: boolean;
  canRedoMask: boolean;
  canUndoMask: boolean;
  colorCorrectionScope: ColorCorrectionScope;
  colorDifferenceResult: ColorDifferenceResult | null;
  colorMatchMode: ColorMatchMode;
  colorStrength: number;
  colorTransferError: string | null;
  hasColorResult: boolean;
  hasGarmentRoi: boolean;
  hasReferenceImage: boolean;
  hasSelectedImage: boolean;
  highlightProtection: number;
  isMaskVisible: boolean;
  isBatchColoring: boolean;
  isColorTransferRunning: boolean;
  isMultimodalAnalyzing: boolean;
  maskEditMode: MaskEditMode;
  maskFeather: number;
  maskOpacity: number;
  maskTool: MaskTool;
  multimodalAnalysis: MultimodalAnalysisResult | null;
  multimodalAnalysisError: string | null;
  referenceMaskStatus: MaskRecognitionStatus;
  selectedSampleMaskStatus: MaskRecognitionStatus;
  segmentationProviderType: SegmentationProviderType;
  smartColorOptimizationEnabled: boolean;
  onBrushSizeChange: (value: number) => void;
  onClearGarmentRoi: () => void;
  onColorCorrectionScopeChange: (scope: ColorCorrectionScope) => void;
  onColorMatchModeChange: (mode: ColorMatchMode) => void;
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
  onAnalyzeGarment: () => void;
  onApplyMultimodalSuggestedRoi: () => void;
  onRedoMask: () => void;
  onRegenerateAutoMask: () => void;
  onResetAdjustmentParam: (key: AdjustmentKey) => void;
  onResetAllAdjustments: () => void;
  onSegmentationProviderTypeChange: (providerType: SegmentationProviderType) => void;
  onShadowProtectionChange: (value: number) => void;
  onSmartColorOptimizationChange: (isEnabled: boolean) => void;
  onStartGarmentRoiSelection: () => void;
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

const colorCorrectionScopeOptions: Array<{
  description: string;
  label: string;
  value: ColorCorrectionScope;
}> = [
  {
    description: "AI / 传统识别仅作为初始蒙版；识别不准时请用手动蒙版精修。",
    label: "智能识别服装",
    value: "auto-garment"
  },
  {
    description: "不需要样品蒙版，整张样品图参与校色。",
    label: "整张样品图",
    value: "full-image"
  },
  {
    description: "只使用你手动绘制的样品蒙版，作为 AI 识别不准时的最终兜底。",
    label: "手动蒙版",
    value: "manual-mask"
  }
];

const colorMatchModeOptions: Array<{
  description: string;
  label: string;
  value: ColorMatchMode;
}> = [
  {
    description: "保留环境光和原图质感，适合模特图、场景图。",
    label: "自然",
    value: "natural"
  },
  {
    description: "尽量接近标准图，适合白底样品图。",
    label: "精准",
    value: "accurate"
  },
  {
    description: "颜色差异大时使用，更接近标准图但自然感略弱。",
    label: "强力",
    value: "strong"
  }
];

const segmentationProviderOptions: Array<{
  description: string;
  label: string;
  value: SegmentationProviderType;
}> = [
  {
    description: "使用当前前端白底、浅灰底和透明底识别算法，支持框选区域。",
    label: "传统识别",
    value: "traditional"
  },
  {
    description: "预留 AI 分割接口；暂未接入模型，识别时会自动回退到传统识别。",
    label: "AI识别，实验性",
    value: "ai-placeholder"
  },
  {
    description: "调用远程 AI 服务生成初始蒙版；低质量结果会被阻断，请用手动蒙版兜底。",
    label: "远程 AI 识别",
    value: "remote-ai"
  }
];

const isRemoteAiConfigured = Boolean(import.meta.env.VITE_AI_SEGMENTATION_API);

const colorDifferenceLabels: Record<ColorDifferenceResult["assessment"], {
  className: string;
  text: string;
}> = {
  acceptable: {
    className: "border-amber-200 bg-amber-50 text-amber-800",
    text: "可接受"
  },
  "very-close": {
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    text: "非常接近"
  },
  "visible-difference": {
    className: "border-rose-200 bg-rose-50 text-rose-700",
    text: "仍有明显偏差，建议修正蒙版或切换更强校色模式"
  }
};

function formatDeltaE(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function formatImprovement(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function AdjustmentPanel({
  adjustmentError,
  adjustmentParams,
  autoMaskNotice,
  brushSize,
  batchColorMessage,
  batchColorProgress,
  canApplyColorTransfer,
  canRedoMask,
  canUndoMask,
  colorCorrectionScope,
  colorDifferenceResult,
  colorMatchMode,
  colorStrength,
  colorTransferError,
  hasColorResult,
  hasGarmentRoi,
  hasReferenceImage,
  hasSelectedImage,
  highlightProtection,
  isMaskVisible,
  isBatchColoring,
  isColorTransferRunning,
  isMultimodalAnalyzing,
  maskEditMode,
  maskFeather,
  maskOpacity,
  maskTool,
  multimodalAnalysis,
  multimodalAnalysisError,
  referenceMaskStatus,
  selectedSampleMaskStatus,
  segmentationProviderType,
  smartColorOptimizationEnabled,
  onBrushSizeChange,
  onClearGarmentRoi,
  onColorCorrectionScopeChange,
  onColorMatchModeChange,
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
  onAnalyzeGarment,
  onApplyMultimodalSuggestedRoi,
  onRedoMask,
  onRegenerateAutoMask,
  onResetAdjustmentParam,
  onResetAllAdjustments,
  onSegmentationProviderTypeChange,
  onShadowProtectionChange,
  onSmartColorOptimizationChange,
  onStartGarmentRoiSelection,
  onToggleMaskVisible,
  onUndoMask,
  shadowProtection
}: AdjustmentPanelProps) {
  const hasEditableImage = maskEditMode === "reference" ? hasReferenceImage : hasSelectedImage;
  const isFullImageScope = colorCorrectionScope === "full-image";
  const isManualMaskScope = colorCorrectionScope === "manual-mask";
  const canUseMaskControls = Boolean(hasEditableImage && !(isFullImageScope && maskEditMode === "target"));
  const colorDifferenceLabel = colorDifferenceResult
    ? colorDifferenceLabels[colorDifferenceResult.assessment]
    : null;
  const applyButtonText = isColorTransferRunning
    ? "处理中..."
    : isBatchColoring
      ? "批量校色中..."
    : isFullImageScope
      ? hasColorResult
        ? "重新整图校色"
        : "整图自动校色"
      : isManualMaskScope
        ? hasColorResult
          ? "重新校色"
          : "开始校色"
        : hasColorResult
          ? "重新校色"
          : "自动识别并校色";

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">Controls</p>
        <h2 className="mt-1 text-base font-semibold">参数调整</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <MultimodalAnalysisPanel
          analysis={multimodalAnalysis}
          error={multimodalAnalysisError}
          hasSelectedImage={hasSelectedImage}
          isAnalyzing={isMultimodalAnalyzing}
          onAnalyze={onAnalyzeGarment}
          onApplySuggestedRoi={onApplyMultimodalSuggestedRoi}
        />
        <section>
          <h3 className="text-sm font-semibold text-zinc-800">自动校色</h3>
          <p className="mt-2 rounded-md bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800">
            {isFullImageScope
              ? "整张样品图模式会把整张样品图向标准图颜色匹配，不需要样品蒙版。"
              : isManualMaskScope
                ? "手动蒙版模式只校色你绘制的样品蒙版区域，适合精修挂拍、衣架、金属夹具、边缘贴图和复杂背景图片。"
                : "AI 识别仅作为辅助。挂拍、衣架、金属夹具、边缘贴图等场景可能识别不准；如蒙版未完整覆盖服装或选中夹具/背景，请使用手动蒙版修正后再校色。"}
          </p>

          <div className="mt-3">
            <p className="text-xs font-medium text-zinc-500">识别方式</p>
            <div className="mt-2 grid gap-2">
              {segmentationProviderOptions.map((option) => (
                <button
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    segmentationProviderType === option.value
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  }`}
                  disabled={isBatchColoring || isColorTransferRunning}
                  key={option.value}
                  onClick={() => onSegmentationProviderTypeChange(option.value)}
                  title={option.description}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-500">{option.description}</span>
                </button>
              ))}
            </div>
            {segmentationProviderType === "ai-placeholder" ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                AI 分割接口已预留，尚未接入模型；本次识别会自动回退到传统识别。
              </p>
            ) : null}
            {segmentationProviderType === "remote-ai" && !isRemoteAiConfigured ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                远程 AI 服务未配置，将使用传统识别。
              </p>
            ) : null}
            {segmentationProviderType === "remote-ai" && isRemoteAiConfigured ? (
              <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
                将调用远程 AI 分割服务生成初始蒙版；低质量或不可靠结果会被阻断。挂拍、衣架、金属夹具、边缘贴图等高风险图请以手动蒙版作为最终校色范围。
              </p>
            ) : null}
          </div>

          <div className="mt-3">
            <p className="text-xs font-medium text-zinc-500">校色模式</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {colorMatchModeOptions.map((option) => (
                <button
                  className={`rounded-md border px-2 py-2 text-left transition ${
                    colorMatchMode === option.value
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  }`}
                  disabled={isBatchColoring || isColorTransferRunning}
                  key={option.value}
                  onClick={() => onColorMatchModeChange(option.value)}
                  title={option.description}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-500">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-medium text-zinc-500">校色范围</p>
            <div className="mt-2 grid gap-2">
              {colorCorrectionScopeOptions.map((option) => (
                <button
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    colorCorrectionScope === option.value
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  }`}
                  disabled={isBatchColoring || isColorTransferRunning}
                  key={option.value}
                  onClick={() => onColorCorrectionScopeChange(option.value)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

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

          <label className="mt-4 flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
            <input
              checked={smartColorOptimizationEnabled}
              className="mt-1 accent-teal-600"
              disabled={isBatchColoring || isColorTransferRunning}
              onChange={(event) => onSmartColorOptimizationChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-800">智能校色优化</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                在基础 Lab 校色后自动微调目标区域颜色，进一步降低 ΔE，同时尽量保留明暗和纹理。
              </span>
            </span>
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
              disabled={isFullImageScope}
              max={24}
              min={0}
              onChange={(event) => onMaskFeatherChange(Number(event.currentTarget.value))}
              type="range"
              value={maskFeather}
            />
          </label>

          <button
            className="mt-4 w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={!canApplyColorTransfer || isColorTransferRunning || isBatchColoring}
            onClick={onApplyColorTransfer}
            type="button"
          >
            {applyButtonText}
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasEditableImage || isColorTransferRunning || isBatchColoring || isFullImageScope || isManualMaskScope}
              onClick={onRegenerateAutoMask}
              type="button"
            >
              重新自动识别蒙版
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isBatchColoring || isFullImageScope || (!hasReferenceImage && !hasSelectedImage)}
              onClick={onEditColorRange}
              type="button"
            >
              编辑校色范围
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={
                isBatchColoring ||
                isColorTransferRunning ||
                isFullImageScope ||
                isManualMaskScope ||
                !hasSelectedImage
              }
              onClick={onStartGarmentRoiSelection}
              type="button"
            >
              框选服装区域
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasGarmentRoi || isBatchColoring || isColorTransferRunning}
              onClick={onClearGarmentRoi}
              type="button"
            >
              清除框选区域
            </button>
          </div>

          {colorTransferError ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {colorTransferError}
            </p>
          ) : null}

          {autoMaskNotice ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800">
              {autoMaskNotice}
            </p>
          ) : null}

          {batchColorProgress ? (
            <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs font-semibold text-sky-800">
                <span>批量校色进度</span>
                <span>
                  {batchColorProgress.current} / {batchColorProgress.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{
                    width: `${Math.round(
                      (batchColorProgress.current / Math.max(1, batchColorProgress.total)) * 100
                    )}%`
                  }}
                />
              </div>
            </div>
          ) : null}

          {batchColorMessage ? (
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-xs font-medium ${
                isBatchColoring
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700"
              }`}
            >
              {batchColorMessage}
            </p>
          ) : null}

          <div className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold text-zinc-700">ΔE 色差检测</h4>
              {colorDifferenceLabel ? (
                <span
                  className={`max-w-[13rem] rounded border px-2 py-1 text-right text-[11px] font-semibold leading-4 ${colorDifferenceLabel.className}`}
                >
                  {colorDifferenceLabel.text}
                </span>
              ) : null}
            </div>

            {colorDifferenceResult ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-zinc-50 px-2 py-2">
                    <p className="text-[11px] font-medium text-zinc-500">校色前</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-800">
                      {formatDeltaE(colorDifferenceResult.deltaEBefore)}
                    </p>
                  </div>
                  <div className="rounded-md bg-zinc-50 px-2 py-2">
                    <p className="text-[11px] font-medium text-zinc-500">校色后</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-800">
                      {formatDeltaE(colorDifferenceResult.deltaEAfter)}
                    </p>
                  </div>
                  <div className="rounded-md bg-zinc-50 px-2 py-2">
                    <p className="text-[11px] font-medium text-zinc-500">改善</p>
                    <p
                      className={`mt-1 text-sm font-semibold ${
                        colorDifferenceResult.improvementPercent >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatImprovement(colorDifferenceResult.improvementPercent)}
                    </p>
                  </div>
                </div>
                {colorDifferenceResult.warning ? (
                  <p className="mt-2 text-xs leading-5 text-amber-700">{colorDifferenceResult.warning}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">暂无色差结果</p>
            )}
          </div>

          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
            {isFullImageScope
              ? `整张样品图模式：不需要样品蒙版；标准图参考区域：${maskStatusLabels[referenceMaskStatus]}，未选择时使用标准图整图。`
              : `标准图参考区域：${maskStatusLabels[referenceMaskStatus]}；当前样品校色范围：${maskStatusLabels[selectedSampleMaskStatus]}${hasGarmentRoi ? "；已启用服装框选辅助识别" : ""}`}
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
                disabled={!canUseMaskControls}
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
                disabled={
                  mode === "reference"
                    ? !hasReferenceImage
                    : !hasSelectedImage || isFullImageScope
                }
                key={mode}
                onClick={() => onMaskEditModeChange(mode)}
                type="button"
              >
                {mode === "reference" ? "标准图取色" : "样品蒙版"}
              </button>
            ))}
          </div>

          {maskEditMode === "target" && !isFullImageScope ? (
            <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800">
              AI 识别不准时，请切换到样品蒙版，用画笔添加服装区域、用橡皮擦去掉衣架/夹具/背景；手动蒙版会作为最终校色范围。
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 rounded-md border border-zinc-200 bg-zinc-50 p-1">
            {(["brush", "eraser"] as const).map((tool) => (
              <button
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  maskTool === tool ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
                }`}
                disabled={!canUseMaskControls}
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
              disabled={!canUseMaskControls}
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
              disabled={!canUseMaskControls}
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
              disabled={!canUseMaskControls || !canUndoMask}
              onClick={onUndoMask}
              type="button"
            >
              撤销
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canUseMaskControls || !canRedoMask}
              onClick={onRedoMask}
              type="button"
            >
              重做
            </button>
            <button
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canUseMaskControls}
              onClick={onClearMask}
              type="button"
            >
              清空
            </button>
          </div>

          {!hasEditableImage || (isFullImageScope && maskEditMode === "target") ? (
            <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              {isFullImageScope && maskEditMode === "target"
                ? "整张样品图模式不需要样品蒙版。"
                : maskEditMode === "reference"
                  ? "上传标准图后可以选择衣服参考区域。"
                  : "上传并选择样品图后可以编辑蒙版。"}
            </p>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

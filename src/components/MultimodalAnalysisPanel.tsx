import type { MultimodalAnalysisResult } from "../core/multimodalAnalysis";

type MultimodalAnalysisPanelProps = {
  analysis: MultimodalAnalysisResult | null;
  error: string | null;
  hasSelectedImage: boolean;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onApplySuggestedRoi: () => void;
};

const riskLabels: Record<string, string> = {
  complex_background: "复杂背景",
  edge_touching: "主体贴边",
  hanger: "衣架 / 挂拍",
  metal_clip: "金属夹具"
};

export function MultimodalAnalysisPanel({
  analysis,
  error,
  hasSelectedImage,
  isAnalyzing,
  onAnalyze,
  onApplySuggestedRoi
}: MultimodalAnalysisPanelProps) {
  return (
    <section className="border-b border-zinc-200 pb-5">
      <h3 className="text-sm font-semibold text-zinc-800">多模态识别建议</h3>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        多模态识别仅用于辅助判断服装主体和风险区域，不会直接进入校色。请确认 ROI / 蒙版准确后再执行校色。
      </p>
      <button
        className="mt-3 w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!hasSelectedImage || isAnalyzing}
        onClick={onAnalyze}
        type="button"
      >
        {isAnalyzing ? "分析中..." : "生成多模态识别建议"}
      </button>

      {error ? (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{analysis.garmentDescription}</span>
            <span className="shrink-0 text-zinc-500">{Math.round(analysis.confidence * 100)}%</span>
          </div>
          {analysis.riskTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {analysis.riskTags.map((risk) => (
                <span className="rounded bg-amber-100 px-2 py-1 text-amber-800" key={risk}>
                  {riskLabels[risk] ?? risk}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-emerald-700">未检测到 mock 风险标签，仍需确认实际蒙版。</p>
          )}
          <p className="leading-5">{analysis.userMessage}</p>
          {analysis.recommendManualMask ? (
            <p className="rounded bg-amber-50 px-2 py-2 leading-5 text-amber-800">
              检测到高风险场景，建议使用手动蒙版精修校色区域。
            </p>
          ) : null}
          {analysis.suggestedRoi ? (
            <div className="space-y-2">
              <p className="text-zinc-500">
                建议 ROI：{analysis.suggestedRoi.x}, {analysis.suggestedRoi.y}, {analysis.suggestedRoi.width}, {analysis.suggestedRoi.height}
              </p>
              <button
                className="w-full rounded-md border border-teal-500 bg-white px-3 py-2 font-semibold text-teal-700 hover:bg-teal-50"
                onClick={onApplySuggestedRoi}
                type="button"
              >
                应用建议 ROI
              </button>
            </div>
          ) : null}
          <p className="leading-5 text-zinc-500">{analysis.safetyNote}</p>
        </div>
      ) : null}
    </section>
  );
}

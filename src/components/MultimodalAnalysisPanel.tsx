import type {
  MultimodalAnalysisResult,
  MultimodalProviderType
} from "../core/multimodalAnalysis";

type MultimodalAnalysisPanelProps = {
  analysis: MultimodalAnalysisResult | null;
  error: string | null;
  hasSelectedImage: boolean;
  isAnalyzing: boolean;
  provider: MultimodalProviderType;
  onAnalyze: () => void;
  onApplySuggestedRoi: () => void;
  onProviderChange: (provider: MultimodalProviderType) => void;
};

const riskLabels: Record<string, string> = {
  complex_background: "复杂背景",
  edge_touching: "主体贴边",
  hanger: "衣架 / 挂拍",
  metal_clip: "金属夹具",
  api_key_missing: "API Key 未配置",
  api_timeout: "服务超时",
  invalid_provider_response: "返回格式异常",
  external_provider_disabled: "真实 provider 未启用",
  external_provider_error: "服务异常",
  runninghub_api_key_missing: "RunningHub Key 未配置",
  runninghub_workflow_config_missing: "工作流配置缺失",
  runninghub_config_invalid: "RunningHub 配置无效",
  runninghub_timeout: "RunningHub 超时",
  runninghub_task_failed: "RunningHub 任务失败",
  runninghub_invalid_response: "RunningHub 返回异常",
  runninghub_provider_disabled: "RunningHub adapter 未启用",
  runninghub_provider_error: "RunningHub 服务异常"
};

const providerStatusLabels: Record<string, string> = {
  ready: "可用",
  missing_api_key: "缺少 API Key",
  timeout: "请求超时",
  invalid_response: "返回异常",
  missing_workflow_config: "缺少工作流配置",
  invalid_config: "配置无效",
  task_failed: "任务失败",
  provider_disabled: "尚未启用",
  provider_error: "服务失败"
};

const providerLabels: Record<MultimodalProviderType, string> = {
  mock: "Mock",
  external: "External",
  runninghub: "RunningHub"
};

const providerDescriptions: Record<MultimodalProviderType, string> = {
  mock: "mock（无需 Key）",
  external: "external（仅后端环境变量）",
  runninghub: "runninghub（仅后端环境变量）"
};

export function MultimodalAnalysisPanel({
  analysis,
  error,
  hasSelectedImage,
  isAnalyzing,
  provider,
  onAnalyze,
  onApplySuggestedRoi,
  onProviderChange
}: MultimodalAnalysisPanelProps) {
  return (
    <section className="border-b border-zinc-200 pb-5">
      <h3 className="text-sm font-semibold text-zinc-800">多模态识别建议</h3>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        多模态识别仅用于辅助判断服装主体和风险区域，不会直接进入校色。请确认 ROI / 蒙版准确后再执行校色。
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2" aria-label="多模态 provider">
        {(["mock", "external", "runninghub"] as const).map((option) => (
          <button
            className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
              provider === option
                ? "border-teal-500 bg-teal-50 text-teal-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
            disabled={isAnalyzing}
            key={option}
            onClick={() => onProviderChange(option)}
            type="button"
          >
            {providerLabels[option]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">
        当前 provider：{providerDescriptions[provider]}
      </p>
      {provider === "runninghub" ? (
        <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-[11px] leading-5 text-sky-800">
          RunningHub 识别结果仅作为辅助建议，不会直接进入校色。最终校色范围以用户确认后的 ROI / mask 为准。
        </p>
      ) : null}
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
        <div className={`mt-3 space-y-2 rounded-md border p-3 text-xs ${
          analysis.success
            ? "border-zinc-200 bg-zinc-50 text-zinc-700"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{analysis.garmentDescription}</span>
            <span className="shrink-0 text-zinc-500">{Math.round(analysis.confidence * 100)}%</span>
          </div>
          <p className="text-zinc-500">
            provider：{analysis.provider} · 状态：{providerStatusLabels[analysis.providerStatus] ?? analysis.providerStatus}
          </p>
          {analysis.riskTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {analysis.riskTags.map((risk) => (
                <span className="rounded bg-amber-100 px-2 py-1 text-amber-800" key={risk}>
                  {riskLabels[risk] ?? risk}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-emerald-700">未检测到风险标签，仍需确认实际蒙版。</p>
          )}
          <p className="leading-5">{analysis.userMessage}</p>
          {analysis.recommendManualMask ? (
            <p className="rounded bg-amber-50 px-2 py-2 leading-5 text-amber-800">
              检测到高风险场景，建议使用手动蒙版精修校色区域。
            </p>
          ) : null}
          {analysis.success && analysis.suggestedRoi ? (
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

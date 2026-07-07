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
  striped_pattern: "条纹图案",
  logo_present: "包含 Logo",
  graphic_print: "图案印花",
  dark_fabric: "深色面料",
  light_fabric: "浅色面料",
  hanger_present: "检测到衣架",
  metal_clip_present: "检测到金属夹",
  metal_hook_present: "检测到金属挂钩",
  complex_background: "复杂背景",
  edge_touching: "主体贴边",
  folded_garment: "服装折叠",
  wrinkled_fabric: "褶皱面料",
  partial_garment: "仅识别到局部",
  closeup_detail: "近景细节",
  multiple_garments: "多件服装",
  shadow_risk: "阴影风险",
  collar_shadow: "领口阴影",
  low_contrast: "低对比度",
  high_contrast_pattern: "高对比图案",
  reflective_material: "反光材质",
  unknown_risk: "未分类风险",
  hanger: "衣架 / 挂拍",
  metal_clip: "金属夹具",
  api_key_missing: "API Key 未配置",
  api_timeout: "服务超时",
  invalid_provider_response: "返回格式异常",
  external_provider_disabled: "真实 provider 未启用",
  external_provider_error: "服务异常",
  runninghub_api_key_missing: "RunningHub Key 未配置",
  runninghub_real_call_disabled: "真实调用未启用",
  runninghub_vlm_timeout: "VLM 请求超时",
  runninghub_vlm_request_failed: "VLM 请求失败",
  runninghub_vlm_invalid_response: "VLM 返回异常",
  runninghub_llm_config_invalid: "VLM 配置无效",
  runninghub_workflow_config_missing: "工作流配置缺失",
  runninghub_config_invalid: "RunningHub 配置无效",
  runninghub_timeout: "RunningHub 超时",
  runninghub_task_failed: "RunningHub 任务失败",
  runninghub_invalid_response: "RunningHub 返回异常",
  runninghub_provider_disabled: "RunningHub adapter 未启用",
  runninghub_provider_error: "RunningHub 服务异常"
};

const categoryLabels: Record<string, string> = {
  polo: "Polo 衫",
  tshirt: "T 恤",
  shirt: "衬衫",
  jacket: "夹克 / 外套",
  trousers: "长裤",
  jeans: "牛仔裤",
  shorts: "短裤",
  knitwear: "针织衫",
  hoodie: "连帽衫",
  sweatshirt: "卫衣 / 运动衫",
  vest: "马甲",
  unknown: "未识别"
};

const roiQualityLabels: Record<string, string> = {
  large_roi: "ROI 范围较大，建议人工确认范围。",
  full_image_roi: "ROI 接近整图，建议重新确认服装主体范围。",
  edge_touching_roi: "ROI 贴边，建议检查主体边缘。",
  small_roi: "ROI 过小，建议重新选择或手动框选。"
};

const providerStatusLabels: Record<string, string> = {
  ready: "可用",
  missing_api_key: "缺少 API Key",
  real_call_disabled: "真实调用未启用",
  request_failed: "请求失败",
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

type SuggestedRoiPreviewProps = {
  coverageRatio: number | null;
  imageSize: {
    width: number;
    height: number;
  };
  roi: NonNullable<MultimodalAnalysisResult["suggestedRoi"]>;
  roiQualityFlags: string[];
};

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value * 100)}%`;
}

function getCoverageRatio(
  roi: NonNullable<MultimodalAnalysisResult["suggestedRoi"]>,
  imageSize: MultimodalAnalysisResult["imageSize"],
  serverCoverageRatio: number | null
) {
  if (serverCoverageRatio !== null && Number.isFinite(serverCoverageRatio)) {
    return Math.max(0, Math.min(1, serverCoverageRatio));
  }

  const imageArea = imageSize.width * imageSize.height;
  if (imageArea <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, (roi.width * roi.height) / imageArea));
}

function SuggestedRoiPreview({
  coverageRatio,
  imageSize,
  roi,
  roiQualityFlags
}: SuggestedRoiPreviewProps) {
  const hasFullImageRisk = roiQualityFlags.includes("full_image_roi");
  const hasEdgeRisk = roiQualityFlags.includes("edge_touching_roi");
  const hasSmallRisk = roiQualityFlags.includes("small_roi");
  const hasLargeRisk = roiQualityFlags.includes("large_roi");
  const roiStroke = hasFullImageRisk || hasLargeRisk
    ? "#f59e0b"
    : hasEdgeRisk || hasSmallRisk
      ? "#0ea5e9"
      : "#14b8a6";

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-zinc-700">建议 ROI 预览</span>
        <span className="shrink-0 text-[11px] text-zinc-500">
          覆盖 {formatPercent(coverageRatio)}
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded border border-zinc-200 bg-zinc-50">
        <svg
          aria-label="多模态建议 ROI 比例示意图"
          className="block h-44 w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
        >
          <rect fill="#f4f4f5" height={imageSize.height} width={imageSize.width} x="0" y="0" />
          <line
            stroke="#d4d4d8"
            strokeDasharray="10 10"
            strokeWidth={Math.max(1, imageSize.width * 0.0015)}
            x1={imageSize.width / 3}
            x2={imageSize.width / 3}
            y1="0"
            y2={imageSize.height}
          />
          <line
            stroke="#d4d4d8"
            strokeDasharray="10 10"
            strokeWidth={Math.max(1, imageSize.width * 0.0015)}
            x1={(imageSize.width * 2) / 3}
            x2={(imageSize.width * 2) / 3}
            y1="0"
            y2={imageSize.height}
          />
          <line
            stroke="#d4d4d8"
            strokeDasharray="10 10"
            strokeWidth={Math.max(1, imageSize.width * 0.0015)}
            x1="0"
            x2={imageSize.width}
            y1={imageSize.height / 3}
            y2={imageSize.height / 3}
          />
          <line
            stroke="#d4d4d8"
            strokeDasharray="10 10"
            strokeWidth={Math.max(1, imageSize.width * 0.0015)}
            x1="0"
            x2={imageSize.width}
            y1={(imageSize.height * 2) / 3}
            y2={(imageSize.height * 2) / 3}
          />
          <rect
            fill="rgba(20, 184, 166, 0.18)"
            height={roi.height}
            stroke={roiStroke}
            strokeWidth={Math.max(2, imageSize.width * 0.004)}
            width={roi.width}
            x={roi.x}
            y={roi.y}
          />
        </svg>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">
        比例示意图，不修改原图；请以画布中的 ROI / 蒙版确认结果为准。
      </p>
    </div>
  );
}

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
  const roiCoverageRatio = analysis?.suggestedRoi
    ? getCoverageRatio(analysis.suggestedRoi, analysis.imageSize, analysis.roiCoverageRatio)
    : null;
  const hasFullImageRoi = analysis?.roiQualityFlags.includes("full_image_roi") ?? false;
  const hasEdgeTouchingRoi = analysis?.roiQualityFlags.includes("edge_touching_roi") ?? false;
  const hasSmallRoi = analysis?.roiQualityFlags.includes("small_roi") ?? false;

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
          <p className="text-zinc-600">
            标准类别：{categoryLabels[analysis.garmentCategory] ?? analysis.garmentCategory}
            （{analysis.garmentCategory}）
          </p>
          {analysis.rawGarmentCategory &&
          analysis.rawGarmentCategory.toLowerCase() !== analysis.garmentCategory.toLowerCase() ? (
            <p className="text-zinc-500">原始识别：{analysis.rawGarmentCategory}</p>
          ) : null}
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
          {analysis.roiQualityFlags.length > 0 ? (
            <div className="space-y-1 rounded bg-sky-50 px-2 py-2 text-sky-800">
              {analysis.roiQualityFlags.map((flag) => (
                <p key={flag}>{roiQualityLabels[flag] ?? flag}</p>
              ))}
            </div>
          ) : null}
          {hasFullImageRoi ? (
            <p className="rounded bg-amber-50 px-2 py-2 leading-5 text-amber-800">
              AI 建议范围接近整张图片，建议人工确认是否需要缩小到服装主体。
            </p>
          ) : null}
          {hasEdgeTouchingRoi ? (
            <p className="rounded bg-sky-50 px-2 py-2 leading-5 text-sky-800">
              AI 建议范围贴近图片边缘，请检查服装边缘是否完整。
            </p>
          ) : null}
          {hasSmallRoi ? (
            <p className="rounded bg-amber-50 px-2 py-2 leading-5 text-amber-800">
              AI 建议范围较小，可能只覆盖局部细节，请确认是否符合校色目标。
            </p>
          ) : null}
          <p className="leading-5">{analysis.userMessage}</p>
          {analysis.recommendManualMask ? (
            <p className="rounded bg-amber-50 px-2 py-2 leading-5 text-amber-800">
              检测到高风险场景，建议手动确认蒙版后再进行校色。
            </p>
          ) : null}
          {analysis.suggestedRoi ? (
            <div className="space-y-2">
              <SuggestedRoiPreview
                coverageRatio={roiCoverageRatio}
                imageSize={analysis.imageSize}
                roi={analysis.suggestedRoi}
                roiQualityFlags={analysis.roiQualityFlags}
              />
              <p className="text-zinc-500">
                建议 ROI：x={analysis.suggestedRoi.x}，y={analysis.suggestedRoi.y}，
                w={analysis.suggestedRoi.width}，h={analysis.suggestedRoi.height}
              </p>
              <p className="text-zinc-500">
                图片尺寸：{analysis.imageSize.width} × {analysis.imageSize.height} · ROI 覆盖比例：
                {formatPercent(roiCoverageRatio)}
              </p>
              <button
                className="w-full rounded-md border border-teal-500 bg-white px-3 py-2 font-semibold text-teal-700 hover:bg-teal-50"
                disabled={!analysis.success}
                onClick={onApplySuggestedRoi}
                type="button"
              >
                应用建议 ROI
              </button>
              <p className="rounded bg-zinc-100 px-2 py-2 leading-5 text-zinc-600">
                仅应用框选范围，不会自动校色、不会生成最终蒙版，也不会进入导出。
              </p>
            </div>
          ) : null}
          <p className="leading-5 text-zinc-500">{analysis.safetyNote}</p>
        </div>
      ) : null}
    </section>
  );
}

import { exportSizeLabels, getExportLongEdge, type ExportSize } from "../core/exportImage";
import type { BatchImageStatus, BatchItemStatus } from "../core/batchProcessor";
import type { UploadedImage } from "../types";

type ExportBarProps = {
  batchStatuses: Record<string, BatchItemStatus>;
  exportMessage: string | null;
  exportSize: ExportSize;
  isExporting: boolean;
  onBatchDownload: () => void;
  onCurrentDownload: () => void;
  onExportSizeChange: (size: ExportSize) => void;
  sampleImages: UploadedImage[];
  selectedImage: UploadedImage | null;
  showUpscaleWarning: boolean;
};

const exportSizes: ExportSize[] = ["original", "2k", "4k"];

const statusLabels: Record<BatchImageStatus, string> = {
  done: "已完成",
  failed: "失败",
  "missing-mask": "缺少蒙版",
  processing: "处理中",
  queued: "等待"
};

const statusClasses: Record<BatchImageStatus, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  "missing-mask": "border-amber-200 bg-amber-50 text-amber-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  queued: "border-zinc-200 bg-zinc-50 text-zinc-500"
};

function getStatusSummary(statuses: BatchItemStatus[]) {
  if (statuses.length === 0) {
    return "选择尺寸后可下载当前图或批量 ZIP";
  }

  const doneCount = statuses.filter((item) => item.status === "done").length;
  const skippedCount = statuses.filter((item) => item.status === "missing-mask").length;
  const failedCount = statuses.filter((item) => item.status === "failed").length;

  return `已处理 ${doneCount} 张，缺少蒙版 ${skippedCount} 张，失败 ${failedCount} 张`;
}

export function ExportBar({
  batchStatuses,
  exportMessage,
  exportSize,
  isExporting,
  onBatchDownload,
  onCurrentDownload,
  onExportSizeChange,
  sampleImages,
  selectedImage,
  showUpscaleWarning
}: ExportBarProps) {
  const statuses = sampleImages.map((image) => batchStatuses[image.id]).filter(Boolean);
  const targetLongEdge = getExportLongEdge(exportSize);

  return (
    <footer className="flex min-h-24 shrink-0 flex-wrap items-center justify-between gap-4 border-t border-zinc-200 bg-white px-5 py-3">
      <div className="min-w-64 flex-1">
        <p className="text-sm font-semibold">导出</p>
        <p className="mt-1 text-xs text-zinc-500">{getStatusSummary(statuses)}</p>
        {targetLongEdge ? (
          <p className="mt-1 text-xs text-zinc-500">
            当前长边目标：{targetLongEdge}px，保持原始比例
          </p>
        ) : null}
        {showUpscaleWarning ? (
          <p className="mt-1 text-xs font-medium text-amber-700">放大不会增加真实细节</p>
        ) : null}
        {exportMessage ? (
          <p className="mt-1 whitespace-pre-line text-xs font-medium text-zinc-700">{exportMessage}</p>
        ) : null}
      </div>

      {statuses.length > 0 ? (
        <div className="max-h-24 min-w-64 flex-1 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => (
              <span
                className={`max-w-56 truncate rounded border px-2 py-1 text-xs font-medium ${
                  statusClasses[item.status]
                }`}
                key={item.imageId}
                title={`${item.fileName}：${item.message ?? statusLabels[item.status]}`}
              >
                {item.fileName} · {statusLabels[item.status]}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
          {exportSizes.map((size) => (
            <button
              className={`rounded px-3 py-2 text-sm font-semibold ${
                exportSize === size ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
              }`}
              key={size}
              onClick={() => onExportSizeChange(size)}
              type="button"
            >
              {exportSizeLabels[size]}
            </button>
          ))}
        </div>

        <button
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!selectedImage || isExporting}
          onClick={onCurrentDownload}
          type="button"
        >
          单张下载
        </button>
        <button
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={sampleImages.length === 0 || isExporting}
          onClick={onBatchDownload}
          type="button"
        >
          {isExporting ? "处理中" : "批量 ZIP"}
        </button>
      </div>
    </footer>
  );
}

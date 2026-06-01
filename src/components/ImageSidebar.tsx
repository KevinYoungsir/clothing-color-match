import type { ChangeEvent } from "react";
import type { MaskRecognitionStatus, SampleProcessStatus, UploadedImage } from "../types";

type ImageSidebarProps = {
  referenceImage: UploadedImage | null;
  sampleImages: UploadedImage[];
  sampleMaskStatuses: Record<string, MaskRecognitionStatus>;
  sampleProcessMessages: Record<string, string>;
  sampleProcessStatuses: Record<string, SampleProcessStatus>;
  selectedSampleIds: string[];
  selectedSampleId: string | null;
  uploadError: string | null;
  isBatchColoring: boolean;
  onClearSampleSelection: () => void;
  onProcessSelectedSamples: () => void;
  onReferenceUpload: (files: FileList | null) => void;
  onSampleUpload: (files: FileList | null) => void;
  onSampleSelect: (imageId: string) => void;
  onSelectAllSamples: () => void;
  onSampleSelectionChange: (imageId: string, isSelected: boolean) => void;
};

const acceptedImageTypes = "image/jpeg,image/png,image/webp";
const maskStatusLabels: Record<MaskRecognitionStatus, string> = {
  auto: "自动识别",
  colored: "已校色",
  manual: "手动修正",
  unrecognized: "未识别"
};

const maskStatusClasses: Record<MaskRecognitionStatus, string> = {
  auto: "bg-sky-50 text-sky-700",
  colored: "bg-teal-50 text-teal-700",
  manual: "bg-emerald-50 text-emerald-700",
  unrecognized: "bg-zinc-100 text-zinc-500"
};

const processStatusLabels: Record<SampleProcessStatus, string> = {
  done: "已校色",
  failed: "处理失败",
  idle: "未处理",
  "missing-mask": "缺少蒙版",
  "needs-manual-fix": "需手动修正",
  processing: "处理中",
  queued: "等待",
  "recognition-failed": "识别失败",
  selected: "已选中"
};

const processStatusClasses: Record<SampleProcessStatus, string> = {
  done: "bg-teal-50 text-teal-700",
  failed: "bg-rose-50 text-rose-700",
  idle: "bg-zinc-100 text-zinc-500",
  "missing-mask": "bg-amber-50 text-amber-700",
  "needs-manual-fix": "bg-orange-50 text-orange-700",
  processing: "bg-sky-50 text-sky-700",
  queued: "bg-zinc-100 text-zinc-500",
  "recognition-failed": "bg-rose-50 text-rose-700",
  selected: "bg-indigo-50 text-indigo-700"
};

export function ImageSidebar({
  referenceImage,
  sampleImages,
  sampleMaskStatuses,
  sampleProcessMessages,
  sampleProcessStatuses,
  selectedSampleIds,
  selectedSampleId,
  uploadError,
  isBatchColoring,
  onClearSampleSelection,
  onProcessSelectedSamples,
  onReferenceUpload,
  onSampleSelect,
  onSelectAllSamples,
  onSampleSelectionChange,
  onSampleUpload
}: ImageSidebarProps) {
  const selectedSampleIdSet = new Set(selectedSampleIds);
  const selectedCount = selectedSampleIds.length;
  const totalCount = sampleImages.length;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  function handleReferenceChange(event: ChangeEvent<HTMLInputElement>) {
    onReferenceUpload(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function handleSampleChange(event: ChangeEvent<HTMLInputElement>) {
    onSampleUpload(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-teal-700">Reference</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">标准图</h2>
          <label className="cursor-pointer rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
            上传
            <input
              accept={acceptedImageTypes}
              className="sr-only"
              onChange={handleReferenceChange}
              type="file"
            />
          </label>
        </div>

        <div className="mt-3 grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-dashed border-zinc-300 bg-zinc-50">
          {referenceImage ? (
            <img
              alt={`标准图预览：${referenceImage.fileName}`}
              className="h-full w-full object-contain"
              src={referenceImage.url}
            />
          ) : (
            <p className="px-4 text-center text-xs text-zinc-400">上传标准图后在这里预览</p>
          )}
        </div>

        {referenceImage ? (
          <div className="mt-2 min-w-0 text-xs text-zinc-500">
            <p className="truncate font-medium text-zinc-700">{referenceImage.fileName}</p>
            <p>
              {referenceImage.width} x {referenceImage.height}px
            </p>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">样品列表</h2>
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
            {sampleImages.length} 张
          </span>
        </div>

        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-700">
            <span className="flex items-center gap-2">
              <input
                checked={isAllSelected}
                className="accent-teal-600"
                disabled={totalCount === 0 || isBatchColoring}
                onChange={(event) =>
                  event.currentTarget.checked ? onSelectAllSamples() : onClearSampleSelection()
                }
                type="checkbox"
              />
              全选
            </span>
            <span className="text-zinc-500">
              已选择 {selectedCount} / 共 {totalCount} 张
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={totalCount === 0 || selectedCount === 0 || isBatchColoring}
              onClick={onClearSampleSelection}
              type="button"
            >
              取消全选
            </button>
            <button
              className="rounded-md bg-teal-600 px-2 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
              disabled={selectedCount === 0 || isBatchColoring}
              onClick={onProcessSelectedSamples}
              title={selectedCount === 0 ? "请先选择样品图" : undefined}
              type="button"
            >
              {isBatchColoring ? "校色中..." : "一键校色选中样品"}
            </button>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-700 hover:border-teal-500 hover:text-teal-700">
          批量上传样品图
          <input
            accept={acceptedImageTypes}
            className="sr-only"
            multiple
            onChange={handleSampleChange}
            type="file"
          />
        </label>

        {uploadError ? (
          <div className="mt-3 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {uploadError}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {sampleImages.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-6 text-center text-sm text-zinc-400">
              暂无样品图
            </div>
          ) : null}

          {sampleImages.map((image, index) => {
            const isSelected = image.id === selectedSampleId;
            const isChecked = selectedSampleIdSet.has(image.id);
            const maskStatus = sampleMaskStatuses[image.id] ?? "unrecognized";
            const processStatus = sampleProcessStatuses[image.id] ?? (isChecked ? "selected" : "idle");
            const processMessage = sampleProcessMessages[image.id];

            return (
              <div
                className={`grid w-full grid-cols-[20px_64px_1fr] gap-3 rounded-md border p-2 text-left transition ${
                  isSelected
                    ? "border-teal-500 bg-teal-50"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                }`}
                key={image.id}
              >
                <input
                  aria-label={`选择样品 ${index + 1}`}
                  checked={isChecked}
                  className="mt-6 accent-teal-600"
                  disabled={isBatchColoring}
                  onChange={(event) => onSampleSelectionChange(image.id, event.currentTarget.checked)}
                  type="checkbox"
                />
                <span className="grid aspect-square place-items-center overflow-hidden rounded border border-zinc-200 bg-white">
                  <img
                    alt={`样品图缩略图：${image.fileName}`}
                    className="h-full w-full object-contain"
                    src={image.url}
                  />
                </span>
                <button
                  className="flex min-w-0 flex-col justify-center text-left"
                  onClick={() => onSampleSelect(image.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-700">样品 {index + 1}</span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          processStatusClasses[processStatus]
                        }`}
                        title={processMessage}
                      >
                        {processStatusLabels[processStatus]}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          maskStatusClasses[maskStatus]
                        }`}
                      >
                        {maskStatusLabels[maskStatus]}
                      </span>
                    </span>
                  </span>
                  <span className="truncate text-xs text-zinc-500">{image.fileName}</span>
                  <span className="text-xs text-zinc-400">
                    {image.width} x {image.height}px
                  </span>
                  {processMessage ? (
                    <span className="truncate text-xs font-medium text-zinc-500">{processMessage}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

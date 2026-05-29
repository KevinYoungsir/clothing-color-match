const exportModes = ["原尺寸", "2K", "4K"];

export function ExportBar() {
  return (
    <footer className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white px-5 py-3">
      <div>
        <p className="text-sm font-semibold">导出</p>
        <p className="mt-1 text-xs text-zinc-500">等待后续任务接入处理结果</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
          {exportModes.map((mode) => (
            <button
              className="rounded px-3 py-2 text-sm font-medium text-zinc-500"
              disabled
              key={mode}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white opacity-50"
          disabled
          type="button"
        >
          批量导出
        </button>
      </div>
    </footer>
  );
}

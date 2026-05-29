export function CanvasWorkspace() {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-rose-700">Preview</p>
          <h2 className="mt-1 text-base font-semibold">画布预览</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-teal-500" />
          <span className="h-3 w-3 rounded-sm bg-rose-500" />
          <span className="h-3 w-3 rounded-sm bg-amber-400" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="canvas-checker relative w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-200 p-5">
          <canvas
            aria-label="当前图片预览"
            className="block aspect-[16/10] w-full rounded-md border border-zinc-300 bg-white"
            height={900}
            width={1440}
          />
          <div className="pointer-events-none absolute inset-5 grid place-items-center">
            <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-sm font-semibold text-zinc-700">未加载图片</p>
              <p className="mt-1 text-xs text-zinc-400">Task 01 静态画布</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const sampleSlots = ["样品 01", "样品 02", "样品 03"];

export function ImageSidebar() {
  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-teal-700">Reference</p>
        <h2 className="mt-1 text-base font-semibold">标准图</h2>
        <div className="mt-3 aspect-[4/3] rounded-md border border-dashed border-zinc-300 bg-zinc-50" />
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">样品列表</h2>
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
            0 张
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {sampleSlots.map((slot) => (
            <div
              className="grid grid-cols-[64px_1fr] gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-2"
              key={slot}
            >
              <div className="aspect-square rounded border border-dashed border-zinc-300 bg-white" />
              <div className="flex flex-col justify-center">
                <p className="text-sm font-medium text-zinc-700">{slot}</p>
                <p className="text-xs text-zinc-400">未加载</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

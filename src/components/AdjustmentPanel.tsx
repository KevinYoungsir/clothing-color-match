const groups = [
  {
    title: "校色",
    rows: ["强度", "高光保护", "阴影保护"]
  },
  {
    title: "人工调整",
    rows: ["亮度", "对比度", "饱和度", "色温"]
  },
  {
    title: "蒙版",
    rows: ["画笔大小", "透明度", "边缘羽化"]
  }
];

export function AdjustmentPanel() {
  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">Controls</p>
        <h2 className="mt-1 text-base font-semibold">参数调整</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="text-sm font-semibold text-zinc-800">{group.title}</h3>
            <div className="mt-3 space-y-3">
              {group.rows.map((row) => (
                <label className="block" key={row}>
                  <span className="text-xs font-medium text-zinc-500">{row}</span>
                  <input
                    className="mt-2 h-2 w-full cursor-not-allowed appearance-none rounded-full bg-zinc-200 accent-teal-600"
                    disabled
                    max={100}
                    min={0}
                    type="range"
                    defaultValue={50}
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

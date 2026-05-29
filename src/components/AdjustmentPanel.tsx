import type { MaskTool } from "../types";

type AdjustmentPanelProps = {
  brushSize: number;
  canRedoMask: boolean;
  canUndoMask: boolean;
  hasSelectedImage: boolean;
  isMaskVisible: boolean;
  maskOpacity: number;
  maskTool: MaskTool;
  onBrushSizeChange: (value: number) => void;
  onClearMask: () => void;
  onMaskOpacityChange: (value: number) => void;
  onMaskToolChange: (tool: MaskTool) => void;
  onRedoMask: () => void;
  onToggleMaskVisible: (isVisible: boolean) => void;
  onUndoMask: () => void;
};

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

export function AdjustmentPanel({
  brushSize,
  canRedoMask,
  canUndoMask,
  hasSelectedImage,
  isMaskVisible,
  maskOpacity,
  maskTool,
  onBrushSizeChange,
  onClearMask,
  onMaskOpacityChange,
  onMaskToolChange,
  onRedoMask,
  onToggleMaskVisible,
  onUndoMask
}: AdjustmentPanelProps) {
  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-panel">
      <div className="border-b border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">Controls</p>
        <h2 className="mt-1 text-base font-semibold">参数调整</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        {groups.slice(0, 2).map((group) => (
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

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-800">蒙版</h3>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
              <input
                checked={isMaskVisible}
                className="accent-teal-600"
                disabled={!hasSelectedImage}
                onChange={(event) => onToggleMaskVisible(event.currentTarget.checked)}
                type="checkbox"
              />
              显示
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 rounded-md border border-zinc-200 bg-zinc-50 p-1">
            {(["brush", "eraser"] as const).map((tool) => (
              <button
                className={`rounded px-3 py-2 text-sm font-semibold ${
                  maskTool === tool ? "bg-white text-teal-700 shadow-sm" : "text-zinc-500"
                }`}
                disabled={!hasSelectedImage}
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
              disabled={!hasSelectedImage}
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
              disabled={!hasSelectedImage}
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
              disabled={!hasSelectedImage || !canUndoMask}
              onClick={onUndoMask}
              type="button"
            >
              撤销
            </button>
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasSelectedImage || !canRedoMask}
              onClick={onRedoMask}
              type="button"
            >
              重做
            </button>
            <button
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasSelectedImage}
              onClick={onClearMask}
              type="button"
            >
              清空
            </button>
          </div>

          {!hasSelectedImage ? (
            <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              上传并选择样品图后可以编辑蒙版。
            </p>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

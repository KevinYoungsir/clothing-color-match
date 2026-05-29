const toolItems = ["项目", "参考图", "样品图", "蒙版", "校色"];

export function TopToolbar() {
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-teal-600 text-sm font-semibold text-white">
          CC
        </div>
        <div>
          <h1 className="text-base font-semibold">Clothing Color Match Studio</h1>
          <p className="text-xs text-zinc-500">服装自动校色工作台</p>
        </div>
      </div>

      <nav className="flex max-w-full items-center gap-2 overflow-x-auto" aria-label="主工具栏">
        {toolItems.map((item) => (
          <button
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-600"
            disabled
            key={item}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
    </header>
  );
}

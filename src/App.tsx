import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { ExportBar } from "./components/ExportBar";
import { ImageSidebar } from "./components/ImageSidebar";
import { TopToolbar } from "./components/TopToolbar";

export default function App() {
  return (
    <main className="flex min-h-screen bg-[#f4f5f7] text-zinc-950">
      <div className="flex min-h-screen w-full flex-col">
        <TopToolbar />

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
          <ImageSidebar />
          <CanvasWorkspace />
          <AdjustmentPanel />
        </section>

        <ExportBar />
      </div>
    </main>
  );
}

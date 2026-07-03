import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isDesktop = mode === "desktop";

  return {
    base: isDesktop ? "./" : "/",
    define: isDesktop
      ? {
          "import.meta.env.VITE_AI_SEGMENTATION_API": JSON.stringify(
            "http://127.0.0.1:8765/segment-garment",
          ),
          "import.meta.env.VITE_AI_SEGMENTATION_TIMEOUT_MS": JSON.stringify("60000"),
        }
      : undefined,
    plugins: [react()],
  };
});

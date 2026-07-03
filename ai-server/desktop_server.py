"""PyInstaller entry point for the Electron FastAPI sidecar."""

from __future__ import annotations

import multiprocessing
import os
import sys
from pathlib import Path


def resolve_default_model_path() -> Path:
    configured_resources = os.getenv("DESKTOP_RESOURCES_PATH")
    if configured_resources:
        return Path(configured_resources).resolve() / "model" / "model.onnx"

    if getattr(sys, "frozen", False):
        executable_dir = Path(sys.executable).resolve().parent
        return executable_dir.parent / "model" / "model.onnx"

    return Path(__file__).resolve().parent / "models" / "model.onnx"


def configure_desktop_defaults() -> tuple[str, int]:
    host = os.getenv("AI_DESKTOP_HOST", "127.0.0.1")
    port = int(os.getenv("AI_DESKTOP_PORT", "8765"))

    os.environ.setdefault("AI_SEGMENTER", "lightweight")
    os.environ.setdefault(
        "AI_LIGHTWEIGHT_MODEL_PATH",
        str(resolve_default_model_path()),
    )
    os.environ.setdefault("AI_DEBUG_SAVE_MASKS", "0")

    return host, port


def main() -> None:
    multiprocessing.freeze_support()
    host, port = configure_desktop_defaults()

    import uvicorn

    from main import app

    print(
        "[desktop-server] "
        f"host={host} port={port} "
        f"segmenter={os.environ['AI_SEGMENTER']} "
        f"model={os.environ['AI_LIGHTWEIGHT_MODEL_PATH']}",
        flush=True,
    )
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=os.getenv("AI_DESKTOP_LOG_LEVEL", "info"),
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()

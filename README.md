# Clothing Color Match Studio

**Open-source human-in-the-loop garment color calibration for e-commerce, fashion-tech, and imaging workflows.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Clothing Color Match Studio helps match a target garment to a reference color **without treating the image as a flat block of pixels**. The workflow is designed to preserve fabric texture, folds, lighting, shadows, patterns, and product detail while restricting color transfer to a validated garment region.

The project combines editable masks, ROI guidance, segmentation quality gates, Lab-based color transfer, optional AI assistance, and batch export. AI is intentionally assistive rather than authoritative: uncertain masks are blocked or sent back for human correction instead of silently entering the final color-transfer path.

> **Project goal:** provide a practical, reusable open-source reference implementation for safe garment color calibration and image-processing workflows.

## Why This Project Exists

Garment recoloring looks simple until product fidelity matters. Generic hue replacement can damage luminance and fabric detail, while fully generative editing may change construction, texture, seams, patterns, or other product attributes.

This project focuses on a narrower but important problem:

- use a real reference garment color
- identify the garment region explicitly
- keep the mask editable by a human
- reject risky segmentation results before processing
- transfer color primarily through Lab `a/b` channels
- preserve target luminance and texture as much as possible
- keep exports reproducible and reviewable

This makes the project useful as a starting point for apparel e-commerce imaging, fashion catalog workflows, sample/colorway review, product-photo tooling, and computer-vision experiments involving controlled color transfer.

## Core Principles

### Human in the loop

AI-generated masks and multimodal suggestions are not automatically trusted. Users can inspect, apply, refine, or replace them with manual masks.

### Safe failure over silent corruption

Low-confidence, partial, over-coverage, overly broad ROI, and risky boundary cases can be blocked before they reach color transfer.

### Product-detail preservation

Color transfer is designed around valid garment pixels and primarily migrates Lab chroma while preserving target luminance, texture, folds, and lighting.

### Model- and provider-aware architecture

The frontend can work with manual masks, while the FastAPI backend supports pluggable segmentation/advisory providers. Provider credentials remain backend-only.

## Current Capabilities

- Reference image upload and reference garment mask selection
- Batch target-image upload with independent per-image mask state
- Manual mask editor with brush, eraser, undo, redo, clear, opacity, and feather controls
- ROI / prompt-box support for difficult images
- Optional FastAPI remote garment segmentation
- Lightweight ONNX segmentation path with configurable preprocessing and labels
- Mask quality gates for cases such as `roi_too_wide`, `over_coverage`, `partial`, and `low_confidence`
- Human-confirmed AI mask preview/application flow
- Lab-based garment color transfer
- Manual brightness, contrast, saturation, hue, exposure, shadows, highlights, white balance, temperature, color-strength, and texture-preservation controls
- Single, left/right, and split comparison modes
- Single-image download and batch ZIP export
- Original-size, 2K, and 4K export with aspect-ratio preservation
- Windows Electron desktop packaging proof of concept
- Regression and release-validation scripts

## Architecture

```text
React / Vite / TypeScript frontend
  ├─ Canvas preview
  ├─ ROI + editable mask workflow
  ├─ Lab color transfer
  ├─ manual adjustments
  └─ single / batch export
            │
            │ optional remote AI assistance
            ▼
FastAPI ai-server
  ├─ /health
  ├─ /segment-garment
  ├─ /analyze-garment
  ├─ /generate-garment-mask
  ├─ pluggable providers / segmenters
  ├─ lightweight ONNX inference
  └─ ROI-first post-processing + quality gates

Local model files
  └─ kept outside Git
```

## Safety Model

The color-transfer path intentionally has explicit boundaries:

1. A reference mask defines the color source.
2. A target mask defines where processing is allowed.
3. ROI can narrow recognition for difficult images.
4. AI or remote-provider output is evaluated before use.
5. Risky masks can be blocked instead of silently accepted.
6. Users can refine or replace masks manually.
7. Mask / ROI changes invalidate stale processed results before export reuse.
8. Color transfer operates only on the confirmed garment region.

Multimodal analysis is advisory. It may suggest garment categories, risk tags, or ROI information, but it does not bypass segmentation safety gates or directly authorize final color transfer.

## Quick Start

### Frontend

Requirements: a recent Node.js / npm environment.

```bash
git clone https://github.com/KevinYoungsir/clothing-color-match.git
cd clothing-color-match
npm install
npm run dev
```

The Vite development server is typically available at:

```text
http://localhost:5173
```

The frontend can be used without a remote AI server through manual-mask and supported local/fallback paths.

## Optional FastAPI AI Server

The backend lives in `ai-server/` and is intended for Python 3.11 or 3.12.

```powershell
cd ai-server
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

For the lightweight ONNX path:

```powershell
pip install -r requirements-lightweight.txt
```

Example lightweight configuration:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
uvicorn main:app --reload --port 8000
```

Check the service:

```powershell
curl.exe http://localhost:8000/health
```

Frontend configuration for the remote segmentation endpoint:

```text
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
VITE_MULTIMODAL_ANALYSIS_API=http://localhost:8000/analyze-garment
```

Restart the Vite server after changing `.env` or `.env.local`.

## Model Setup

Real model files are intentionally not included in the repository.

Recommended local path:

```text
ai-server/models/model.onnx
```

Or point to another local path:

```powershell
$env:AI_LIGHTWEIGHT_MODEL_PATH="D:\path\to\model.onnx"
```

Do not commit model binaries or local generated artifacts. Examples include:

```text
ai-server/models/
ai-server/test-assets/
ai-server/debug/
*.onnx
*.pt
*.pth
*.safetensors
*.ckpt
*.engine
*.bin
```

## Optional Multimodal / Provider Integration

The backend includes provider abstractions for advisory multimodal analysis and garment-mask experimentation. Secrets must remain in backend process environment variables and must never be embedded in frontend code, Electron resources, Git history, screenshots, or logs.

The RunningHub OpenAI-compatible VLM path is documented in:

- [`docs/runninghub-llm-vlm-integration.md`](docs/runninghub-llm-vlm-integration.md)
- [`docs/runninghub-live-verification.md`](docs/runninghub-live-verification.md)
- [`docs/runninghub-vlm-multi-sample-regression.md`](docs/runninghub-vlm-multi-sample-regression.md)
- [`docs/runninghub-ai-mask-pipeline.md`](docs/runninghub-ai-mask-pipeline.md)

Provider output remains advisory unless it passes through the existing user-confirmed ROI / mask flow.

## Validation

Frontend build:

```bash
npm run build
```

Export verification:

```bash
npm run verify:export
```

Backend syntax check example:

```powershell
cd ai-server
.venv\Scripts\python.exe -m py_compile main.py segmenters\lightweight_segmenter.py segmenters\onnx_utils.py
```

Additional backend verification utilities are available under `ai-server/scripts/`.

`npm run verify:export` currently checks behavior including:

- download naming and JPEG output
- ZIP structure and filenames
- missing-mask batch skip behavior
- original export dimensions
- 2K long edge at `2048`
- 4K long edge at `4096`
- aspect-ratio preservation

The release-acceptance checklist is maintained at:

- [`docs/e2e-release-acceptance-checklist.md`](docs/e2e-release-acceptance-checklist.md)

## Known Limitations

- Real browser E2E with live FastAPI, local models, uploads, ROI editing, visual comparison, and downloaded outputs still benefits from manual release verification.
- Segmentation quality depends on the model, labels, preprocessing, image composition, and garment category.
- Hangers, metal clips, edge-touching garments, closeups, and complex backgrounds may require manual mask correction.
- The repository does not ship model weights.
- Project save/restore, cloud storage, and collaboration are not implemented.
- Current export output is JPEG; PNG/WebP export options are not yet implemented.
- Very large browser-side batches may create memory pressure.
- 2K / 4K resizing cannot create genuine source detail that was not present in the original image.

## Contributing

Contributions are welcome, especially around segmentation quality, difficult-case mask handling, color-transfer fidelity, performance, tests, documentation, accessibility, and packaging.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a substantial pull request.

Good first contribution areas include:

- improving docs and setup clarity
- adding reproducible regression cases using non-sensitive assets
- improving mask-quality diagnostics
- profiling large-image or batch performance
- improving accessibility and localization
- evaluating model-agnostic segmentation adapters

## Security

Please read [`SECURITY.md`](SECURITY.md) before reporting a vulnerability. Do not publish real API keys, access tokens, private customer images, or sensitive local paths in issues or pull requests.

## Community

Project interactions are governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Deployment

The frontend can be deployed as a Vite static application to services such as Vercel, Netlify, or GitHub Pages. Remote AI segmentation requires a separately available FastAPI backend and a configured `VITE_AI_SEGMENTATION_API`.

A static-only deployment can still support workflows that do not require the remote ONNX segmentation service.

## Project Status

This is an actively developed open-source project. The current positioning is **AI-assisted recognition + human-confirmed mask workflow**, not fully automatic garment recognition.

The project prioritizes reproducibility, explicit safety boundaries, and product-detail preservation over forcing every image through an automatic AI path.

## License

Licensed under the [MIT License](LICENSE).

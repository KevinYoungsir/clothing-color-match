# Clothing Color Match Studio

Clothing Color Match Studio is a garment color calibration tool for product photos, sample photos, hanger shots, model photos, and fabric/detail images. The goal is to match a target garment to a reference garment color while preserving texture, folds, lighting, patterns, shadows, and fabric detail.

The current project is no longer a pure frontend MVP. It includes a React/Vite frontend and an optional FastAPI AI mask server with a lightweight ONNX garment segmentation path. The frontend can still run without the AI server by using manual masks or safe traditional fallback paths, but the current remote-AI workflow is designed around the FastAPI `/segment-garment` service.

## Project Overview

- Upload a reference image and define the reference garment region.
- Upload one or more target garment images.
- Generate or edit a target mask using manual drawing, traditional segmentation, or remote AI segmentation.
- Apply Lab-based color transfer only inside valid garment masks.
- Block unreliable AI masks before they enter color transfer.
- Export a single image or batch ZIP in original size, 2K, or 4K.

## Current Architecture

```txt
React / Vite / TypeScript frontend
  -> Canvas preview, ROI/mask editing, Lab color transfer, batch export
  -> Remote AI provider via VITE_AI_SEGMENTATION_API

FastAPI ai-server
  -> /health
  -> /segment-garment
  -> Pluggable segmenters: mock, lightweight ONNX, sam2 placeholder
  -> ROI-first inference, postprocess, and mask quality gates

Local model files
  -> ai-server/models/model.onnx
  -> ignored by Git
```

The current stable safety baseline is documented around `stable-frontend-color-transfer-safety-20260616`.

## Features

- Reference image upload and reference mask selection.
- Target image batch upload with per-image mask state.
- Manual mask editing with brush, eraser, undo, redo, clear, opacity, and feather controls.
- Remote AI garment segmentation through the FastAPI server.
- Lightweight ONNX segmentation with configurable labels, input size, normalization, thresholding, gamma, blur, ROI-first inference, and candidate scoring.
- ROI / promptBox support for target masks.
- Safety gates for `roi_too_wide`, `over_coverage`, `partial`, `low_confidence`, sparse candidates, low fill ratio, and risky boundary contact.
- Target remote-AI failures do not silently enter unsafe traditional fallback.
- ROI / mask changes clear stale `processedImages` / `adjustedImages` results before export reuse.
- Lab color transfer that primarily migrates a/b color channels and preserves target luminance/texture.
- Manual image adjustments for brightness, contrast, saturation, hue, exposure, shadows, highlights, white balance, color temperature, color strength, and texture preservation.
- Single, left/right, and split comparison preview modes.
- Single image download.
- Batch ZIP download.
- Original / 2K / 4K export with aspect-ratio preservation.

## Frontend Setup

Install frontend dependencies:

```bash
npm install
```

Create a local frontend environment file when using the remote AI server:

```txt
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
```

Run the frontend:

```bash
npm run dev
```

The Vite URL is usually:

```txt
http://localhost:5173
```

Restart `npm run dev` after changing `.env` or `.env.local`.

## Backend AI Server Setup

The backend lives in `ai-server/` and is a FastAPI service.

Create and activate a Python 3.11 or 3.12 virtual environment:

```powershell
cd "D:\Color Calibration\ai-server"
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

For real lightweight ONNX inference, install the optional lightweight dependency set:

```powershell
pip install -r requirements-lightweight.txt
```

Start the AI server in lightweight mode:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
uvicorn main:app --reload --port 8000
```

Check the server:

```powershell
curl.exe http://localhost:8000/health
```

`GET /segment-garment` in a browser returns Method Not Allowed because the endpoint expects `POST` image uploads.

## Model Setup

Real model files are not included in the repository.

Recommended local model path:

```txt
ai-server/models/model.onnx
```

You can also keep the model outside the repo and point to it with:

```powershell
$env:AI_LIGHTWEIGHT_MODEL_PATH="D:\path\to\model.onnx"
```

Model files must not be committed. Keep these local:

- `ai-server/models/`
- `*.onnx`
- `*.pt`
- `*.pth`
- `*.safetensors`
- `*.ckpt`
- `*.engine`
- `*.bin`

## Environment Variables

Frontend:

```txt
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
VITE_MULTIMODAL_ANALYSIS_API=http://localhost:8000/analyze-garment
```

Backend:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_MASK_THRESHOLD="0.55"
$env:AI_LIGHTWEIGHT_MASK_GAMMA="1.4"
$env:AI_LIGHTWEIGHT_MASK_BLUR="4"
$env:AI_LIGHTWEIGHT_KEEP_COMPONENTS="2"
$env:AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO="0.002"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
$env:AI_MASK_ROI_PADDING_RATIO="0.08"
```

The multimodal analysis UI defaults to the deterministic `mock` provider and does not need a key. The `external` provider skeleton reads configuration only from the backend process environment:

```powershell
$env:MULTIMODAL_AI_PROVIDER="external"
$env:MULTIMODAL_AI_API_KEY="<local-only>"
$env:MULTIMODAL_AI_BASE_URL="<optional>"
$env:MULTIMODAL_AI_MODEL="<optional>"
$env:MULTIMODAL_AI_TIMEOUT_SECONDS="30"
```

Do not put `MULTIMODAL_AI_API_KEY` in Vite variables, frontend source, Git, or Electron resources. The current external provider performs no network request; missing or unavailable configuration returns a safe failure and directs the user to the local AI mask or manual mask.

The optional `runninghub` provider keeps its legacy workflow/app adapter branches network-disabled until their contracts are configured. Its `llm_vlm` branch is a real OpenAI-compatible advisory provider. All `RUNNINGHUB_*` configuration remains backend-only; no RunningHub Key belongs in frontend configuration, Electron resources, Git, README examples, or logs.

RunningHub also supports `RUNNINGHUB_MODEL_TYPE=llm_vlm` for the OpenAI-compatible Vision endpoint. This mode defaults to `https://llm.runninghub.cn/v1` with model `qwen/qwen3.7-plus`, does not require workflow/app/node configuration, and remains disabled unless the backend process explicitly sets `RUNNINGHUB_ENABLE_REAL_CALL=true`. The Key never enters Vite, Electron, Git, or frontend storage; VLM output remains advice that must be confirmed through the existing ROI / mask flow.

Use `ai-server/scripts/verify_runninghub_llm_vlm.py` to validate ready, missing-Key, malformed-JSON, timeout, and success behavior without a real Key or network request. See `docs/runninghub-llm-vlm-integration.md` for setup and failure handling.

Optional debug output:

```powershell
$env:AI_DEBUG_SAVE_MASKS="1"
```

Debug files are written under `ai-server/debug/` and must remain untracked.

## AI Mask, ROI, And Manual Mask Flow

- Reference masks define the garment color source.
- Target masks define where color transfer is allowed.
- Manual masks are always available and are the safest correction path for hard cases.
- Remote AI masks are requested through `VITE_AI_SEGMENTATION_API`.
- Target requests carry `debugRole: "target"` and `sampleId`.
- ROI / promptBox narrows target recognition and enables ROI-first inference in the backend.
- Low-quality target masks are blocked with qualities such as `partial`, `low_confidence`, `over_coverage`, or `roi_too_wide`.
- Blocked or failed target masks must not enter `colorTransfer`.
- If a target mask is blocked, the user should adjust ROI or manually edit the mask.

## Color Transfer Safety

`colorTransfer` only operates on valid mask pixels in garment mode:

- Missing target mask in non-full-image mode throws instead of processing the whole image.
- Mask size mismatch throws.
- Pixels with mask alpha / weight `0` are not modified.
- Reference and target masks are checked before Lab transfer.
- ROI / mask edits clear old processed and adjusted results so batch export does not reuse stale output.

## Development Workflow

Typical local remote-AI workflow uses two terminals.

Backend terminal:

```powershell
cd "D:\Color Calibration\ai-server"
.venv\Scripts\activate
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
uvicorn main:app --reload --port 8000
```

Frontend terminal:

```powershell
cd "D:\Color Calibration"
npm run dev
```

Then open:

```txt
http://localhost:5173
```

## Validation Commands

Frontend build:

```bash
npm run build
```

Export verification:

```bash
npm run verify:export
```

Backend syntax check:

```powershell
cd ai-server
.venv\Scripts\python.exe -m py_compile main.py segmenters\lightweight_segmenter.py segmenters\onnx_utils.py
```

Backend environment and model checks:

```powershell
cd ai-server
python scripts/check_environment.py
python scripts/inspect_onnx_model.py --model-path "models\model.onnx"
python scripts/verify_lightweight.py --model-path "models\model.onnx"
```

Real image mask verification:

```powershell
python scripts\verify_lightweight_image.py `
  --model-path "models\model.onnx" `
  --image-path "test-assets\sample-garment.jpg" `
  --labels 4,5,6,7 `
  --output "debug\lightweight-mask.png"
```

## Export Verification

`npm run verify:export` checks:

- Single download naming and JPEG output.
- ZIP structure and filenames.
- Missing-mask batch skip behavior.
- Original export dimensions.
- 2K long edge at `2048`.
- 4K long edge at `4096`.
- Aspect-ratio preservation.

## Safety Notes

- Do not weaken ROI safety gates to make a case pass.
- Difficult cases may correctly return `partial`, `low_confidence`, `over_coverage`, or `roi_too_wide`.
- A safe failure is preferable to an incorrect color transfer.
- Hanger, metal clip, edge-touching, complex background, and closeup images still need human review when masks are visually ambiguous.
- No-ROI success on high-risk images should be manually inspected before production export.
- If a result looks wrong, edit the mask manually instead of forcing AI success.
- Multimodal analysis provides category, risk, and ROI suggestions only. It never writes the final mask or directly enters color transfer.

## Known Limitations

- Full browser E2E with live FastAPI, real `model.onnx`, real uploads, ROI drawing, previews, and downloaded images still needs manual release verification.
- The current model and label map are local assumptions; another model may require different labels or preprocessing.
- The app does not include project save / restore, cloud storage, or collaboration.
- Current export output is JPEG; PNG/WebP export options are not implemented.
- Batch processing still runs in the browser and can have memory pressure on very large images.
- 2K / 4K upscaling preserves aspect ratio but cannot create real detail beyond the source image.

## Git Ignore / Do Not Commit

Do not commit:

- `.env.local`
- `dist/`
- `node_modules/`
- `ai-server/.venv/`
- `ai-server/models/`
- `ai-server/test-assets/`
- `ai-server/debug/`
- `*.onnx`
- `*.pt`
- `*.pth`
- `*.safetensors`
- `*.ckpt`
- `*.engine`
- `*.bin`
- `__pycache__/`
- `*.pyc`

## Release Acceptance Status

Latest release acceptance checklist:

- `docs/e2e-release-acceptance-checklist.md`

Current validation baseline:

- `npm run build`
- `npm run verify:export`
- Backend `py_compile` for key AI server files

Before a release, also run a manual browser E2E pass with:

1. Frontend on `http://localhost:5173`.
2. FastAPI server on `http://localhost:8000`.
3. Local ONNX model at `ai-server/models/model.onnx` or a configured external path.
4. Representative white-background, hanger, closeup, edge-touching, and complex-background images.
5. Manual inspection of masks, previews, and downloaded files.

## Deployment

The frontend can still be deployed as a Vite static app to Vercel, Netlify, or GitHub Pages. Remote AI segmentation requires a separately deployed FastAPI service and a configured `VITE_AI_SEGMENTATION_API`.

For static-only deployments without the AI server, users can still use manual masks and safe traditional segmentation paths, but real ONNX remote-AI segmentation will not be available.

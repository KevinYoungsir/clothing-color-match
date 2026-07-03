# AI Segmentation Server

This optional FastAPI service powers remote garment mask generation for the frontend. It includes a pluggable segmenter registry, a mock segmenter for local safety checks, a real lightweight ONNX adapter, and a SAM2 placeholder. It does not include, download, or commit any model file.

## Segmenter Architecture

The server uses a small pluggable segmenter registry under `segmenters/`.

- `segmenters/base.py` defines `SegmentInput`, `SegmentResult`, and `BaseSegmenter`.
- `segmenters/mock_segmenter.py` implements the ROI-based mock behavior.
- `segmenters/lightweight_segmenter.py` implements the guarded lightweight ONNX garment segmentation adapter.
- `segmenters/sam2_segmenter.py` reserves a future high-precision SAM2 adapter.
- `segmenters/registry.py` exposes `get_segmenter(name)`.

The default segmenter is `mock`. You can select it explicitly:

```powershell
$env:AI_SEGMENTER="mock"
```

The `lightweight` segmenter contains the current generic ONNX inference adapter for a local garment segmentation model:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="path\to\model.onnx"
```

If `AI_LIGHTWEIGHT_MODEL_PATH` is missing or points to a missing file, `/segment-garment` returns `success: false` with a clear message. If ONNX dependencies are missing, the model cannot load, or the first output cannot be parsed as a mask, it also returns `success: false` so the frontend can fall back to traditional segmentation. It does not fall back to a full-image mask or generate a fake garment mask.

The `sam2` segmenter is registered as a placeholder for future high-precision SAM2 garment segmentation. It does not import torch or load a real SAM2 model yet:

```powershell
$env:AI_SEGMENTER="sam2"
$env:AI_SAM2_CHECKPOINT="path\to\sam2_checkpoint.pt"
$env:AI_SAM2_CONFIG="path\to\sam2_config.yaml"
```

If `AI_SAM2_CHECKPOINT` or `AI_SAM2_CONFIG` is missing, or either path does not exist, `/segment-garment` returns `success: false` with a clear message. It does not fall back to a full-image mask or generate a fake garment mask.

Future implementations can add model-specific lightweight adapters or real `sam2` inference without changing the frontend `/segment-garment` contract.

## Mask Postprocessing

`segmenters/postprocess.py` contains shared mask postprocessing helpers.

- If `roi` or `promptBox` is provided, every pixel outside that rectangle is forced to black.
- If a model returns a mask with a different size from the input image, the mask is resized safely with nearest-neighbor sampling.
- If no `roi` or `promptBox` is provided, postprocessing does not create a new full-image mask.

This keeps lightweight or SAM/SAM2 segmenters from accidentally returning a whole-image garment mask when the user has provided a tighter garment region.

## Real Model Dependencies

Do not install heavyweight inference dependencies for the mock server. The lightweight ONNX path uses optional dependencies such as `onnxruntime` and `numpy`. A future SAM/SAM2 segmenter may add PyTorch-related packages such as `torch`, `torchvision`, and `sam2`. Model files must not be committed to the repo.

## Python Version and Lightweight Dependencies

Use Python 3.11 or 3.12 for real lightweight ONNX inference work. Python 3.14 is not recommended for this stage because some AI inference packages may not publish compatible wheels yet.

The base mock server stays intentionally small:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

When running lightweight ONNX inference, install the optional lightweight dependency set separately:

```powershell
pip install -r requirements-lightweight.txt
```

`requirements-lightweight.txt` currently reserves:

- `onnxruntime` for ONNX model inference.
- `numpy` for tensor and mask array processing.
- `opencv-python-headless` as a commented optional helper for future preprocessing.

You can check the local Python environment without installing anything:

```powershell
python scripts/check_environment.py
```

Missing lightweight dependencies are reported as informational warnings until you intentionally enable real lightweight ONNX inference.

## Lightweight ONNX Inference

The `lightweight` segmenter is a generic ONNX adapter. It is guarded by quality gates and may still require model-specific labels or preprocessing for a new model. It:

- Reads `AI_LIGHTWEIGHT_MODEL_PATH`.
- Imports `onnxruntime` and `numpy` only when `AI_SEGMENTER=lightweight` is used.
- Loads the ONNX model with CPU execution.
- Reads the first model input and supports static 4D NCHW / NHWC image tensors, plus dynamic NCHW tensors such as `[batch_size, num_channels, height, width]`.
- Resizes the image to the configured input size and converts it to an RGB float32 tensor in the 0-1 range.
- Runs `session.run`.
- Tries to parse the first output as a binary / two-class mask, or as multi-class logits `[1, num_labels, height, width]`.
- Converts multi-class logits to a soft garment mask with softmax probabilities and `AI_LIGHTWEIGHT_CLOTHING_LABELS`.
- Returns `success: false` if the model output shape cannot be safely interpreted.
- Sends successful masks through `segmenters/postprocess.py`, so `roi` / `promptBox` can still force pixels outside the selected region to black.

Install the optional dependencies before trying a real lightweight ONNX model:

```powershell
pip install -r requirements.txt
pip install -r requirements-lightweight.txt
```

Configure the segmenter:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="ai-server\models\garment.onnx"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_MASK_THRESHOLD="0.55"
$env:AI_LIGHTWEIGHT_MASK_GAMMA="1.4"
$env:AI_LIGHTWEIGHT_MASK_BLUR="4"
$env:AI_LIGHTWEIGHT_KEEP_COMPONENTS="2"
$env:AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO="0.002"
$env:AI_LIGHTWEIGHT_BODY_FILTER="1"
$env:AI_LIGHTWEIGHT_BODY_KEEP_COMPONENTS="2"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
$env:AI_LIGHTWEIGHT_TARGET_SEMANTIC_FLOOR="0.55"
$env:AI_DEBUG_SAVE_MASKS="1"
$env:AI_MASK_ROI_PADDING_RATIO="0.08"
```

`AI_LIGHTWEIGHT_INPUT_SIZE` defaults to `512` when the model uses dynamic height / width. `AI_LIGHTWEIGHT_CLOTHING_LABELS` defaults to `4,5,6,7`; adjust it to match the selected model label map. If the adapter returns "未检测到服装类别", the model may be working but the clothing label ids likely need to be changed.

`AI_LIGHTWEIGHT_MASK_THRESHOLD` defaults to `0.55`; probabilities below the threshold are forced to transparent so low-confidence background pixels do not participate in color transfer. Pixels above the threshold are remapped with `AI_LIGHTWEIGHT_MASK_GAMMA` (default `1.4`) before becoming alpha, which suppresses weak edges while keeping strong garment pixels. `AI_LIGHTWEIGHT_MASK_BLUR` defaults to `4` pixels and only softens the final alpha edge.

`AI_LIGHTWEIGHT_KEEP_COMPONENTS` defaults to `2`, and `AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO` defaults to `0.002`. The lightweight adapter removes tiny connected components after thresholding to reduce hanger, table, and background leakage. Increase `KEEP_COMPONENTS` only when a garment is split into multiple real parts.

`AI_LIGHTWEIGHT_BODY_FILTER` defaults to enabled. It scores connected components by garment-body shape and position, then removes top-heavy, thin horizontal artifacts such as hangers or bars before the final component filtering step. General masks keep up to two components, while the target close-up candidate path keeps the highest-scoring garment body component to avoid isolated hanger, clip, and support responses.

The target close-up candidate path uses ImageNet mean / std normalization by default, while the existing reference path remains unchanged. Set `AI_LIGHTWEIGHT_TARGET_NORMALIZATION=zero-one` only for a model that explicitly expects unnormalized 0-1 RGB.

For multiclass logits, target masks also use the model's argmax clothing-class support to calibrate the soft probability map. `AI_LIGHTWEIGHT_TARGET_SEMANTIC_FLOOR` defaults to `0.55`, and non-clothing responses are reduced by `AI_LIGHTWEIGHT_TARGET_BACKGROUND_SCALE` (default `0.25`). This fills low-confidence gaps inside a garment prediction without converting the ROI rectangle into a mask.

The target close-up candidate path evaluates thresholds `0.25,0.35,0.45,0.55,0.65,0.70,0.75,0.78,0.82,0.86` on the same ONNX probability output. It runs ONNX once, scores candidates at reduced resolution, and only builds the selected full-resolution mask. Candidate acceptance uses the same width, border-contact, and bbox-area limits as the final target safety gate, so a lower-threshold over-coverage candidate cannot hide a safer high-threshold candidate.

When `AI_DEBUG_SAVE_MASKS` is enabled, the lightweight API writes the exact returned RGBA masks to role-specific debug files:

- `debug/api-return-reference-mask.png`
- `debug/api-return-reference-mask.json`
- `debug/api-return-target-mask-<sampleId>.png`
- `debug/api-return-target-mask-<sampleId>.json`

The JSON sidecar records role, sample id, input image size, output mask size, labels, foreground ratio, bbox, message, and success. These files are ignored by Git and are intended for comparing the backend response against frontend decoded masks.

`AI_MASK_ROI_PADDING_RATIO` defaults to `0.08` for real lightweight / SAM2 segmenters. It applies a soft edge inside the user ROI; pixels outside the ROI remain black. Keep ROI boxes loose enough to include garment edges.

The reference path keeps the existing RGB 0-1 preprocessing. The close-up target path defaults to ImageNet mean / std normalization because the current `pixel_values` SegFormer-style model expects it. Both modes remain configurable for another model.

You can verify the lightweight safety paths without a real model:

```powershell
python scripts/verify_lightweight.py
```

You can inspect a local ONNX model contract before wiring it into the segmenter:

```powershell
python scripts/inspect_onnx_model.py --model-path "ai-server\models\garment.onnx"
```

The inspector prints input/output names, shapes, types, provider information, and whether the current generic adapter is likely compatible. It does not run image inference or generate a mask. The lightweight adapter supports static 4D NCHW / NHWC inputs and dynamic NCHW inputs that can run at `AI_LIGHTWEIGHT_INPUT_SIZE`. If the model needs custom normalization, a non-mask output, or different garment label ids, a model-specific follow-up may still be needed.

To verify a missing model path explicitly:

```powershell
python scripts/verify_lightweight.py --model-path ai-server\models\garment.onnx --expect-missing-model
```

After a real ONNX model is available locally, the same script can check whether the adapter returns either a safe failure or an ROI-limited mask:

```powershell
python scripts/verify_lightweight.py --model-path ai-server\models\garment.onnx
```

To run the lightweight adapter against a real garment image and save a local debug mask:

```powershell
python scripts/verify_lightweight_image.py `
  --model-path models\model.onnx `
  --image-path test-assets\sample-garment.jpg `
  --labels 4,5,6,7 `
  --output debug\lightweight-mask.png
```

Use `--roi x,y,width,height` when you want to verify that postprocessing forces pixels outside the selected region to black:

```powershell
python scripts/verify_lightweight_image.py `
  --model-path models\model.onnx `
  --image-path test-assets\sample-garment.jpg `
  --labels 4,5,6,7 `
  --roi 100,80,600,900 `
  --output debug\lightweight-mask.png
```

The script prints `success`, the segmenter message, mask size, foreground pixel count, and foreground ratio. If no clothing class is detected, it reports the labels used and suggests checking the label map or model normalization. Keep `test-assets/` and `debug/` files local; they are ignored by Git.

To diagnose a real model label map and the mask postprocessing stages, export per-label masks:

```powershell
python scripts/inspect_label_masks.py `
  --model-path models\model.onnx `
  --image-path test-assets\sample-garment.jpg `
  --labels 4,5,6,7 `
  --inspect-labels 4,5,6,7 `
  --roi 100,80,600,900 `
  --output-dir debug\label-masks
```

The script limits inspection to the explicitly listed label ids, runs ONNX once, and writes `probability.png` plus `mask.png` under each `label-XX/` directory. It also writes these combined-stage masks:

- `combined-raw-probability.png`
- `combined-threshold.png`
- `combined-body-filter.png`
- `combined-components.png`
- `combined-final-crop.png`
- `combined-postprocess-production.png`
- `combined-postprocess-expanded-roi.png`

It prints each stage's foreground ratio, bbox ratios, alpha min / max / mean, border touch status, component diagnostics, selected candidate, and candidate scoring time. Environment overrides are cleared unless passed through script arguments, so repeated tests are reproducible. Use this before changing color transfer when the frontend targetMask contains only small isolated blocks.

## Multi-garment Mask Evaluation

The repeatable test matrix and manual acceptance checklist are documented in
[`docs/multi-garment-mask-evaluation.md`](../docs/multi-garment-mask-evaluation.md).
This evaluation records when a category may safely return `success` and when it
must stop with `partial`, `low_confidence`, `over_coverage`, or
`roi_too_wide`. It does not weaken the existing mask quality gates.

Keep local test images under an ignored directory such as `test-assets/`. Use a
stable case id that includes the garment category, image type, and sequence
number.

Run the production lightweight target path and save a structured result:

```powershell
python scripts/verify_lightweight_image.py `
  --model-path models\model.onnx `
  --image-path test-assets\trouser_whitebg_001.jpg `
  --case-id trouser_whitebg_001 `
  --category trouser `
  --image-type whitebg `
  --expected-result success `
  --summary-json debug\multi-garment\trouser_whitebg_001\summary.json `
  --output debug\multi-garment\trouser_whitebg_001\mask.png
```

The summary JSON includes the actual result, quality, foreground ratio, bbox,
ROI diagnostics, selected candidate, candidate scoring time, ONNX run count,
and a comparison suggestion against the expected result. The suggestion is
diagnostic only; the mask still requires visual review.

Use the label inspector when a mask includes a hanger, metal bar, clip,
background, skin, or an inner layer:

```powershell
python scripts/inspect_label_masks.py `
  --model-path models\model.onnx `
  --image-path test-assets\trouser_hanger_002.jpg `
  --case-id trouser_hanger_002 `
  --category trouser `
  --image-type hanger `
  --labels 4,5,6,7 `
  --inspect-labels 4,5,6,7
```

With `--case-id`, the default output directory is
`debug/multi-garment/<case-id>/`. It contains per-label masks, combined stage
PNGs, and `inspection-summary.json`. ONNX still runs once.

Review the mask PNGs together with the JSON summaries. A `success` result
passes only when the garment body is covered continuously without background
or prop contamination and without visible color blocks. A difficult case that
returns the expected safe failure is also a passing evaluation. Unreliable
masks must not enter color transfer.

To compare the backend mask with the frontend decoded mask, enable frontend decoded-mask downloads in the browser console before running remote AI segmentation:

```js
localStorage.setItem("debugRemoteMaskDownload", "1")
```

Then retry remote AI recognition. The browser downloads `decoded-target-mask-<sampleId>.png` or `decoded-reference-mask.png`. Compare target masks with `debug/api-return-target-mask-<sampleId>.png`, the right-panel `target-mask-debug-<sampleId>.png`, and `applied-mask-debug-<sampleId>.png`. Compare reference masks separately with `debug/api-return-reference-mask.png` and `reference-mask-debug.png`. Disable it after diagnosis:

```js
localStorage.removeItem("debugRemoteMaskDownload")
```

For diagnosis only, you can temporarily relax mask filtering to see whether the garment body is being removed by thresholding or component filtering:

```powershell
python scripts/inspect_label_masks.py `
  --model-path models\model.onnx `
  --image-path test-assets\sample-garment.jpg `
  --labels 4,5,6,7 `
  --threshold 0.30 `
  --gamma 1.0 `
  --keep-components 10 `
  --min-component-ratio 0 `
  --output-dir debug\label-masks-relaxed
```

If pants are not represented by labels `4,5,6,7`, update `AI_LIGHTWEIGHT_CLOTHING_LABELS` to the label ids whose per-label masks cover the garment body. Do not commit anything under `debug/`, `test-assets/`, or `models/`.

If you start FastAPI with `AI_SEGMENTER=lightweight`, you can also point the script at the running server:

```powershell
python scripts/verify_lightweight.py --base-url http://localhost:8000
```

Model files must stay out of Git.

## Real Model File Management

Real model files should not be committed to GitHub.

The recommended local model directory is:

```txt
ai-server/models/
```

You can also keep model files outside the repository and point the server to them with environment variables.

Lightweight mode example:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="ai-server\models\garment.onnx"
```

SAM2 mode example:

```powershell
$env:AI_SEGMENTER="sam2"
$env:AI_SAM2_CHECKPOINT="path\to\sam2_checkpoint.pt"
$env:AI_SAM2_CONFIG="path\to\sam2_config.yaml"
```

The `sam2` segmenter is still a placeholder in the current codebase. The `lightweight` segmenter has a generic ONNX inference adapter, but no model file is included.

## Setup

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Frontend Config

Create or update the frontend `.env` file:

```txt
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
VITE_MULTIMODAL_ANALYSIS_API=http://localhost:8000/analyze-garment
```

Restart the Vite dev server after changing `.env`.

The timeout is configurable because the first lightweight ONNX request may need
to load the model before inference. The backend caches the ONNX Runtime session
by model path and file metadata, so later requests reuse the loaded session.

## Local Verification

Start the backend first:

```powershell
uvicorn main:app --reload --port 8000
```

Then run the verification script from the `ai-server/` directory:

```powershell
python scripts/verify_segment.py
```

For lightweight ONNX safety checks, run:

```powershell
python scripts/check_environment.py
python scripts/inspect_onnx_model.py --model-path "ai-server\models\garment.onnx"
python scripts/verify_lightweight.py
```

You can also point it at another local server:

```powershell
python scripts/verify_segment.py --base-url http://localhost:8000
```

The script checks:

- `/health` returns `{ "ok": true }`.
- `/segment-garment` accepts a PNG image and ROI.
- ROI mock mask dimensions match the input image.
- ROI pixels are white and pixels outside ROI are black.
- A request without ROI returns `success: false`.

## Endpoints

### `GET /health`

Returns:

```json
{
  "ok": true
}
```

### `POST /analyze-garment`

This endpoint provides multimodal garment analysis suggestions separately from pixel-level segmentation. Form fields:

- `image`: uploaded image file.
- `role`: `source` or `target`.
- `roi`: optional JSON `x/y/width/height`.
- `provider`: `mock` (default), `external`, or `runninghub`.

The deterministic `mock` provider needs no API Key. The `external` skeleton reads only backend environment variables:

```powershell
$env:MULTIMODAL_AI_PROVIDER="external"
$env:MULTIMODAL_AI_API_KEY="<local-only>"
$env:MULTIMODAL_AI_BASE_URL="<optional>"
$env:MULTIMODAL_AI_MODEL="<optional>"
$env:MULTIMODAL_AI_TIMEOUT_SECONDS="30"
```

Never expose the Key through Vite variables or frontend code. This phase intentionally makes no external network request. Missing Key, timeout, invalid response, and disabled-provider paths return `success: false`, `recommendManualMask: true`, and `shouldApplyDirectlyToColorTransfer: false`. Continue with the local AI mask or manual mask.

`provider=runninghub` adds a RunningHub-specific provider. Its legacy `workflow`, `aiapp`, and `standard` adapter branches remain network-disabled until their submit/poll contracts are configured. The `llm_vlm` branch is a real OpenAI-compatible advisory provider and is independently opt-in.

Set `RUNNINGHUB_MODEL_TYPE=llm_vlm` to use the OpenAI-compatible Vision branch. It reads `RUNNINGHUB_LLM_BASE_URL` (default `https://llm.runninghub.cn/v1`), `RUNNINGHUB_LLM_MODEL` (default `qwen/qwen3.7-plus`), `RUNNINGHUB_LLM_MAX_TOKENS` (default `2048`), and `RUNNINGHUB_LLM_TEMPERATURE` (default `0.1`). Real calls remain disabled unless `RUNNINGHUB_ENABLE_REAL_CALL=true`. This branch sends an in-memory JPEG data URL, requests strict JSON, and does not require workflow ID, app ID, nodeInfoList, submit endpoint, or poll endpoint.

Install `requirements-desktop.txt` for the optional `openai` Python client. Missing client, timeout, request errors, non-JSON, missing fields, invalid types, or out-of-bounds ROI values fail safely and direct the user to the local AI mask or manual mask. Never put `RUNNINGHUB_API_KEY` in frontend or Electron configuration.

Run the deterministic five-state check without a real Key or network request:

```powershell
cd "D:\Color Calibration\ai-server"
.venv-desktop\Scripts\python.exe scripts\verify_runninghub_llm_vlm.py
```

See `docs/runninghub-llm-vlm-integration.md` for the full request contract and safety boundary.

### `POST /segment-garment`

Form fields:

- `image`: uploaded image file.
- `roi`: optional JSON string, for example `{"x":100,"y":80,"width":320,"height":480}`.
- `promptBox`: optional JSON string. The mock server treats it like `roi`.
- `promptPoints`: optional JSON string, reserved for future prompt-based segmentation.
- `debugRole`: optional debug role, `reference` or `target`.
- `sampleId`: optional frontend sample id used only for target debug filenames.
- `imageWidth` / `imageHeight`: optional original image size used for debug sidecar metadata.

Success response:

```json
{
  "success": true,
  "mask": "base64 png",
  "confidence": 0.5,
  "message": "mock mask"
}
```

Failure response:

```json
{
  "success": false,
  "message": "需要 roi 或真实 AI 模型"
}
```

## Mock Mask Rule

When `roi` or `promptBox` is provided, the service returns a same-size PNG mask: the selected rectangle is white and every other pixel is black. Without `roi` or `promptBox`, the service returns `success: false` with `需要 roi 或真实 AI 模型`.

# AI Segmentation Server Mock

This optional FastAPI service is a skeleton for future SAM / SAM2 / garment segmentation integration. It does not include or download any AI model.

## Segmenter Architecture

The server uses a small pluggable segmenter registry under `segmenters/`.

- `segmenters/base.py` defines `SegmentInput`, `SegmentResult`, and `BaseSegmenter`.
- `segmenters/mock_segmenter.py` implements the current ROI-based mock behavior.
- `segmenters/lightweight_segmenter.py` reserves a future lightweight garment segmentation adapter.
- `segmenters/sam2_segmenter.py` reserves a future high-precision SAM2 adapter.
- `segmenters/registry.py` exposes `get_segmenter(name)`.

The default segmenter is `mock`. You can select it explicitly:

```powershell
$env:AI_SEGMENTER="mock"
```

The `lightweight` segmenter contains a generic ONNX inference skeleton for a future small garment segmentation model:

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

Future implementations can add real `lightweight` or `sam2` inference without changing the frontend `/segment-garment` contract.

## Mask Postprocessing

`segmenters/postprocess.py` contains shared mask postprocessing helpers.

- If `roi` or `promptBox` is provided, every pixel outside that rectangle is forced to black.
- If a model returns a mask with a different size from the input image, the mask is resized safely with nearest-neighbor sampling.
- If no `roi` or `promptBox` is provided, postprocessing does not create a new full-image mask.

This keeps future lightweight or SAM/SAM2 segmenters from accidentally returning a whole-image garment mask when the user has provided a tighter garment region.

## Future Real Model Dependencies

Do not install heavyweight inference dependencies for the mock server. A future real lightweight segmenter may add dependencies such as `onnxruntime`, and a SAM/SAM2 segmenter may add PyTorch-related packages such as `torch`, `torchvision`, and `sam2`. Those should be introduced only with the real model integration task, and model files must not be committed to the repo.

## Python Version and Lightweight Dependencies

Use Python 3.11 or 3.12 for real lightweight ONNX inference work. Python 3.14 is not recommended for this stage because some AI inference packages may not publish compatible wheels yet.

The base mock server stays intentionally small:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

When starting the future lightweight ONNX integration task, install the optional lightweight dependency set separately:

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

## Lightweight ONNX Inference Skeleton

The `lightweight` segmenter is a generic ONNX adapter, not a model-specific implementation yet. It:

- Reads `AI_LIGHTWEIGHT_MODEL_PATH`.
- Imports `onnxruntime` and `numpy` only when `AI_SEGMENTER=lightweight` is used.
- Loads the ONNX model with CPU execution.
- Reads the first model input and supports static 4D NCHW or NHWC image tensors.
- Resizes the image to the model input size and converts it to a float32 tensor.
- Runs `session.run`.
- Tries to parse the first output as a binary or two-class mask.
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
```

Because model input and output conventions vary, a future model-specific adapter may still be needed after the first real model is selected.

You can verify the lightweight safety paths without a real model:

```powershell
python scripts/verify_lightweight.py
```

You can inspect a local ONNX model contract before wiring it into the segmenter:

```powershell
python scripts/inspect_onnx_model.py --model-path "ai-server\models\garment.onnx"
```

The inspector prints input/output names, shapes, types, provider information, and whether the current generic skeleton is likely compatible. It does not run image inference or generate a mask. If the input is not static 4D NCHW / NHWC, or if the output is not a 2D/3D/4D mask-like tensor, a future model-specific adapter will likely be needed.

To verify a missing model path explicitly:

```powershell
python scripts/verify_lightweight.py --model-path ai-server\models\garment.onnx --expect-missing-model
```

After a real ONNX model is available locally, the same script can check whether the adapter returns either a safe failure or an ROI-limited mask:

```powershell
python scripts/verify_lightweight.py --model-path ai-server\models\garment.onnx
```

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

The `sam2` segmenter is still a placeholder in the current codebase. The `lightweight` segmenter has a generic ONNX inference skeleton, but no model file is included.

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
```

Restart the Vite dev server after changing `.env`.

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

### `POST /segment-garment`

Form fields:

- `image`: uploaded image file.
- `roi`: optional JSON string, for example `{"x":100,"y":80,"width":320,"height":480}`.
- `promptBox`: optional JSON string. The mock server treats it like `roi`.
- `promptPoints`: optional JSON string, reserved for future prompt-based segmentation.

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

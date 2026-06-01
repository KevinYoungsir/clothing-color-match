# AI Segmentation Server Mock

This optional FastAPI service is a skeleton for future SAM / SAM2 / garment segmentation integration. It does not include or download any AI model.

## Segmenter Architecture

The server uses a small pluggable segmenter registry under `segmenters/`.

- `segmenters/base.py` defines `SegmentInput`, `SegmentResult`, and `BaseSegmenter`.
- `segmenters/mock_segmenter.py` implements the current ROI-based mock behavior.
- `segmenters/registry.py` exposes `get_segmenter(name)`.

The default segmenter is `mock`. You can select it explicitly:

```powershell
$env:AI_SEGMENTER="mock"
```

The `lightweight` segmenter is registered as a placeholder for a future small garment segmentation model. It does not run real inference yet:

```powershell
$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="path\to\model.onnx"
```

If `AI_LIGHTWEIGHT_MODEL_PATH` is missing or points to a missing file, `/segment-garment` returns `success: false` with a clear message. It does not fall back to a full-image mask or generate a fake garment mask.

Future implementations can add real `lightweight` or `sam2` inference without changing the frontend `/segment-garment` contract.

## Future Real Model Dependencies

Do not install heavyweight inference dependencies for the mock server. A future real lightweight segmenter may add dependencies such as `onnxruntime`, and a SAM/SAM2 segmenter may add PyTorch-related packages. Those should be introduced only with the real model integration task, and model files must not be committed to the repo.

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

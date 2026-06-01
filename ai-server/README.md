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

Future implementations can add new segmenters such as `lightweight` or `sam2` without changing the frontend `/segment-garment` contract.

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

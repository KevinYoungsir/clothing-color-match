# RunningHub LLM/VLM Advisory Integration

## Purpose

The RunningHub LLM/VLM provider adds garment visual understanding before pixel-level segmentation. It can identify a garment category, describe the subject, flag visual risks, and suggest an ROI. It does not create the final mask and cannot invoke color transfer.

The default OpenAI-compatible endpoint and model are:

- Base URL: `https://llm.runninghub.cn/v1`
- Model: `qwen/qwen3.7-plus`
- API: `client.chat.completions.create(...)`

RunningHub lists this model as supporting image input. The integration therefore sends the uploaded image as an in-memory JPEG data URL and requests one strict JSON object. See the [RunningHub model catalog](https://www.runninghub.cn/call-api/llm/models).

## Environment Variables

All values are read by the FastAPI process. The API Key must never use a `VITE_` prefix or enter frontend/Electron configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `RUNNINGHUB_MODEL_TYPE` | Existing adapter inference | Set to `llm_vlm` |
| `RUNNINGHUB_API_KEY` | Empty | Backend-only RunningHub Key |
| `RUNNINGHUB_LLM_BASE_URL` | `https://llm.runninghub.cn/v1` | OpenAI-compatible base URL |
| `RUNNINGHUB_LLM_MODEL` | `qwen/qwen3.7-plus` | Vision-capable model |
| `RUNNINGHUB_LLM_MAX_TOKENS` | `2048` | Maximum response tokens |
| `RUNNINGHUB_LLM_TEMPERATURE` | `0.1` | Low-variance JSON response |
| `RUNNINGHUB_ENABLE_REAL_CALL` | `false` | Explicit network-call opt-in |
| `RUNNINGHUB_TIMEOUT_SECONDS` | `60` | Request timeout |

PowerShell example:

```powershell
cd "D:\Color Calibration\ai-server"
.venv-desktop\Scripts\activate
pip install -r requirements-desktop.txt

$env:RUNNINGHUB_MODEL_TYPE="llm_vlm"
$env:RUNNINGHUB_API_KEY=Read-Host "RunningHub API Key"
$env:RUNNINGHUB_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_LLM_BASE_URL="https://llm.runninghub.cn/v1"
$env:RUNNINGHUB_LLM_MODEL="qwen/qwen3.7-plus"
uvicorn main:app --port 8000
```

Do not place a real Key in a script, `.env.local`, Git, logs, screenshots, frontend storage, or an Electron resource.

## Request Flow

The frontend calls `POST /analyze-garment` with:

- `image`
- `role=source|target`
- optional `roi`
- `provider=runninghub`

The backend converts the decoded image to RGB JPEG, encodes it as a base64 data URL, and sends a JSON-only prompt through the OpenAI-compatible client. Workflow ID, app ID, node mappings, submit endpoints, and polling endpoints are not required in `llm_vlm` mode.

The required response fields are:

```json
{
  "garmentCategory": "trouser",
  "garmentDescription": "gray hanging trousers",
  "suggestedRoi": { "x": 120, "y": 160, "width": 800, "height": 1200 },
  "confidence": 0.82,
  "riskTags": ["hanger", "metal_clip"],
  "containsHanger": true,
  "containsMetalClip": true,
  "edgeTouching": false,
  "complexBackground": false,
  "recommendManualMask": true,
  "userMessage": "请确认 ROI 和最终蒙版后再校色。"
}
```

The provider validates every required field, boolean type, confidence range, risk-tag list, and ROI bounds against the original image. A malformed or incomplete result is rejected.

RunningHub natural-language categories and risk labels are normalized into stable internal identifiers. The response also includes optional `rawGarmentCategory` and `rawRiskTags` fields for diagnostics. Unknown values become `unknown` or `unknown_risk` instead of leaking arbitrary model text into internal tags.

## Advisory-Only Safety Boundary

`shouldApplyDirectlyToColorTransfer` is always `false`, including successful responses. A suggested ROI can only populate the current target ROI editor state. Applying it clears stale derived results and does not start segmentation or color transfer.

The user must still:

1. Review or adjust the suggested ROI.
2. Run the existing segmentation path.
3. Pass the existing ROI and mask safety gates.
4. Confirm or manually edit the final mask.
5. Start color transfer explicitly.

The provider does not alter segmentation, ROI gates, color transfer, or export behavior.

## Safe Failure Strategy

| Condition | `providerStatus` | Result |
| --- | --- | --- |
| Valid backend configuration | `ready` | Provider is available for a request |
| Missing Key | `missing_api_key` | No request; recommend manual mask |
| Real call disabled | `real_call_disabled` | No request; recommend manual mask |
| Request timeout | `timeout` | Safe failure; recommend manual mask |
| Network/client failure | `request_failed` | Safe failure; recommend manual mask |
| Non-JSON, missing fields, invalid types, or invalid ROI | `invalid_response` | Safe failure; recommend manual mask |
| Valid response | `ready` with `success=true` | Display advice only |

All failures return no suggested ROI, set `recommendManualMask=true`, and retain `shouldApplyDirectlyToColorTransfer=false`. Exceptions do not escape the provider into an unhandled FastAPI error.

## Local Five-State Verification

The deterministic verification script uses an in-process fake OpenAI-compatible client. It never sends a network request and never needs a real Key:

```powershell
cd "D:\Color Calibration\ai-server"
.venv-desktop\Scripts\python.exe scripts\verify_runninghub_llm_vlm.py
```

It verifies:

1. `ready`: valid backend-only configuration.
2. `missing_api_key`: safe failure without a Key.
3. `malformed_json`: invalid response is rejected.
4. `timeout`: timeout is classified and safely handled.
5. `success`: valid JSON produces advisory fields and a bounded suggested ROI.

For a real small-sample check, use only approved non-sensitive images and inspect the advice before applying the ROI. Never treat a successful VLM response as a final mask.

## Frontend Behavior

Select `RunningHub` in the existing multimodal suggestion panel. The panel displays category, description, confidence, risk tags, suggested ROI, the manual-mask recommendation, and the user message.

The **Apply suggested ROI** action writes only the current target ROI. The UI reminds users that AI analysis is advisory and that ROI or manual-mask confirmation is required before color calibration.

## Privacy and Key Handling

Images are sent to a third-party API only when `RUNNINGHUB_ENABLE_REAL_CALL=true`. Confirm internal approval before sending customer, model, brand, or commercial images. Do not log the Key or image data URL. For broader rollout, prefer an internal proxy with access control and redacted logs.

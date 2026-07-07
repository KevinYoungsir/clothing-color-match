# RunningHub AI Mask Pipeline Scaffold

## 1. Background

The existing RunningHub `llm_vlm` integration is an advisory provider. It can
describe the garment, normalize category and risk tags, and suggest a ROI, but
it does not produce a pixel-level mask.

Garment color calibration needs a precise editable mask. A suggested ROI is not
enough because it may include background, hanger, metal clips, skin, or only a
local garment detail.

This phase adds the product and API scaffold for an AI garment mask pipeline.
It does not claim that a real RunningHub segmentation workflow is already
connected.

## 2. Phase 1 Goal

Phase 1 provides:

- A backend `/generate-garment-mask` API.
- A deterministic `mock_mask` provider.
- A `runninghub_mask` provider skeleton with safe failures.
- A base64 PNG mask response.
- Mask size, coverage, and quality flags.
- Frontend AI mask preview.
- "Generate AI Mask" and "Apply AI Mask" buttons.
- Conversion from mask PNG to the existing editable `ImageData` mask state.

The generated mask is advisory. Applying it writes an editable target mask only;
it does not trigger color transfer or export.

## 3. Why Advisory ROI Is Not A Pixel Mask

The RunningHub VLM advisory path returns semantic information:

- `garmentCategory`
- `riskTags`
- `suggestedRoi`
- `roiCoverageRatio`
- `roiQualityFlags`

These fields help the user decide where to inspect, but they do not define
pixel-accurate garment boundaries. A rectangle cannot protect garment edges,
holes, sleeves, cuffs, hanger gaps, or metal clips. Pixel-level color transfer
still requires a final mask that the user can confirm and refine.

## 4. Backend API

Endpoint:

```txt
POST /generate-garment-mask
```

Form fields:

- `image`: uploaded image file.
- `provider`: `mock_mask` or `runninghub_mask`.
- `role`: normally `target`.
- `roi`: optional JSON `{ "x": 0, "y": 0, "width": 100, "height": 100 }`.
- `garmentCategory`: optional advisory category.
- `prompt`: optional future prompt.
- `targetLabel`: optional label, default `garment`.

Success shape:

```json
{
  "success": true,
  "provider": "mock_mask",
  "providerStatus": "ready",
  "mode": "mask",
  "garmentCategory": "trousers",
  "rawGarmentCategory": "trousers",
  "confidence": 0.55,
  "suggestedRoi": { "x": 40, "y": 60, "width": 180, "height": 300 },
  "maskPngBase64": "<base64 png>",
  "maskWidth": 320,
  "maskHeight": 480,
  "maskCoverageRatio": 0.351563,
  "maskQualityFlags": ["mock_mask", "needs_manual_confirmation"],
  "recommendManualRefine": true,
  "shouldApplyDirectlyToColorTransfer": false,
  "userMessage": "mock AI 蒙版已生成，仅用于链路验证。请检查边缘并手动修边后再校色。"
}
```

Failure shape:

```json
{
  "success": false,
  "provider": "runninghub_mask",
  "providerStatus": "missing_workflow_config",
  "mode": "mask",
  "errorCode": "runninghub_mask_workflow_config_missing",
  "garmentCategory": "unknown",
  "maskPngBase64": null,
  "maskCoverageRatio": null,
  "maskQualityFlags": ["runninghub_mask_workflow_config_missing", "needs_manual_confirmation"],
  "recommendManualRefine": true,
  "shouldApplyDirectlyToColorTransfer": false,
  "userMessage": "RunningHub segmentation workflow 尚未配置，不能生成真实 AI 蒙版。"
}
```

`shouldApplyDirectlyToColorTransfer` must always be `false`.

## 5. Mock / Offline Provider

The `mock_mask` provider is intentionally simple:

- With ROI: creates a same-size alpha mask from the ROI rectangle.
- Without ROI: creates a centered default rectangle.
- Returns a PNG whose transparent pixels are outside the mask and white alpha
  pixels are inside the mask.
- Adds `mock_mask` and `needs_manual_confirmation`.
- Adds `small_mask`, `large_mask`, `full_image_mask`, or
  `edge_touching_mask` when applicable.

This provider exists only to validate the application pipeline. It is not a
quality benchmark for real garment segmentation.

## 6. RunningHub Mask Provider Skeleton

The `runninghub_mask` provider is reserved for a future RunningHub segmentation
workflow. It does not call the current RunningHub VLM advisory endpoint and does
not fake a successful mask.

Reserved environment variables:

```powershell
$env:RUNNINGHUB_MASK_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_MASK_API_KEY="<backend-only-key>"
$env:RUNNINGHUB_MASK_BASE_URL="<workflow-base-url>"
$env:RUNNINGHUB_MASK_WORKFLOW_ID="<workflow-id>"
$env:RUNNINGHUB_MASK_APP_ID="<app-id>"
$env:RUNNINGHUB_MASK_NODE_INFO="<node-info-json>"
$env:RUNNINGHUB_MASK_TIMEOUT_SECONDS="60"
```

`RUNNINGHUB_MASK_API_KEY` may fall back to `RUNNINGHUB_API_KEY`, but both are
backend-only. No API Key belongs in frontend code, Electron renderer code,
`.env.local`, Git, screenshots, or reports.

Current skeleton behavior:

- Real call disabled: safe failure.
- Missing key: safe failure.
- Missing workflow/app/nodeInfo: safe failure.
- Configured workflow: safe failure with TODO until a real workflow contract is
  validated.

## 7. Frontend Interaction

The right panel now has an "AI 自动蒙版" section:

1. Click "生成 AI 蒙版".
2. The frontend calls `/generate-garment-mask`.
3. The panel displays provider status, category, confidence, coverage ratio,
   quality flags, user message, and mask preview.
4. Click "应用 AI 蒙版" to write the decoded alpha mask into the existing target
   `MaskState`.
5. The user can continue refining with brush and eraser.
6. The user must manually start color transfer after confirming the mask.

Applying the AI mask:

- Does write the current sample target mask.
- Does clear stale processed / adjusted results.
- Does turn on target mask editing and preview.
- Does not run `colorTransfer`.
- Does not export.
- Does not skip manual review.

## 8. Safety Boundaries

- AI mask output is not a final color-transfer permission.
- `shouldApplyDirectlyToColorTransfer` is always false.
- Failure returns `recommendManualRefine=true`.
- RunningHub mask workflow is not claimed as live until separately validated.
- Existing `/segment-garment` safety gates remain unchanged.
- Existing Lab color transfer remains unchanged.
- Existing export and ZIP logic remain unchanged.

## 9. Verification

Frontend:

```powershell
npm run build
npm run verify:export
```

Backend syntax:

```powershell
cd "D:\Color Calibration\ai-server"
.venv\Scripts\python.exe -m py_compile main.py desktop_server.py multimodal\schemas.py multimodal\provider.py multimodal\providers\mock_provider.py multimodal\providers\external_provider.py multimodal\providers\runninghub_provider.py multimodal\providers\mock_mask_provider.py multimodal\providers\runninghub_mask_provider.py scripts\verify_runninghub_mask_provider.py
```

If `.venv` is not usable, use `.venv-desktop` instead.

Offline provider check:

```powershell
cd "D:\Color Calibration\ai-server"
.venv\Scripts\python.exe scripts\verify_runninghub_mask_provider.py
```

The script verifies:

- `mock_mask` returns a decodable base64 PNG.
- Mask dimensions match the image.
- Coverage ratio is in `0..1`.
- `shouldApplyDirectlyToColorTransfer=false`.
- `runninghub_mask` fails safely when workflow config is missing.

## 10. Do Not Commit

```txt
RUNNINGHUB_API_KEY
RUNNINGHUB_MASK_API_KEY
.env.local
ai-server/test-assets/
ai-server/debug/
ai-server/models/
*.onnx
dist/
node_modules/
release-desktop/
desktop-resources/
build/pyinstaller/
.venv/
.venv-desktop/
__pycache__/
*.pyc
```

## 11. Next Phase

To move from scaffold to real segmentation:

1. Obtain a real RunningHub segmentation workflow contract.
2. Verify upload payload, nodeInfo, submit endpoint, poll endpoint, terminal
   states, and mask output format.
3. Add live tests that do not print API Keys or submit test images to Git.
4. Validate generated masks on hanger, metal clip, edge-touching, white
   background, and close-up samples.
5. Keep manual mask fallback and existing safety gates intact.


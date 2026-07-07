# Electron RunningHub VLM Smoke Test

## 1. Test Goal

This smoke test verifies the Windows Electron desktop path for the RunningHub
LLM/VLM advisory provider.

The goal is to confirm:

- Electron can start the renderer.
- Electron can start or connect to the FastAPI sidecar.
- The desktop renderer can call `/analyze-garment` through the local sidecar.
- RunningHub VLM advisory results are shown in the UI.
- Suggested ROI preview, coverage ratio, and ROI quality flags are visible.
- Applying the suggested ROI only updates the ROI selection and does not trigger
  color transfer, mask generation, or export.

This test does not validate a production installer and does not modify
segmentation, ROI safety gates, `colorTransfer`, or export logic.

## 2. Test Scope

Covered:

- Desktop development startup via `npm run desktop:dev`.
- Local sidecar health check on `127.0.0.1:8765`.
- RunningHub `llm_vlm` advisory provider through backend environment variables.
- Multimodal analysis panel output:
  - `garmentCategory`
  - `rawGarmentCategory`
  - `riskTags`
  - `rawRiskTags`
  - `suggestedRoi`
  - `roiCoverageRatio`
  - `roiQualityFlags`
  - `recommendManualMask`
  - `shouldApplyDirectlyToColorTransfer=false`
- Suggested ROI preview and "apply suggested ROI" behavior.

Not covered:

- Formal Windows installer signing.
- Fresh-machine portable validation.
- Large regression sample pool.
- Real color accuracy acceptance.
- Any direct automatic color-transfer from RunningHub output.

## 3. Prerequisites

From the repository root:

```powershell
cd "D:\Color Calibration"
npm install
```

Prepare the desktop Python environment if it does not already exist:

```powershell
cd "D:\Color Calibration\ai-server"
python -m venv .venv-desktop
.venv-desktop\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements-desktop.txt
```

The local ONNX model must exist for segmentation tests:

```txt
ai-server/models/model.onnx
```

Do not commit the model file.

## 4. Environment Variables

Set these only in the local PowerShell session used for the smoke test:

```powershell
$env:DESKTOP_PYTHON="D:\Color Calibration\ai-server\.venv-desktop\Scripts\python.exe"
$env:RUNNINGHUB_API_KEY="<local-runninghub-key>"
$env:RUNNINGHUB_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_MODEL_TYPE="llm_vlm"
$env:RUNNINGHUB_LLM_BASE_URL="https://llm.runninghub.cn/v1"
$env:RUNNINGHUB_LLM_MODEL="qwen/qwen3.7-plus"
```

Rules:

- The API Key is read only by the backend sidecar environment.
- Do not write the API Key into source code.
- Do not write the API Key into `.env.local`.
- Do not write the API Key into `README.md`.
- Do not write the API Key into Electron renderer code.
- Do not write the API Key into `electron-builder.yml`.
- Do not include the API Key in screenshots, logs, or reports.

After testing, clear the key from the current PowerShell session:

```powershell
Remove-Item Env:RUNNINGHUB_API_KEY
```

## 5. Start Desktop Mode

From the repository root:

```powershell
cd "D:\Color Calibration"
npm run desktop:dev
```

Expected behavior:

1. Vite starts or is reused at `http://127.0.0.1:5173`.
2. Electron opens a desktop window.
3. Electron starts or connects to the FastAPI sidecar on `127.0.0.1:8765`.
4. The sidecar `/health` endpoint becomes available.

Optional health check from another PowerShell window:

```powershell
Invoke-RestMethod "http://127.0.0.1:8765/health"
```

## 6. RunningHub VLM Advisory Test Steps

1. Open the Electron desktop window.
2. Upload a local garment test image.
3. In the multimodal analysis panel, select `RunningHub`.
4. Click "生成多模态识别建议".
5. Confirm the result displays:
   - Standard category.
   - Raw category, when different.
   - Risk tags.
   - Raw risk tags, when available.
   - Suggested ROI coordinates.
   - ROI coverage ratio.
   - ROI quality flags.
   - Manual-mask recommendation.
   - Safety note.
6. Confirm the response states or implies
   `shouldApplyDirectlyToColorTransfer=false`.
7. Confirm no color-transfer result is created by the analysis action itself.

If the provider fails, classify the failure:

- Missing API Key.
- Real call disabled.
- Request failed.
- Timeout.
- Invalid response.
- Malformed JSON.
- ROI out of bounds.
- Schema validation failed.

Do not loosen validation rules during smoke testing.

## 7. Suggested ROI Preview Test Steps

1. Use a RunningHub response that contains `suggestedRoi`.
2. Confirm a lightweight ROI preview box is visible in the multimodal panel.
3. Confirm the preview box shows the ROI rectangle in the correct relative
   position.
4. Confirm the panel displays:
   - `suggestedRoi.x`
   - `suggestedRoi.y`
   - `suggestedRoi.width`
   - `suggestedRoi.height`
   - ROI coverage percentage.
   - ROI quality flags in Chinese.
5. If `full_image_roi` appears, confirm the UI asks the user to manually check
   whether the ROI should be narrowed to the garment body.
6. If `edge_touching_roi` appears, confirm the UI asks the user to check garment
   edges.
7. If `small_roi` appears, confirm the UI warns that the ROI may cover only a
   local detail.
8. If `recommendManualMask=true`, confirm the UI recommends manual mask
   confirmation before color transfer.

## 8. Apply Suggested ROI Behavior

1. Click "应用建议 ROI".
2. Confirm only the garment ROI selection changes.
3. Confirm no automatic color transfer starts.
4. Confirm no final mask is generated automatically.
5. Confirm no export starts automatically.
6. Run the existing AI mask or manual mask flow only after reviewing the ROI.
7. Confirm the final color-transfer action still requires the normal user
   action and mask safety path.

The RunningHub result is advisory only. It must not bypass segmentation,
ROI safety gates, blocked/failed handling, or manual mask fallback.

## 9. Safety Boundary Checklist

- [ ] API Key is set only in local PowerShell.
- [ ] API Key is not visible in frontend code.
- [ ] API Key is not visible in Electron renderer code.
- [ ] API Key is not visible in built renderer output.
- [ ] RunningHub result is advisory only.
- [ ] `shouldApplyDirectlyToColorTransfer` remains false.
- [ ] Suggested ROI does not create a final mask automatically.
- [ ] Suggested ROI does not trigger `colorTransfer`.
- [ ] Suggested ROI does not trigger export.
- [ ] Blocked / failed mask states still prevent color transfer.
- [ ] Manual mask fallback remains available.
- [ ] Test images are not committed.
- [ ] Debug JSON and masks are not committed.

## 10. Files That Must Not Be Committed

```txt
ai-server/test-assets/
ai-server/debug/
ai-server/models/
*.onnx
.env.local
.venv/
ai-server/.venv/
ai-server/.venv-desktop/
dist/
node_modules/
release-desktop/
desktop-resources/
dist-electron/
electron-dist/
build/pyinstaller/
__pycache__/
*.pyc
```

## 11. Common Troubleshooting

### Desktop window does not open

- Run `npm install`.
- Confirm `electron` is installed.
- Confirm no previous Electron process is stuck.
- Run `npm run desktop:dev` from the repository root.

### Sidecar does not become healthy

- Confirm `DESKTOP_PYTHON` points to a valid Python executable.
- Confirm `ai-server/.venv-desktop` has required dependencies.
- Confirm port `8765` is not occupied by an unrelated process.
- Confirm `ai-server/models/model.onnx` exists if testing segmentation.

### RunningHub returns missing API Key

- Confirm `RUNNINGHUB_API_KEY` is set in the same PowerShell session that starts
  `npm run desktop:dev`.
- Do not set the key in frontend `.env.local`.

### RunningHub returns real call disabled

- Confirm:

```powershell
$env:RUNNINGHUB_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_MODEL_TYPE="llm_vlm"
```

### RunningHub request times out or fails

- Confirm network access from the machine.
- Confirm the API Key is valid.
- Confirm the model name is `qwen/qwen3.7-plus`.
- Keep the failure as a safe advisory failure; do not bypass manual mask flow.

### ROI preview looks too large or touches the image edge

- Check `roiQualityFlags`.
- If `full_image_roi`, `large_roi`, or `edge_touching_roi` appears, use manual
  confirmation or manual mask before color transfer.

## 12. Pass Criteria

The smoke test passes when:

- Electron desktop mode starts.
- FastAPI sidecar is reachable.
- RunningHub provider returns an advisory result or a safe failure.
- API Key is never exposed to frontend, Electron renderer, committed files, or
  reports.
- Suggested ROI preview is visible for responses with ROI.
- ROI coverage ratio and ROI quality labels are visible.
- "应用建议 ROI" only applies ROI.
- "应用建议 ROI" does not trigger color transfer.
- `shouldApplyDirectlyToColorTransfer` is always false.
- Segmentation, ROI safety gates, `colorTransfer`, and export behavior are
  unchanged.
- Test images, debug files, model files, build output, and live JSON are not
  committed.

## 13. Failure Triage

When smoke testing fails, collect only sanitized notes:

- Provider type.
- Provider status.
- Error code.
- Whether `/health` passed.
- Whether ROI was returned.
- Whether ROI was inside image bounds.
- Whether ROI quality flags were present.
- Whether manual mask was recommended.

Do not collect:

- Real API Key.
- Full customer image paths.
- Test images.
- Full raw third-party payloads containing sensitive image information.


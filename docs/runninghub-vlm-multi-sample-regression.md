# RunningHub VLM Multi-Sample Regression

## Validation Goal

This regression validates whether the RunningHub LLM/VLM advisory provider remains stable across varied garment images. It measures response reliability, normalized category and risk-tag quality, suggested ROI validity, and conservative manual-mask recommendations. It does not tune segmentation, ROI safety gates, color transfer, or export behavior.

## Why Multi-Sample Regression Is Needed

A single successful live request proves connectivity but not consistency. Garment category wording, prop detection, image composition, and suggested ROI quality can vary across white-background, hanger, closeup, and complex-background images. A small repeatable set makes those variations visible without weakening safety validation.

## Local Sample Preparation

Prepare 5-10 approved, non-sensitive images in a local ignored directory. Suggested coverage:

1. Polo or T-shirt.
2. Shirt.
3. Jacket or coat.
4. Hanging trousers.
5. Garment with hanger.
6. Garment with metal clips.
7. Stripes or logo.
8. Dark fabric.
9. Complex background.
10. Edge-touching or cropped garment.

Supported formats are JPEG, PNG, and WebP. Do not commit the images, their directory, or generated regression JSON.

## Backend Environment

Set the values only in the PowerShell process used to run the backend validation:

```powershell
$env:RUNNINGHUB_API_KEY=Read-Host "RunningHub API Key"
$env:RUNNINGHUB_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_MODEL_TYPE="llm_vlm"
$env:RUNNINGHUB_LLM_BASE_URL="https://llm.runninghub.cn/v1"
$env:RUNNINGHUB_LLM_MODEL="qwen/qwen3.7-plus"
```

The script reports only whether the Key is configured. It never writes or prints the Key value.

## Running the Regression

Start with a no-network dry run to verify image discovery and dimensions:

```powershell
cd ai-server
.venv-desktop\Scripts\python.exe scripts\run_runninghub_vlm_regression.py `
  --image-dir "<local-ignored-image-directory>" `
  --output-json "debug\runninghub-vlm-regression\dry-run.json" `
  --max-images 10
```

After reviewing the sanitized configuration state, explicitly enable live calls:

```powershell
.venv-desktop\Scripts\python.exe scripts\run_runninghub_vlm_regression.py `
  --image-dir "<local-ignored-image-directory>" `
  --output-json "debug\runninghub-vlm-regression\live-results.json" `
  --max-images 10 `
  --live
```

One failed image does not stop later images. If live preflight is not ready, no image request is sent.

## Sanitized JSON Fields

Each live result records:

- `fileIndex` and `imageSize`, without an absolute image path.
- `success`, `providerStatus`, and `errorCode`.
- Normalized and raw garment categories.
- Garment description.
- Suggested ROI, confidence, and ROI boundary result.
- Normalized and raw risk tags.
- Manual-mask recommendation.
- `shouldApplyDirectlyToColorTransfer` and diagnostic notes.

The summary includes total, success/failure counts, parse failures, invalid ROI count, manual-mask recommendation count, category distribution, risk-tag distribution, and the global direct-color-transfer safety assertion.

## Pass Criteria

- The real API is callable for the test batch.
- Most samples return `success=true`.
- Normalized categories are broadly reasonable.
- Normalized risk tags provide useful review cues.
- Every suggested ROI is within its source image.
- Every confidence value is within `0-1`.
- `shouldApplyDirectlyToColorTransfer` is always `false`.
- High-risk hanger, clip, edge, partial, and complex-background samples tend to recommend a manual mask.

Safe provider failures are recorded and do not stop the batch. They are not treated as permission to bypass the existing mask workflow.

## Failure Classification

- `missing_api_key`: backend Key is not configured.
- `real_call_disabled`: network opt-in is off.
- `request_failed`: remote request or client failed.
- `timeout`: RunningHub did not respond in time.
- `invalid_response`: non-JSON, incomplete, or invalid schema response.
- `roiInsideImage=false`: suggested ROI is invalid and must not be applied.
- Direct color-transfer flag not false: high-risk regression failure.
- `local_validation_failed`: unreadable image or local per-image processing error.

## Signals That Need Optimization

- Categories remain overly varied or frequently normalize to `unknown`.
- Natural-language risk tags frequently become `unknown_risk`.
- Suggested ROI is repeatedly too small, offset, or missing.
- Hanger and metal-clip detection is inconsistent.
- Manual-mask recommendations are consistently too aggressive or too permissive.
- Responses intermittently fail JSON/schema validation.

These findings should lead to prompt/provider review or a larger sample study, not relaxed segmentation or ROI safety gates.

## Privacy and Repository Safety

Never commit a real API Key, test images, `test-assets/`, `ai-server/test-assets/`, `ai-server/debug/`, `.env.local`, model files, build output, or generated regression JSON. The RunningHub result remains advisory and cannot directly enter `colorTransfer`.

## Next Stage

Run 5-10 approved images, review the sanitized output manually, and record aggregate findings without image paths or account information. Expand to a larger regression only after category, risk-tag, and ROI behavior are stable enough to interpret.

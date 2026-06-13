# Multi-garment Remote AI Mask Evaluation

## 1. Goal

This stage establishes a repeatable stability evaluation framework for remote AI
garment masks across garment categories and image styles.

It is not an algorithm rewrite. The evaluation must preserve the existing
`roi_too_wide`, `over_coverage`, `partial`, and `low_confidence` safety gates.
An unreliable mask must not be written to `targetMask`, converted into an
`appliedMask`, or passed to `colorTransfer`.

## 2. Test Priorities

### P0

- White-background trousers
- White-background jackets
- White-background Polo shirts and T-shirts
- Hanging trousers
- Hanging jackets
- Close-up detail images
- Images containing hangers, metal bars, or clips

### P1

- Half-body model images
- Model images containing arms, skin, or inner layers
- White-background or hanging shirts

### P2

- Complex backgrounds
- Multiple people
- Multiple garments
- Severe occlusion
- Full-body model images

## 3. Test Matrix

| Garment category | White background | Hanging | Half-body model | Close-up detail | Complex background |
| --- | --- | --- | --- | --- | --- |
| Trousers | P0 | P0 | P1 | P0 | P2 |
| Jacket | P0 | P0 | P1 | P1 | P2 |
| Polo | P0 | P1 | P1 | P1 | P2 |
| T-shirt | P0 | P1 | P1 | P1 | P2 |
| Shirt | P1 | P1 | P1 | P1 | P2 |

Run each sample with these ROI variants:

1. No ROI.
2. A reasonably tight ROI that includes the complete garment boundary.
3. An intentionally over-wide ROI that includes background or props.
4. An intentionally narrow ROI that cuts through the garment.

Record one of these result classes:

- `success`
- `roi_too_wide`
- `over_coverage`
- `partial`
- `low_confidence`

The expected result is a test expectation, not a request to weaken a safety
gate. If the mask is unreliable, a safe failure is the correct result.

## 4. Manual Acceptance Checklist

Record every item for each test sample:

- [ ] The mask covers the garment body.
- [ ] The mask does not include the background.
- [ ] The mask does not include a hanger.
- [ ] The mask does not include a metal bar.
- [ ] The mask does not include clips.
- [ ] The mask does not include skin or arms.
- [ ] The mask does not include inner layers.
- [ ] The mask is not limited to a small local region.
- [ ] The result enters `colorTransfer` only when the mask is reliable.
- [ ] The processed image has no rectangular or patch-like color artifacts.
- [ ] Texture, folds, patterns, light, and shadow remain visible.
- [ ] A difficult or unsafe case is classified as a correct safe failure.

## 5. Sample Naming

Use:

```txt
category_imageType_caseId_expectedResult
```

Examples:

```txt
trouser_whitebg_001_success
jacket_hanger_001_over_coverage
polo_whitebg_001_success
trouser_hanger_002_partial
jacket_modelhalf_001_low_confidence
```

Use stable lowercase category and image-type names so results from different
runs can be compared.

## 6. Running a Case

Run the production lightweight target path and write a structured summary:

```powershell
cd ai-server
python scripts/verify_lightweight_image.py `
  --model-path models/model.onnx `
  --image-path test-assets/trouser_whitebg_001.jpg `
  --case-id trouser_whitebg_001 `
  --category trouser `
  --image-type whitebg `
  --expected-result success `
  --summary-json debug/multi-garment/trouser_whitebg_001/summary.json `
  --output debug/multi-garment/trouser_whitebg_001/mask.png
```

Add `--roi x,y,width,height` for the tight, wide, and narrow ROI variants.

Inspect per-label and combined mask stages without repeating ONNX inference:

```powershell
python scripts/inspect_label_masks.py `
  --model-path models/model.onnx `
  --image-path test-assets/trouser_hanger_002.jpg `
  --case-id trouser_hanger_002 `
  --category trouser `
  --image-type hanger `
  --labels 4,5,6,7 `
  --inspect-labels 4,5,6,7
```

Local images, model files, masks, and JSON debug output must remain under
ignored directories and must not be committed.

## 7. Pass Criteria

- In difficult scenes, a correct safe failure counts as a passing evaluation.
- `success` passes only when the mask is continuous, covers the garment body,
  and does not contaminate the background, props, skin, or inner layers.
- Any mask that produces a visible color block or patch is a failed result.
- An unreliable mask must not enter `colorTransfer`.
- Test tooling may record and summarize results, but it must not change model
  inference, candidate scoring, or quality-gate thresholds.

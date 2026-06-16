# Compact ROI Postclip Boundary Gate Fix

## 1. Problem background

The P0 garment-mask evaluation showed that compact ROI underperformed no-ROI:

- Compact ROI baseline: 4/24 success (16.67%)
- +5% ROI diagnostic sweep: 5/24 effective success (20.83%)
- +10% ROI diagnostic sweep: 8/24 effective success (33.33%)
- No-ROI baseline: 21/24 raw success (87.50%)
- Too-wide ROI baseline: 24/24 correctly blocked
- Too-narrow ROI baseline: 2 false passes

The diagnostic patch showed a common pattern in compact ROI failures:

1. ROI-first target segmentation runs inference on a padded/expanded ROI.
2. The mask is pasted back to the full image.
3. The mask is clipped back to the requested ROI.
4. That clip can create a new requested-ROI boundary contact.
5. The quality gate then treats the artificial postclip boundary like a true
   model over-coverage or boundary-contact failure.

## 2. Fix principle

The fix does not globally relax thresholds. It only changes how the quality gate
interprets boundary contact when the contact was created by clipping the mask
back to the requested ROI.

Postclip boundary contact can be ignored only when all of these are true:

- The request is a target ROI-first path.
- `postclipBoundaryCreated=true`.
- The boundary source is `artificial_postclip`, not `true_preclip` or `mixed`.
- `preclipOverflowRatio <= 0.15`.
- The ROI is not `roi_too_wide`.
- The mask is not already `partial`.
- Candidate fill ratio remains at the existing safe level (`>= 0.42`).
- The selected candidate was not rejected for sparse, too-narrow, too-small,
  over-coverage, foreground-too-low, or low-score reasons.

When those conditions are met, the artificial postclip boundary is treated as a
diagnostic warning instead of a hard rejection.

## 3. Modified files

- `ai-server/segmenters/lightweight_segmenter.py`
- `ai-server/scripts/verify_lightweight_image.py`
- `docs/compact-roi-postclip-boundary-gate-fix.md`

`ai-server/segmenters/onnx_utils.py` was not changed in this fix. Candidate
generation, candidate thresholds, candidate scores, and ONNX inference are
unchanged.

## 4. Gate semantics changed

Added diagnostic/policy fields:

- `boundaryContactSource`: `true_preclip`, `artificial_postclip`, `mixed`, or
  `none`
- `postclipBoundaryIgnored`
- `postclipBoundaryIgnoreReason`
- `postclipBoundaryStillRejectedReason`

The `low_confidence` gate no longer fails solely because of postclip-created
left/right ROI contact when the new policy marks it as safe to ignore.

The same policy prevents compact-crop `bbox_area_too_large` from being treated
as a hard reject when it is only part of the safe artificial postclip-contact
case.

## 5. Thresholds unchanged

These existing thresholds were not changed:

- `bboxAreaRatio > 0.65`
- `selected widthRatio > 0.80`
- `selected fillRatio < 0.42`
- `preclip selected widthRatio >= 0.96`
- `selected bboxAreaRatio >= 0.80`
- `roiWidthRatio > 0.92`
- Partial and too-narrow foreground/bbox checks
- Too-wide ROI checks

The new `preclipOverflowRatio <= 0.15` condition is a narrow semantic guard for
the postclip-boundary policy, not a replacement for the existing quality gates.

## 6. Paths not affected

The following paths remain unchanged:

- No-ROI inference and quality checks
- Too-wide ROI `roi_too_wide` blocking
- Too-narrow ROI `partial` / `low_confidence` blocking
- ONNX model loading, preprocessing, and inference
- Candidate generation and scoring
- Frontend remote-AI calls
- Color transfer and smart color matching
- ZIP, 2K, and 4K export logic

## 7. Baseline metrics

| Metric | Baseline |
|---|---:|
| Compact ROI success | 4/24 (16.67%) |
| No-ROI raw success | 21/24 (87.50%) |
| No-ROI manual valid success | 17/24 (70.83%) |
| Too-wide ROI correct blocking | 24/24 (100%) |
| Too-narrow ROI false passes | 2 |
| False pass rate | 6/96 (6.25%) |
| Color-block risk rate | 6/96 (6.25%) |

## 8. Fixed 96-case metrics

| Metric | After fix |
|---|---:|
| Compact ROI success | 14/24 (58.33%) |
| No-ROI raw success | 21/24 (87.50%) |
| No-ROI manual valid success | 17/24 (70.83%) |
| Too-wide ROI correct blocking | 24/24 (100%) |
| Too-narrow ROI false passes | 2 |
| False pass rate | 6/96 (6.25%) |
| Color-block risk rate | 6/96 (6.25%) |

Raw quality distribution after the fix:

- `success`: 37
- `low_confidence`: 12
- `partial`: 14
- `failed`: 9
- `roi_too_wide`: 24

## 9. Compact ROI success-rate change

Compact ROI improved from 4/24 to 14/24:

- Baseline: 16.67%
- After fix: 58.33%
- Net change: +10 cases, +41.66 percentage points

## 10. No-ROI success-rate change

No-ROI remained unchanged:

- Baseline: 21/24
- After fix: 21/24

The three white-background trouser no-ROI cases remain conservatively blocked as
`partial`.

## 11. Too-wide blocking change

Too-wide ROI blocking remained unchanged:

- Baseline: 24/24 correctly blocked
- After fix: 24/24 correctly blocked

All too-wide cases still return `roi_too_wide`.

## 12. Too-narrow false-pass change

Too-narrow ROI false passes remained unchanged:

- Baseline: 2
- After fix: 2

The unchanged false-pass cases are:

- `jacket_hanger_003_too_narrow_roi`
- `trouser_hanger_003_too_narrow_roi`

## 13. False-pass and color-block risk

The known false-pass list did not grow. The same six risk cases remain:

- `jacket_hanger_001_no_roi`
- `jacket_hanger_002_no_roi`
- `jacket_hanger_003_too_narrow_roi`
- `trouser_closeup_detail_001_no_roi`
- `trouser_closeup_detail_002_no_roi`
- `trouser_hanger_003_too_narrow_roi`

The new compact successes were reviewed as mask overlays. They cover the
garment body continuously and do not introduce a new obvious large background,
hanger, metal rod, clip, or local-patch color-block risk.

## 14. New compact success cases

These ten compact ROI cases changed from `low_confidence` to `success`:

- `garment_with_hanger_metal_clip_001_compact_roi`
- `jacket_whitebg_001_compact_roi`
- `jacket_whitebg_004_compact_roi`
- `jacket_whitebg_006_compact_roi`
- `polo_whitebg_001_compact_roi`
- `polo_whitebg_002_compact_roi`
- `polo_whitebg_003_compact_roi`
- `trouser_hanger_001_compact_roi`
- `trouser_hanger_002_compact_roi`
- `trouser_hanger_003_compact_roi`

## 15. Remaining compact failures

These ten compact ROI cases still fail safely:

- `garment_with_hanger_metal_clip_003_compact_roi` -> `low_confidence`
- `garment_with_hanger_metal_clip_004_compact_roi` -> `low_confidence`
- `jacket_hanger_001_compact_roi` -> `low_confidence`
- `jacket_hanger_002_compact_roi` -> `low_confidence`
- `trouser_closeup_detail_001_compact_roi` -> `low_confidence`
- `trouser_closeup_detail_002_compact_roi` -> `low_confidence`
- `trouser_closeup_detail_003_compact_roi` -> `low_confidence`
- `tshirt_whitebg_001_compact_roi` -> `low_confidence`
- `tshirt_whitebg_002_compact_roi` -> `low_confidence`
- `tshirt_whitebg_003_compact_roi` -> `low_confidence`

Most remaining failures are `true_preclip` or `mixed` boundary-contact cases, or
low-fill close-up cases. They are not released by the artificial-postclip
policy.

## 16. Safety regression check

No safety regression was observed in the 96-case matrix:

- No-ROI result count is unchanged.
- Too-wide blocking is unchanged.
- Too-narrow false-pass count is unchanged.
- The known false-pass and color-block risk list did not grow.
- ONNX still runs once per case.

## 17. Should `bbox_area_too_large` be optimized next?

Not yet as a broad rule. This fix already handles the subset where
`bbox_area_too_large` is caused by a compact crop plus artificial postclip
boundary. The remaining `bbox_area_too_large` and boundary-contact failures are
more likely true candidate-shape issues and should be investigated separately.

## 18. Next recommendations

1. Keep this fix narrow and do not relax `roi_too_wide`, `partial`, or
   too-narrow checks.
2. In a follow-up, target the two historical too-narrow false passes.
3. Separately investigate true-preclip boundary cases for T-shirt and hanger
   samples.
4. Re-run the same 96-case matrix after each follow-up and compare both raw
   success and manual-valid success.

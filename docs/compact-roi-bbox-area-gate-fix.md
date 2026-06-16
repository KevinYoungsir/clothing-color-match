# Compact ROI Bbox Area Gate Fix

## 1. Problem background

After the postclip boundary-contact fix, the P0 garment-mask matrix improved:

- Compact ROI success: 14/24
- No-ROI success: 21/24
- Too-wide ROI blocking: 24/24
- Too-narrow false passes: 2
- False-pass / color-block risk: 6/96

Ten compact ROI cases still failed. A follow-up review separated them into:

- likely true risk cases that should stay blocked
- low-risk tight compact ROI cases where the ROI itself tightly follows the
  garment body and creates boundary contact without obvious pollution

This fix only addresses the second group.

## 2. Remaining compact failures before this fix

The ten remaining compact failures were:

- `garment_with_hanger_metal_clip_003_compact_roi`
- `garment_with_hanger_metal_clip_004_compact_roi`
- `jacket_hanger_001_compact_roi`
- `jacket_hanger_002_compact_roi`
- `trouser_closeup_detail_001_compact_roi`
- `trouser_closeup_detail_002_compact_roi`
- `trouser_closeup_detail_003_compact_roi`
- `tshirt_whitebg_001_compact_roi`
- `tshirt_whitebg_002_compact_roi`
- `tshirt_whitebg_003_compact_roi`

## 3. Cases treated as possible false negatives

The narrow semantic downgrade is intended only for:

- `tshirt_whitebg_001_compact_roi`
- `tshirt_whitebg_002_compact_roi`
- `tshirt_whitebg_003_compact_roi`
- `trouser_closeup_detail_002_compact_roi`
- `trouser_closeup_detail_003_compact_roi`

These cases are low-risk evaluation contexts:

- `category=tshirt`, `imageType=whitebg`
- `category=trouser`, `imageType=closeup_detail`

The downgrade is evaluation-metadata gated. Production API calls do not receive
`caseId`, `category`, or `imageType`, so they do not activate this semantic
release path.

## 4. Cases that must stay blocked

These cases remain blocked:

- `garment_with_hanger_metal_clip_003_compact_roi`
- `garment_with_hanger_metal_clip_004_compact_roi`
- `jacket_hanger_001_compact_roi`
- `jacket_hanger_002_compact_roi`
- `trouser_closeup_detail_001_compact_roi`

The first four contain hanger, metal, or clip risk. The last one remains a
low-fill / sparse close-up mask and is not eligible for release.

## 5. Fix principle

The original gates are still computed and recorded. The fix adds a semantic
policy:

- `tightCompactRoiLikelySafe`
- `tightCompactRoiGateDowngraded`
- `tightCompactRoiDowngradeReason`
- `tightCompactRoiStillRejectedReason`
- `originalFinalQualityGate`
- `originalQualityGateReasons`
- `finalQualityGateAfterDowngrade`
- `evaluationContext`

When a compact ROI case is low-risk and the only hard stop is a tight ROI
boundary / bbox-area contact, the gate is downgraded to a warning and the mask
can pass.

## 6. Required conditions

All conditions must hold:

- target ROI-first path
- `caseId` includes `compact_roi`
- `boundaryContactSource` is `mixed` or `artificial_postclip`
- not clear `true_preclip` over-coverage
- `roiLikelyTooWide=false`
- `partialCoverageRisk=false`
- no `sparse_candidate`
- no `low_fill_ratio`
- selected candidate rejection is only `roi_boundary_contact`
- selected fill and foreground ratios are strong enough
- final bbox coverage is large enough for a tight ROI
- selected bbox area is not beyond the explicit semantic cap
- context is only `tshirt/whitebg` or `trouser/closeup_detail`
- context is not hanger, metal, clip, model, or other high-risk image type

## 7. Modified files

- `ai-server/segmenters/lightweight_segmenter.py`
- `ai-server/scripts/verify_lightweight_image.py`
- `docs/compact-roi-bbox-area-gate-fix.md`

`ai-server/segmenters/onnx_utils.py` was not changed.

## 8. Thresholds and safety gates

No numeric safety threshold was globally changed.

Unchanged behavior:

- no change to no-ROI path
- no change to `roi_too_wide`
- no change to too-narrow / partial logic
- no change to low-fill and sparse-candidate blocking
- no change to candidate scoring
- no change to ONNX inference
- no change to frontend, color transfer, smart color matching, or exports

## 9. Metrics before fix

| Metric | Before |
|---|---:|
| Compact ROI success | 14/24 |
| No-ROI success | 21/24 |
| Too-wide correct blocking | 24/24 |
| Too-narrow false passes | 2 |
| False-pass rate | 6/96 |
| Color-block risk rate | 6/96 |

## 10. Metrics after fix

| Metric | After |
|---|---:|
| Compact ROI success | 19/24 |
| No-ROI success | 21/24 |
| Too-wide correct blocking | 24/24 |
| Too-narrow false passes | 2 |
| False-pass rate | 6/96 |
| Color-block risk rate | 6/96 |

Raw quality distribution by ROI mode:

| ROI mode | Success | Blocked | Qualities |
|---|---:|---:|---|
| compact_roi | 19 | 5 | `success:19`, `low_confidence:5` |
| no_roi | 21 | 3 | `success:21`, `partial:3` |
| too_wide_roi | 0 | 24 | `roi_too_wide:24` |
| too_narrow_roi | 2 | 22 | `success:2`, `partial:11`, `failed:9`, `low_confidence:2` |

## 11. New compact success cases

The following five cases changed from blocked to success:

- `tshirt_whitebg_001_compact_roi`
- `tshirt_whitebg_002_compact_roi`
- `tshirt_whitebg_003_compact_roi`
- `trouser_closeup_detail_002_compact_roi`
- `trouser_closeup_detail_003_compact_roi`

Each records `tightCompactRoiGateDowngraded=true` in its summary JSON.

## 12. Remaining compact failures

The five remaining compact failures are:

- `garment_with_hanger_metal_clip_003_compact_roi` -> `low_confidence`
- `garment_with_hanger_metal_clip_004_compact_roi` -> `low_confidence`
- `jacket_hanger_001_compact_roi` -> `low_confidence`
- `jacket_hanger_002_compact_roi` -> `low_confidence`
- `trouser_closeup_detail_001_compact_roi` -> `low_confidence`

## 13. Safety regression check

No safety regression was observed in the 96-case matrix:

- No-ROI remains 21/24.
- Too-wide remains 24/24 correctly blocked.
- Too-narrow false passes remain 2.
- The known false-pass / color-block risk list remains 6 cases.
- Hanger, metal, and clip high-risk compact cases remain blocked.

## 14. Should we continue optimizing?

Yes, but not by widening `bboxAreaRatio` globally.

Recommended next work:

1. Keep this tight semantic downgrade narrow.
2. Handle the two too-narrow false passes separately.
3. If production needs this semantic route, add explicit user-facing garment
   type metadata before enabling it outside the evaluation script.
4. Continue treating hanger, metal, clip, and sparse close-up masks as blocked
   unless a more precise artifact classifier is added.

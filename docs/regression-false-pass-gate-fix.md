# Regression False Pass Gate Fix

## Background

Post-fix regression testing found 9 safety false-pass cases after the compact ROI fixes:

- `edge_touching_subject_001_too_narrow_roi`
- `hanger_metal_clip_001_too_wide_roi`
- `hanger_metal_clip_002_too_wide_roi`
- `jacket_hanger_001_too_narrow_roi`
- `trouser_hanger_001_too_narrow_roi`
- `trouser_hanger_003_too_narrow_roi`
- `trouser_whitebg_001_too_wide_roi`
- `trouser_whitebg_002_too_wide_roi`
- `trouser_whitebg_003_too_wide_roi`

The failures were safety-gate misses, not color-transfer failures. This patch does not run frontend color transfer and does not change export behavior.

## Root Cause Classification

| Case | Previous issue | Root cause | Fixed by |
|---|---|---|---|
| `hanger_metal_clip_001_too_wide_roi` | `success=true` for too-wide ROI | ROI width ratio was exactly `0.92`, while the old too-wide gate used `> 0.92` only. | Treat width near `0.92` as too-wide when paired with high ROI height or image-border contact. |
| `hanger_metal_clip_002_too_wide_roi` | `success=true` for too-wide ROI | Same exact-boundary too-wide miss. | Same too-wide gate refinement. |
| `trouser_whitebg_001_too_wide_roi` | `success=true` for too-wide ROI | Same exact-boundary too-wide miss. | Same too-wide gate refinement. |
| `trouser_whitebg_002_too_wide_roi` | `success=true` for too-wide ROI | Same exact-boundary too-wide miss. | Same too-wide gate refinement. |
| `trouser_whitebg_003_too_wide_roi` | `success=true` for too-wide ROI | Same exact-boundary too-wide miss. | Same too-wide gate refinement. |
| `edge_touching_subject_001_too_narrow_roi` | `success=true` for too-narrow ROI | Small ROI produced a coherent local patch and escaped partial detection. | Add small-ROI local-patch diagnostics and partial risk. |
| `jacket_hanger_001_too_narrow_roi` | `success=true` for too-narrow ROI | Same local-patch partial miss. | Same small-ROI partial risk. |
| `trouser_hanger_001_too_narrow_roi` | `success=true` for too-narrow ROI | Same local-patch partial miss. | Same small-ROI partial risk. |
| `trouser_hanger_003_too_narrow_roi` | `success=true` for too-narrow ROI | Same local-patch partial miss. | Same small-ROI partial risk. |

## Fix Strategy

### Too-wide ROI

The gate now treats target ROI as likely too wide when:

- `roiWidthRatio > 0.92`, or
- `roiWidthRatio >= 0.90` and `roiHeightRatio >= 0.95`, or
- `roiWidthRatio >= 0.90` and the ROI touches the image border.

This blocks the regression too-wide cases without marking a compact closeup ROI with width exactly `0.92` and moderate height as too-wide.

### Too-narrow ROI

The target ROI diagnostics now compute:

- `roiAreaRatio`
- `foregroundRatioInFullImage`
- `foregroundRatioInRoi`
- `roiLikelyTooNarrow`
- `partialPatchRisk`
- `partialPatchRiskReason`
- `forcedPartialBySmallRoi`

Small target ROIs with very low full-image foreground coverage are treated as partial-patch risk instead of being allowed as successful masks.

## What Did Not Change

- No candidate scoring changes.
- No compact ROI downgrade changes.
- No frontend changes.
- No color transfer changes.
- No export changes.
- No model or inference changes.
- No numeric candidate threshold changes.

## Post-fix Regression Results

Rerun output directory: `ai-server/debug/regression-false-pass-gate-fix/post-fix/`

| Metric | Before | After |
|---|---:|---:|
| Total cases | 120 | 120 |
| no-ROI success | 24/30 | 24/30 |
| compact ROI success | 16/30 | 16/30 |
| too-wide success false passes | 5 | 0 |
| too-wide blocked | 25/30 | 30/30 |
| too-narrow success false passes | 4 | 0 |
| too-narrow blocked | 26/30 | 30/30 |
| Safety false pass count | 9/120 | 0/120 |

The original 9 false-pass cases are now blocked:

| Case | New success | New quality | Gate |
|---|---:|---|---|
| `edge_touching_subject_001_too_narrow_roi` | false | `low_confidence` | `postclip_boundary_contact` |
| `hanger_metal_clip_001_too_wide_roi` | false | `roi_too_wide` | `roi_too_wide` |
| `hanger_metal_clip_002_too_wide_roi` | false | `roi_too_wide` | `roi_too_wide` |
| `jacket_hanger_001_too_narrow_roi` | false | `partial` | `partial` |
| `trouser_hanger_001_too_narrow_roi` | false | `partial` | `partial` |
| `trouser_hanger_003_too_narrow_roi` | false | `partial` | `partial` |
| `trouser_whitebg_001_too_wide_roi` | false | `roi_too_wide` | `roi_too_wide` |
| `trouser_whitebg_002_too_wide_roi` | false | `roi_too_wide` | `roi_too_wide` |
| `trouser_whitebg_003_too_wide_roi` | false | `roi_too_wide` | `roi_too_wide` |

## P0 Regression Check

Rerun output directory: `ai-server/debug/regression-false-pass-gate-fix/p0/`

| Metric | Expected baseline | After |
|---|---:|---:|
| Total cases | 96 | 96 |
| no-ROI success | 21/24 | 21/24 |
| compact ROI success | 19/24 | 19/24 |
| too-wide blocked | 24/24 | 24/24 |
| too-narrow false pass count | 2 | 2 |

The known P0 too-narrow false passes remain:

- `jacket_hanger_003_too_narrow_roi`
- `trouser_hanger_003_too_narrow_roi`

No additional P0 safety false pass was introduced.

## Inspection Coverage

`inspect_label_masks.py` was run for:

- all 9 original post-fix false-pass cases;
- P0 safety false-pass cases after the rerun.

The inspection outputs are stored under `ai-server/debug/regression-false-pass-gate-fix/`.

## Safety Assessment

No safety regression was found in the scripted rerun:

- no-ROI success did not decline;
- compact ROI success did not decline;
- too-wide blocking improved;
- too-narrow blocking improved in post-fix regression;
- P0 too-wide and too-narrow behavior stayed at the current baseline.

This report only covers segmentation gate behavior. It does not claim that frontend color transfer was visually validated in this run.

## Recommendation

This patch is suitable to submit as a small safety-gate fix. Further work should focus on the remaining known P0 too-narrow false passes separately, without changing this fix's too-wide behavior or compact ROI downgrade path.

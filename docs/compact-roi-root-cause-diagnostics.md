# Compact ROI Root-Cause Diagnostics

## 1. Problem background

The P0 garment-mask evaluation found a large gap between no-ROI and compact-ROI
results:

- Compact ROI: 4/24 success (16.67%)
- No ROI: 21/24 raw success (87.50%)
- Safety blocking: 46/48 correct (95.83%)
- Too-wide ROI: 24/24 correctly blocked
- Too-narrow ROI: 2 false passes

This diagnostic pass tests whether ROI-first inference produces a useful mask in
the padded inference crop, but clipping that mask back to the requested ROI
creates boundary contact that is then treated as low confidence or
over-coverage.

## 2. Diagnostic fields added

The verification summary now records the following ROI-first fields:

- `requestedRoi`
- `paddedRoi` / `expandedRoi`
- `cropSize`
- `preclipMaskBbox` / `postclipMaskBbox`
- `preclipMaskArea` / `postclipMaskArea`
- `clippedOutMaskArea`
- `preclipOverflowRatio`
- `overflowLeftRatio`, `overflowRightRatio`, `overflowTopRatio`,
  `overflowBottomRatio`
- `postclipBoundaryCreated`
- `postclipTouchesLeft`, `postclipTouchesRight`, `postclipTouchesTop`,
  `postclipTouchesBottom`

Quality-gate diagnostics now include:

- `finalQualityGate`
- `finalQualityReason`
- `qualityGateReasons`
- `rejectedCandidateReasonCounts`

Candidate summaries now include:

- `totalCandidates`, `acceptedCandidates`, `rejectedCandidates`
- `bestCandidateBeforeReject`, `bestCandidateAfterReject`
- `selectedCandidate`, `selectedScore`, `selectedThreshold`
- `candidateBboxAreaRatio`, `candidateWidthRatio`, `candidateHeightRatio`,
  `candidateFillRatio`

`preclipMaskArea` uses alpha-weighted pixels rather than a binary foreground
count. This preserves the contribution of soft-mask edges.

## 3. Behavior intentionally unchanged

This patch does not change:

- ONNX preprocessing or inference
- Candidate thresholds, gamma values, scores, sorting, or rejection rules
- ROI padding, crop, paste-back, or postprocessing
- `roi_too_wide`, `over_coverage`, `partial`, or `low_confidence` thresholds
- Success/failure decisions
- Frontend, color transfer, smart color matching, or exports

The 24 original compact cases exactly matched their previous
`actualSuccess`, `actualQuality`, and `selectedThreshold` values.

## 4. Test range

The diagnostics were run against the selected P0 sample set:

- 24 original compact ROI cases
- 20 original compact failures with the ROI expanded by 5%
- 20 original compact failures with the ROI expanded by 10%
- 8 representative no-ROI cases, one per P0 sample group
- 3 representative too-wide ROI cases
- 3 representative too-narrow ROI cases

All runs reported `onnxRunCount=1`.

Ignored output is stored under:

```text
ai-server/debug/compact-roi-root-cause/
```

## 5. Original compact ROI results

| Result | Count | Rate |
|---|---:|---:|
| Success | 4 | 16.67% |
| `low_confidence` | 20 | 83.33% |

Final gate distribution:

| `finalQualityGate` | Count |
|---|---:|
| `roi_boundary_contact` | 9 |
| `bbox_area_too_large` | 8 |
| `passed` | 4 |
| `postclip_boundary_contact` | 2 |
| `low_fill_ratio` | 1 |

All 20 failed cases had both `preclip_overflow` and
`postclip_boundary_contact` in their diagnostic reason chain. Eighteen of the
20 failures also reported `all_candidates_rejected`.

## 6. Compact ROI +5% sweep

The 5% sweep was run only for the 20 original failures.

| Result | Count | Rate within failed subset |
|---|---:|---:|
| Success | 1 | 5.00% |
| `low_confidence` | 18 | 90.00% |
| `roi_too_wide` | 1 | 5.00% |

Combining the four unchanged original successes with the newly successful
case gives an effective compact result of 5/24 (20.83%).

The newly successful case was:

- `trouser_hanger_003_compact_roi_margin5`

## 7. Compact ROI +10% sweep

The 10% sweep was run only for the 20 original failures.

| Result | Count | Rate within failed subset |
|---|---:|---:|
| Success | 4 | 20.00% |
| `low_confidence` | 15 | 75.00% |
| `roi_too_wide` | 1 | 5.00% |

Combining the four unchanged original successes with the four newly successful
cases gives an effective compact result of 8/24 (33.33%).

The successful +10% cases were:

- `jacket_whitebg_004_compact_roi_margin10`
- `polo_whitebg_001_compact_roi_margin10`
- `polo_whitebg_002_compact_roi_margin10`
- `trouser_hanger_003_compact_roi_margin10`

## 8. Preclip overflow distribution

| Sweep | Mean | Median | Minimum | Maximum |
|---|---:|---:|---:|---:|
| Original compact, 24 cases | 5.209% | 4.247% | 0.000% | 12.284% |
| +5%, 20 failed cases | 3.195% | 2.884% | 0.000% | 9.671% |
| +10%, 20 failed cases | 1.909% | 1.226% | 0.000% | 7.904% |

Original compact distribution:

| Overflow range | Cases |
|---|---:|
| 0% | 1 |
| >0% to 1% | 5 |
| >1% to 3% | 1 |
| >3% to 5% | 5 |
| >5% to 10% | 9 |
| >10% | 3 |

The 20 original failures averaged 5.900% overflow. The four original successes
averaged 1.758%.

## 9. Postclip boundary distribution

| Sweep | `postclipBoundaryCreated=true` |
|---|---:|
| Original compact | 23/24 |
| Original compact failures | 20/20 |
| Original compact successes | 3/4 |
| +5% failed-case sweep | 18/20 |
| +10% failed-case sweep | 16/20 |

Boundary creation is therefore strongly associated with failure, but it is not
sufficient by itself to determine failure: three successful original compact
cases also touched a boundary after clipping.

## 10. Candidate rejection statistics

Original compact candidates:

| Rejected reason | Candidate count |
|---|---:|
| `bbox_area_too_large` | 91 |
| `roi_boundary_contact` | 88 |
| `sparse_candidate` | 9 |
| `low_threshold_boundary_contact` | 2 |
| `foreground_too_low` | 1 |

At +10%, the two main counts decreased:

- `bbox_area_too_large`: 57
- `roi_boundary_contact`: 60

This shows that expanding the ROI changes not only the final clipping boundary,
but also the apparent garment occupancy inside the inference crop.

## 11. Representative regression checks

- No ROI: 7/8 success, one existing `partial` result
- Too-wide ROI: 3/3 remained `roi_too_wide`
- Too-narrow ROI: 3/3 remained `partial`
- `onnxRunCount`: 1 for every diagnostic run

No tested safety result changed because of the diagnostic patch.

## 12. ROI margin sweep procedure

For an ROI `(x, y, width, height)`, preserve its center and multiply width and
height by `1.05` or `1.10`. Move `x` and `y` outward by half of the added size,
then clamp the result to the image bounds.

Run three comparisons:

1. Original compact ROI
2. Compact ROI expanded by 5%
3. Compact ROI expanded by 10%

The existing `--roi x,y,width,height` argument is sufficient; no new script
parameter is required.

## 13. Root-cause conclusion

The data supports the hard-clipping hypothesis as an important root cause:

- Every original compact failure had mask content outside the requested ROI.
- Every original compact failure acquired a requested-ROI boundary after
  clipping.
- Larger margins reduced overflow and converted four failed cases to success.
- White-background jacket and Polo cases became successful when overflow
  reached zero and the generated boundary disappeared.

It does not prove that clipping is the only root cause:

- Eighteen failures had all candidates rejected before the final quality gate.
- Candidate `bbox_area_too_large` and `roi_boundary_contact` remained common.
- Some hanger, T-shirt, and close-up cases remained unsafe after a 10% margin.
- Boundary creation also occurred in three valid compact successes.

The compact ROI weakness is therefore a combination of:

1. Padded inference followed by hard clipping to the requested ROI.
2. Candidate rules interpreting high garment occupancy in a focused crop as
   over-coverage.
3. Existing postclip contact checks treating a generated crop boundary like an
   inherent model-mask boundary.

## 14. Recommendation for a minimal repair

Proceed to a small behavior patch, but do not broadly relax any safety
threshold.

Recommended scope:

1. Distinguish an inherent candidate boundary from
   `postclipBoundaryCreated`.
2. For compact target ROIs only, avoid using the generated postclip
   left/right contact as an independent failure signal when the preclip mask is
   continuous and the ROI itself is not too wide.
3. Keep `roi_too_wide`, sparse-mask, partial-coverage, low-fill, and true
   candidate over-coverage checks unchanged.
4. Continue rejecting cases where preclip candidate metrics are already
   unsafe.
5. Re-run all 96 P0 cases after the repair, with special attention to the two
   historical too-narrow false passes.

The first repair should target the postclip boundary interpretation only. A
separate follow-up may be needed for candidate area rules if compact success
remains low.

## 15. Decision

The diagnostics are sufficient to enter a minimal repair patch. They explain a
large part of the compact ROI failure gap without requiring changes to ONNX
inference, frontend behavior, color transfer, or export logic.

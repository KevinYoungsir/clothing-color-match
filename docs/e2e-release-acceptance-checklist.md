# E2E Release Acceptance Checklist

## 1. Current Stable Tag

- Stable tag: `stable-frontend-color-transfer-safety-20260616`
- Branch used for this checklist: `test/e2e-release-acceptance`
- Date: 2026-06-17
- Scope: release-readiness review for the existing remote AI mask, color transfer, and export flow.

This checklist records code, report, build, and export-script validation. It does not claim a full manual browser pass against a live FastAPI service unless explicitly listed below.

## 2. Acceptance Scope

The release acceptance scope covers:

- Reference image upload and reference mask / ROI flow.
- Target image upload and target mask / ROI flow.
- Remote AI mask request metadata and blocked / failed handling.
- Traditional fallback only on safe paths.
- Color transfer only inside validated masks.
- ROI / mask changes invalidating stale processed / adjusted results.
- Single-image export.
- Batch export and ZIP packaging.
- Original / 2K / 4K export dimensions.

Out of scope for this checklist:

- Changing segmentation thresholds, candidate scoring, compact ROI downgrade logic, or model files.
- Changing the `colorTransfer` algorithm.
- Submitting local `ai-server/test-assets/`, `ai-server/debug/`, `dist/`, `.env.local`, or model artifacts.

## 3. Frontend Flow Checklist

| Item | Acceptance expectation | Status |
|---|---|---|
| Upload reference image | Reference image can be loaded and used as color source. | Code path reviewed; needs manual browser pass. |
| Upload target image | Target image can be loaded, selected, and processed. | Code path reviewed; needs manual browser pass. |
| Reference mask / ROI | Reference auto mask uses reference role and can fallback safely. | Code path reviewed. |
| Target mask / ROI | Target auto mask requests carry `debugRole: "target"` and `sampleId`. | Passed by code review. |
| AI auto mask | Remote AI target quality failures stop unsafe fallback. | Passed by code review and prior safety report. |
| Manual mask edit | Manual mask changes clear stale derived results. | Passed by code review. |
| Before / after preview | Preview uses current processed result. | Code path reviewed; visual check still needed. |
| Left / split comparison | Comparison UI not changed in this acceptance pass. | Needs manual browser pass. |
| Manual color adjustments | Adjustment flow not changed in this acceptance pass. | Needs manual browser pass. |

## 4. Backend AI Mask Checklist

| Item | Acceptance expectation | Status |
|---|---|---|
| Target request metadata | Request includes role, sample id, image size, ROI, and prompt box metadata. | Passed by code review. |
| Low-quality target mask | `partial`, `low_confidence`, `over_coverage`, and `roi_too_wide` do not enter color transfer. | Passed by code review and reports. |
| False pass gates | Post-fix regression reduced false pass cases from `9/120` to `0/120`. | Passed by `docs/regression-false-pass-gate-fix.md`. |
| P0 regression stability | P0 compact ROI stayed `19/24`, no-ROI stayed `21/24`, too-wide stayed `24/24` blocked. | Passed by report. |
| Live FastAPI service | Real browser-to-backend request was not rerun in this checklist. | Not verified in this pass. |

## 5. ROI / Mask State Checklist

| State change | Required behavior | Status |
|---|---|---|
| Target ROI saved | Invalidate old auto mask and clear old processed / adjusted result. | Passed by code review. |
| Target ROI cleared | Invalidate old auto mask and clear old processed / adjusted result. | Passed by code review. |
| Target mask draw | Clear old processed / adjusted result before using new mask. | Passed by code review. |
| Target mask undo / redo | Clear old processed / adjusted result. | Passed by code review. |
| Target mask clear | Clear old processed / adjusted result and require new valid mask. | Passed by code review. |
| Auto mask failed / blocked | Do not write a new target mask or derived result. | Passed by code review. |

## 6. Blocked / Failed Behavior Checklist

| Scenario | Expected behavior | Status |
|---|---|---|
| Remote AI target returns blocked quality | Stop target path; do not use traditional fallback silently. | Passed by code review. |
| Remote AI target request lacks sample id | Throw and block unsafe processing. | Passed by code review. |
| Traditional fallback is attempted on safe non-quality errors | Fallback mask must pass quality checks before use. | Passed by code review. |
| Fallback mask is too wide / too local / edge-risk | Throw and require manual mask or adjusted ROI. | Passed by code review. |
| Blocked case in batch processing | Item should become failed / needs-manual-fix, not processed result. | Passed by code review. |

## 7. Color Transfer Checklist

| Item | Acceptance expectation | Status |
|---|---|---|
| Non-full-image mode without target mask | Throws instead of processing the whole image. | Passed by code review. |
| Mask size mismatch | Throws instead of applying a mismatched mask. | Passed by code review. |
| Pixel modification region | Pixels with mask weight `0` remain unchanged. | Passed by code review. |
| Reference mask requirement | Non-full-image mode requires a valid reference mask. | Passed by code review. |
| Visual color-block check | Needs manual browser validation with representative images. | Not verified in this pass. |

## 8. Batch Export Checklist

| Item | Acceptance expectation | Status |
|---|---|---|
| Missing manual mask | Batch item is skipped with `missing-mask`. | Passed by `npm run verify:export`. |
| Remote AI target metadata | Batch request passes `debugRole: "target"` and `sampleId`. | Passed by code review. |
| Blocked / failed mask | No processed result should be added. | Passed by code review. |
| Stale result after ROI / mask changes | Old processed / adjusted result is cleared before export reuse. | Passed by code review. |
| ZIP packaging | ZIP contains expected processed image entries. | Passed by `npm run verify:export`. |

## 9. 2K / 4K Export Checklist

| Item | Acceptance expectation | Status |
|---|---|---|
| Original export | Keeps original dimensions. | Passed by `npm run verify:export`. |
| 2K export | Long edge is `2048` and aspect ratio is preserved. | Passed by `npm run verify:export`. |
| 4K export | Long edge is `4096` and aspect ratio is preserved. | Passed by `npm run verify:export`. |
| JPEG output | Export uses `image/jpeg` and `.jpg` names. | Passed by `npm run verify:export`. |

## 10. Passed Items

- Build check: expected to pass before submission of this checklist.
- Export verification: expected to pass before submission of this checklist.
- Target remote AI requests are explicitly role-safe.
- Target remote AI quality failures do not silently enter traditional fallback.
- Batch remote AI requests include target metadata.
- ROI / mask changes clear stale processed / adjusted results.
- False-pass safety gate report shows `9/120 -> 0/120`.
- Batch ZIP export script verifies missing-mask skip, ZIP structure, JPG naming, and original / 2K / 4K dimensions.

## 11. Not Verified In This Pass

- Full manual browser flow with actual user image upload.
- Live FastAPI remote AI request from the browser.
- Visual confirmation of target mask overlay on all representative categories.
- Visual before / after / split comparison check.
- Visual color-block check on real high-risk hanger, metal clip, edge-touching, and closeup samples.
- Manual confirmation that downloaded files visually match the current preview.

## 12. Known Risks

- `README.md` still contains MVP-era wording that says the current version does not depend on a backend and AI segmentation is not connected; this is documentation drift, not a runtime blocker for this checklist.
- Some high-risk no-ROI success cases in hanger / metal / clip or edge-touching scenes still require user review or manual mask guidance.
- The known P0 too-narrow baseline still includes two historical false-pass cases from the P0 report; later post-fix regression has stricter false-pass gates, but this checklist did not rerun the P0 suite.
- This pass relies on build / export scripts and code review; it does not replace a real browser acceptance session with the FastAPI server and `model.onnx`.

## 13. Larger Regression Recommendation

Recommended before production release:

1. Run a manual browser E2E pass using the live FastAPI server and `remote-ai`.
2. Reuse the post-fix regression sample categories for visual inspection.
3. Include hanger / metal / clip, edge-touching, closeup, white-background, and compact ROI flows.
4. Confirm blocked cases show actionable user guidance and do not produce exportable processed images.

## 14. Packaging Recommendation

This branch can proceed toward release packaging after:

- `npm run build` passes.
- `npm run verify:export` passes.
- Optional backend `py_compile` passes.
- A manual browser pass confirms upload, ROI drawing, remote AI, comparison views, and downloaded images visually behave as expected.

## 15. Submission Recommendation

Recommend committing this checklist as release acceptance documentation after the validation commands pass.

Suggested commit message:

`docs: add E2E release acceptance checklist`

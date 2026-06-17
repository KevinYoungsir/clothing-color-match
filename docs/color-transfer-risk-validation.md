# Color Transfer Risk Validation

## 1. 验证背景

当前稳定标签：`stable-regression-false-pass-gates-20260616`

本轮目标是验证 remote AI mask 进入真实前端校色链路前后的风险，而不是继续调整分割算法、ROI 安全门、前端校色逻辑或导出逻辑。

本轮未执行真实浏览器 colorTransfer 视觉回归；风险判断基于：

- 前端调用链路代码
- 后端 quality / diagnostics 返回逻辑
- `ai-server/debug/` 中的 post-fix regression summary / mask 输出
- `npm run build`
- `npm run verify:export`

## 2. 验证范围

重点检查：

- post-fix regression 原 9 个 false pass case
- 修复后应被阻断的 `too_wide_roi` / `too_narrow_roi`
- representative success case
- hanger / metal / clip 高风险样本
- edge-touching 高风险样本
- trouser white-background too-wide 样本
- batch remote AI metadata / export 链路

## 3. 前端 Color Transfer 链路

### 单图链路

1. 用户上传标准图和样品图。
2. 用户选择识别方式和 ROI / 手动 mask。
3. `App.tsx` 调用 `ensureTargetMask()`。
4. `ensureTargetMask()` 调用 `runGarmentSegmentation()`。
5. `segmentationProvider.ts` 通过 remote AI 请求后端 `/segment-garment`。
6. 后端返回 `success / mask / quality / diagnostics / message`。
7. 前端解码 mask，执行前端兜底质量判断。
8. 通过后，`storeAutoTargetMask()` 写入 target mask。
9. `transferLabColor()` 使用 target mask 权重进行 Lab 迁移。
10. `processedImages / adjustedImages` 保存可预览和可导出的结果。

### 批量链路

1. `processBatchImages()` 逐张处理样品图。
2. 批量 remote AI 请求显式携带 `debugRole: "target"` 和 `sampleId: sample.id`。
3. remote AI quality failure 会被 `runGarmentSegmentation()` 识别为 target 失败。
4. 异常会进入 batch item `failed`，或被 `isAutoMaskResultUsable()` 标记为 `needs-manual-fix`。
5. 只有 `result` 存在的 batch item 会进入 `processedResults` 并参与 ZIP 导出。

## 4. Safety Gate 与 Color Transfer 关系

`transferLabColor()` 本身只按 `targetMask` 的 alpha 权重写入像素：

- mask 权重为 0 的像素不会被修改。
- mask 尺寸不匹配会抛错。
- 非 full-image 模式下缺少 target mask 会抛错。

因此，色块风险的主要入口不是 `colorTransfer` 自身，而是：

- 不可靠 mask 被错误写入 target mask；
- remote AI 被阻断后又 fallback 到传统 mask，并且传统 mask 通过质量检查；
- ROI / mask 改变后旧的 processed result 未清理，导出复用了旧结果。

## 5. Blocked Case 验证

原 9 个 post-fix false pass 在当前修复后均已阻断：

| caseId | roiMode | backendQuality | frontendShouldAllowColorTransfer | actualRiskType | riskLevel | reason | recommendedAction | needsManualMask | shouldBlockExport |
|---|---|---|---|---|---|---|---|---|---|
| `edge_touching_subject_001_too_narrow_roi` | too_narrow_roi | `low_confidence` | no | partial / edge-touch local patch | P0 | mask foreground is too local and postclip boundary contact remains | keep blocked; require manual mask or adjusted ROI | yes | yes |
| `hanger_metal_clip_001_too_wide_roi` | too_wide_roi | `roi_too_wide` | no | over-wide ROI with prop risk | P0 | ROI is too wide and includes high-risk hanger/metal area | keep blocked | yes | yes |
| `hanger_metal_clip_002_too_wide_roi` | too_wide_roi | `roi_too_wide` | no | over-wide ROI with prop risk | P0 | ROI is too wide and includes high-risk hanger/metal area | keep blocked | yes | yes |
| `jacket_hanger_001_too_narrow_roi` | too_narrow_roi | `partial` | no | local patch | P0 | small ROI only covers local area | keep blocked; manual mask | yes | yes |
| `trouser_hanger_001_too_narrow_roi` | too_narrow_roi | `partial` | no | local patch | P0 | small ROI only covers local pants area | keep blocked; manual mask | yes | yes |
| `trouser_hanger_003_too_narrow_roi` | too_narrow_roi | `partial` | no | local patch | P0 | small ROI only covers local pants area | keep blocked; manual mask | yes | yes |
| `trouser_whitebg_001_too_wide_roi` | too_wide_roi | `roi_too_wide` | no | over-wide ROI | P0 | ROI is intentionally too wide | keep blocked | yes | yes |
| `trouser_whitebg_002_too_wide_roi` | too_wide_roi | `roi_too_wide` | no | over-wide ROI | P0 | ROI is intentionally too wide | keep blocked | yes | yes |
| `trouser_whitebg_003_too_wide_roi` | too_wide_roi | `roi_too_wide` | no | over-wide ROI | P0 | ROI is intentionally too wide | keep blocked | yes | yes |

Current backend behavior is correct for these 9 cases. They should not enter color transfer or export as newly processed results.

## 6. Frontend Bypass / Fallback Review

### Confirmed safe behavior

- Batch processing passes `debugRole: "target"`.
- In batch, remote AI target quality failures do not silently become processed images.
- `processBatchImages()` only exports entries with `result`.
- `verify:export` confirms missing-mask items are skipped.

### Potential single-image risk

`App.tsx` target calls rely on implicit target role by passing `mode: "garment"` but do not explicitly pass `debugRole: "target"` in `ensureTargetMask()` and `handleRegenerateAutoMask()`.

`fetchRemoteAiMask()` correctly derives target role internally, but `runGarmentSegmentation()` currently checks only `input.debugRole === "target"` when deciding whether a remote AI quality failure must stop instead of attempting traditional fallback.

Risk:

- The bad remote mask itself is not returned.
- But a remote AI blocked target case can still attempt traditional fallback in the single-image path.
- If the traditional fallback passes its generic coverage checks, it can enter `colorTransfer`.

Risk level: P1. This should be fixed in a frontend safety patch by either explicitly passing `debugRole: "target"` from `App.tsx` or deriving the role consistently inside `runGarmentSegmentation()`.

## 7. Export Risk Review

### New processing path

Blocked new results should not be exported:

- single-image download catches failures and does not call `downloadBlob`;
- batch processing only exports `existingResults + processedResults`;
- failed / needs-manual-fix / missing-mask batch items have no `result`.

### Stale result path

Potential risk remains if a user has an old `processedImages` or `adjustedImages` entry and later changes ROI / mask state:

- `handleGarmentRoiChange()` marks the sample unrecognized but does not clear old processed image data.
- `handleBatchDownload()` exports existing processed results before processing missing ones.

Risk level: P1. This does not mean blocked current cases are exported, but stale results could be reused after ROI/mask changes. A small frontend fix should clear processed / adjusted results when ROI changes or when an auto mask is invalidated.

## 8. Success Case Risk Analysis

Representative success masks from post-fix regression:

| caseId | category | imageType | roiMode | backendQuality | frontendShouldAllowColorTransfer | actualRiskType | riskLevel | reason | recommendedAction | needsManualMask | shouldBlockExport |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `trouser_whitebg_001_compact_roi` | trouser | whitebg | compact_roi | `success` | yes | low | P3 | mask is continuous and mostly follows pants body | allow | no | no |
| `trouser_hanger_002_compact_roi` | trouser | hanger | compact_roi | `success` | yes | hanger / edge review risk | P2 | compact mask succeeds but hanger scenes remain higher-risk than white background | allow with visual review | optional | no |
| `closeup_detail_002_compact_roi` | garment | closeup_detail | compact_roi | `success` | yes | closeup local-region risk | P2 | closeup mask is valid for local fabric but may not represent whole garment | allow only if user intended local detail ROI | optional | no |
| `hanger_metal_clip_003_no_roi` | garment | hanger_metal_clip | no_roi | `success` | yes | top prop / clip edge risk | P1 | saved mask covers garment body but includes small top structure risk | prefer compact ROI or manual review before color transfer | yes for production | no if manually accepted |
| `edge_touching_subject_002_no_roi` | garment | edge_touching_subject | no_roi | `success` | yes | edge-touching / boundary pollution | P1 | mask is large and touches complex image edge; color transfer may affect edge artifacts | prefer compact ROI or manual mask | yes | no if manually accepted |
| `jacket_hanger_002_no_roi` | jacket | hanger | no_roi | `success` | yes | support / metal below jacket risk | P1 | historical P0 report already flagged jacket hanger no-ROI as prop-pollution risk | prefer compact ROI; do not rely on no-ROI for production | yes | no if manually accepted |

## 9. Hanger / Metal / Clip Risk

Hanger / metal / clip images remain the highest non-blocked risk group. The safety gates correctly block intentionally too-wide cases, but no-ROI success can still include small prop structures around the neckline or support area.

Recommendation:

- Keep too-wide gates as-is.
- Prefer compact ROI for hanger / metal / clip images.
- Add user-facing guidance or a manual-mask prompt for hanger-heavy success masks in a future frontend pass.

## 10. Edge-touching Risk

Edge-touching samples can pass no-ROI while still showing boundary-sensitive masks. The backend gates block too-narrow local patch cases after the false-pass fix, but edge-touching success masks should be treated as review-required.

Recommendation:

- Keep backend safety gates unchanged.
- Add frontend warning or review hint when diagnostics / mask stats indicate strong edge contact.

## 11. Trouser White-background Risk

The formerly false-pass `trouser_whitebg_*_too_wide_roi` cases now return `roi_too_wide` and should be blocked. Compact ROI trouser white-background success masks are comparatively low-risk.

Recommendation:

- No backend change needed for trouser white-background too-wide cases.
- Continue allowing compact ROI success.

## 12. Does Any Blocked Case Still Enter Color Transfer?

Backend blocked masks are not directly returned to `colorTransfer`.

However, the single-image frontend path has a fallback-risk gap:

- target role is implicit in some `App.tsx` calls;
- `runGarmentSegmentation()` only checks explicit `input.debugRole === "target"` when deciding whether to forbid fallback after remote quality failure;
- therefore a blocked remote AI target can still attempt traditional fallback in single-image flows.

Batch flow is safer because it passes explicit `debugRole: "target"`.

## 13. Can Batch Export Output Blocked Cases?

Current batch processing should not output newly blocked cases because failed items do not produce `result`.

Potential stale-export risk remains:

- previously processed results are reused by batch ZIP;
- ROI changes do not currently clear existing processed / adjusted image data.

This is a frontend state-management risk, not a backend mask-gate risk.

## 14. Recommendations

### Frontend

Recommended next-stage frontend safety patch:

1. Pass `debugRole: "target"` explicitly from all target mask calls in `App.tsx`.
2. Or change `runGarmentSegmentation()` to derive target role using the same role logic as `fetchRemoteAiMask()`.
3. Clear `processedImages` / `adjustedImages` when ROI changes or target mask is invalidated.
4. Consider warning users when no-ROI success occurs on hanger / metal / clip or edge-touching images.

### Backend

No immediate backend algorithm or safety-gate change is recommended from this validation.

### Manual Mask Prompt

Recommended for:

- hanger / metal / clip no-ROI success;
- edge-touching no-ROI success;
- any success with visible prop contamination around the neck, hanger, metal, support, or image border.

## 15. Conclusion

The backend safety fixes correctly block the original 9 post-fix false-pass cases. Batch processing also respects blocked / failed cases and should not emit newly processed blocked images.

The remaining risk is frontend-side:

- single-image remote AI target failures may still fall back to traditional segmentation because target role is not passed explicitly in all calls;
- stale processed results may remain exportable after ROI/mask changes;
- some no-ROI success masks in high-risk image types still need manual review before production color transfer.

Recommended next step: a small frontend safety patch, not a backend model or color-transfer change.

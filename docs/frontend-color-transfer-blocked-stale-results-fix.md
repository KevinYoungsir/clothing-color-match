# Frontend Blocked Mask and Stale Result Fix

## 1. 问题背景

`docs/color-transfer-risk-validation.md` 指出两个前端风险点：

1. 单图 target 请求没有显式传 `debugRole: "target"`，而 `runGarmentSegmentation()` 只检查显式 `input.debugRole === "target"` 来决定 remote AI 质量失败后是否禁止 fallback。
2. ROI / mask 变化后，旧的 `processedImages` / `adjustedImages` 仍可能被批量 ZIP 优先复用，造成 stale result 导出风险。

本修复只处理前端状态与调用链路，不修改后端算法、ROI 安全门、候选评分、模型或 `colorTransfer` 算法。

## 2. 单图 target fallback 风险

修复前：

- `App.tsx` 的单图 target 自动识别请求依赖 `mode: "garment"` 隐式推导 target role。
- `fetchRemoteAiMask()` 可以正确推导 target role。
- 但 `runGarmentSegmentation()` 的 catch 分支只使用显式 `input.debugRole === "target"` 判断是否禁止 traditional fallback。
- 因此 remote AI target 被后端 `partial / low_confidence / over_coverage / roi_too_wide` 阻断后，单图路径仍可能尝试传统识别。

修复后：

- `App.tsx` 的 target 自动识别请求显式传入 `debugRole: "target"`。
- `runGarmentSegmentation()` 使用内部 `getDebugRole(input)` 统一推导 role。
- remote AI target 被质量门阻断后，不会静默 fallback 到 traditional segmentation。

## 3. Stale processed / adjusted result 风险

修复前：

- ROI 改变后会标记样品 mask 为 `unrecognized`，但旧的 `processedImages` / `adjustedImages` 不一定清除。
- 清除 ROI 后，旧 auto mask 也可能继续保留。
- 批量 ZIP 会优先复用已有 processed / adjusted result。

修复后：

- 新增 `clearSampleDerivedResult(imageId)`，统一清理：
  - `processedImages`
  - `adjustedImages`
  - `colorDifferenceResults`
  - sample process status / message
  - batch status
- 新增 `invalidateAutoTargetMask(image)`，在 ROI 改变或清除时：
  - 清理旧派生结果
  - 对非手动 mask 清空旧 auto mask
  - 将 mask 状态恢复为 `unrecognized`
- 手动 mask 绘制、撤销、重做、清空都会清理对应样品的旧派生结果。
- 自动重新识别 target 前会先清理旧派生结果；如果识别失败或被 blocked，不会继续导出旧校色图。

## 4. 修改文件

- `src/App.tsx`
- `src/core/segmentationProvider.ts`
- `docs/frontend-color-transfer-blocked-stale-results-fix.md`

## 5. 是否修改后端

没有。

## 6. 是否修改 colorTransfer 算法

没有。`src/core/colorTransfer.ts` 未修改。

## 7. Blocked target 是否还能 fallback

target remote AI quality failure 现在通过 `getDebugRole(input)` 判断 target role。即使调用方忘记显式传 `debugRole`，只要可从 `mode: "garment"` 推导为 target，就会阻止 fallback。

此外，`App.tsx` 的 target 请求也显式传入 `debugRole: "target"`。

## 8. ROI / mask 变化后旧结果是否会清理

会。

触发清理的路径包括：

- ROI 保存
- ROI 清除
- target mask 绘制开始
- target mask undo / redo
- target mask clear
- target auto mask 重新生成
- auto target mask 成功写入前

Reference mask 改动仍沿用原有全量清理逻辑。

## 9. Batch export 是否还会输出 stale result

当前修复降低了 stale export 风险：

- ROI / mask 变化会删除对应样品的旧 processed / adjusted result。
- failed / blocked 后不会保留旧派生结果用于 ZIP。
- 批量路径本身已显式传入 `debugRole: "target"`。

如果用户未改变 ROI / mask，已有 processed result 仍会被视为有效缓存，这是当前产品行为。

## 10. 验证结果

- `npm run build`: passed
- `npm run verify:export`: passed

## 11. 是否建议提交

建议提交。建议提交信息：

`fix: block stale color transfer results after mask changes`

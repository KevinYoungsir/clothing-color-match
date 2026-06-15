# P0 Garment Mask Sample Results

## 1. P0 测试目标

本轮用于建立 P0 多品类 remote AI mask 的样本清单、执行记录和人工验收结果。

本轮不进行模型、候选评分、mask 后处理或安全门优化。现有
`roi_too_wide`、`over_coverage`、`partial`、`low_confidence` 等安全失败必须
继续生效。不可靠 mask 不允许进入 `colorTransfer`。

## 2. P0 样本准备清单

每类至少准备 3 张，共至少 24 张原始样本。

本地样本建议放在：

```txt
ai-server/test-assets/p0-garment-mask/
```

`test-assets/` 仅用于本地测试，不应提交到 Git。

| Sample ID | Sample type | Suggested file | Prepared | Notes |
| --- | --- | --- | --- | --- |
| 001 | `trouser_whitebg` | `trouser_whitebg_001.jpg` | [ ] | |
| 002 | `trouser_whitebg` | `trouser_whitebg_002.jpg` | [ ] | |
| 003 | `trouser_whitebg` | `trouser_whitebg_003.jpg` | [ ] | |
| 001 | `jacket_whitebg` | `jacket_whitebg_001.jpg` | [ ] | |
| 002 | `jacket_whitebg` | `jacket_whitebg_002.jpg` | [ ] | |
| 003 | `jacket_whitebg` | `jacket_whitebg_003.jpg` | [ ] | |
| 001 | `polo_whitebg` | `polo_whitebg_001.jpg` | [ ] | |
| 002 | `polo_whitebg` | `polo_whitebg_002.jpg` | [ ] | |
| 003 | `polo_whitebg` | `polo_whitebg_003.jpg` | [ ] | |
| 001 | `tshirt_whitebg` | `tshirt_whitebg_001.jpg` | [ ] | |
| 002 | `tshirt_whitebg` | `tshirt_whitebg_002.jpg` | [ ] | |
| 003 | `tshirt_whitebg` | `tshirt_whitebg_003.jpg` | [ ] | |
| 001 | `trouser_hanger` | `trouser_hanger_001.jpg` | [ ] | |
| 002 | `trouser_hanger` | `trouser_hanger_002.jpg` | [ ] | |
| 003 | `trouser_hanger` | `trouser_hanger_003.jpg` | [ ] | |
| 001 | `jacket_hanger` | `jacket_hanger_001.jpg` | [ ] | |
| 002 | `jacket_hanger` | `jacket_hanger_002.jpg` | [ ] | |
| 003 | `jacket_hanger` | `jacket_hanger_003.jpg` | [ ] | |
| 001 | `trouser_closeup_detail` | `trouser_closeup_detail_001.jpg` | [ ] | |
| 002 | `trouser_closeup_detail` | `trouser_closeup_detail_002.jpg` | [ ] | |
| 003 | `trouser_closeup_detail` | `trouser_closeup_detail_003.jpg` | [ ] | |
| 001 | `garment_with_hanger_metal_clip` | `garment_with_hanger_metal_clip_001.jpg` | [ ] | |
| 002 | `garment_with_hanger_metal_clip` | `garment_with_hanger_metal_clip_002.jpg` | [ ] | |
| 003 | `garment_with_hanger_metal_clip` | `garment_with_hanger_metal_clip_003.jpg` | [ ] | |

## 3. ROI 测试模式

每张样本至少执行以下 4 种模式，共至少 96 个测试 case。

| ROI mode | Definition | Expected safety behavior |
| --- | --- | --- |
| `no_roi` | 不传入 ROI，使用整张样品图识别。 | 可靠时可成功；不可靠时必须安全失败。 |
| `compact_roi` | 完整包住服装主体，并尽量避开背景和道具。 | 优先争取可靠 `success`。 |
| `too_wide_roi` | 故意包含较多背景、衣架或支架。 | 应被 `roi_too_wide`、`over_coverage` 或其他安全门阻断。 |
| `too_narrow_roi` | 故意裁断服装主体或只覆盖局部。 | 应被 `partial` 或 `low_confidence` 阻断。 |

ROI 坐标统一使用：

```txt
x,y,width,height
```

## 4. caseId 命名规则

格式：

```txt
category_imageType_index_roiMode
```

示例：

- `trouser_whitebg_001_no_roi`
- `trouser_whitebg_001_compact_roi`
- `trouser_whitebg_001_too_wide_roi`
- `trouser_whitebg_001_too_narrow_roi`
- `jacket_hanger_001_compact_roi`
- `polo_whitebg_001_no_roi`

caseId 不包含测试日期，便于不同代码版本使用同一 caseId 对比结果。测试日期和
commit hash 单独记录。

## 5. 测试环境记录

| Field | Value |
| --- | --- |
| Test date | |
| Git branch | `test/p0-garment-mask-samples` |
| Git commit | |
| Model path | `ai-server/models/model.onnx` |
| Python version | |
| ONNX Runtime version | |
| Clothing labels | `4,5,6,7` |
| Input size | `512` |
| Tester | |

## 6. verify_lightweight_image.py 命令模板

从 `ai-server` 目录运行。

### compact ROI

```powershell
cd "D:\Color Calibration\ai-server"

python scripts\verify_lightweight_image.py `
  --model-path "models\model.onnx" `
  --image-path "test-assets\p0-garment-mask\trouser_whitebg_001.jpg" `
  --roi "120,80,900,1300" `
  --case-id "trouser_whitebg_001_compact_roi" `
  --category "trouser" `
  --image-type "whitebg" `
  --expected-result "success" `
  --summary-json "debug\multi-garment\trouser_whitebg_001_compact_roi\summary.json" `
  --output "debug\multi-garment\trouser_whitebg_001_compact_roi\mask.png"
```

### no ROI

```powershell
cd "D:\Color Calibration\ai-server"

python scripts\verify_lightweight_image.py `
  --model-path "models\model.onnx" `
  --image-path "test-assets\p0-garment-mask\trouser_whitebg_001.jpg" `
  --case-id "trouser_whitebg_001_no_roi" `
  --category "trouser" `
  --image-type "whitebg" `
  --expected-result "success" `
  --summary-json "debug\multi-garment\trouser_whitebg_001_no_roi\summary.json" `
  --output "debug\multi-garment\trouser_whitebg_001_no_roi\mask.png"
```

为 `too_wide_roi` 和 `too_narrow_roi` 测试设置对应的 `--roi` 坐标，并按人工预期
设置 `--expected-result`。预期值只用于结果对照，不会改变质量门。

## 7. Label inspection 命令模板

当结果包含背景、衣架、金属杆、夹子或只识别局部时，使用 label inspection
查看每个类别和各阶段 mask。

```powershell
cd "D:\Color Calibration\ai-server"

python scripts\inspect_label_masks.py `
  --model-path "models\model.onnx" `
  --image-path "test-assets\p0-garment-mask\trouser_whitebg_001.jpg" `
  --case-id "trouser_whitebg_001_compact_roi" `
  --category "trouser" `
  --image-type "whitebg" `
  --roi "120,80,900,1300" `
  --output-dir "debug\multi-garment\trouser_whitebg_001_compact_roi"
```

该脚本会输出 per-label mask、组合阶段图和 `inspection-summary.json`，ONNX
仍只运行一次。

## 8. 结果记录表

每个 case 填写一行。布尔字段建议统一使用 `yes`、`no` 或 `n/a`。

| caseId | samplePath | category | imageType | roiMode | roi | expectedResult | actualSuccess | actualQuality | foregroundRatio | selectedThreshold | selectedScore | candidateScoringMs | onnxRunCount | backgroundPollution | hangerPollution | metalRodPollution | clipPollution | skinArmPollution | partialMask | enteredColorTransfer | colorBlockObserved | texturePreserved | manualPassFail | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `trouser_whitebg_001_no_roi` | `test-assets/p0-garment-mask/trouser_whitebg_001.jpg` | `trouser` | `whitebg` | `no_roi` | `n/a` | `success` | | | | | | | | | | | | | | | | | | |
| `trouser_whitebg_001_compact_roi` | `test-assets/p0-garment-mask/trouser_whitebg_001.jpg` | `trouser` | `whitebg` | `compact_roi` | | `success` | | | | | | | | | | | | | | | | | | |
| `trouser_whitebg_001_too_wide_roi` | `test-assets/p0-garment-mask/trouser_whitebg_001.jpg` | `trouser` | `whitebg` | `too_wide_roi` | | `roi_too_wide` | | | | | | | | | | | | | | | | | | |
| `trouser_whitebg_001_too_narrow_roi` | `test-assets/p0-garment-mask/trouser_whitebg_001.jpg` | `trouser` | `whitebg` | `too_narrow_roi` | | `partial` | | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | | | | | | | | |

结果来源：

- 自动字段优先从 `summary.json` 复制。
- 污染、色块、纹理和最终通过结论由人工查看 mask PNG 与网页结果后填写。
- `enteredColorTransfer=yes` 但 mask 不可靠时，必须记录为失败。

## 9. 人工验收 Checklist

每个 case 都要确认：

- [ ] mask 是否连续覆盖服装主体。
- [ ] 是否误识别背景。
- [ ] 是否误识别衣架。
- [ ] 是否误识别金属杆。
- [ ] 是否误识别夹子。
- [ ] 是否误识别皮肤或手臂。
- [ ] 是否误识别内搭。
- [ ] 是否只识别服装局部。
- [ ] 不可靠结果是否被阻止进入 `colorTransfer`。
- [ ] 可靠结果是否按预期进入 `colorTransfer`。
- [ ] 校色后是否出现矩形、斑块或局部色块。
- [ ] 纹理、褶皱、图案、光影和明暗关系是否保留。
- [ ] 失败结果是否属于正确安全失败。

## 10. 通过标准

- `success` 只有在 mask 连续覆盖服装主体、没有明显背景或道具污染，并且不会
  产生色块时才算通过。
- 困难场景中的正确安全失败也算通过。
- `partial`、`low_confidence`、`over_coverage` 或 `roi_too_wide` 只要正确
  阻断 `colorTransfer`，就算通过。
- 任何不可靠 mask 被写入 `targetMask`、生成 `appliedMask` 或进入
  `colorTransfer` 的 case 都算失败。
- 任何进入 `colorTransfer` 后产生明显色块的 case 都算失败。
- 自动建议不能代替人工检查 mask PNG 和网页校色结果。

## 11. 待优化问题记录

仅记录问题，不在本测试分支修改算法。

| Issue ID | Category | Image type | Case ID | Failure mode | Summary JSON | Mask PNG | Suggested next step | Algorithm change needed | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0-ISSUE-001 | | | | | | | | | |

建议的 failure mode：

- `background_pollution`
- `hanger_pollution`
- `metal_rod_pollution`
- `clip_pollution`
- `skin_arm_pollution`
- `partial_mask`
- `incorrect_success`
- `incorrect_failure`
- `color_block`
- `performance_regression`

## 12. 汇总统计

### 总体统计

| Metric | Count | Rate | Notes |
| --- | ---: | ---: | --- |
| Total cases | 0 | 100% | 目标至少 96 |
| `success` | 0 | 0% | 仅统计人工确认可靠的成功 |
| Safe failures | 0 | 0% | 正确阻断的不可靠结果 |
| Incorrect passes | 0 | 0% | 不可靠 mask 被错误放行 |
| Color-block cases | 0 | 0% | 任何明显色块均计入 |
| Manual passes | 0 | 0% | 可靠成功 + 正确安全失败 |
| Manual failures | 0 | 0% | 错误放行、错误失败或色块 |

### 按品类统计

| Category | Total | Success | Safe failure | Incorrect pass | Color block | Manual pass rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trousers | 0 | 0 | 0 | 0 | 0 | 0% |
| Jacket | 0 | 0 | 0 | 0 | 0 | 0% |
| Polo | 0 | 0 | 0 | 0 | 0 | 0% |
| T-shirt | 0 | 0 | 0 | 0 | 0 | 0% |
| Mixed garment with props | 0 | 0 | 0 | 0 | 0 | 0% |

### 按图像类型统计

| Image type | Total | Success | Safe failure | Incorrect pass | Color block | Manual pass rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `whitebg` | 0 | 0 | 0 | 0 | 0 | 0% |
| `hanger` | 0 | 0 | 0 | 0 | 0 | 0% |
| `closeup_detail` | 0 | 0 | 0 | 0 | 0 | 0% |
| `hanger_metal_clip` | 0 | 0 | 0 | 0 | 0 | 0% |

## 13. 执行完成条件

- [ ] 已准备至少 24 张 P0 样本。
- [ ] 已执行至少 96 个 ROI case。
- [ ] 每个 case 都有 `summary.json` 或明确的执行失败记录。
- [ ] 每个 case 都完成人工 mask 检查。
- [ ] 所有 `success` 都确认不会产生色块。
- [ ] 所有不可靠结果都确认未进入 `colorTransfer`。
- [ ] 所有问题都已登记到待优化问题记录区。
- [ ] 已更新总体、品类和图像类型统计。

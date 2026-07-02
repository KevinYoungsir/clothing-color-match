# Internal Release Handoff

## 1. 交付版本信息

| 项目 | 值 |
| --- | --- |
| 产品 | Clothing Color Match Studio |
| 交付类型 | 内部候选发布版本 |
| main 当前提交 | `6054a28847a5bab11af7e19570cbb96880d6da1b` (`6054a28`) |
| main 提交说明 | `Merge pull request #23 from KevinYoungsir/docs/internal-release-package-guide` |
| 最终候选标签 | `release-candidate-internal-docs-20260616`，指向 `6054a28` |
| 功能稳定标签 | `stable-manual-mask-guidance-20260616`，指向 `a8f0ba8` |
| 交付文档分支 | `docs/internal-release-handoff` |

本交付以 `release-candidate-internal-docs-20260616` 为候选基线。组员复现问题或反馈结果时，应同时提供实际 commit、模型版本、环境变量和测试图片类型。

## 2. 当前版本定位

当前版本定位为：

> AI 自动识别辅助 + 手动蒙版兜底的内部候选发布版本。

- AI mask 用于生成初始服装范围，不能替代人工检查。
- AI 识别不完整，或包含衣架、金属夹具、背景时，应使用手动蒙版修正。
- 手动蒙版是复杂场景的最终校色范围。
- 本版本不应宣传为完全自动识别，也不适合无人复核的生产批处理。

## 3. 功能范围

当前候选版本包含：

- 参考图上传和参考服装区域选择。
- 单张或批量样品图上传。
- FastAPI remote AI mask 服务和 lightweight ONNX 分割。
- 传统识别、AI mask、ROI / promptBox 和手动蒙版编辑。
- 不可靠 target mask 的 blocked / failed 安全阻断。
- 基于有效参考区域和目标蒙版的 Lab 自动校色。
- 亮度、对比度、饱和度、色相、曝光、阴影、高光、白平衡等手动调色。
- 单图、左右和分割对比预览。
- 单图导出。
- 批量 ZIP 导出。
- 原尺寸、2K（长边 2048px）和 4K（长边 4096px）导出。

## 4. 本地部署入口

完整说明见 [`docs/internal-release-package-guide.md`](internal-release-package-guide.md) 和 [`README.md`](../README.md)。

### 4.1 前端

在项目根目录创建本地 `.env.local`：

```txt
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
```

启动前端：

```powershell
cd "D:\Color Calibration"
npm install
npm run dev
```

默认访问 `http://localhost:5173/`。修改 `.env.local` 后需要重启 Vite。

### 4.2 后端

首次准备 Python 3.11 / 3.12 环境：

```powershell
cd "D:\Color Calibration\ai-server"
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-lightweight.txt
```

启动真实 lightweight ONNX 服务：

```powershell
cd "D:\Color Calibration\ai-server"
.venv\Scripts\activate

$env:AI_SEGMENTER="lightweight"
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
$env:AI_LIGHTWEIGHT_CLOTHING_LABELS="4,5,6,7"
$env:AI_LIGHTWEIGHT_INPUT_SIZE="512"
$env:AI_LIGHTWEIGHT_TARGET_NORMALIZATION="imagenet"
$env:AI_DEBUG_SAVE_MASKS="0"

uvicorn main:app --host 127.0.0.1 --port 8000
```

健康检查：

```powershell
curl.exe http://localhost:8000/health
```

预期返回 `{"ok":true}`。

### 4.3 模型位置

模型不包含在仓库或发布文档提交中。默认本地位置：

```txt
D:\Color Calibration\ai-server\models\model.onnx
```

从 `ai-server` 目录启动时使用：

```powershell
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
```

也可以配置仓库外绝对路径。模型必须通过受控内部渠道单独交付，并记录来源、版本和许可。

### 4.4 主要环境变量

| 变量 | 推荐值 | 用途 |
| --- | --- | --- |
| `VITE_AI_SEGMENTATION_API` | `http://localhost:8000/segment-garment` | 前端 remote AI 接口。 |
| `VITE_AI_SEGMENTATION_TIMEOUT_MS` | `60000` | 前端请求超时。 |
| `AI_SEGMENTER` | `lightweight` | 启用 lightweight ONNX。 |
| `AI_LIGHTWEIGHT_MODEL_PATH` | `models\model.onnx` | 模型路径。 |
| `AI_LIGHTWEIGHT_CLOTHING_LABELS` | `4,5,6,7` | 当前模型服装标签。 |
| `AI_LIGHTWEIGHT_INPUT_SIZE` | `512` | 推理输入尺寸。 |
| `AI_LIGHTWEIGHT_TARGET_NORMALIZATION` | `imagenet` | target 预处理。 |
| `AI_DEBUG_SAVE_MASKS` | `0` | 内部使用时关闭 debug 输出。 |

已验证的高级阈值和 ROI 安全参数应沿用当前默认值，不要为了提高 AI success 数量而临时放宽。

### 4.5 PowerShell 拦截 `npm.ps1`

优先直接使用 Windows 命令入口：

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run verify:export
```

也可以仅为当前 PowerShell 进程临时放行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

不要将系统级执行策略永久改为 `Unrestricted`。受管理设备应遵守公司安全策略。

## 5. 内部使用流程

1. 启动 FastAPI 后端，确认 `/health` 正常。
2. 启动 Vite 前端并打开浏览器页面。
3. 上传标准图，确认参考服装区域准确。
4. 上传一张或多张样品图。
5. 优先尝试 AI 识别，检查生成的服装蒙版。
6. 如果 AI mask 漏选服装，或选中背景、衣架、金属杆、夹具，切换到手动蒙版修正。
7. 以最终确认的蒙版执行自动校色和必要的手动调色。
8. 使用单图、左右或分割对比检查服装边缘、背景和纹理。
9. 确认没有色块、边缘污染或 ROI 外染色后，再执行单图或批量导出。

## 6. 安全链路说明

- `blocked`、`failed`、`partial`、`low_confidence`、`over_coverage`、`roi_too_wide` 等不可靠 target 结果不得进入 `colorTransfer`。
- target remote AI 被阻断后，不应静默使用不可靠 traditional fallback 继续校色。
- ROI、mask、手动编辑或重新识别发生变化时，对应的旧 `processedImages` / `adjustedImages` 会被清理。
- AI 失败或 blocked 时，不应用失败结果覆盖已有可信蒙版。
- batch export 不应复用 stale result，也不应把 blocked / failed 项静默写入 ZIP。
- 手动蒙版修改后必须重新执行校色和预览，不能直接沿用修改前导出结果。

相关修复说明：

- [`docs/frontend-color-transfer-blocked-stale-results-fix.md`](frontend-color-transfer-blocked-stale-results-fix.md)
- [`docs/color-transfer-risk-validation.md`](color-transfer-risk-validation.md)
- [`docs/regression-false-pass-gate-fix.md`](regression-false-pass-gate-fix.md)

## 7. 已完成验证

| 验证项 | 结果 |
| --- | --- |
| `npm run build` | passed |
| `npm run verify:export` | passed |
| post-fix regression false pass | `9/120 -> 0/120` |
| P0 no-ROI / compact ROI 基线 | no-ROI `21/24`，compact ROI `19/24` |
| 人工浏览器 E2E | 手动蒙版路径未观察到明显色块 |
| blocked / stale result 链路 | 代码审查和人工 E2E 基本有效 |

注意：post-fix regression 的 `0/120` 是该回归样本集在安全门修复后的结果，不代表所有真实业务图都能自动识别成功。P0 报告中的既有高风险样本和人工复核要求仍然有效。

详细记录：

- [`docs/post-fix-regression-run-summary.md`](post-fix-regression-run-summary.md)
- [`docs/manual-browser-e2e-result.md`](manual-browser-e2e-result.md)
- [`docs/e2e-release-acceptance-checklist.md`](e2e-release-acceptance-checklist.md)

## 8. 已知限制

- 挂拍裤子、衣架、金属夹具和主体贴近图片边缘等场景，AI 自动识别仍可能不够精准。
- 高风险图应优先人工检查，并在需要时使用手动蒙版。
- 真实业务图片在导出前仍建议逐批人工复核。
- 2K / 4K 放大可以保持比例，但不能创造源图中不存在的真实细节。
- 当前 ONNX 标签和预处理针对本地验证模型；更换模型后必须重新检查输入、输出、标签和回归表现。
- 当前版本不是完全自动化产品，不应作为无人监督的自动校色服务对外宣传。

## 9. 组员使用注意事项

不要提交或打包进源码仓库：

```txt
ai-server/models/
ai-server/debug/
ai-server/test-assets/
ai-server/.venv/
node_modules/
dist/
.env
.env.local
__pycache__/
*.pyc
*.onnx
*.pt
*.pth
*.safetensors
*.ckpt
*.engine
*.bin
```

每次导出前必须：

- 检查参考图和样品图蒙版是否准确。
- 确认背景、皮肤、衣架、金属杆和夹具没有被选中。
- 确认服装主体没有漏选或只覆盖局部。
- 重新检查 ROI / mask 修改后的校色结果。
- 确认预览和下载图没有明显色块。

## 10. 最终交付检查清单

- [x] `release-candidate-internal-docs-20260616` 标签存在并指向 `6054a28`。
- [x] `stable-manual-mask-guidance-20260616` 标签存在并指向 `a8f0ba8`。
- [x] README 已更新为当前 FastAPI + ONNX 架构。
- [x] [`docs/internal-release-package-guide.md`](internal-release-package-guide.md) 已存在。
- [x] [`docs/manual-browser-e2e-result.md`](manual-browser-e2e-result.md) 已记录人工 E2E 结果。
- [x] 前端已增加 AI 辅助和手动蒙版兜底提示。
- [x] blocked / failed 和 stale result 安全修复已记录。
- [x] 本地前后端启动已在人工浏览器 E2E 中完成验证。
- [ ] 交付前在目标组员机器上验证 Python、Node、模型和环境变量。
- [ ] 交付前使用 3-5 张真实业务图完成最终人工复核。

## 11. 下一阶段建议

### P0：内部试用

- 使用 3-5 张真实业务图进行组员人工试用。
- 保持 blocked / failed 不进入校色。
- 保持手动蒙版兜底可用，并记录使用阻塞点。

### P1：样本收集

- 收集 AI 识别失败、局部识别和道具污染样本。
- 记录图片类型、ROI、AI quality、最终人工蒙版和是否产生色块。
- 将真实样本回归扩大到 50-100 张。

### P2：模型能力评估

- 评估更强的服装分割模型或专用品类模型。
- 对 hanger / metal / clip、edge-touching 和复杂背景场景单独回归。
- 模型升级应通过新的独立分支和完整安全回归，不应直接放宽现有质量门。

在完成目标机器验证和 3-5 张真实业务图试用前，建议保持“内部候选发布”状态，不升级为完全自动化正式产品。

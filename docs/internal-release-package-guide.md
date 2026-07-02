# Internal Release and Local Deployment Guide

## 1. 内部发布说明

Clothing Color Match Studio 是面向服装图片校色的内部验收版本，当前包含：

- React、Vite、TypeScript、Tailwind CSS 前端。
- FastAPI AI mask 服务。
- lightweight ONNX 服装分割。
- ROI、AI mask、手动蒙版编辑与安全阻断。
- 仅在有效服装蒙版内执行的 Lab 校色。
- 单图下载、批量 ZIP、原尺寸、2K、4K 导出。

当前安全基线参考 `stable-frontend-color-transfer-safety-20260616`。正式发包时还应记录实际使用的 Git commit、分支或 release tag。

本版本不应被描述为“完全自动服装识别”。真实浏览器验收表明，挂拍裤子、衣架、金属夹具和主体贴边等复杂场景仍可能识别不准。正确的产品定位是：

> AI 自动识别辅助 + 手动蒙版兜底。

低质量或被阻断的 AI mask 不得进入 `colorTransfer`。用户应检查 AI 初始蒙版，并在识别不完整或选中背景、衣架、夹具时使用手动蒙版修正。

## 2. 本地部署步骤

### 2.1 前置环境

- Windows PowerShell。
- Node.js：使用兼容 Vite 5 的 Node.js LTS 版本。
- Python 3.11 或 3.12。
- 本地 ONNX 模型文件，单独提供，不进入 Git。

先确认环境：

```powershell
node --version
npm --version
py -0p
```

建议使用两个 PowerShell 终端：一个运行 FastAPI 后端，一个运行 Vite 前端。

### 2.2 获取项目并安装依赖

```powershell
cd "D:\Color Calibration"
npm install

cd "D:\Color Calibration\ai-server"
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-lightweight.txt
```

`.venv`、`node_modules` 和生成的构建产物只保留在本机，不提交到 Git。

## 3. 前端启动步骤

在项目根目录创建本地 `.env.local`：

```txt
VITE_AI_SEGMENTATION_API=http://localhost:8000/segment-garment
VITE_AI_SEGMENTATION_TIMEOUT_MS=60000
```

启动前端：

```powershell
cd "D:\Color Calibration"
npm run dev
```

默认访问地址：

```txt
http://localhost:5173/
```

修改 `.env.local` 后必须重启 Vite。`.env.local` 是本机配置，不应提交。

生产构建和本地预览：

```powershell
npm run build
npm run preview
```

`dist/` 是可重新生成的构建产物，不提交到 Git。内部需要静态包时，应从已确认的 commit 重新构建，并在 Git 仓库之外交付构建产物。

## 4. 后端启动步骤

在独立 PowerShell 终端中运行：

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

开发时可增加 `--reload`；内部验收或稳定运行时建议不使用自动重载。

检查服务：

```powershell
curl.exe http://localhost:8000/health
```

预期结果：

```json
{"ok":true}
```

浏览器直接打开 `/segment-garment` 会发出 GET 请求并得到 `405 Method Not Allowed`，这是正常现象；该接口只接受前端提交的 POST 图片请求。

## 5. `model.onnx` 放置说明

默认本地路径：

```txt
D:\Color Calibration\ai-server\models\model.onnx
```

从 `ai-server` 目录启动后端时，对应配置为：

```powershell
$env:AI_LIGHTWEIGHT_MODEL_PATH="models\model.onnx"
```

也可以使用仓库外的绝对路径：

```powershell
$env:AI_LIGHTWEIGHT_MODEL_PATH="D:\AI Models\garment\model.onnx"
```

模型文件必须通过受控的内部渠道单独提供，并确认来源、版本和使用许可。不要把模型放入 Git commit、PR、源码压缩包或公共下载地址。

可在启动服务前检查模型契约：

```powershell
cd "D:\Color Calibration\ai-server"
python scripts\inspect_onnx_model.py --model-path "models\model.onnx"
python scripts\check_environment.py
```

## 6. 环境变量说明

### 6.1 前端

| 变量 | 推荐值 | 说明 |
| --- | --- | --- |
| `VITE_AI_SEGMENTATION_API` | `http://localhost:8000/segment-garment` | remote AI POST 接口。 |
| `VITE_AI_SEGMENTATION_TIMEOUT_MS` | `60000` | 前端 AI 请求超时，单位为毫秒。 |

### 6.2 后端必需或推荐配置

| 变量 | 推荐值 | 说明 |
| --- | --- | --- |
| `AI_SEGMENTER` | `lightweight` | 启用 lightweight ONNX segmenter。 |
| `AI_LIGHTWEIGHT_MODEL_PATH` | `models\model.onnx` | 本地模型路径。 |
| `AI_LIGHTWEIGHT_CLOTHING_LABELS` | `4,5,6,7` | 当前模型的服装类别标签；更换模型时必须重新核对。 |
| `AI_LIGHTWEIGHT_INPUT_SIZE` | `512` | 动态 NCHW 输入的推理尺寸。 |
| `AI_LIGHTWEIGHT_TARGET_NORMALIZATION` | `imagenet` | 当前 target 模型预处理方式。 |
| `AI_DEBUG_SAVE_MASKS` | `0` | 内部发布时关闭 debug PNG/JSON 写入。诊断时才临时设为 `1`。 |

### 6.3 后端高级参数

以下值是当前实现的常用配置。发布时原则上沿用已验证默认值，不应为了提高“成功率”随意放宽安全门。

| 变量 | 常用值 | 说明 |
| --- | --- | --- |
| `AI_LIGHTWEIGHT_MASK_THRESHOLD` | `0.55` | 清除低概率背景响应。 |
| `AI_LIGHTWEIGHT_MASK_GAMMA` | `1.4` | 压低弱响应并保留强 mask。 |
| `AI_LIGHTWEIGHT_MASK_BLUR` | `4` | 轻微柔化 mask 边缘。 |
| `AI_LIGHTWEIGHT_KEEP_COMPONENTS` | `2` | 保留主要连通区域。 |
| `AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO` | `0.002` | 去除小面积噪点。 |
| `AI_LIGHTWEIGHT_BODY_FILTER` | `1` | 启用服装主体形态过滤。 |
| `AI_LIGHTWEIGHT_BODY_KEEP_COMPONENTS` | `2` | 主体过滤阶段保留的区域数。 |
| `AI_LIGHTWEIGHT_TARGET_SEMANTIC_FLOOR` | `0.55` | target 语义支持下限。 |
| `AI_MASK_ROI_PADDING_RATIO` | `0.08` | ROI-first 推理的边缘余量。 |

PowerShell 环境变量只对当前终端会话生效。关闭终端后需要重新设置，或通过受控的本地启动脚本注入；启动脚本中不得包含敏感信息或被误提交。

## 7. 常见问题：PowerShell 拦截 `npm.ps1`

如果出现“无法加载 `npm.ps1`，因为在此系统上禁止运行脚本”，优先直接调用 Windows 命令入口：

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run verify:export
```

也可以只为当前 PowerShell 进程临时放行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

然后重新运行 `npm` 命令。该设置在关闭当前终端后失效。不要为了本项目把系统级策略永久改为 `Unrestricted`；受公司策略管理的设备应联系管理员。

## 8. 当前版本定位

当前版本可用于内部验收和受控的 MVP 使用，推荐流程是：

1. AI 自动识别生成初始服装蒙版。
2. 用户检查蒙版是否完整覆盖服装主体。
3. 对挂拍、衣架、金属夹具、复杂边缘或低置信场景，使用手动蒙版修正。
4. 以最终手动确认的蒙版作为校色范围。
5. 检查单图、左右或分割对比，再执行导出。

安全原则：

- `blocked`、`failed`、`partial`、`low_confidence`、`over_coverage`、`roi_too_wide` 等不可靠 target 结果不得进入校色。
- ROI 或 mask 变化后，旧的 processed / adjusted result 应被清理，不能作为新结果导出。
- AI 识别不准时应转为手动蒙版，不应通过放宽安全阈值强行成功。
- 不建议对外宣传为完全自动识别或无人复核的批处理系统。

## 9. 不要提交的内容

提交或创建 PR 前，确认以下内容没有进入 Git：

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

检查命令：

```powershell
git status --short
git ls-files | Select-String -Pattern "(^|/)(models|debug|test-assets|dist|node_modules|\.venv)/|\.(onnx|pt|pth|safetensors|ckpt|engine|bin|pyc)$"
```

如果检查结果包含模型、测试图片、debug 输出、环境文件或构建产物，应先停止发布并确认文件来源。不要用强制 Git 操作掩盖问题。

## 10. 发布包检查清单

### 10.1 版本与源码

- [ ] 记录当前 commit、分支和稳定 tag。
- [ ] `git status --short` 只包含本次预期修改，正式打包前工作区干净。
- [ ] 没有模型、测试图、debug、环境文件、依赖目录或 `dist/` 被 Git 跟踪。
- [ ] 模型通过受控渠道单独交付，并记录模型版本。

### 10.2 前端验证

- [ ] `npm install` 或 `npm ci` 成功。
- [ ] `npm run build` 通过。
- [ ] `npm run verify:export` 通过。
- [ ] `npm run dev` 可启动，浏览器可打开 Vite 页面。
- [ ] `.env.local` 指向正确的 FastAPI 地址，修改后已重启 Vite。

### 10.3 后端验证

- [ ] Python 版本为 3.11 或 3.12。
- [ ] `requirements.txt` 与 `requirements-lightweight.txt` 安装成功。
- [ ] `model.onnx` 存在且未被 Git 跟踪。
- [ ] `python scripts\check_environment.py` 无阻断错误。
- [ ] `GET /health` 返回 `{"ok":true}`。
- [ ] 后端以 `AI_SEGMENTER=lightweight` 启动。
- [ ] 发布环境显式设置 `AI_DEBUG_SAVE_MASKS=0`。

### 10.4 浏览器 E2E

- [ ] 可以上传参考图和目标图。
- [ ] remote AI 请求能到达 `/segment-garment`。
- [ ] AI mask 可预览和人工检查。
- [ ] 被阻断或失败的 target 不进入 `colorTransfer`。
- [ ] 高风险挂拍图可切换到手动蒙版并完成校色。
- [ ] 手动蒙版校色不污染背景、衣架或夹具。
- [ ] ROI / mask 修改后不会复用旧 processed / adjusted result。
- [ ] 单图、左右、分割对比正常。

### 10.5 导出验收

- [ ] 单图下载正常。
- [ ] 批量 ZIP 可生成并解压。
- [ ] blocked / failed 项不会静默进入 ZIP。
- [ ] 原尺寸导出保持原始尺寸和比例。
- [ ] 2K 长边为 2048px，比例不变。
- [ ] 4K 长边为 4096px，比例不变。
- [ ] 导出文件没有明显色块或 ROI 外污染。

全部检查通过后，才建议生成内部发布包。任何 AI mask 视觉异常都应先改用手动蒙版复核，而不是跳过安全阻断。

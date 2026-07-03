# Windows Desktop Packaging POC

## 1. 目标

本 POC 将现有 React + FastAPI + ONNX 项目封装为 Windows 桌面应用，目标是让内部组员最终无需 Git、Node、Python 命令行即可启动应用。

当前产品定位保持不变：

> AI 自动识别辅助 + 手动蒙版兜底。

桌面封装不改变 AI 分割、ROI 安全门、Lab 校色或导出业务逻辑。

## 2. 为什么不能只打包成纯 HTML

当前应用不仅包含浏览器前端，还依赖：

- FastAPI `/segment-garment` 服务。
- Python、Pillow、NumPy 和 ONNX Runtime。
- 本地 `model.onnx`。
- 后端 mask 质量门和 ROI-first 推理。

纯 HTML 无法直接承载现有 Python 服务和 ONNX Runtime，也无法保持当前后端安全链路。仅复制 `dist/` 会保留手动蒙版和部分前端能力，但不会提供真实 lightweight ONNX remote AI。

## 3. 为什么选择 Electron

Electron 可以复用现有 React/Vite UI，并由主进程管理本地后端 sidecar：

- 不重写前端业务页面。
- 开发模式直接加载 Vite。
- 生产模式加载本地 `dist/index.html`。
- 使用 PyInstaller 将 Python/FastAPI 打包成独立 exe。
- 使用 electron-builder 生成 Windows portable 程序，并为 NSIS 安装包预留配置。

## 4. 桌面架构

```txt
Electron main process
  -> BrowserWindow
     -> development: http://127.0.0.1:5173
     -> packaged: dist/index.html (file://)
  -> FastAPI sidecar lifecycle
     -> http://127.0.0.1:8765/health
     -> http://127.0.0.1:8765/segment-garment

PyInstaller backend
  -> ai-server/desktop_server.py
  -> imports existing ai-server/main.py app
  -> uses packaged resources/model/model.onnx
```

Electron 会先探测 8765 的 `/health`。如果已有健康服务，则直接连接且不负责关闭；否则启动自己的 sidecar，并在应用退出时清理该进程树。Windows 上使用进程树清理，避免 PyInstaller onefile 子进程残留并占用端口。

## 5. 前端如何加载

桌面模式使用 Vite `desktop` mode：

- `base` 设置为 `./`，保证 `file://` 下静态资源路径可用。
- AI API 固定为 `http://127.0.0.1:8765/segment-garment`。
- 请求超时固定为 `60000ms`。
- 普通 `npm run dev` 和 `npm run build` 保持原 Web 行为。

桌面 renderer 构建命令：

```powershell
npm run desktop:build
```

## 6. 后端 sidecar 如何启动

`ai-server/desktop_server.py` 是 PyInstaller 入口。它只负责：

- 读取 `AI_DESKTOP_HOST` / `AI_DESKTOP_PORT`。
- 默认使用 `127.0.0.1:8765`。
- 默认设置 `AI_SEGMENTER=lightweight`。
- 定位本地或打包资源中的 `model.onnx`。
- 默认关闭 `AI_DEBUG_SAVE_MASKS`。
- 导入并启动现有 `main.app`。

它不包含或修改分割算法。

开发模式可以设置 Python 路径：

```powershell
$env:DESKTOP_PYTHON="D:\Color Calibration\ai-server\.venv-desktop\Scripts\python.exe"
```

如果 8765 后端已由开发者手动启动，可设置连接模式：

```powershell
$env:AI_DESKTOP_CONNECT_ONLY="1"
```

## 7. `model.onnx` 放置方式

打包前必须在本机提供：

```txt
ai-server/models/model.onnx
```

该文件被 electron-builder 复制到应用资源：

```txt
resources/model/model.onnx
```

模型不会进入 Git。模型应通过受控内部渠道单独提供，并确认版本、来源和许可。

## 8. 开发模式启动

### 8.1 安装 Node 依赖

```powershell
cd "D:\Color Calibration"
npm install
```

### 8.2 准备桌面 Python 环境

推荐单独创建可重建的桌面环境：

```powershell
cd "D:\Color Calibration\ai-server"
python -m venv .venv-desktop
.venv-desktop\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements-desktop.txt
```

### 8.3 启动 Electron POC

```powershell
cd "D:\Color Calibration"
$env:DESKTOP_PYTHON="D:\Color Calibration\ai-server\.venv-desktop\Scripts\python.exe"
npm run desktop:dev
```

该命令会：

1. 启动或复用 Vite `127.0.0.1:5173`。
2. 启动 Electron 窗口。
3. 连接或启动 FastAPI `127.0.0.1:8765`。
4. Electron 退出后清理它创建的 Vite 和后端进程。

自动化 smoke test 可临时设置：

```powershell
$env:DESKTOP_SMOKE_TEST="1"
npm run desktop:dev
```

窗口完成 `ready-to-show` 后会自动退出，用于验证 Vite、Electron 和 sidecar 生命周期。正常使用不要设置该变量。

## 9. 打包命令

### 9.1 单独构建后端

```powershell
$env:DESKTOP_PYTHON="D:\Color Calibration\ai-server\.venv-desktop\Scripts\python.exe"
npm run desktop:pack-backend
```

输出：

```txt
desktop-resources/backend/ai-server-desktop.exe
```

### 9.2 检查打包前提

```powershell
npm run desktop:build
npm run desktop:check
```

检查项包括 renderer、sidecar、Electron 依赖和本地模型。

### 9.3 生成 unpacked 应用目录

```powershell
npm run desktop:pack
```

### 9.4 生成 portable Windows 应用

```powershell
npm run desktop:dist
```

### 9.5 生成 NSIS 安装包

```powershell
npm run desktop:installer
```

`desktop:dist` 和 `desktop:installer` 会重新执行 renderer、后端和前提检查，避免把旧产物打入应用。

## 10. 输出目录

| 输出 | 目录 |
| --- | --- |
| Web/desktop renderer | `dist/` |
| PyInstaller sidecar | `desktop-resources/backend/` |
| PyInstaller 临时文件 | `build/pyinstaller/` |
| electron-builder 输出 | `release-desktop/` |

这些目录均为本地构建产物，不提交 Git。

## 11. 组员如何使用

portable 版本的预期使用方式：

1. 从受控内部渠道取得 Windows portable 应用。
2. 双击 `服装校色工具-<version>-portable-x64.exe`。
3. 等待本地后端启动和桌面窗口出现。
4. 上传参考图和样品图。
5. 优先尝试 AI mask，并检查识别范围。
6. AI 不准时使用手动蒙版修正。
7. 确认没有色块或背景污染后导出。

组员不需要单独安装 Node 或 Python；它们由 Electron 和 PyInstaller 产物承载。

## 12. 注意事项

- 桌面后端仅监听 `127.0.0.1`，不对局域网开放。
- 固定端口为 8765；如果端口被非本应用服务占用，应用会启动失败并显示错误。
- 打包前显式保持 `AI_DEBUG_SAVE_MASKS=0`。
- 不要通过放宽安全门提高 AI success 数量。
- blocked / failed target 仍不得进入 `colorTransfer`。
- ROI / mask 变化后的 stale result 清理逻辑保持不变。
- 首次启动 PyInstaller onefile sidecar 可能比后续启动慢。
- 内部发布前应检查 `npm audit` 结果，但不要未经验证直接运行破坏性升级。

## 13. 不要提交的内容

```txt
ai-server/models/
ai-server/test-assets/
ai-server/debug/
ai-server/.venv/
ai-server/.venv-desktop/
desktop-resources/
release-desktop/
dist-electron/
electron-dist/
build/pyinstaller/
dist/
node_modules/
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

## 14. 当前 POC 限制

- 尚未配置正式应用图标、代码签名和发布证书。
- 尚未实现自动更新。
- 当前只配置 Windows x64。
- 当前通过固定 localhost 端口连接 sidecar，没有动态端口协商。
- 尚未在无开发工具的全新 Windows 机器上完成安装/portable 验收。
- PyInstaller 对 ONNX Runtime 的完整收集需要实际打包验证。
- 模型许可、分发方式和应用包体积仍需发布负责人确认。
- AI 自动识别能力仍是辅助能力，高风险图片需要手动蒙版。

## 15. 后续生成正式安装包

在 POC 验证通过后，正式安装包建议补齐：

1. Windows 应用图标和产品元数据。
2. 代码签名证书。
3. 全新 Windows 机器 smoke test。
4. Windows Defender / 企业杀毒兼容性检查。
5. 模型许可和受控分发方案。
6. 端口冲突与后端启动失败的用户级提示。
7. 安装、卸载、升级和用户数据保留验证。
8. NSIS 安装包与 portable 包的校验和。

## 16. 验收清单

- [x] `npm run build` 通过。
- [x] `npm run verify:export` 通过。
- [x] `npm run desktop:build` 通过。
- [x] 桌面构建包含 `127.0.0.1:8765` API 地址。
- [x] `desktop_server.py` Python 语法检查通过。
- [x] `npm run desktop:dev` 打开 Electron 窗口。
- [x] `/health` 返回成功。
- [x] Electron 关闭后自有 sidecar 被清理。
- [x] `npm run desktop:pack-backend` 生成 sidecar exe。
- [x] `npm run desktop:check` 通过。
- [x] `npm run desktop:dist` 生成 portable Windows 应用。
- [x] portable 应用完成本机启动和自动退出 smoke test。
- [ ] portable 应用可在未安装 Node/Python 的测试机启动。
- [ ] remote AI 和手动蒙版路径可用。
- [ ] 单图、ZIP、2K、4K 导出正常。
- [ ] 没有模型、debug、test-assets 或构建产物进入 Git。

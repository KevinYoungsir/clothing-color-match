# Multimodal AI Mock Provider

## 1. 本阶段目标

本阶段实现多模态 AI 接入的第一阶段 POC：建立独立 provider 契约、deterministic mock provider、`POST /analyze-garment` 接口和前端识别建议 UI。它用于验证数据契约与安全交互，不提供真实视觉模型能力。

## 2. Mock provider 的作用

`ai-server/multimodal/providers/mock_provider.py` 不调用外部服务，也不需要 API Key。它根据上传文件名、图片尺寸和可选 ROI 返回可复现的模拟结果：

- 从文件名推测服装类别。
- 从 `hanger`、`clip`、`metal`、`edge`、`complex` 等关键词生成风险标签。
- 对风险场景返回 `recommendManualMask=true`。
- 有输入 ROI 时沿用并规范化该 ROI；否则返回图片中心区域的建议 ROI。
- 始终返回 `shouldApplyDirectlyToColorTransfer=false`。

mock 结果不能用于评估真实识别精度。

## 3. `/analyze-garment` 接口

请求：`POST /analyze-garment`，`multipart/form-data`。

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `image` | 是 | 待分析图片。 |
| `role` | 否 | `source` 或 `target`，默认 `target`。 |
| `roi` | 否 | JSON 格式的 `x/y/width/height`。 |
| `provider` | 否 | 当前仅支持 `mock`。 |

响应包含 provider、服装类别、描述、建议 ROI、置信度、风险标签、手动蒙版建议、用户提示和安全说明。接口不返回像素级 mask。

示例：

```powershell
curl.exe -X POST "http://127.0.0.1:8000/analyze-garment" `
  -F "image=@test-assets/sample-garment.jpg" `
  -F "role=target" `
  -F "provider=mock" `
  -F 'roi={"x":100,"y":80,"width":600,"height":900}'
```

## 4. 前端识别建议 UI

右侧面板新增“多模态识别建议”：

1. 用户选择样品图后点击“生成多模态识别建议”。
2. 页面展示类别、置信度、风险标签、手动蒙版建议和建议 ROI。
3. “应用建议 ROI”只更新当前样品的 ROI，并复用现有 stale result 清理逻辑。
4. 用户仍需运行现有蒙版识别、检查蒙版，必要时使用手动蒙版。
5. 多模态分析或应用 ROI 都不会自动触发 `colorTransfer`。

前端优先读取 `VITE_MULTIMODAL_ANALYSIS_API`。未配置时，会从 `VITE_AI_SEGMENTATION_API` 的 `/segment-garment` 地址推导 `/analyze-garment`。

```env
VITE_MULTIMODAL_ANALYSIS_API=http://127.0.0.1:8000/analyze-garment
```

## 5. 为什么不接真实 API Key

本阶段先固定接口 schema、安全边界和交互流程，避免在契约尚未稳定时引入供应商、费用、隐私和凭据泄露风险。mock provider 不读取、不存储、不传输任何 API Key。

## 6. 为什么不直接进入 colorTransfer

多模态模型适合服装类别、场景风险和粗粒度位置判断，不保证像素级边界。服装校色必须依赖最终确认后的 mask，否则可能污染背景、衣架或夹具并产生色块。因此建议 ROI 只能作为下一步 segmentation 的输入提示。

## 7. 安全边界

- `shouldApplyDirectlyToColorTransfer` 在后端序列化和前端解析中都强制为 `false`。
- `/analyze-garment` 不返回或写入最终 mask。
- 现有 segmentation、ROI safety gates、blocked/failed 处理保持不变。
- 应用建议 ROI 会清理旧 processed/adjusted result，避免 stale export。
- 手动蒙版兜底保持可用。
- 多模态分析失败不会触发传统分割 fallback，也不会启动校色。

## 8. 验证方式

```powershell
npm run build
npm run verify:export

cd ai-server
..\.venv\Scripts\python.exe -m py_compile main.py desktop_server.py multimodal\schemas.py multimodal\provider.py multimodal\providers\mock_provider.py
```

启动后端后验证：

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe -X POST "http://127.0.0.1:8000/analyze-garment" -F "image=@<local-image>" -F "role=target" -F "provider=mock"
```

验收响应中的 `success` 应为 `true`，`provider` 应为 `mock`，且 `shouldApplyDirectlyToColorTransfer` 必须为 `false`。

## 9. 下一阶段接入真实 provider

下一阶段可在相同 provider 抽象下增加真实实现：

1. 仅由 FastAPI 后端读取本地环境变量或内部代理凭据。
2. 增加供应商响应 schema 校验、超时、限流和错误映射。
3. 保持前端展示契约不变。
4. 使用批准的真实样本验证 ROI 建议与风险标签。
5. 不改变 segmentation safety gates，也不让分析结果直接进入校色。

## 10. API Key 禁止事项

不得提交真实 API Key，不得把 Key 写入前端源码、Git、日志、Electron renderer、`app.asar`、PyInstaller 可执行文件或默认配置。本阶段没有任何真实凭据配置入口。

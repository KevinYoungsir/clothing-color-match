# RunningHub LLM/VLM Provider

## 1. 为什么选择 qwen/qwen3.7-plus

RunningHub 的模型目录将 `qwen/qwen3.7-plus` 标记为支持对话、工具、图片输入和流式输出，并提供较大的上下文窗口，因此适合服装类别、主体描述、场景风险和建议 ROI 等视觉理解任务。它在本项目中只作为校色前分析 provider，不承担像素级分割。

默认 OpenAI-compatible 配置：

- Base URL：`https://llm.runninghub.cn/v1`
- Model：`qwen/qwen3.7-plus`
- 调用：`client.chat.completions.create(...)`

## 2. 与 workflow / standard image-edit 的区别

`llm_vlm` 直接调用 OpenAI-compatible chat completion：

- 不需要 workflow ID。
- 不需要 app ID。
- 不需要 nodeInfoList。
- 不需要 submit/poll endpoint。
- 图片作为 chat message 的 `image_url` data URL 输入。
- 返回目标是结构化 JSON 分析建议，而不是编辑后的图片。

现有 `workflow`、`aiapp` 和 `standard` 分支保持不变，仍使用原安全 adapter 行为。

## 3. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RUNNINGHUB_MODEL_TYPE` | 按原规则推断 | VLM 模式设为 `llm_vlm` |
| `RUNNINGHUB_API_KEY` | 空 | 仅由 FastAPI 后端读取 |
| `RUNNINGHUB_LLM_BASE_URL` | `https://llm.runninghub.cn/v1` | OpenAI-compatible base URL |
| `RUNNINGHUB_LLM_MODEL` | `qwen/qwen3.7-plus` | Vision 模型 |
| `RUNNINGHUB_LLM_MAX_TOKENS` | `2048` | 最大输出 token |
| `RUNNINGHUB_LLM_TEMPERATURE` | `0.1` | 取值 0-2，强调稳定 JSON |
| `RUNNINGHUB_ENABLE_REAL_CALL` | `false` | 只有显式开启才发送请求 |
| `RUNNINGHUB_TIMEOUT_SECONDS` | `60` | OpenAI client 超时 |

Key 不得使用 `VITE_` 变量，不得传到 React 或 Electron renderer。

## 4. 本地 PowerShell 测试

安装后端桌面依赖：

```powershell
cd "D:\Color Calibration\ai-server"
.venv-desktop\Scripts\activate
pip install -r requirements-desktop.txt
```

临时配置使用 `Read-Host`，不在脚本或文档中写 Key：

```powershell
$env:RUNNINGHUB_MODEL_TYPE="llm_vlm"
$env:RUNNINGHUB_API_KEY=Read-Host "RunningHub API Key"
$env:RUNNINGHUB_ENABLE_REAL_CALL="true"
$env:RUNNINGHUB_LLM_BASE_URL="https://llm.runninghub.cn/v1"
$env:RUNNINGHUB_LLM_MODEL="qwen/qwen3.7-plus"
uvicorn main:app --port 8000
```

先使用获准的非敏感图片调用 `POST /analyze-garment`，表单 `provider=runninghub`。结束后关闭终端或清除环境变量。

## 5. 图片输入格式

后端把 FastAPI 已解码的图片转换为 RGB JPEG，并编码为：

```text
data:image/jpeg;base64,<image-bytes>
```

data URL 只在后端内存中构造并发送给配置的 OpenAI-compatible endpoint，不写入日志、debug 文件或前端状态。现有 ROI 只作为文本上下文，仍不是最终 mask。

## 6. JSON 输出格式

系统 prompt 要求模型只返回一个 JSON 对象，不使用 Markdown，并包含：

```json
{
  "garmentCategory": "trouser",
  "garmentDescription": "gray hanging trousers",
  "suggestedRoi": { "x": 120, "y": 160, "width": 800, "height": 1200 },
  "confidence": 0.8,
  "riskTags": ["hanger", "metal_clip"],
  "containsHanger": true,
  "containsMetalClip": true,
  "edgeTouching": false,
  "complexBackground": false,
  "recommendManualMask": true,
  "userMessage": "请确认 ROI 和最终蒙版后再校色。"
}
```

Prompt 明确要求：不编辑图片、不生成图片、只分析主要服装、结果仅作为校色前建议、最终范围必须由用户确认 ROI / mask。

## 7. 失败兜底策略

| 场景 | providerStatus | errorCode | 行为 |
| --- | --- | --- | --- |
| 缺 Key | `missing_api_key` | `runninghub_api_key_missing` | 安全失败，建议本地 AI / 手动蒙版 |
| 真实调用关闭 | `real_call_disabled` | `runninghub_real_call_disabled` | 不导入客户端、不发送图片 |
| 客户端缺失或请求失败 | `request_failed` | `runninghub_vlm_request_failed` | 后端保持可用 |
| 请求超时 | `timeout` | `runninghub_vlm_timeout` | 后端保持可用，建议手动蒙版 |
| 内容为空、非 JSON 或 schema 无效 | `invalid_response` | `invalid_runninghub_vlm_response` | 不应用 ROI，不进入校色 |

所有失败都返回 `recommendManualMask=true`、`confidence=0`、`fallbackUsed=false` 和 `shouldApplyDirectlyToColorTransfer=false`。

## 8. 为什么不直接进入 colorTransfer

VLM 输出是语义理解和粗定位，不是像素级可靠 mask。即使分析成功，建议 ROI 也必须由用户确认，然后继续使用现有 segmentation、ROI safety gates 和手动蒙版流程。只有最终确认的 mask 才能进入 `colorTransfer`。

## 9. 禁止提交真实 Key

不得把真实 `RUNNINGHUB_API_KEY` 写入源码、Git、README、文档示例、`.env.local`、前端、Electron、日志、debug 输出或安装包。Key 只能通过运行 FastAPI 的本地后端环境变量提供。

## 10. 下一步真实小样本计划

1. 使用 1 张获准非敏感白底服装图验证连接和 JSON。
2. 验证建议 ROI 坐标与原图尺寸一致。
3. 使用 2-4 张挂拍、衣架、夹具和贴边图片验证风险标签。
4. 确认失败时不写入 targetMask、不进入 `colorTransfer`。
5. 检查日志和错误信息不含 Key 或 data URL。
6. 扩展至 20-50 张真实样本，对比本地 ONNX 与手动蒙版使用率。

## 参考

- [RunningHub LLM model catalog](https://www.runninghub.cn/call-api/llm/models)
- [RunningHub OpenAI-compatible LLM workflow](https://www.runninghub.ai/post/1890402871119368194)

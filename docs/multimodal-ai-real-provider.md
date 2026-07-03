# Multimodal AI External Provider Skeleton

## 1. 本阶段目标

本阶段在 deterministic mock provider 基础上增加真实多模态 provider 的安全接入骨架。目标是固定 provider 配置、失败状态和前端展示契约，而不是连接具体厂商。

当前实现不调用任何外部 API，不包含真实 API Key，也不会改变 segmentation、ROI safety gates、`colorTransfer` 或导出流程。

## 2. External provider 架构

`POST /analyze-garment` 根据表单字段 `provider` 从 registry 选择：

- `mock`：继续使用本地 deterministic 规则返回测试建议。
- `external`：加载后端环境配置，并通过统一安全结果返回 provider 状态。

`ExternalMultimodalProvider` 将配置读取、未来请求 adapter、响应解析和安全失败分开。当前 `_request_external()` 明确禁用网络并返回 `provider_disabled`；后续只能在这一 adapter 边界内接入经批准的厂商客户端。

## 3. 环境变量

| 变量 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MULTIMODAL_AI_PROVIDER` | 否 | `external` | 未来具体厂商 adapter 名称。 |
| `MULTIMODAL_AI_API_KEY` | external 必需 | 空 | 只允许由 FastAPI 后端进程读取。 |
| `MULTIMODAL_AI_BASE_URL` | 否 | 空 | 未来厂商或内部代理地址。 |
| `MULTIMODAL_AI_MODEL` | 否 | 空 | 未来模型名称。 |
| `MULTIMODAL_AI_TIMEOUT_SECONDS` | 否 | `30` | 未来请求超时秒数；非正数或非法值回退到 30。 |

示例只使用占位符：

```powershell
$env:MULTIMODAL_AI_PROVIDER="external"
$env:MULTIMODAL_AI_API_KEY="<local-only>"
$env:MULTIMODAL_AI_TIMEOUT_SECONDS="30"
```

## 4. 为什么 API Key 不进入前端

Vite 环境变量会进入浏览器 bundle，用户可通过 DevTools 或静态资源读取。因此 API Key 不得使用 `VITE_` 前缀，不得传给 React，不得放在请求表单、日志、错误信息或浏览器存储中。前端只能选择 `mock` / `external` 并展示非敏感 provider 状态。

## 5. 为什么 API Key 不写进 Electron

写入 `desktop/main.cjs`、preload、renderer、`app.asar`、PyInstaller sidecar 默认值或资源目录都不能提供可靠保密。当前 Electron 包只连接本地 FastAPI sidecar，不内置 Key。后续如需桌面录入，应使用 Electron main process 与 OS 级凭据存储，renderer 只能获知“已配置/未配置”。

## 6. Mock 与 External 的区别

| 项目 | mock | external |
| --- | --- | --- |
| API Key | 不需要 | 只从后端环境读取 |
| 外部网络 | 不使用 | 本阶段明确禁用 |
| 用途 | UI、schema 和风险流程测试 | 真实 provider 接入边界与失败流程测试 |
| 成功状态 | `ready` | 当前为 `missing_api_key` 或 `provider_disabled` |
| 直接校色 | 永远禁止 | 永远禁止 |

## 7. 失败兜底策略

| 场景 | providerStatus | errorCode | riskTags | 用户行动 |
| --- | --- | --- | --- | --- |
| Key 缺失 | `missing_api_key` | `missing_api_key` | `api_key_missing` | 使用本地 AI mask 或手动蒙版 |
| 请求超时 | `timeout` | `provider_timeout` | `api_timeout` | 使用本地 AI mask 或手动蒙版 |
| 返回异常 | `invalid_response` | `invalid_provider_response` | `invalid_provider_response` | 使用本地 AI mask 或手动蒙版 |
| 当前 adapter 禁用 | `provider_disabled` | `external_provider_not_implemented` | `external_provider_disabled` | 使用本地 AI mask 或手动蒙版 |
| 其他异常 | `provider_error` | `external_provider_error` | `external_provider_error` | 使用本地 AI mask 或手动蒙版 |

所有失败均为 `success=false`、`fallbackUsed=false`、`confidence=0`、`recommendManualMask=true`，并保持 `shouldApplyDirectlyToColorTransfer=false`。系统不会把 external 失败伪装成 mock 成功。

## 8. 返回字段

除已有类别、描述、建议 ROI、置信度和风险字段外，响应新增：

- `success`：provider 分析是否成功。
- `provider`：`mock` 或 `external`。
- `providerStatus`：`ready`、`missing_api_key`、`timeout`、`invalid_response`、`provider_disabled` 或 `provider_error`。
- `fallbackUsed`：本阶段恒为 `false`，不静默切换 provider。
- `errorCode`：稳定的机器可读失败码；成功时为 `null`。
- `shouldApplyDirectlyToColorTransfer`：恒为 `false`。

## 9. 安全边界

- 多模态结果不生成最终 mask。
- 建议 ROI 只有用户点击后才更新现有 ROI 状态。
- external 失败不应用建议 ROI、不触发 segmentation、不触发 `colorTransfer`。
- 现有 blocked / failed safety gates 和手动蒙版兜底保持不变。
- provider 异常被转换为结构化安全失败，不使 FastAPI 进程崩溃。
- Key 不记录、不返回、不传给前端。

## 10. 本地测试缺少 API Key

不要设置 `MULTIMODAL_AI_API_KEY`，启动后端：

```powershell
cd "D:\Color Calibration\ai-server"
.venv-desktop\Scripts\activate
Remove-Item Env:MULTIMODAL_AI_API_KEY -ErrorAction SilentlyContinue
uvicorn main:app --port 8000
```

发送请求：

```powershell
curl.exe -X POST "http://127.0.0.1:8000/analyze-garment" `
  -F "image=@test-assets/sample-garment.jpg" `
  -F "role=target" `
  -F "provider=external"
```

预期：`success=false`、`providerStatus=missing_api_key`、`recommendManualMask=true`、`shouldApplyDirectlyToColorTransfer=false`，后端保持可用。

## 11. 后续接具体厂商

1. 完成图片隐私与供应商审批。
2. 在后端新增具体 adapter，不改变前端契约。
3. 使用有超时和响应大小限制的 HTTP client。
4. 把供应商响应映射到内部 schema，拒绝越界 ROI 和非法枚举。
5. 不记录 Key、图片内容或完整供应商响应。
6. 增加 timeout、invalid response、quota 和限流测试。
7. 使用 50-100 张获准真实图片回归，确认不增加色块和 false pass。

## 12. Electron API Key 设置页计划

优先使用公司内部代理，使客户端不持有第三方 Key。如必须 BYOK：

1. 由 Electron main process 管理录入和清除。
2. 使用 Windows Credential Manager 或等效 OS 级安全存储。
3. preload 只暴露受限 IPC，renderer 不读取明文。
4. 启动 sidecar 时通过进程环境临时注入，不使用命令行参数。
5. 设置页只显示配置状态和脱敏尾号。
6. 离线或 provider 失败时继续使用本地 ONNX 与手动蒙版。

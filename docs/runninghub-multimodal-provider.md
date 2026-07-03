# RunningHub Multimodal Provider Adapter

## 1. 本阶段目标

本阶段为 `POST /analyze-garment` 新增 `provider=runninghub`，建立配置读取、内部请求上下文、任务提交、任务轮询、结果解析和安全失败的 adapter 边界。

当前阶段不调用 RunningHub 外部 API，不包含任何真实 API Key，不猜测 endpoint 或 wire payload，也不改变 segmentation、ROI safety gates、`colorTransfer` 和导出流程。

## 2. Provider 架构

```text
/analyze-garment
  -> provider registry
  -> RunningHubMultimodalProvider
  -> load_runninghub_config
  -> build_runninghub_payload (internal context only)
  -> submit_runninghub_task (network disabled)
  -> poll_runninghub_task (network disabled)
  -> parse_runninghub_result
  -> unified GarmentAnalysisResult
```

`build_runninghub_payload()` 当前生成内部 adapter context，不代表 RunningHub 官方请求格式。`submit_runninghub_task()` 和 `poll_runninghub_task()` 在官方契约确认前固定安全失败，因此不会产生网络流量。

## 3. 环境变量

| 变量 | 用途 | 当前行为 |
| --- | --- | --- |
| `RUNNINGHUB_API_KEY` | 后端认证凭据 | 缺失时 `missing_api_key`；不记录、不返回 |
| `RUNNINGHUB_BASE_URL` | 未来 API 根地址 | 当前不请求 |
| `RUNNINGHUB_WORKFLOW_ID` | workflow 标识 | workflow 模式需要 |
| `RUNNINGHUB_APP_ID` | aiapp 标识 | aiapp 模式需要 |
| `RUNNINGHUB_MODEL_TYPE` | `workflow` / `aiapp` / `standard` | 非法值安全失败 |
| `RUNNINGHUB_TIMEOUT_SECONDS` | 总请求超时 | 默认 60 |
| `RUNNINGHUB_POLL_INTERVAL_SECONDS` | 轮询间隔 | 默认 2 |
| `RUNNINGHUB_MAX_POLL_ATTEMPTS` | 最大轮询次数 | 默认 60 |
| `RUNNINGHUB_NODE_INFO_JSON` | 未来 nodeInfoList 映射 | 必须是对象数组 JSON |
| `RUNNINGHUB_RESULT_MODE` | 未来结果选择模式 | 当前只保留配置 |

本文不提供 API Key 值或可复制的 Key 示例。Key 只能由运行 FastAPI 的后端进程在本地环境中读取。

## 4. 为什么 API Key 只在后端

后端可以控制日志脱敏、超时、重试、配额和供应商响应校验。Key 不进入 multipart 请求，不返回给 React，也不出现在统一结果 schema 中。配置对象的字符串表示会把 Key 固定显示为 `<redacted>`。

## 5. 为什么不在前端或 Electron 内置 Key

Vite bundle、renderer、preload、`app.asar` 和打包资源都可被本机用户检查。前端只发送 provider 名称，不提供 Key 输入框，不存储 Key。Electron 当前只继承启动环境，不写死、展示或持久化 RunningHub Key。

后续若需要桌面设置页，应由 Electron main process 使用 OS 级凭据存储，renderer 只能读取“已配置/未配置”。

## 6. Mock、External 与 RunningHub

| Provider | 用途 | 网络 | 缺配置行为 |
| --- | --- | --- | --- |
| `mock` | UI 与 schema 确定性测试 | 无 | 不需要配置 |
| `external` | 通用真实 provider 安全骨架 | 当前禁用 | 缺通用 Key 时安全失败 |
| `runninghub` | RunningHub 任务式 adapter 骨架 | 当前禁用 | 缺 Key、workflow/app 时安全失败 |

三者都保持 `shouldApplyDirectlyToColorTransfer=false`。

## 7. 任务提交与轮询流程

未来正式 adapter 应执行：

1. 验证 Key、模式和 workflow/app 标识。
2. 根据官方文档构建 submit payload。
3. 上传或引用输入图片。
4. 提交任务并提取 task ID。
5. 按配置间隔轮询，限制最大次数和总超时。
6. 将成功、失败、取消、超时等任务状态映射为内部状态。
7. 下载或读取结构化分析结果。
8. 严格校验字段后转换为统一 schema。

当前缺少官方 submit endpoint、poll endpoint 和任务状态样例，所以第 3-7 步不会执行。

## 8. Workflow、AI App 与 Standard 预留

- `workflow`：要求 `RUNNINGHUB_WORKFLOW_ID`。
- `aiapp`：要求 `RUNNINGHUB_APP_ID`。
- `standard`：保留给后续确认的标准 API；当前至少需要 workflow ID 或 app ID 才能通过基础配置门。

若没有显式设置模式，存在 workflow ID 时推断为 `workflow`，否则存在 app ID 时推断为 `aiapp`。推断只用于配置校验，不代表真实 API payload。

## 9. nodeInfoList 与参数映射

`RUNNINGHUB_NODE_INFO_JSON` 只接受 JSON 对象数组。当前 adapter 会解析并放入内部 context，但不会发送。

正式接入前需要明确：

- 哪个节点接收图片。
- 节点 ID、字段名和数据类型。
- workflow 与 aiapp 是否使用不同参数结构。
- ROI、role、文件名是否需要映射。
- 哪些字段可安全进入日志。

在这些信息确认前，不应根据名称猜测 `nodeInfoList` wire schema。

## 10. 统一 schema 转换

未来 RunningHub 成功结果必须转换为：类别、描述、建议 ROI、置信度、风险标签、衣架/夹具/贴边/复杂背景布尔值、手动蒙版建议和用户消息。

解析器拒绝缺失必需字段、非法置信度、非数组风险标签和不完整 ROI。成功结果仍只提供建议，不生成最终 mask，也不能直接进入 `colorTransfer`。

## 11. 失败兜底策略

| 场景 | providerStatus | errorCode | 行为 |
| --- | --- | --- | --- |
| 缺 Key | `missing_api_key` | `runninghub_api_key_missing` | 手动蒙版 / 本地 AI |
| 缺 workflow/app | `missing_workflow_config` | `runninghub_workflow_config_missing` | 提示补后端配置 |
| 配置非法 | `invalid_config` | `runninghub_model_type_invalid` | 安全失败 |
| 超时 | `timeout` | `runninghub_timeout` | 安全失败 |
| 任务失败 | `task_failed` | `runninghub_task_failed` | 安全失败 |
| 返回异常 | `invalid_response` | `runninghub_invalid_response` | 安全失败 |
| adapter 未启用 | `provider_disabled` | `runninghub_adapter_not_configured` | 安全失败 |
| 其他异常 | `provider_error` | `runninghub_provider_error` | 安全失败 |

所有失败均返回 `success=false`、`fallbackUsed=false`、`confidence=0`、`recommendManualMask=true` 和 `shouldApplyDirectlyToColorTransfer=false`。不会静默伪装为 mock 成功。

## 12. 测试缺 Key

确保后端进程没有 `RUNNINGHUB_API_KEY`，然后对 `/analyze-garment` 发送 `provider=runninghub`。预期：

- `provider=runninghub`
- `providerStatus=missing_api_key`
- `recommendManualMask=true`
- `shouldApplyDirectlyToColorTransfer=false`
- FastAPI 保持健康

## 13. 测试缺 workflow 配置

在隔离测试进程中设置一个非生产测试占位凭据，但不要设置 `RUNNINGHUB_WORKFLOW_ID` 或 `RUNNINGHUB_APP_ID`。不要把该值写入文件、文档或 Git。预期 `providerStatus=missing_workflow_config`，且不会执行网络请求。

## 14. 验证 Mock 不受影响

继续发送 `provider=mock`。预期 `success=true`、`providerStatus=ready`，建议 ROI 和原 mock 风险规则保持不变。RunningHub 环境变量不影响 mock provider。

## 15. 下一步真实配置与小样本验证

进入真实调用前，需要用户提供并确认：

1. 官方 submit endpoint。
2. 官方 poll/status endpoint。
3. workflow ID 或 app ID 的使用规则。
4. `nodeInfoList` 参数映射。
5. 成功、处理中、失败和超时响应示例。
6. 最终结构化结果示例或结果文件格式。
7. 图片隐私、保存周期、配额和费用策略。

确认后先用 3-5 张获准非敏感样本验证，观察建议 ROI 和风险标签；仍不得直接进入校色。随后再扩展到 50-100 张回归。

## 16. 禁止提交真实 Key

不得把真实 RunningHub Key 写入源码、README、文档示例、`.env.example`、前端、Electron、Git、日志、debug JSON、命令行参数或安装包。任何凭据测试只能在本地进程环境中完成，结束后立即清除。

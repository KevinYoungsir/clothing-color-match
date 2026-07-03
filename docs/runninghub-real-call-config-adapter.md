# RunningHub Real-call Configuration Adapter

## 1. 本阶段目标

本阶段把 `provider=runninghub` 从纯安全骨架扩展为配置化 submit/poll adapter。代码可以在明确开启后执行 JSON POST、提取 task ID、轮询任务并解析统一多模态结果，但默认仍不产生任何外部请求。

本阶段没有提交或使用真实 Key、workflow ID、app ID、私有 endpoint 或敏感 `nodeInfoList`，也没有修改 segmentation、ROI safety gates、`colorTransfer` 或导出。

## 2. 为什么默认不启用真实调用

真实调用会上传或引用业务图片、消耗额度并涉及供应商隐私策略。错误 workflow 或节点映射也可能产生费用但得不到可解析结果。因此 `RUNNINGHUB_ENABLE_REAL_CALL` 默认是 `false`；即使其他配置齐全，也只返回 `real_call_disabled`。

只有后端进程中显式设置 `RUNNINGHUB_ENABLE_REAL_CALL=true`，并通过全部配置校验后，代码才进入 submit/poll 网络边界。

## 3. 环境变量

| 变量 | 必需条件 | 说明 |
| --- | --- | --- |
| `RUNNINGHUB_ENABLE_REAL_CALL` | 真实调用 | 默认 false；仅 `1/true/yes/on` 开启 |
| `RUNNINGHUB_API_KEY` | 真实调用 | 只由后端读取，不记录、不返回 |
| `RUNNINGHUB_SUBMIT_ENDPOINT` | 真实调用 | 完整 submit URL |
| `RUNNINGHUB_POLL_ENDPOINT` | 真实调用 | 完整 status/output URL |
| `RUNNINGHUB_WORKFLOW_ID` | workflow 模式 | workflow 标识 |
| `RUNNINGHUB_APP_ID` | aiapp 模式 | AI App 标识 |
| `RUNNINGHUB_MODEL_TYPE` | 否 | `workflow`、`aiapp` 或预留 `standard` |
| `RUNNINGHUB_NODE_INFO_JSON` | 真实调用 | JSON 对象数组；包含获批输入映射 |
| `RUNNINGHUB_RESULT_MODE` | 否 | `json`、`text` 或 `natural_language` 等结果解析提示 |
| `RUNNINGHUB_TIMEOUT_SECONDS` | 否 | 单次 HTTP 超时，默认 60 |
| `RUNNINGHUB_POLL_INTERVAL_SECONDS` | 否 | 轮询间隔，默认 2 |
| `RUNNINGHUB_MAX_POLL_ATTEMPTS` | 否 | 最大轮询次数，默认 60 |

除 localhost 外，endpoint 必须使用 HTTPS。环境变量只存在于启动 FastAPI 的 PowerShell 会话及其子进程。

## 4. PowerShell 临时配置

下面的方式不会把值写入代码或文档。输入时请在受控本机终端完成，结束后关闭终端或清除环境变量。

```powershell
$env:RUNNINGHUB_API_KEY = Read-Host "RunningHub API Key"
$env:RUNNINGHUB_WORKFLOW_ID = Read-Host "RunningHub workflow ID"
$env:RUNNINGHUB_SUBMIT_ENDPOINT = Read-Host "RunningHub submit endpoint"
$env:RUNNINGHUB_POLL_ENDPOINT = Read-Host "RunningHub poll endpoint"
$env:RUNNINGHUB_NODE_INFO_JSON = Get-Content -Raw -LiteralPath (Read-Host "Approved nodeInfoList JSON path")
$env:RUNNINGHUB_MODEL_TYPE = "workflow"
```

不要使用命令行参数传 Key，不要截图，不要把终端历史或环境导出到仓库。

## 5. 缺 Key 测试

```powershell
Remove-Item Env:RUNNINGHUB_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:RUNNINGHUB_ENABLE_REAL_CALL -ErrorAction SilentlyContinue
```

请求 `provider=runninghub`，预期 `success=false`、`providerStatus=missing_api_key`、`recommendManualMask=true`、`shouldApplyDirectlyToColorTransfer=false`。

## 6. real_call_disabled 测试

在当前 PowerShell 会话中临时读取 Key，但不要开启真实调用：

```powershell
$env:RUNNINGHUB_API_KEY = Read-Host "Non-production test credential"
Remove-Item Env:RUNNINGHUB_ENABLE_REAL_CALL -ErrorAction SilentlyContinue
```

预期 `providerStatus=real_call_disabled`，且不会解析 endpoint、不会发送网络请求。

## 7. 缺 endpoint 测试

```powershell
$env:RUNNINGHUB_ENABLE_REAL_CALL = "true"
Remove-Item Env:RUNNINGHUB_SUBMIT_ENDPOINT -ErrorAction SilentlyContinue
Remove-Item Env:RUNNINGHUB_POLL_ENDPOINT -ErrorAction SilentlyContinue
```

预期 `providerStatus=missing_endpoint`，不会发送网络请求。

## 8. 缺 workflow/app 测试

先在本地设置非生产 submit/poll 测试地址，再清除 workflow/app：

```powershell
$env:RUNNINGHUB_SUBMIT_ENDPOINT = Read-Host "Non-production submit endpoint"
$env:RUNNINGHUB_POLL_ENDPOINT = Read-Host "Non-production poll endpoint"
Remove-Item Env:RUNNINGHUB_WORKFLOW_ID -ErrorAction SilentlyContinue
Remove-Item Env:RUNNINGHUB_APP_ID -ErrorAction SilentlyContinue
```

预期 `providerStatus=missing_workflow_config`，不会发送网络请求。

## 9. 开启真实调用

只有在 Key、HTTPS endpoint、workflow/app、模式和 `nodeInfoList` 都已由负责人核对后，才设置：

```powershell
$env:RUNNINGHUB_ENABLE_REAL_CALL = "true"
```

启动 FastAPI 后，`provider=runninghub` 才会执行 submit 和 poll。建议先将轮询次数和超时设为较小的受控值，用一张获准的非敏感图片测试。

当前 adapter 不猜测图片上传节点。`RUNNINGHUB_NODE_INFO_JSON` 必须包含该工作流已经认可的上传文件引用或输入映射。若 RunningHub 需要独立资源上传步骤，应在下一阶段按官方 upload 接口单独实现。

## 10. 用户需要提供的信息

真实小样本测试前需要：

1. 使用 workflow、AI App 还是 standard 模式。
2. submit endpoint 与 poll/output endpoint。
3. workflow ID 或 app ID。
4. 导出的 workflow API JSON 或 AI App node 列表。
5. 图片节点的 `nodeId`、`fieldName` 和 `fieldValue` 规则。
6. 是否需要先调用资源上传 API。
7. submit、处理中、成功、失败和结果响应样本。
8. 最终结果是内嵌 JSON、自然语言、文件 URL 还是其他格式。
9. 图片隐私、保存周期、额度与重试策略。

## 11. 结果样本整理方式

请对每类响应脱敏后保存字段结构，不保留 Key、签名 URL 查询参数或客户图片：

- submit success：`code/msg/data.taskId/data.taskStatus`。
- submit failure：HTTP 状态、`code/msg` 和非敏感错误字段。
- polling：queued/running/success/failed 各一份。
- structured result：统一字段所在的嵌套路径。
- natural language result：文本字段名和外层 envelope。
- empty/non-JSON：响应状态和 content type。

这些样本用于调整 parser，不应直接提交包含公司工作流信息的原始响应。

## 12. 结果不会直接进入 colorTransfer

所有 `GarmentAnalysisResult` 都通过统一 schema 序列化，`shouldApplyDirectlyToColorTransfer` 固定为 `false`。RunningHub 成功结果只显示类别、风险和建议 ROI；用户仍需确认 ROI、运行现有 segmentation、通过 safety gates，并确认或手动修正最终 mask。

失败结果没有建议 ROI，返回 `recommendManualMask=true`。前端不会显示“应用建议 ROI”，也不会触发 `colorTransfer`。

## 13. 禁止提交敏感配置

不得提交真实 Key、workflow/app ID、私有 endpoint、敏感 `nodeInfoList`、真实供应商响应、`.env.local` 或终端导出。前端和 Electron 不保存 Key。

## 14. 下一阶段小样本计划

1. 由负责人确认官方 endpoint 和工作流节点映射。
2. 使用 1 张获准非敏感图片验证资源上传或引用。
3. 验证 submit/task ID/poll/terminal state。
4. 验证结构化 JSON parser；自然语言结果必须保持低置信度并建议手动蒙版。
5. 检查日志不含 Key、图片内容和完整供应商响应。
6. 扩展到 3-5 张挂拍、夹具和白底图片。
7. 与本地 ONNX + 手动蒙版对照，不允许增加色块和 false pass。

## 官方契约参考

- [RunningHub Start ComfyUI Task (Advanced)](https://www.runninghub.ai/runninghub-api-doc-en/api-425761093)
- [RunningHub Start AI App Task](https://www.runninghub.ai/runninghub-api-doc-en/api-425761096)
- [RunningHub Check Task Status](https://www.runninghub.ai/runninghub-api-doc-en/api-425761033)
- [RunningHub Workflow Integration Example](https://www.runninghub.ai/runninghub-api-doc-en/doc-8287472)

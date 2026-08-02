# 0010 Agent Harness MVP 需求

## 1. 背景

阶段 4 已完成 Source、Extraction、Search、Context Pack、MergePlan、PatchPlan、Coverage 和 Git diff 的确定性契约，但这些能力仍需要 Human Maintainer 或外部 Agent 手工串联。

阶段 5 要提供一个配置模型 API 后即可运行的 Wiki Agent 应用。它必须复用现有确定性工具，并把模型判断限制在可审查、可校验、可恢复的 Harness 工作流中。

## 2. 第一性目标

给定一个已初始化 Vault、模型配置和低敏 Source，Harness 能够：

1. 调用模型生成结构化 Extraction Artifact。
2. 构建 Context Pack 并定位 Candidate Page。
3. 生成完整 MergePlan 和 PatchPlan。
4. 在 Human Maintainer 明确确认后受控写入 Wiki。
5. 自动执行 validate、index、diff 和 finalize。
6. 保存一次运行的输入、状态、artifact、失败和审查记录。
7. 对 Wiki Query 生成带页面和 Source 引用的回答。
8. 将有长期价值的回答通过 File-back 重新登记为 Source。

## 3. 用户与入口

主要操作者是 Agent，最终决策者是 Human Maintainer。MVP 提供 CLI 入口，建议命令为：

```bash
pkwiki agent plan-ingest <source-id> [--json]
pkwiki agent merge <run-id> [--json]
pkwiki agent query <question> [--json]
pkwiki agent file-back <run-id> [--json]
pkwiki agent status <run-id> [--json]
```

最终命令名在实现前通过 CLI 设计测试冻结，但 workflow 名称固定为 `plan-ingest`、`merge`、`query` 和 `file-back`。

## 4. Harness Core

Harness Core 必须保持 Runtime-neutral，并负责：

- 读取 Vault policy 和模型非敏感配置。
- 创建和推进 Run lifecycle。
- 请求确定性工具构建 Context Pack。
- 调用 Runtime Adapter。
- 校验模型生成的 Extraction Artifact、MergePlan、PatchPlan 和 Query Answer。
- 对可恢复的结构化输出错误执行有限重试。
- 编排现有 core、search、merge、patch、validator、indexer 和 git 能力。
- 在人工确认点停止，不通过隐式交互绕过审批。
- 记录失败分类、工具结果、usage、反馈和 eval evidence。

Harness Core 不得依赖 Pi 的消息类型、Session 类型或 Provider 实现。

## 5. Runtime Adapter

统一 Runtime Adapter 至少提供：

- 模型和 Provider 初始化。
- 单轮或多轮生成。
- 结构化 tool call。
- 流式事件。
- session 生命周期。
- timeout 和 abort。
- usage 和模型信息。
- 标准化错误分类。

Pi 是第一个正式 Adapter。未来增加其他 Adapter 时，不修改 Vault、Context Pack、MergePlan、PatchPlan 或 Run Artifact 契约。

## 6. Pi Adapter

MVP 使用 `@earendil-works/pi-coding-agent` SDK，并通过其内部的 `pi-agent-core` 和 `pi-ai` 获得 Agent loop 与模型访问能力。

要求：

- 固定经过验证的 Pi 版本。
- 禁用 Pi 默认的 read、write、edit、bash 等 coding tools。
- 只注册 pkwiki 明确允许的领域工具。
- 使用 pkwiki system prompt 和 ResourceLoader。
- Pi Session 不是 pkwiki Run Record 的机器真相源。
- MVP 不使用 `pi-tui`。

## 7. 模型配置

模型配置从环境变量或显式本地配置读取：

```text
PKWIKI_MODEL_PROVIDER
PKWIKI_MODEL_BASE_URL
PKWIKI_MODEL_API
PKWIKI_MODEL_API_KEY
PKWIKI_MODEL_NAME
PKWIKI_MODEL_REASONING_EFFORT
PKWIKI_MODEL_CONTEXT_WINDOW
PKWIKI_MODEL_MAX_TOKENS
```

规则：

- API Key 不进入 Git、Vault、Run Record、日志或错误对象。
- `baseUrl` 保存 API 根路径，具体 endpoint 由 Provider client 拼接。
- 第一 dogfood Provider 使用 OpenAI-compatible Chat Completions。
- 自定义思考级别通过 Pi model-level thinking map 映射，不污染 Harness Core。
- 缺少必要容量参数时应在启动前失败，不使用未经确认的隐式大值。

## 8. Run Lifecycle

MVP 状态：

```text
created
preparing
generating
planning
awaiting_approval
applying
validating
completed
failed
cancelled
```

状态推进必须满足：

- 每次变更原子写入 Run Record。
- 非法跃迁被拒绝。
- `awaiting_approval` 不允许自动进入 `applying`。
- failed 保存分类、阶段和可安全展示的信息。
- resume 只能从明确允许的恢复点继续。

## 9. Plan Ingest

输入为已登记且 active 的 Source ID。

流程：

1. status 和 validate preflight。
2. 必要时执行 chunk。
3. 构建仅包含 Source/chunk/policy 的 extraction context。
4. 模型通过结构化 tool call 提交 Extraction Artifact。
5. 确定性 parser 和 evidence 校验。
6. `register-extraction`。
7. `build-context` 定位 Wiki Candidate。
8. 模型提交 MergePlan。
9. `register-merge-plan`。
10. Run 进入 `awaiting_approval`。

模型不能直接写 extraction 文件、manifest 或 Wiki。

## 10. Merge

输入为处于 `awaiting_approval` 的 merge Run。

默认流程：

1. Human Maintainer 显式批准 MergePlan。
2. 模型生成 PatchPlan。
3. 确定性 parser 和 candidate target 范围校验。
4. 展示 PatchPlan 和 dry-run 结果。
5. Human Maintainer 显式批准写入。
6. apply-patch。
7. validate、index 和 diff。
8. diff 范围符合 MergePlan 后 finalize-merge。
9. Run completed。

MVP 不自动 commit 或 push。

## 11. Query

Query 默认只读：

1. search 和 build-context。
2. 模型生成结构化 Query Answer。
3. 每个重要结论至少引用一个 Wiki Page 或 Source ID。
4. 保存问题、Context Pack、回答、引用和 usage。
5. 不执行 apply-patch。

## 12. File-back

File-back 只处理 Human Maintainer 明确选择的 Query Answer 或 Run 结果：

1. 生成可审查的 Markdown Source。
2. Human Maintainer 确认内容和隐私级别。
3. 调用 ingest 登记为新 Source。
4. 后续重新进入 plan-ingest。

File-back 不直接更新 Wiki。

## 13. Approval

MVP 使用显式、可恢复的 plan-first 审批：

- 读、搜索、Context Pack 和计划生成可以自动执行。
- MergePlan 审批和 PatchPlan apply 审批分离。
- CLI 非交互 JSON 模式必须返回 `approvalRequired` 和下一步命令。
- 不依赖一次性终端 prompt 作为唯一审批记录。
- commit、push 和发布始终由 Human Maintainer 决定。

## 14. 错误与重试

至少分类：

- provider_auth
- provider_rate_limit
- provider_timeout
- provider_protocol
- model_refusal
- model_output_invalid
- tool_input_invalid
- tool_execution_failed
- approval_rejected
- vault_changed
- cancelled

只有 provider 瞬时错误和模型结构化输出错误允许有限重试。路径越权、checksum stale、审批拒绝和 Vault 改变不得静默重试。

## 15. 非目标

- 不开发 MCP、HTTP 或 Web UI。
- 不开发 `pi-tui` 交互界面。
- 不允许通用 shell、任意文件写入或任意网络工具。
- 不实现多个 Agent 并发协作。
- 不实现自动 commit、push 或发布。
- 不实现 Wiki Health 和 Self-maintenance。
- 不保证模型判断永远正确。

## 16. 验收

- Adapter contract 可由 fake runtime 和 Pi runtime 共同实现。
- API Key 不出现在 Git diff、Run Record、日志和测试快照中。
- 低敏 Source 可完成 plan-ingest，并停在可审查的 MergePlan。
- 经两次显式审批后可完成 Patch、validate、diff 和 finalize。
- Query 返回带引用回答。
- File-back 生成并登记新 Source，不直接写 Wiki。
- provider、tool、approval 和 stale 失败均有稳定错误码和 Run 状态。
- build、test、lint、CLI 测试和低敏端到端 eval 通过。

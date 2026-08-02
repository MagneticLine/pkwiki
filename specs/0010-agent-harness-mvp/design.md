# 0010 Agent Harness MVP 设计

## 1. 模块边界

```text
packages/cli
  -> packages/agent
       -> Harness Core
       -> RuntimeAdapter interface
       -> PiRuntimeAdapter
       -> RunStore
       -> Workflow services
       -> pkwiki deterministic packages

PiRuntimeAdapter
  -> @earendil-works/pi-coding-agent
       -> pi-agent-core
       -> pi-ai
```

`packages/agent` 不重新实现 Source、Context Pack、MergePlan、PatchPlan 或 validate parser。已有确定性 package 保持机器真相源。

## 2. 目录建议

```text
packages/agent/src/
  index.ts
  config.ts
  errors.ts
  runtime.ts
  run-store.ts
  schemas.ts
  tools.ts
  workflows/
    plan-ingest.ts
    merge.ts
    query.ts
    file-back.ts
  adapters/
    fake.ts
    pi.ts
```

第一批可以保持文件较少，但公开导出必须沿上述责任边界组织，避免把所有状态机和 Pi 代码写进一个入口文件。

## 3. Runtime Adapter Contract

概念接口：

```ts
type RuntimeRequest = {
  runId: string;
  systemPrompt: string;
  messages: RuntimeMessage[];
  tools: RuntimeTool[];
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  timeoutMs: number;
};

interface RuntimeAdapter {
  readonly id: string;
  generate(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
  abort(runId: string): Promise<void>;
}
```

RuntimeEvent 使用 pkwiki 自有类型：text delta、tool call、tool result、usage、completed 和 failed。Harness Core 不向外暴露 Pi event。

## 4. Pi Runtime Adapter

依赖基线：`@earendil-works/pi-coding-agent@0.82.1`。

创建 session 时：

- `noTools: "all"`。
- `customTools` 只包含 pkwiki tool definitions。
- 使用自定义 ResourceLoader 和 system prompt。
- MVP 默认使用 in-memory Pi Session。
- pkwiki RunStore 独立持久化审计 artifact。

Pi 的 thinking level 使用 `xhigh`。自定义 OpenAI-compatible model 通过 model-level `thinkingLevelMap` 把 `xhigh` 映射为 Provider 的 `max`。

## 5. Model Config

`loadModelConfig()` 只读取显式输入和环境变量，不扫描或打印 secret。

```ts
type ModelConfig = {
  provider: string;
  baseUrl: string;
  api: "openai-completions";
  apiKey: SecretString;
  model: string;
  reasoningEffort: string;
  contextWindow: number;
  maxTokens: number;
};
```

配置加载后立即验证 URL、API 类型、模型名、正整数容量和 Key 是否存在。面向日志和 Run Record 的 `ModelConfigSummary` 不包含 apiKey。

## 6. Structured Output

MVP 优先使用专用提交工具，而不是从 Markdown 代码块解析 JSON：

```text
submit_extraction
submit_merge_plan
submit_patch_plan
submit_query_answer
```

工具参数使用与现有 parser 对齐的 JSON schema。Tool call 到达后仍由 core/merge/patch parser 二次验证；JSON schema 不是唯一安全边界。

每次结构化生成最多允许两次修复重试：

1. 第一次返回 parser 错误摘要。
2. 模型只能重新提交同一 artifact。
3. 第二次失败后 Run 进入 failed。

## 7. pkwiki Tools

Pi 不直接获得任意路径工具。内部工具分为：

- read-only：status、validate、list-pages、read-page、search、build-context、读取 Run artifact。
- controlled-write：chunk、register-extraction、register-merge-plan、apply-patch、index、finalize-merge、ingest file-back。

controlled-write 只能由 Harness workflow 调用，不作为模型可以任意组合的通用工具暴露。模型主要通过 submit tools 返回计划；Harness 决定何时调用确定性写工具。

## 8. Run Store

阶段 5 扩展 `.pkwiki/runs/<run-id-file-name>/`：

```text
run.json
context-pack.json
extraction.json
merge-plan.json
patch-plan.json
query-answer.json
validation.json
diff.json
approval.json
feedback.json
events.jsonl
```

不是每个 workflow 都生成全部文件。

`run.json` 记录：

- version、runId、workflow、status。
- createdAt、updatedAt、currentStep。
- Source ID 或 query 摘要。
- Runtime、Provider 和 model 非敏感摘要。
- retry count 和最后错误分类。
- artifact 相对路径。

RunStore 使用临时文件和 rename 原子更新 JSON。events.jsonl 只记录经过脱敏的领域事件，不保存完整 prompt 或 API Key。

## 9. Approval Artifact

```json
{
  "version": "pkwiki.approval/0.1",
  "runId": "run:example",
  "mergePlan": {
    "status": "approved",
    "decidedAt": "..."
  },
  "patchApply": {
    "status": "pending"
  }
}
```

审批通过命令必须重新检查 artifact checksum，防止审批后计划被替换。

## 10. Workflow 编排

### 10.1 Plan Ingest

Harness 调用确定性 preflight 和 chunk，构造受限 extraction prompt。模型只通过 `submit_extraction` 返回 artifact。登记 extraction 后，再由 build-context 产生候选上下文，模型通过 `submit_merge_plan` 返回完整 coverage。

### 10.2 Merge

MergePlan 批准后生成 PatchPlan。PatchPlan 批准前只执行 dry-run。apply 后重新 validate/index/diff，并检查 changed file 是否属于 MergePlan candidateTargets，最后 finalize。

### 10.3 Query

Query 使用 context-only Run。回答 schema 至少包含 answer、citations、uncertainties 和 suggestedFileBack。Citation 引用 Page ID/path 或 Source ID。

### 10.4 File-back

File-back 从已保存 Query Answer 构造 Markdown Source 候选，审批后写入临时文件并调用 ingest。生成的新 Source ID写回原 Query Run。

## 11. CLI

CLI 只解析参数、渲染事件和返回下一步，不承载 workflow 业务逻辑。

JSON 模式保持非交互：

```json
{
  "ok": true,
  "runId": "run:...",
  "status": "awaiting_approval",
  "approvalRequired": "merge_plan",
  "nextCommand": "pkwiki agent merge ..."
}
```

人类模式可以显示进度，但 MVP 不依赖 TUI。

## 12. 错误模型

`HarnessError` 包含 code、category、step、retryable、safeMessage 和 cause。序列化到 Run Record 时只保存 safeMessage。

Provider 原始响应、headers 和 authorization 不写入 Run Record。测试使用 FakeRuntime，不依赖真实模型；真实 Provider 只用于显式低敏 dogfood。

## 13. 测试策略

- Config：缺失、非法 URL、secret 脱敏和容量边界。
- RunStore：状态迁移、原子写、resume 和非法跃迁。
- Adapter contract：FakeRuntime 与 Pi Adapter 事件一致性。
- Structured output：合法、修复重试、重复 tool call 和 parser 失败。
- Approval：未批准拒绝 apply，checksum 改变拒绝继续。
- Workflow：四个 workflow 的成功和失败路径。
- Security：无默认 Pi tools、路径越权拒绝、secret 不进入 artifact。
- Eval：使用 `mock-sources/` 完成真实低敏 merge/query/file-back。

## 14. 实施拆分

0010 是阶段 5 的总 Spec。实现按以下独立批次推进，每个批次开始前可继续拆出子 Spec：

1. Harness Core、ModelConfig、RunStore 和 FakeRuntime。
2. Pi Runtime Adapter 与 Provider dogfood。
3. Plan Ingest 与 Merge。
4. Query 与 File-back。
5. Approval、错误恢复和 Eval hardening。

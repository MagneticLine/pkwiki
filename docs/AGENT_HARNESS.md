# Agent Harness

Agent Harness 是 `pkwiki` 面向知识编译、查询和维护场景提供的产品运行层与质量适配层。

它不是简单的 CLI 包装，也不重新实现一个通用 coding agent。Harness Core 定义 Wiki 专用工作流和质量边界，Runtime Adapter 提供模型调用、Agent loop、会话和工具执行。Pi 是第一个正式 Adapter，但不是确定性 core 的硬依赖。

## 1. 目标

- 让 Human Maintainer 配置模型 API 后可以运行完整的 Wiki 工作流。
- 让 Agent 在有限上下文中找到正确 Source 和 Wiki Page。
- 让 Agent 用结构化计划表达判断和修改意图。
- 让每次运行可重放、可审查、可反馈、可评估。
- 让不同 Agent Runtime 复用同一套 Vault 和 Merge 契约。

## 2. 核心边界

- Agent 不自由重写整个 Vault。
- Agent 先读取状态和规则，再构建 Context Pack。
- 重要信息必须进入 coverage，不能无声忽略。
- 实质修改必须通过 PatchPlan 或其他确定性写入协议。
- 修改后必须 validate、index 和 diff。
- 冲突、隐私和高不确定性默认请求 Human Maintainer 确认。
- 默认不自动 commit、push 或公开发布。

## 3. Harness Core

Harness Core 负责领域编排：

- 选择 workflow。
- 读取 Vault policy。
- 构建和收缩 Context Pack。
- 管理 Run lifecycle。
- 调用 Runtime Adapter。
- 校验模型结构化输出。
- 调用确定性工具。
- 聚合 coverage、validate、diff 和 review 状态。
- 记录失败、反馈和 eval evidence。

Harness Core 不关心 Pi 或其他 Runtime 的内部消息格式。它只依赖稳定的 Adapter 能力接口。

## 4. Runtime Adapter

Runtime Adapter 至少提供：

- 模型和 provider 配置。
- 一次或多轮生成。
- Tool calling。
- Session 生命周期。
- 取消、超时和错误分类。
- Token 使用和上下文统计，如 Runtime 支持。

Pi Adapter 是第一实现，用于验证完整产品链路。Claude Code、Codex、OpenClaw 等外部 Agent 也可以直接调用 CLI 或 MCP，不必全部以内嵌 Adapter 形式接入。

## 5. Context Pack

Context Pack 是一次 Agent 判断实际读取的有限知识集合。

它应记录：

- Run 目标和 workflow。
- Source、chunk 和 information item 摘要。
- Candidate Wiki Page 和选择原因。
- 必要的页面正文或 section。
- 相关链接、backlink 和 manifest metadata。
- `system/` 中适用的规则。
- 上下文预算、截断和未读取内容说明。

Context Pack 让“Agent 到底看到了什么”成为可审查事实，也是定位错误、遗漏和错误合并的基础。

## 6. Run Lifecycle

一次 Harness Run 应经历：

```text
created
  -> preparing
  -> planning
  -> awaiting_approval
  -> applying
  -> validating
  -> completed | failed | cancelled
```

只读 Query 可以跳过 `awaiting_approval` 和 `applying`。

Run Record 至少保存：

- run id、workflow 和时间。
- 输入 Source、问题或 Health scope。
- Runtime、model 和非敏感配置摘要。
- Context Pack。
- Extraction、MergePlan、PatchPlan 或 Repair Plan。
- 工具调用结果。
- validate、index 和 diff 结果。
- Human Maintainer 的 approval、rejection 和 feedback。

API key、token 和其他 secret 不得写入 Run Record 或 Git。

## 7. 工作流

### 7.1 Plan Ingest

读取 Raw Source，完成 normalize、chunk、extraction、候选页面定位和 MergePlan，不写 Wiki。

### 7.2 Merge

在已确认 MergePlan 基础上生成 PatchPlan，应用修改，更新 coverage，运行 validate、index 和 diff。

### 7.3 Query

根据问题搜索 Wiki 和必要 Source，构建 Context Pack，输出带 Wiki Page 和 Source 引用的回答。Query 默认只读。

### 7.4 File-back

把有长期价值的回答、决策或运行结果登记为新的 Source，再进入 Extraction 和 Merge 流程。File-back 不直接绕过 Source-to-Wiki Merge 写页面。

### 7.5 Self-maintenance

读取 Health Report，生成 Repair Plan 和 PatchPlan，通过相同的 approval、validate 和 diff 流程修复 Wiki。

## 8. Approval Mode

MVP 默认采用 plan-first：

- 读取、搜索、构建 Context Pack 和生成计划可以自动执行。
- 修改 Wiki 前需要 Human Maintainer 确认。
- validate、index 和 diff 可以自动执行。
- commit、push 和发布始终由 Human Maintainer 决定。

后续可以为低风险操作提供显式 auto-apply policy，但必须按 Vault 配置开启，并保留 Run Record 和 Git diff。

## 9. Feedback 与 Eval

Harness 的“逐渐符合用户”首先通过规则和 eval 实现，不依赖模型自动修改自己。

反馈分为：

- Result Feedback：当前页面或计划哪里不对。
- Policy Feedback：以后遇到同类信息应如何处理。
- Safety Feedback：哪些内容不应发送、写入或发布。

可复用反馈经过 Human Maintainer 确认后，写入 `system/` 规则或低敏 eval fixture。基础 Merge eval 至少检查：

- 重要信息召回。
- 错误事实写入。
- Candidate Page 定位。
- Source 和 evidence 引用。
- 冲突与不确定性处理。
- coverage 完整性。
- diff 范围和无关改写。

## 10. 与 PatchPlan 和 Git 的关系

- MergePlan 记录“为什么合并”。
- PatchPlan 记录“怎样修改文件”。
- Run Record 记录“本次运行发生了什么”。
- Git 记录“仓库最终如何变化”。

未来可以在 apply 时记录 inverse plan，提供操作级 undo/redo，但不替代 Git 的仓库历史和回滚能力。

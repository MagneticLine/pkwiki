# 架构

`pkwiki` 采用文件优先、确定性内核与 Agent Runtime 解耦的分层架构。

## 1. 架构原则

- Markdown Vault 是知识真相源。
- Git 是仓库级历史和审查系统。
- 派生索引、Context Pack 和运行结果可以重建，不替代 Wiki Page。
- Agent 负责判断，确定性工具负责执行和验证。
- Harness Core 不绑定单一模型供应商或 Agent Runtime。
- 外部入口不重复实现核心业务逻辑。

## 2. 分层

```text
Human Maintainer / External Agent
               |
               v
CLI / MCP / HTTP / Local Web UI / Static Site
               |
               v
Agent Harness Core
  workflow / context pack / run lifecycle / approval / eval
               |
               +----------------------+
               |                      |
               v                      v
Runtime Adapters                Deterministic Knowledge Engine
Pi first, more later            core / indexer / search / merge / patch / git
               |                      |
               v                      v
Model Providers                 Markdown Vault + Git
```

### 2.1 Vault Data Layer

包含：

- `raw/`：不可变 Raw Source。
- `extracted/`：归一化和提取工作层。
- `wiki/`：长期 Markdown Wiki。
- `system/`：Human Maintainer 管理的规则。
- `.pkwiki/`：manifest、run record 和机器状态。
- `outputs/`：可再生成的索引、报告和发布产物。

### 2.2 Deterministic Knowledge Engine

确定性知识引擎提供可重复、可测试的操作：

- `packages/core`：Vault、Source、配置和路径契约。
- `packages/validator`：结构、链接、manifest、引用和规则校验。
- `packages/indexer`：Page Manifest 和 Search Index。
- `packages/search`：安全读取、确定性词法排序、链接扩展和 Context Pack。
- `packages/merge`：MergePlan、Coverage、最小 Run Record 和 finalize。
- `packages/patch`：PatchPlan 校验和受控应用。
- `packages/git`：worktree 状态和 diff 审查。
- `packages/cli`：面向人和 Agent 的稳定命令入口。

这一层不调用 LLM，也不决定某条信息是否重要。

### 2.3 Agent Harness Core

`packages/agent` 承载 Wiki 场景的工作流和质量适配能力：

- 请求并消费确定性工具构建的 Context Pack。
- 管理 Run lifecycle。
- 调用 Runtime Adapter。
- 要求结构化 extraction、MergePlan 和 PatchPlan。
- 编排 search、validate、apply-patch、index 和 diff。
- 管理人工确认、失败恢复、反馈和 eval。

Harness Core 定义领域流程，不直接依赖 Pi 的具体会话类型或工具 API。

### 2.4 Runtime Adapter

Runtime Adapter 把 Harness 所需能力映射到具体 Agent Runtime：

- 模型调用。
- Agent loop。
- Tool calling。
- Session 和 compaction。
- 流式输出和取消。

Pi 是第一个正式 Adapter。后续可以增加其他 Adapter，而不改变 Vault、MergePlan、PatchPlan 和 Run Record 契约。

### 2.5 External Interfaces

- CLI：本地维护和自动化的基础入口。
- MCP：供外部 Agent 客户端调用工具和 Harness workflow。
- HTTP：供自定义应用调用。
- Local Web UI：供 Human Maintainer 审查计划、diff、确认项和运行历史。
- Static Site：把 Wiki 渲染为人类可浏览的派生站点。

MCP、HTTP 和 Web UI 只做协议适配和交互，不拥有独立的知识写入逻辑。

## 3. 核心数据流

### 3.1 Merge

```text
Raw Source
  -> Source Manifest
  -> normalize/chunk/extract
  -> Extraction Artifact
  -> Context Pack
  -> MergePlan
  -> PatchPlan
  -> apply-patch
  -> validate/index/diff
  -> Human Review
  -> Git Commit
```

### 3.2 Query

```text
Question
  -> search/index/link traversal
  -> Context Pack
  -> Runtime Adapter + Model
  -> cited answer
  -> optional File-back
```

### 3.3 Self-maintenance

```text
Health Scan
  -> Health Report
  -> Repair Plan
  -> PatchPlan
  -> validate/diff/review
```

## 4. 真相源与派生产物

| 数据 | 真相源 | 可再生成 |
| --- | --- | --- |
| 原始素材 | `raw/` 和 Source Manifest | 否 |
| 长期知识 | `wiki/**/*.md` | 否 |
| Vault 规则 | `system/*.md` | 否 |
| 提取工作层 | Extracted Source 和正式 extraction artifact | 部分 |
| Page Manifest | `.pkwiki/page_manifest.json` | 是 |
| Search Index | `outputs/index.json` | 是 |
| Context Pack | Run Record 内的运行输入 | 是 |
| Merge/Patch/Review 记录 | `.pkwiki/runs/<run-id>/` | 否，属于审计记录 |
| 静态站点 | `outputs/` 或外部构建目录 | 是 |

具体目录和字段以 [Vault Spec](VAULT_SPEC.md) 为准。

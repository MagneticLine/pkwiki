# 路线图

本文档是 `pkwiki` 产品阶段和 Feature Spec 顺序的唯一权威路线图。

Feature Spec 编号表示开发批次，不等同于阶段编号。根目录 `DEVELOPMENT_PLAN.md` 只维护 workspace 边界、当前状态和协作规则，不再复制另一套详细阶段计划。

## 阶段 0：Workspace 与产品基线

目标：建立公开工具仓库、私密 Vault 仓库和本地参考资料的清晰边界，并固定产品原则。

状态：已完成。

## 阶段 1：确定性 Vault 工具

范围：

- `pkwiki init`
- `pkwiki status`
- `pkwiki validate`
- Vault root 探测
- Git 状态读取

Feature Spec：`0001-cli-mvp`

状态：已实现，并通过临时 Vault 与 `my-pkm-vault` dogfood。

## 阶段 2：Source 与 Wiki 索引基础

范围：

- `pkwiki ingest`
- Source Manifest MVP
- Extracted Source 模板
- Page Manifest
- Search Index
- `pkwiki index`
- ESLint、build 和 test 质量门禁

Feature Spec：

- `0002-source-ingest-quality-gate`
- `0003-page-manifest-index`

状态：已完成。

## 阶段 3：受控修改与审查

范围：

- PatchPlan v0
- `pkwiki apply-patch`
- `pkwiki diff`
- 路径和 checksum 安全边界
- Git worktree 变更审查

Feature Spec：

- `0004-patch-plan-apply`
- `0005-git-diff-review`

状态：已完成。Git 继续负责仓库级历史、commit、branch 和 rollback；`pkwiki` 暂不自动 commit 或 push。

## 阶段 4：Merge Foundations

目标：把“素材如何被完整、正确、可追溯地合并进 Wiki”从文档原则变成可验证契约，为 Agent Harness 提供稳定输入和输出。

### 4.1 Vault 与 Source Contract

Feature Spec：`0006-vault-source-contract`

范围：

- Source Manifest v0.2 metadata
- `processingStatus` 与 `lifecycleStatus` 分离
- Raw Source checksum 和 size 校验
- `deleted` lifecycle 语义
- Extracted Source 模板升级
- 旧 manifest 向后兼容

状态：已实现并通过单元测试、CLI 测试和三份低敏 mock source dogfood。

### 4.2 Extraction 与 Chunk Contract

Feature Spec：`0007-extraction-chunk-contract`

范围：

- Chunk Manifest 正式契约
- 大文件 normalize、chunk、map extract、reduce summary 流程
- 带稳定 Item ID 的 fact、event、entity、decision、question 和 uncertainty
- Item 到 source/chunk/evidence 的细粒度追溯
- 人类可读 Extracted Source 与机器可读 extraction artifact 的职责划分

状态：已实现 `pkwiki chunk`、Extraction Artifact v0.1、`pkwiki register-extraction`、对应 validate 规则，并通过三份低敏 mock source dogfood。

### 4.3 MergePlan 与 Coverage Contract

Feature Spec：`0008-merge-plan-coverage`

范围：

- MergePlan schema
- Candidate Target、处理决策和多页面影响
- Merge Coverage 的机器真相源
- `merged`、`deferred`、`discarded`、`needs_confirmation` 语义
- 冲突、隐私和不确定性规则
- coverage 与 Source processing status 的确定性更新

状态：已实现 `@pkwiki/merge`、MergePlan/Coverage v0.1、最小 Run Record、`register-merge-plan`、`finalize-merge` 和 Run validate，并通过低敏端到端 dogfood。

### 4.4 Search 与 Context Pack

Feature Spec：`0009-search-context-pack`

范围：

- 面向 Agent 的确定性 search/list/read 接口
- Page Manifest、Search Index、Markdown links 和全文搜索的候选排序
- 有预算的链接级联读取
- Context Pack schema
- Candidate Page 定位结果和证据
- 后续可替换或扩展为 QMD、SQLite FTS 或向量检索

状态：已实现 `@pkwiki/search`、`list-pages`、`read-page`、`search`、`build-context`、Context Request/Pack v0.1 和 validate 规则，并通过多字段搜索、链接扩展、预算截断、stale warning 和 CLI dogfood。

阶段 4 验收：给定一份低敏 Raw Source，系统能够产出可审查的 extraction、候选页面、MergePlan、PatchPlan 和 coverage，并能说明每个重要信息单元的去向。

状态：已于 2026-07-28 通过使用仓库低敏 mock source 的端到端集成验收，覆盖 ingest、chunk、extraction、Context Pack、MergePlan、PatchPlan、finalize、validate 和 diff。阶段 4 已完成。

## 阶段 5：Agent Harness MVP

目标：提供一个配置模型 API 后即可运行的 Wiki Agent 应用，而不把确定性 core 绑定到单一 Runtime。

计划 Feature Spec：从 `0010-agent-harness-mvp` 开始拆分。

状态：下一阶段，尚未开始实现。

范围：

- Runtime-neutral Harness Core
- Pi 作为第一个正式 Runtime Adapter
- 模型和 API 配置
- Run lifecycle 与 `.pkwiki/runs/<run-id>/` 记录
- `plan-ingest`、`merge`、`query`、`file-back` 工作流
- plan、apply 和 review 的人工确认边界
- status、validate、index、search、apply-patch、diff 的确定性编排
- Context Pack 构建和上下文预算
- 失败分类、用户反馈和低敏 eval fixtures
- CLI 入口，例如 `pkwiki agent` 或等价子命令

默认安全模式：Agent 可以自动读取、搜索、规划和校验；实质写入默认要求 Human Maintainer 确认。自动 apply 只能作为显式配置的后续能力，commit 和 push 继续由人决定。

阶段 5 验收：Human Maintainer 提供模型 API 和一份低敏 source 后，Harness 能完成提取、定位、计划、受控合并、校验和 diff；Query 能给出带来源的回答；File-back 能把有价值结果重新纳入受控 Merge 流程。

## 阶段 6：外部接口、发布与文件归档

目标：让更多 Agent 和人类界面能够使用同一套 Harness 与 Vault。

优先级：

1. MCP server，服务 Claude Code、Codex、OpenClaw 和其他 Agent 客户端。
2. 本地 HTTP API，服务自定义应用和自动化。
3. 本地审查型 Web UI，展示 Source、计划、diff、确认项和运行历史。
4. 静态站点输出，服务人类浏览和可选发布。
5. Managed Artifact 文件归档，用于整理简历、证书、申请材料和项目成果。

Web UI 不承担新的核心业务逻辑，只调用 Harness 和确定性工具。静态站点是 Wiki 的派生输出，不成为新的知识真相源。

## 阶段 7：Wiki Health 与 Self-maintenance

目标：让长期 Wiki 能检测并受控修复自身的结构和内容问题。

范围：

- 重复和近似页面
- 过时 claim
- 跨页面矛盾
- 断链和孤儿页面
- 页面过长和结构坏味道
- 缺少来源或低置信度 claim
- Health Report 和 Repair Plan
- 受控 PatchPlan 修复
- 修复前后 eval、validate 和 diff

Self-maintenance 不允许 Agent 自由重写整个 Wiki，也不允许未经审查自动提交。

## 阶段 8：规模化与生态扩展

候选方向：

- Schema migration
- Source revision 和增量重处理
- QMD、SQLite FTS 或向量检索适配
- 多模态 extraction worker
- Managed Artifact 版本和去重
- 可插拔 Runtime Adapter
- OKF 兼容性矩阵和导入导出
- 更完整的 merge/query/maintenance eval 套件

这些方向只有在真实 Vault dogfood 暴露明确瓶颈后才进入 Feature Spec。

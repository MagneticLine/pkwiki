# 路线图

## 阶段 1

- `pkwiki init`
- `pkwiki status`
- `pkwiki validate`

状态：已实现 MVP，并通过临时 Vault 与 `my-pkm-vault` dogfood。

## 阶段 2：Source 与 Wiki 索引基础

- `pkwiki ingest`
- source manifest
- page manifest
- index 生成
- ESLint 质量门禁

状态：阶段 2 已通过 0002 和 0003 实现。0002 已实现非 LLM ingest、source manifest、Extracted Source 模板和真实 ESLint 质量门禁；0003 已实现 page manifest、Search Index 和 `pkwiki index`。

## 阶段 3：受控修改协议

- patch plan 协议
- `pkwiki apply-patch`
- `pkwiki diff`
- lint 检查

状态：已实现 PatchPlan v0、`pkwiki apply-patch` MVP 与只读 `pkwiki diff` 变更审查。当前不做自动 commit/push，Git 仍负责仓库级历史和审查。

## 阶段 4

- Source-to-Wiki Merge 协议
- Extracted Source Schema
- MergePlan
- Agent 集成
- MCP server
- 本地 Web UI

状态：进入规划展开。阶段 4 不应先做集成壳子，而应先固定 Agent 合并素材的契约、覆盖记录和用户确认机制。

## 阶段 5

- Wiki Health 检查
- Self-maintenance 修复计划
- 冗余、过时、矛盾、断链、孤儿页面检测
- 受控 PatchPlan 修复

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
- lint 检查

状态：尚未开始。预计在阶段 2 的 page manifest 与 index 完成后进入，Feature Spec 编号预计从 0004 开始。

## 阶段 4

- agent 集成
- MCP server
- 本地 Web UI

## 阶段 5

- Wiki Health 检查
- Self-maintenance 修复计划
- 冗余、过时、矛盾、断链、孤儿页面检测
- 受控 PatchPlan 修复

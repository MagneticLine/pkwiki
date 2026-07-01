# 路线图

## 阶段 1

- `pkwiki init`
- `pkwiki status`
- `pkwiki validate`

状态：已实现 MVP，并通过临时 Vault 与 `my-pkm-vault` dogfood。

## 阶段 2

- `pkwiki ingest`
- source manifest
- page manifest
- index 生成
- ESLint 质量门禁

状态：已实现非 LLM ingest、source manifest、Extracted Source 模板和真实 ESLint 质量门禁。page manifest 与 index 生成进入后续阶段。

## 阶段 3

- patch plan 协议
- `pkwiki apply-patch`
- lint 检查

## 阶段 4

- agent 集成
- MCP server
- 本地 Web UI

## 阶段 5

- Wiki Health 检查
- Self-maintenance 修复计划
- 冗余、过时、矛盾、断链、孤儿页面检测
- 受控 PatchPlan 修复

# AGENTS.md

## Vault 目标

这个 Vault 把零散 Raw Source 编译为可追溯、可查询、可演进的长期 Markdown Wiki。

## 硬性规则

- 工作前读取 `system/` 中适用的规则。
- 不修改 `raw/` 中的原始内容。
- 不直接修改 `.pkwiki/` manifest 和运行记录。
- 不自由重写整个 Wiki 或无关页面。
- 先定位候选页面，再生成 MergePlan 和 PatchPlan。
- 重要信息必须有 coverage 决策和 Source 引用。
- 不确定、冲突或高敏内容优先请求 Human Maintainer 确认。
- 修改后运行 validate、index 和 diff。
- 未经明确确认，不 commit、push 或公开发布。

## 标准链接

使用 Markdown links，不依赖 Obsidian 专属 wikilink 语法。

## File-back

有长期价值的回答或运行结果先登记为 Source，再进入受控 Merge 流程，不直接绕过规则写 Wiki。

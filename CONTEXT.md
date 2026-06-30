# pkwiki

`pkwiki` 是一个面向个人 LLM Wiki 的工具上下文。这里记录产品领域语言，避免 CLI、Agent、Vault、Source 等概念在需求和实现中混用。

## Language

**CLI Command**:
用户或 Agent 在终端调用的确定性 `pkwiki` 命令，例如 `pkwiki init`、`pkwiki status`、`pkwiki validate`。MVP 阶段的“pkwiki 指令”统一指 CLI Command。
_Avoid_: 指令, prompt, Agent 指令

**Agent Instruction**:
给 Claude Code、OpenClaw、Pi 或 MCP 客户端读取的操作规则，用于约束 Agent 如何理解和调用 `pkwiki`。它不是 CLI Command。
_Avoid_: pkwiki 指令, CLI 指令

**Feature Spec**:
`pkwiki` 仓库中针对一个独立开发过程或模块的需求、设计和任务计划。Feature Spec 放在 `pkwiki/specs/` 下，随产品代码一起版本化。
_Avoid_: 根目录开发计划, 临时 TODO, 普通 docs

**Agent**:
`pkwiki` 的第一用户。Agent 读取素材、调用 CLI Command、生成或应用受控变更，用于维护个人 Wiki。
_Avoid_: AI, LLM, 助手

**Human Maintainer**:
`pkwiki` 的第二用户。Human Maintainer 提供素材、审查结果，并在需要时直接通过终端调用 CLI Command。
_Avoid_: 用户, 终端用户, 个人用户

**Vault**:
由 `pkwiki` 管理的完整个人知识库工作区，包含 `raw/`、`extracted/`、`wiki/`、`outputs/`、`assets/`、`system/` 和 `.pkwiki/`。Vault 不等同于纯 OKF bundle。
_Avoid_: Wiki, 仓库, bundle

**OKF Bundle**:
符合 Open Knowledge Format 的自包含知识包，通常表现为一个由 Markdown concept 文档、`index.md` 和可选 `log.md` 组成的目录树。在 `pkwiki` 中，`wiki/` 是 OKF-compatible bundle。
_Avoid_: Vault, 仓库, 普通 Markdown 文件夹

**Wiki**:
Vault 中长期稳定的知识层，由 Wiki Page 组成，用于承载从 Raw Source 和 Extracted Source 编译出的长期概念、项目、人物、决策和学习地图。Wiki 位于 `wiki/`，并兼容 OKF Bundle。
_Avoid_: raw notes, inbox, extracted, 普通笔记

**Wiki Page**:
Wiki 中的单个 Markdown concept 页面，必须包含 `pkwiki/0.1` profile 要求的 YAML frontmatter。Wiki Page 是 Agent 最终维护的长期知识单元。
_Avoid_: Source, Extracted Source, 临时笔记

**Raw Source**:
Human Maintainer 提供的原始素材，存放在 `raw/` 下，默认不可被 Agent 修改。Agent 可以登记或复制 Raw Source，但不能改写其原始内容。
_Avoid_: Wiki Page, Extracted Source, 知识页

**Extracted Source**:
从 Raw Source 归一化、提取或总结出的中间产物，存放在 `extracted/` 下。Extracted Source 是 Agent 可写的工作层，用于连接 Raw Source 和 Wiki。
_Avoid_: Raw Source, Wiki Page, 最终知识

**Harness**:
约束并增强 Agent 如何读取、查找、计划、修改和校验 Vault 的工具层。Harness 的目标是降低自由式 vibe coding 带来的不确定性，并针对 Wiki 维护场景补足模型在定位、完整性、引用、级联修改和质量检查上的能力短板。
_Avoid_: Agent Runtime, Pi, Claude Code

**Source-to-Wiki Merge**:
将一份 Raw Source 或 Extracted Source 中的信息完整、正确、可追溯地合并进 Wiki 的过程。它是 `pkwiki` 的长期质量目标，不等同于简单摘要或文件复制。
_Avoid_: ingest, summarize, import

**Wiki Health**:
Wiki 长期演进后的结构和内容健康状态，包括是否存在冗余、过时、矛盾、断链、孤儿页面、过长页面和缺少来源的 claim。
_Avoid_: 代码质量, 文档质量, lint

**Self-maintenance**:
Agent 在 Harness 约束下对 Wiki Health 做持续检查、提出修复计划并应用受控修改的能力。它不是 Agent 自由整理整个知识库。
_Avoid_: 自动重构, 自动整理, cleanup

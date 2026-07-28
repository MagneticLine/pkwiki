# pkwiki

`pkwiki` 是一个由 Agent 驱动的个人知识编译与维护产品。这里记录领域语言，避免 CLI、Agent、Vault、Source、Harness 和 Wiki 等概念混用。

## Language

**Human Maintainer**:
Vault 的知识所有者、最终用户和决策者，负责提供素材、定义规则并审查实质变更。
_Avoid_: 第二用户, 终端用户, 普通用户

**Agent**:
`pkwiki` 的主要操作者和机器接口消费者，负责提取、定位、规划、查询和维护，但不拥有最终决定权。
_Avoid_: 最终用户, 模型, LLM, 助手

**CLI Command**:
用户或 Agent 在终端调用的确定性 `pkwiki` 命令。
_Avoid_: 指令, prompt, Agent Instruction

**Agent Instruction**:
约束 Agent 如何理解 Vault 和调用工具的操作规则，不是 CLI Command。
_Avoid_: pkwiki 指令, CLI 指令

**Feature Spec**:
`pkwiki/specs/` 中针对一个独立开发批次维护的需求、设计和任务计划；编号表示批次，不等同于路线图阶段。
_Avoid_: 路线图阶段, 普通 docs, 临时 TODO

**Vault**:
由 `pkwiki` 管理的完整个人知识工作区，包含 Source、Wiki、规则、派生产物和机器状态。
_Avoid_: Wiki, 仓库, OKF Bundle

**OKF Bundle**:
符合 Open Knowledge Format 外部约定的自包含知识包；在 `pkwiki` 中，它是 Wiki 层的兼容目标，不代表完整 Vault。
_Avoid_: Vault, pkwiki profile, 普通 Markdown 文件夹

**Wiki**:
Vault 中长期稳定的知识层，由 Wiki Page 组成，用于承载从 Source 编译出的长期知识。
_Avoid_: Vault, Raw Source, Extracted Source, 普通笔记

**Wiki Page**:
Wiki 中带 `pkwiki` profile frontmatter 的单个长期知识单元。
_Avoid_: Source, Extracted Source, 临时笔记

**Raw Source**:
Human Maintainer 提供的原始素材，默认不可被 Agent 改写。
_Avoid_: Wiki Page, Extracted Source, Managed Artifact

**Extracted Source**:
从 Raw Source 归一化和提取出的工作层，用于承载信息单元、证据、不确定性和合并准备。
_Avoid_: Raw Source, Wiki Page, 最终知识

**Managed Artifact**:
需要长期保存并供人直接复用的原始文件，例如简历、证书和申请材料；它与 Raw Source 可以关联，但目的不是知识提取。
_Avoid_: Raw Source, assets, Wiki Page

**Source ID**:
Raw Source 在 Vault 内的稳定标识，用于 manifest、extraction、Wiki 引用和 merge 追溯。
_Avoid_: 文件名, 路径, Page ID

**Source Manifest**:
Raw Source 的机器可读登记表，保存身份、位置、完整性、处理状态和生命周期状态。
_Avoid_: Page Manifest, Search Index, Source 文件

**Source Processing Status**:
Source 在知识编译流程中的进度，例如 registered、extracted、partially merged 或 merged。
_Avoid_: Source Lifecycle Status, 文件存在状态

**Source Lifecycle Status**:
Source 在 Vault 中的保留状态，例如 active、archived 或 deleted；它与处理进度相互独立。
_Avoid_: Source Processing Status, merge status

**Page Manifest**:
Wiki Page 的可再生成机器索引，不承载长期知识事实。
_Avoid_: Source Manifest, Search Index, Wiki Page

**Search Index**:
面向 Agent 和工具查询的可再生成 Wiki 索引，用于定位候选页面和链接关系。
_Avoid_: Page Manifest, Wiki, 全文知识库

**Context Pack**:
一次 Agent Run 实际读取的有限 Source、Wiki、链接和规则集合，用于说明模型在判断时看到了什么。
_Avoid_: 整个 Vault, prompt, Search Index

**Harness**:
编排知识工作流、管理 Context Pack 和 Run、约束 Agent 输出并调用确定性工具的产品运行层。
_Avoid_: Agent Runtime, Pi, CLI wrapper

**Agent Runtime**:
提供模型调用、Agent loop、会话和工具执行的通用运行环境。
_Avoid_: Harness, 模型供应商, MCP

**Runtime Adapter**:
把 Harness 所需的生成、会话和工具能力映射到具体 Agent Runtime 的适配边界。
_Avoid_: Harness Core, Agent Instruction

**Run**:
Harness 执行一次 ingest、merge、query、file-back 或 maintenance 工作流的完整生命周期。
_Avoid_: Git commit, Agent session, CLI Command

**Run Record**:
记录一次 Run 的输入、Context Pack、结构化计划、工具结果、审查和反馈的审计产物。
_Avoid_: Git history, log message, Search Index

**Source-to-Wiki Merge**:
把 Source 中的重要信息完整、正确、可追溯地合并进 Wiki 的知识编译过程。
_Avoid_: ingest, summarize, import

**Information Item**:
从 Source 中提取并带稳定标识的事实、事件、实体、决策、问题或不确定性，是 coverage 的最小处理单元。
_Avoid_: chunk, Wiki Page, 自由文本摘要

**MergePlan**:
Agent 对候选页面、信息取舍、冲突、隐私和 coverage 作出的结构化合并决策。
_Avoid_: PatchPlan, prompt, 摘要

**Merge Coverage**:
记录每个重要 Information Item 已合并、延后、舍弃或需要确认的处理结果。
_Avoid_: 测试覆盖率, Git diff, 简单摘要

**PatchPlan**:
Agent 生成、确定性工具应用的结构化文件修改计划，回答怎样修改文件。
_Avoid_: MergePlan, 自由编辑, Git diff

**apply-patch**:
校验并应用 PatchPlan 的 CLI Command，不负责自动 commit 或 push。
_Avoid_: Agent 直接写文件, git apply, 自动提交

**Query**:
基于 Wiki 和必要 Source 生成带引用回答的只读知识工作流。
_Avoid_: search, File-back, 临时聊天

**File-back**:
把有长期价值的回答或运行结果重新登记为 Source，并进入受控 Merge 流程。
_Avoid_: 直接写 Wiki, 保存聊天记录, commit

**Git Diff Review**:
Human Maintainer 或 Agent 对 Vault worktree 变更范围和内容进行的只读审查。
_Avoid_: commit, push, rollback

**Wiki Health**:
Wiki 长期演进后的结构和内容健康状态，包括冗余、过时、矛盾、断链、孤儿页面和缺少来源的 claim。
_Avoid_: 代码质量, 文档排版, validate result

**Self-maintenance**:
Harness 在 Human Maintainer 控制下检测 Wiki Health、提出修复计划并应用受控修改的能力。
_Avoid_: 自动重构, 自由整理, cleanup

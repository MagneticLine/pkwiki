# 产品定义

## 1. 产品定位

`pkwiki` 是一个面向 Agent 的个人 LLM Wiki 工具箱。

它不是笔记软件、传统 Wiki 网站或 RAG 平台，而是一套让 Agent 能够安全维护个人知识库的确定性工具层。Human Maintainer 提供素材、规则和审查；Agent 负责读取素材、规划修改、维护 Wiki；`pkwiki` 负责提供可验证的 Vault 契约、CLI Command、校验、索引、Patch 和版本管理辅助。

## 2. 第一用户

`pkwiki` 的第一用户是 Agent。

这意味着：

- CLI Command 必须稳定、可解析、可自动化。
- 关键命令必须支持 `--json`。
- 每次 Agent 操作前应能读取 Vault 状态。
- 每次 Agent 修改后应能校验结果。
- 产品设计优先考虑 Agent 不确定性的约束，而不是只考虑人手动使用是否方便。

Human Maintainer 是第二用户，负责：

- 提供 Raw Source。
- 审查 Agent 产物。
- 决定是否提交和推送。
- 管理隐私边界。
- 在必要时直接使用 CLI Command。

## 3. 核心对象

### 3.1 Vault

Vault 是完整的个人知识库工作区，不等同于 OKF Bundle。

标准结构：

```text
raw/
extracted/
wiki/
outputs/
assets/
system/
.pkwiki/
```

### 3.2 OKF Bundle

OKF Bundle 是外部规范中的知识包概念，通常是一个自包含 Markdown 目录树。

在 `pkwiki` 中：

```text
wiki/ = OKF-compatible bundle
```

也就是说，`pkwiki` 使用 OKF 作为 Wiki 层的外部兼容标准，但完整 Vault 还包含 Raw Source、Extracted Source、运行状态和系统规则。

### 3.3 Raw Source

Raw Source 是 Human Maintainer 提供的原始素材。

规则：

- 默认存放在 `raw/`。
- Agent 不允许修改原始内容。
- Agent 可以登记、复制或引用 Raw Source。
- 如果需要清洗、提取、总结，应生成 Extracted Source。

### 3.4 Extracted Source

Extracted Source 是从 Raw Source 得到的中间产物。

规则：

- 默认存放在 `extracted/`。
- Agent 可以写入和更新。
- 用于记录 OCR、转写、分块、摘要、事实提取、实体提取、疑问和不确定性。
- 它不是最终知识层。

### 3.5 Wiki

Wiki 是长期稳定知识层。

规则：

- 默认存放在 `wiki/`。
- 由 Wiki Page 组成。
- 兼容 OKF Bundle。
- Agent 可以修改，但修改必须受 Harness 约束。
- 每次实质修改都应能被 Git diff 审查，并最终由 Human Maintainer 决定是否 commit。

### 3.6 Wiki Page

Wiki Page 是 Wiki 中的单个长期知识单元。

页面必须包含 `pkwiki/0.1` profile 的 YAML frontmatter：

```yaml
---
okf_version: "0.1"
profile: pkwiki/0.1
id: career/meituan-internship
type: Project
title: 美团实习
description: 关于美团实习准备、入职适应和阶段复盘的长期页面。
domain: career
status: active
created: 2026-06-30
updated: 2026-06-30
confidence: medium
privacy: private
sources:
  - src:example
tags:
  - career
---
```

## 4. 终极质量目标

`pkwiki` 的长期质量目标是做好 Source-to-Wiki Merge。

当 Agent 拿到一份 Raw Source 时，它应该能够：

1. 理解这份素材属于什么主题、领域和时间范围。
2. 找到已有 Wiki 中最相关的页面。
3. 通过目录、索引、frontmatter、manifest、搜索和 Markdown links 渐进定位需要修改的位置。
4. 判断是创建新页面、更新旧页面、拆分页面，还是只生成 Extracted Source。
5. 保证素材中的重要信息没有遗漏。
6. 保证新增内容有来源引用。
7. 保证没有把不确定推断写成确定事实。
8. 保证多页面级联修改后仍然链接正确、结构健康、可审查。

这个目标不能只靠模型能力完成，必须依赖 Harness。

另一个长期质量目标是 Wiki Health。

AI 维护的 Wiki 会像长期开发项目一样出现冗余、过时、坏味道和矛盾内容。因此 `pkwiki` 后期需要提供 Self-maintenance 能力，让 Agent 能在 Harness 约束下持续检查并修复 Wiki Health。

典型问题包括：

- 多个 Wiki Page 表达同一概念，产生重复和分叉。
- 旧页面没有被新事实更新。
- 不同页面之间存在矛盾 claim。
- Markdown links 断裂。
- 页面过长，已经应该拆分。
- 页面没有被索引或其他页面引用。
- 新增 claim 缺少 source 引用。
- 临时推断被写成长期事实。

Self-maintenance 的原则：

- 先检测，再提出修复计划。
- 优先生成可审查的 PatchPlan。
- 不允许 Agent 自由“整理整个 Wiki”。
- 修复后必须运行 validate。
- 实质修改必须通过 Git diff 审查。

## 5. Harness 的职责

Harness 是 `pkwiki` 的核心价值。

它不是简单的命令包装，而是面向 Wiki 维护场景的质量适配层。类似 coding agent 会为软件开发补充搜索、编辑、测试、diff、回滚和上下文管理能力，`pkwiki` 的 Harness 也需要围绕知识库维护补充专门能力。

它负责：

- 建立 Vault 契约。
- 提供 CLI Command。
- 让 Agent 能读取状态。
- 校验结构和规则。
- 维护 source/page/chunk manifest。
- 约束 Agent 修改方式。
- 生成可审查 diff。
- 支持版本管理。
- 支持 Wiki Health 检查和 Self-maintenance。
- 帮助 Agent 在有限上下文内定位相关 Wiki Page。
- 帮助 Agent 判断 Source-to-Wiki Merge 涉及哪些页面和链接。
- 帮助 Agent 检查素材是否被完整、正确、可追溯地合并。
- 帮助 Agent 识别跨页面级联修改后的不一致。

Harness 会随着 dogfood 和真实素材摄入不断调整。早期不预设完整方案，而是优先把可观察、可验证、可迭代的工具接口做出来。

它不负责：

- 替代 Agent Runtime。
- 绑定 Pi、Claude Code、OpenClaw 或任何单一 Agent 框架。
- 替代 Human Maintainer 做最终判断。
- 保证模型推理永远正确。

## 6. 核心工作流

### 6.1 初始化

```text
Human Maintainer -> pkwiki init -> Vault
```

目标：创建一个标准 Vault，让 Agent 能识别和操作。

### 6.2 状态读取

```text
Agent -> pkwiki status --json -> 当前 Vault 状态
```

目标：让 Agent 工作前知道当前目录、profile、文件数量、manifest 和 Git 状态。

### 6.3 校验

```text
Agent -> pkwiki validate --json -> error / warning
```

目标：让 Agent 在修改前后确认 Vault 是否仍然合规。

### 6.4 素材摄入

```text
Human Maintainer 提供素材
Agent 或 Human Maintainer 调用 pkwiki ingest
Raw Source 登记到 manifest
生成 Extracted Source 模板
```

目标：把素材纳入可追溯的 Source 管理。

### 6.5 合并入 Wiki

```text
Agent 读取 status / manifest / extracted / wiki
Agent 生成 PatchPlan
pkwiki apply-patch
pkwiki validate
Human Maintainer 审查 diff
Human Maintainer commit / push
```

目标：把素材完整、正确、可追溯地合并进长期 Wiki。

### 6.6 自维护

```text
Agent 读取 status / validate / index / manifest
Agent 发现 Wiki Health 问题
Agent 生成修复计划
pkwiki apply-patch
pkwiki validate
Human Maintainer 审查 diff
Human Maintainer commit / push
```

目标：让长期 Wiki 像代码库一样定期体检和受控维护，减少冗余、过时、坏味道和矛盾。

## 7. MVP 边界

第一阶段只做：

```text
pkwiki init
pkwiki status
pkwiki validate
```

不做：

- LLM 调用。
- Pi 接入。
- MCP。
- Web UI。
- PatchPlan。
- 自动 ingest。
- 自动 commit。
- Self-maintenance。

这样做的原因是：后续所有 Agent 行为都依赖一个可识别、可读取、可校验的 Vault。

## 8. 非目标

`pkwiki` 不追求成为：

- Obsidian 替代品。
- Wiki.js / MediaWiki 替代品。
- 全功能 RAG 平台。
- 云同步服务。
- 多 Agent 编排框架。
- 专属 Pi Agent 实现。

它应保持为 Agent 可调用的个人知识库工具层。

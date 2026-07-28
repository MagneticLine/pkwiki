# 产品定义

## 1. 产品定位

`pkwiki` 是一个本地优先、文件为真相源、由 Agent 驱动的个人知识编译与维护系统。

它把聊天记录、文档、日记、经历、健康记录、学习资料和其他零散 Raw Source，增量编译成可追溯、可查询、可演进的 Markdown Wiki。Human Maintainer 拥有知识和最终决定权；Agent 负责提取、定位、规划、合并、查询和维护；确定性工具负责建立契约、限制写入、校验结果并留下审计记录。

`pkwiki` 不是单一 CLI 包，也不是只有模型调用的聊天应用。完整产品由三部分组成：

1. 可被不同 Agent 调用的确定性知识工具。
2. 面向 Wiki 场景的 Agent Harness 应用。
3. CLI、MCP、HTTP、本地 Web UI 和静态站点等外部入口。

一句话表达产品价值：

> 让零散资料经过可审查的知识编译流程，持续沉淀为人和 Agent 都能使用的长期个人知识库。

## 2. 用户与操作者

### 2.1 Human Maintainer

Human Maintainer 是最终用户、知识所有者和决策者，负责：

- 提供 Raw Source 和 Vault 目标。
- 定义隐私、保留、风格和合并规则。
- 审查 Agent 产物和 Git diff。
- 回答冲突、不确定性和重要性问题。
- 决定是否 apply、commit、push 或发布。

### 2.2 Agent

Agent 是主要操作者和机器接口消费者，负责：

- 读取 Vault 状态和规则。
- 提取并理解 Raw Source。
- 定位候选 Wiki Page。
- 生成 MergePlan 和 PatchPlan。
- 调用确定性命令完成受控修改。
- 查询 Wiki，并在得到授权时把有价值结果写回。
- 发现 Wiki Health 问题并提出修复计划。

因此，CLI Command 必须稳定、可解析、可自动化，关键命令必须支持结构化输出。产品设计需要同时满足两个目标：约束 Agent 的不确定性，并让 Human Maintainer 能理解和控制每次实质变更。

## 3. 核心对象

### 3.1 Vault

Vault 是完整的个人知识工作区，不等同于 OKF Bundle。

当前 `pkwiki/0.1` 结构：

```text
raw/
extracted/
wiki/
outputs/
assets/
system/
.pkwiki/
```

### 3.2 Raw Source

Raw Source 是 Human Maintainer 提供的原始素材。

- 默认存放在 `raw/`。
- Agent 不允许修改原始内容。
- `pkwiki ingest` 可以复制、登记和校验 Raw Source。
- 清洗、OCR、转写、分块、提取和总结必须进入 Extracted Source。

### 3.3 Extracted Source

Extracted Source 是 Raw Source 和 Wiki 之间的工作层。

- 默认存放在 `extracted/`。
- 保存归一化内容、信息单元、证据、不确定性和候选目标。
- Agent 可以在 Harness 约束下更新。
- 它不是长期知识事实的最终来源。

### 3.4 Wiki

Wiki 是长期稳定知识层，由 Wiki Page 组成。

- 默认存放在 `wiki/`。
- 兼容 OKF Bundle 的基本目录与 Markdown 约定。
- Agent 只能通过受控修改流程写入。
- 每次实质修改都必须可校验、可追溯、可通过 Git diff 审查。

OKF 是 Wiki 层的外部兼容目标，不是完整 Vault 的内部数据模型。`pkwiki` profile 才是 Vault、Source、Merge 和 Harness 的产品契约。

### 3.5 Wiki Page

Wiki Page 是 Wiki 中的单个长期知识单元。页面必须包含 `pkwiki/0.1` profile 的 YAML frontmatter：

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

### 3.6 Managed Artifact

Managed Artifact 是需要被长期保存并供人直接复用的原始文件，例如简历、成绩单、证书、申请材料和项目成果。

Managed Artifact 与 Raw Source 相关但不等同：Raw Source 服务知识追溯，Managed Artifact 服务文件归档和未来取用。该能力属于后续产品范围，在 `pkwiki/0.1` 中暂不增加必需目录，后续通过独立 Feature Spec 决定目录、版本和引用关系。

## 4. 核心质量目标

### 4.1 Source-to-Wiki Merge

当 Agent 拿到一份 Raw Source 时，它应该能够：

1. 理解素材主题、领域、时间范围、隐私和用途。
2. 把素材拆成带稳定标识和证据的信息单元。
3. 通过索引、frontmatter、manifest、全文搜索和链接渐进定位候选页面。
4. 判断创建、更新、拆分、链接、延后或舍弃。
5. 保证重要信息没有被无记录地遗漏。
6. 保证新增内容能追溯到 Source ID，必要时追溯到具体信息单元或 chunk。
7. 保证不确定推断不会被写成确定事实。
8. 保证跨页面级联修改后链接、索引和结论仍然一致。
9. 让 Human Maintainer 能审查 Agent 为什么这样处理每个重要信息单元。

这个目标不能只依赖模型能力，必须由 Harness、结构化计划、确定性校验和真实场景 eval 共同保障。

### 4.2 Compounding Knowledge

Wiki 不应只在摄入时有用。Agent 应能基于 Wiki 查询历史信息，并把经 Human Maintainer 认可的新结论、回答和经验重新写回，使知识在长期使用中持续复利。

对应两个正式工作流：

- Query：只读检索和回答，默认给出 Wiki Page 和 Source 引用。
- File-back：把有长期价值的回答或运行结果重新纳入 Source-to-Wiki Merge，而不是直接绕过规则写 Wiki。

### 4.3 Adaptive Maintenance

Agent 应通过版本化规则、运行记录、用户反馈和回归 eval 逐渐符合当前 Vault 的目的与风格。

早期不做模型微调。偏好学习优先沉淀为：

- `system/MERGE_POLICY.md`
- `system/STYLE_GUIDE.md`
- `system/PAGE_TYPES.md`
- `system/PRIVACY_RULES.md`
- 可复用的已接受和已拒绝案例

Human Maintainer 的一次纠正可以只修当前结果；具有普遍性的纠正应经过确认后更新规则或 eval，避免同类错误再次发生。

### 4.4 Wiki Health

长期 Wiki 会出现重复、过时、矛盾、断链、孤儿页面、过长页面和缺少来源的 claim。Self-maintenance 必须遵循：

- 先检测，再提出修复计划。
- 修复使用可审查的 PatchPlan。
- 不允许 Agent 自由整理整个 Wiki。
- 修复后必须 validate 和 diff。

## 5. Harness 的产品职责

Harness 是 `pkwiki` 的核心产品层，不只是命令包装。

它负责：

- 根据 Vault 规则构建有限上下文的 Context Pack。
- 编排 extraction、candidate location、merge、query、file-back 和 maintenance 工作流。
- 管理一次运行的输入、模型、上下文、计划、工具调用、结果和反馈。
- 要求 Agent 输出结构化 Extraction、MergePlan 和 PatchPlan。
- 调用确定性工具执行 search、validate、index、apply-patch 和 diff。
- 在冲突、隐私、不确定性和越权写入时停止并请求确认。
- 聚合完整性、引用、级联修改和 Wiki Health 检查。
- 通过 dogfood、失败样本和 eval 持续改进规则与工具。

Harness Core 保持 Agent Runtime 中立。Pi 是第一个正式 Runtime Adapter，用于提供模型调用、Agent loop、会话和工具执行能力；后续可以增加其他 Runtime Adapter。MCP、HTTP 和 Web UI 是 Harness 的外部入口，不等同于 Harness 本身。

Harness 不负责：

- 替代 Human Maintainer 做最终价值判断。
- 保证模型推理永远正确。
- 让 `pkwiki` core 绑定单一模型供应商或 Agent Runtime。
- 自动 commit、push 或公开发布敏感资料。

## 6. 核心工作流

### 6.1 Initialize

```text
Human Maintainer -> pkwiki init -> Vault
```

### 6.2 Ingest

```text
Raw Source -> register -> immutable raw copy -> Extracted Source template
```

### 6.3 Extract And Locate

```text
Raw Source -> normalize/chunk/extract -> Context Pack -> candidate Wiki Pages
```

### 6.4 Merge

```text
Extraction -> MergePlan -> PatchPlan -> apply -> validate -> diff -> review
```

### 6.5 Query

```text
Question -> search/index/link traversal -> Context Pack -> cited answer
```

### 6.6 File-back

```text
Valuable answer/run output -> new Source -> controlled Merge workflow
```

### 6.7 Self-maintenance

```text
Health scan -> repair plan -> PatchPlan -> validate -> diff -> review
```

### 6.8 Artifact Filing

```text
Reusable original file -> classify/version -> Managed Artifact -> Wiki reference
```

Artifact Filing 是后续范围，不属于当前 `pkwiki/0.1` 的必需能力。

## 7. 当前产品状态

0001 到 0009 已完成 Merge Foundations 的确定性工具和协议：

```text
pkwiki init
pkwiki status
pkwiki validate
pkwiki ingest
pkwiki chunk
pkwiki register-extraction
pkwiki index
pkwiki list-pages
pkwiki read-page
pkwiki search
pkwiki build-context
pkwiki register-merge-plan
pkwiki finalize-merge
pkwiki apply-patch
pkwiki diff
```

当前尚未完成：

- Agent Harness 和 Pi Runtime Adapter。
- 模型驱动的 extraction、MergePlan、PatchPlan、Query 和 File-back。
- 完整 Harness Run lifecycle、approval、feedback 和 eval。
- MCP、HTTP、本地 Web UI 和静态站点输出。
- Wiki Health 和 Self-maintenance。

Merge Foundations 已通过低敏端到端验收。下一里程碑是 Agent Harness MVP。

## 8. 非目标

`pkwiki` 不追求成为：

- Obsidian 替代品。
- Wiki.js 或 MediaWiki 替代品。
- 全功能 RAG 平台。
- 云同步服务。
- 通用多 Agent 编排框架。
- 自动发布个人隐私数据的托管平台。

产品可以使用 Pi 等 Agent Runtime，但确定性内核和 Vault 契约必须保持可移植。

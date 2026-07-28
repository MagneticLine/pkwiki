# Extracted Source Schema

Extracted Source 是 Raw Source 和 Wiki 之间的人类可读工作层。

它不是简单摘要，也不单独承担全部机器状态。Extracted Source Markdown 用于阅读和审查；正式 Information Item 与 evidence 记录在 `extracted/data/<source-id-file-name>.json`，MergePlan 和 Merge Coverage 的机器结构由 0008 定义。

## 1. 目标

Extracted Source 支持：

- 保存 Raw Source 的归一化阅读版本。
- 展示带稳定 Item ID 的 facts、events、entities、decisions、questions 和 uncertainty。
- 展示 Agent 定位的候选 Wiki Page。
- 让 Human Maintainer 审查哪些信息被合并、延后、舍弃或需要确认。
- 为 Source-to-Wiki Merge 提供人类可读输入。

## 2. 文件位置

```text
extracted/sources/src-YYYY-MM-DD-slug.md
```

每个 Extracted Source 必须对应一个 Source ID。

## 3. Frontmatter

0006 目标格式：

```yaml
---
source_id: src:2026-07-28-example
raw_path: raw/inbox/2026-07-28-example.md
type: chat
domain: personal
created: 2026-07-28T10:00:00+08:00
processing_status: registered
lifecycle_status: active
privacy: private
language: zh-CN
---
```

Frontmatter 状态是 Source Manifest 的人类可读镜像，不是独立真相源。状态更新必须由确定性流程同步，不能依赖 Agent 手工修改两个位置。

## 4. 标准章节

```markdown
# Extracted Source

## Source

## Normalized Content

## Summary

## Facts

## Events

## Entities

## Decisions

## Questions

## Uncertainty

## Candidate Wiki Targets

## Merge Coverage

## Deferred

## Discarded

## User Confirmation Needed
```

## 5. 章节语义

### 5.1 Source

至少展示：

- Source ID。
- Raw path。
- Source type 和 domain。
- Checksum。
- Privacy 和 language。
- 当前 processing 和 lifecycle status。

### 5.2 Normalized Content

Raw Source 的归一化阅读版本。

- OCR、转写和格式清洗可以放在这里。
- 不改变原始事实含义。
- 大 Source 可以保留摘要和 chunk 引用，不要求复制全部内容。
- 无法识别或可能损坏的信息必须明确标注。

### 5.3 Summary

素材整体导航摘要。

- Summary 不是 Wiki 最终事实。
- 不确定内容必须标注。
- 大 Source 的 Summary 应能引导 Agent 选择需要读取的 chunk。

### 5.4 Information Item

Fact、Event、Entity、Decision、Question 和 Uncertainty 都属于 Information Item。

每个重要 Item 至少需要：

```text
itemId
kind
content
evidence
confidence
```

`itemId` 在同一 Source 内稳定，例如 `fact:f1`、`event:e1`。Extraction Artifact v0.1 已由 0007 冻结并通过 `pkwiki register-extraction` 登记。

### 5.5 Facts

可进入 Wiki 的事实候选。

推荐人类可读格式：

```markdown
- item_id: fact:f1
  claim: "..."
  evidence: "chunk:c3 lines 10-14"
  confidence: high
```

### 5.6 Events

有时间属性的经历、项目节点、生活事件或学习记录。应区分发生时间、记录时间和不确定时间。

### 5.7 Entities

人物、组织、项目、课程、产品、地点、游戏、文件等实体。应保留 aliases、entity type 和与 Human Maintainer 的关系。

### 5.8 Decisions

明确做出的选择、判断或承诺。必须区分事实、理由、约束、后续行动和复盘，不能把临时想法误写成长期决策。

### 5.9 Questions

素材中暴露出的待回答问题，可以进入 Wiki 的待确认区域，也可以留在 Extracted Source。

### 5.10 Uncertainty

不确定、冲突、缺少证据或需要 Human Maintainer 解释的内容。Agent 不能把这里的内容直接写成确定事实。

### 5.11 Candidate Wiki Targets

Agent 对可能受影响页面的定位结果。

每个候选至少记录：

- target path 或 page id。
- reason。
- intent：create、update、split、link 或 skip。
- confidence。
- 定位依据，例如 title、tag、source reference、full-text match 或 link traversal。

### 5.12 Merge Coverage

展示每个重要 Information Item 的处理结果：

```text
merged
deferred
discarded
needs_confirmation
```

Extracted Source 中的 coverage 是审查视图。机器真相源由正式 MergePlan、coverage artifact 和 Run Record 共同定义，确定性工具据此推进 Source Processing Status。

### 5.13 Deferred

有价值但暂不进入 Wiki 的内容，必须记录原因和重新处理条件。

### 5.14 Discarded

明确舍弃的内容，必须记录原因。

不得无记录舍弃可能影响个人长期画像、重要经历、健康、职业、财务、关系、价值观演化或未来可复用材料的信息。

### 5.15 User Confirmation Needed

需要 Human Maintainer 判断的问题。遇到冲突、隐私边界、不确定重要性或高影响结论时，Agent 应选择确认，而不是擅自写入 Wiki。

## 6. 状态推进

```text
registered
  -> extracted
  -> partially_merged | merged
```

- ingest 创建模板时使用 `processing_status: registered`。
- 完成正式 extraction artifact 并通过校验后进入 `extracted`。
- 存在未完成的重要 Item 时进入 `partially_merged`。
- 所有重要 Item 都有合法 coverage 决策并完成必要审查后进入 `merged`。

Lifecycle Status 独立推进，不受上述流程限制。

## 7. 合并前要求

Agent 生成 MergePlan 前至少完成：

- Summary。
- 带稳定 Item ID 的重要 Information Item。
- Evidence 和 confidence。
- Candidate Wiki Targets。
- Uncertainty 和 User Confirmation Needed。
- Merge Coverage 初稿。

## 8. 合并后要求

受控 finalize 流程应：

- 保存正式 coverage artifact。
- 更新 Extracted Source 的人类可读 coverage 视图。
- 更新 Source Processing Status。
- 记录目标 Wiki Page 和 PatchPlan。
- 保存 validate、diff 和 Human Review 结果。

具体写入协议由 `0008-merge-plan-coverage` 冻结。0006 只升级模板，不实现完整 extraction 或 finalize 流程。

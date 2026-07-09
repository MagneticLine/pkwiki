# Extracted Source Schema

Extracted Source 是 Raw Source 和 Wiki 之间的中间层。

它的作用不是简单摘要，而是让 Agent 在合并前先把原始素材拆成可审查、可追溯、可取舍的信息单元。

## 1. 目标

Extracted Source 需要支持四件事：

- 保存 Raw Source 的归一化阅读版本。
- 把重要信息拆成 facts、events、entities、decisions、questions 和 uncertainty。
- 记录哪些信息已经合并、延后合并、舍弃或需要用户确认。
- 为 Source-to-Wiki Merge 提供稳定输入。

## 2. 文件位置

```text
extracted/sources/src-YYYY-MM-DD-slug.md
```

每个 Extracted Source 必须对应一个 Source ID。

## 3. Frontmatter

推荐格式：

```yaml
---
source_id: src:2026-07-02-example
raw_path: raw/inbox/2026-07-02-example.md
type: chat
domain: personal
created: 2026-07-02T10:00:00+08:00
status: extracted
privacy: private
language: zh-CN
---
```

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

记录 source metadata，至少包含：

- Source ID。
- Raw path。
- Source type。
- Domain。
- Checksum。

### 5.2 Normalized Content

Raw Source 的归一化阅读版本。

规则：

- OCR、转写、格式清洗可以放这里。
- 不应在这里改写事实含义。
- 如果 Raw Source 太大，可以只保留摘要和 chunk 引用。

### 5.3 Summary

对素材整体内容的简短概括。

规则：

- Summary 是导航辅助，不是 Wiki 最终事实。
- 不确定内容必须标注不确定。

### 5.4 Facts

可进入 Wiki 的事实候选。

推荐格式：

```markdown
- [ ] fact_id: f1
  claim: "..."
  evidence: "..."
  confidence: high|medium|low
  target: wiki/...
```

### 5.5 Events

有时间属性的经历、项目节点、生活事件或学习记录。

推荐字段：

- date。
- title。
- participants。
- location。
- evidence。
- candidate target。

### 5.6 Entities

人物、组织、项目、课程、产品、地点、游戏、文件等实体。

推荐字段：

- name。
- entity type。
- aliases。
- relation to Human Maintainer。
- candidate page。

### 5.7 Decisions

明确做出的选择、判断或承诺。

规则：

- 决策要区分事实、理由和后续行动。
- 不应把聊天中的临时想法误写成长期决策。

### 5.8 Questions

素材中暴露出的待回答问题。

这些问题可以进入 Wiki 的 TODO/Question 区域，也可以留在 Extracted Source 等待后续处理。

### 5.9 Uncertainty

不确定、冲突、缺少证据或需要用户解释的内容。

Agent 不应把这里的内容直接写成确定事实。

### 5.10 Candidate Wiki Targets

Agent 对可能受影响 Wiki Page 的定位结果。

推荐记录：

- target path。
- reason。
- operation intent：create/update/split/skip。
- confidence。

### 5.11 Merge Coverage

记录素材信息的处理结果。

推荐状态：

```text
merged
deferred
discarded
needs_confirmation
```

### 5.12 Deferred

有价值但暂不进入 Wiki 的内容。

典型原因：

- 需要更多上下文。
- 不适合当前页面。
- 信息粒度太细。
- 等待用户确认。

### 5.13 Discarded

明确舍弃的内容。

规则：

- 必须写原因。
- 不应舍弃可能影响个人长期画像、重要经历、健康、职业、财务、关系、信念演化的信息，除非 Human Maintainer 规则明确允许。

### 5.14 User Confirmation Needed

需要 Human Maintainer 回答的问题。

Agent 遇到冲突、隐私边界、不确定重要性时，应优先把问题写在这里，而不是擅自写入 Wiki。

## 6. 合并前要求

Agent 在生成 PatchPlan 之前，应至少完成：

- Summary。
- Facts 或 Events。
- Candidate Wiki Targets。
- Merge Coverage 初稿。
- User Confirmation Needed，如有。

## 7. 合并后要求

PatchPlan 应用并通过审查后，Extracted Source 应更新 Merge Coverage：

- 哪些 fact/event/entity 已合并。
- 合并到了哪些 Wiki Page。
- 哪些内容 deferred。
- 哪些内容 discarded。
- 哪些问题仍需用户确认。

这使得“信息是否丢失”可以被审查，而不是完全依赖 Agent 主观判断。

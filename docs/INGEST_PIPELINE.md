# Ingest Pipeline

摄入采用编译器式流水线，避免让 Agent 一次读取全部 Raw Source 和 Wiki 后自由改写。

```text
Register Source
  -> Normalize
  -> Chunk
  -> Extract Information Items
  -> Reduce Summary
  -> Locate Candidate Pages
  -> Build Context Pack
  -> MergePlan
  -> Human Approval
  -> PatchPlan
  -> Apply
  -> Validate And Index
  -> Diff Review
  -> Finalize Coverage
```

阶段职责：

1. Register：分配 Source ID，记录 checksum、路径、类型、时间、隐私和状态。
2. Normalize：把 PDF、图片、网页、聊天和音频转换为可读内容，不改变原意。
3. Chunk：按结构或语义边界切分大 Source，并保留 evidence locator。
4. Extract：提取带稳定 Item ID 的 facts、events、entities、decisions、questions 和 uncertainty。
5. Reduce：形成 Source Summary，并保留未能归纳的信息。
6. Locate：通过 index、frontmatter、全文搜索和 links 定位 Candidate Wiki Page。
7. Context Pack：记录本次 Agent 实际读取的 Source、页面和规则。
8. MergePlan：为每个重要 Item 记录去向和理由。
9. PatchPlan：表达确定性文件修改，不承担知识取舍。
10. Finalize：写入正式 coverage、推进 Processing Status 并保存 Run Record。

0006 到 0009 已实现 Register、Chunk、Extraction Artifact、Candidate Location、Context Pack、MergePlan、Coverage 和 Finalize 的确定性契约。下一阶段由 Agent Harness 调用模型生成 extraction、MergePlan 和 PatchPlan，并编排这些工具。

详细契约见：

- [Vault Spec](VAULT_SPEC.md)
- [Extracted Source Schema](EXTRACTED_SOURCE_SCHEMA.md)
- [Source-to-Wiki Merge](SOURCE_TO_WIKI_MERGE.md)
- [Search 与 Context Pack](SEARCH_AND_CONTEXT.md)
- [Agent Harness](AGENT_HARNESS.md)

# Search 与 Context Pack

Search 与 Context Pack 是 Agent Harness 之前的确定性读取层。它负责把“从整个 Vault 中找资料”收缩为可重复、可审查、受预算约束的页面和 Source 上下文集合，不负责生成知识判断。

## 1. CLI

```bash
pkwiki list-pages [--json]
pkwiki read-page <wiki-path> [--json]
pkwiki search <query> [--limit <number>] [--json]
pkwiki build-context <request.json> [--json]
```

- `list-pages` 重新生成索引后，按 Page ID 稳定列出 Wiki Page。
- `read-page` 只读取 `wiki/**/*.md`，返回 metadata、checksum、headings、links 和 Markdown content。
- `search` 每次基于最新 Wiki 重新生成 Page Manifest 和 Search Index。
- `build-context` 构建并保存 Context Pack，不调用模型。

## 2. Search

搜索覆盖 title、id、path、tags、domain、type、sources、headings、description 和正文。基础评分为：

```text
title exact            100
title contains          40
id/path contains        30
tags exact token        25
domain/type match       20
sources match           20
headings contains       15
description contains    10
body contains            5
```

每类字段只计算一次基础分，多 token 命中只增加低权重分。结果按 score 降序、Page ID 升序排列，并记录 `matchedFields` 和短 excerpt。`limit` 默认 10，范围 1 到 100。

## 3. Context Request v0.1

```json
{
  "version": "pkwiki.context-request/0.1",
  "runId": "run:2026-07-28-example",
  "workflow": "merge",
  "query": "pkwiki MergePlan",
  "sourceIds": ["src:2026-07-28-example"],
  "maxPages": 5,
  "maxChars": 20000,
  "linkDepth": 1
}
```

- `workflow` 支持 `merge` 和 `query`。
- `maxPages` 默认 5，范围 1 到 20。
- `maxChars` 默认 20000，范围 1000 到 100000，只计算 Page content。
- `linkDepth` 默认 1，范围 0 到 2。
- `sourceIds` 中的 Source 必须已登记且不能重复。

## 4. Context Pack v0.1

Context Pack 写入：

```text
.pkwiki/runs/<run-id-file-name>/context-pack.json
```

它记录：

- runId、workflow、query 和生成时间。
- page/source 字符预算、实际使用量和截断状态。
- Source Manifest metadata。
- 已存在 Extraction Artifact 的 summary、Information Item 和 evidence chunk ID。
- Candidate Page 的选择原因、score、link depth、metadata、checksum、links、headings 和受预算约束的 content。
- 因 `maxPages` 或 `maxChars` 未纳入的候选页面。

Context Pack 不自动包含 Raw Source 全文。Source context 字符独立记录为 `sourceChars`，不挤占 Page 的 `maxChars`。

## 5. Candidate 与链接扩展

1. 先按 Search score 产生 depth 0 的直接候选。
2. 选中页面后，按 Markdown links 扩展现有 Wiki Page。
3. 链接页记录 `linked_from:<page-id>`，并使用衰减分数参与稳定排序。
4. 同一 Page 只出现一次。
5. 达到页面或字符预算后，剩余候选进入 `omitted`。

## 6. Run 目录共存

- `build-context` 可以先创建只含 `context-pack.json` 的 planning Run 目录。
- `register-merge-plan` 可以在该目录中补充 `run.json` 和 `merge-plan.json`，必须保留已有 Context Pack。
- Query workflow 可以只保存 Context Pack；0009 不创建完整 Query Run Record。
- Merge finalize 后继续在同一目录保存 `coverage.json`。
- 页面在 Context Pack 生成后变化时，`validate` 报告 `CONTEXT_PAGE_CHECKSUM_STALE` warning，不把历史 Context Pack 判为非法。

## 7. 安全边界

- read path 必须位于 Vault 的 Wiki root 且以 `.md` 结尾。
- Context Pack 在完整构造并通过 schema 校验后原子写入。
- Agent 不直接手写 Page Manifest、Search Index 或 Context Pack。
- Search 不调用 embedding、rerank model 或 LLM，也不自动决定 MergePlan。

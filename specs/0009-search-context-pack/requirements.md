# 0009 Search 与 Context Pack 需求

## 1. 背景

0006 到 0008 已建立 Source、Extraction、MergePlan 和 Coverage 契约，但 Agent 仍缺少稳定的渐进读取接口。直接遍历整个 Vault 会浪费上下文，也无法审计模型究竟读取了哪些页面。

0009 提供确定性 list/read/search 和 Context Pack 构建，为 Source-to-Wiki Merge 和后续 Query/Harness 提供候选定位与上下文预算。

## 2. CLI

```bash
pkwiki list-pages [--json]
pkwiki read-page <wiki-path> [--json]
pkwiki search <query> [--limit <number>] [--json]
pkwiki build-context <request.json> [--json]
```

## 3. Search

- 每次 search 基于最新 Wiki 重新生成 Page Manifest 和 Search Index。
- 搜索 title、id、path、description、domain、type、tags、sources、headings 和正文。
- 排序必须确定性，同分按 page id。
- 结果包含 score、matchedFields 和短 excerpt。
- 默认 limit 10，范围 1 到 100。

## 4. Read

- `list-pages` 返回 Page Manifest 的稳定排序摘要。
- `read-page` 只允许读取 `wiki/**/*.md`。
- 输出 path、checksum、metadata、headings、links 和 Markdown content。
- 拒绝 Vault 外路径和非 Markdown 文件。

## 5. Context Request v0.1

```json
{
  "version": "pkwiki.context-request/0.1",
  "runId": "run:2026-07-28-example",
  "workflow": "merge",
  "query": "pkwiki 阶段四 MergePlan",
  "sourceIds": ["src:2026-07-28-example"],
  "maxPages": 5,
  "maxChars": 20000,
  "linkDepth": 1
}
```

workflow 支持 `merge` 和 `query`。

约束：

- maxPages 默认 5，范围 1 到 20。
- maxChars 默认 20000，范围 1000 到 100000。
- linkDepth 默认 1，范围 0 到 2。
- Source 必须已登记；存在 Extraction Artifact 时加入 Source context。

## 6. Context Pack v0.1

```json
{
  "version": "pkwiki.context-pack/0.1",
  "runId": "run:2026-07-28-example",
  "workflow": "merge",
  "query": "pkwiki 阶段四 MergePlan",
  "createdAt": "2026-07-28T16:00:00+08:00",
  "budget": {
    "maxPages": 5,
    "maxChars": 20000,
    "usedPages": 2,
    "usedChars": 8000
  },
  "sources": [],
  "pages": [],
  "omitted": []
}
```

Page context 包含选择原因、search score、link depth、metadata、content 和 truncated 状态。Context Pack 写入 `.pkwiki/runs/<run-id>/context-pack.json`。

## 7. Candidate 选择

1. Search 取得直接候选。
2. 按 score 选择页面。
3. 根据 Markdown links 逐层扩展。
4. 不重复页面，不越过 maxPages。
5. 页面内容超过剩余 maxChars 时截断并记录。
6. 未纳入的候选及原因写入 omitted。

## 8. 非目标

- 不调用 LLM。
- 不做向量 embedding 或 rerank model。
- 不自动决定 MergePlan。
- 不读取 private Source 原文全文进入 Context Pack，只加入 manifest 和 extraction 摘要/items。
- 不实现 Query 回答生成。

## 9. 验收

- list/read/search 对 fixture Vault 输出稳定。
- Search 能按 title、tag、source 和正文命中。
- 不安全 read path 被拒绝。
- Context Pack 遵守 page/char/linkDepth 预算。
- Context Pack 记录 Source extraction、候选理由、截断和 omitted。
- validate 能检查已保存 Context Pack。
- build、test、lint 和低敏 dogfood 通过。

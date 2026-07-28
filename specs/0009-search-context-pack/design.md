# 0009 Search 与 Context Pack 设计

## 1. 包结构

新增 `packages/search`，依赖 `core`、`indexer` 和 `merge`。它提供纯确定性的页面读取、词法搜索和 Context Pack 构建。

## 2. Search 评分

对规范化 query 和 token 计算字段匹配：

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

每个字段只计一次基础分；命中多个 token 可增加低权重 token 分。结果按 score 降序、page id 升序排列。

## 3. Page Read

`readWikiPage` 使用 Page Manifest 和 Search Index metadata，并读取当前文件 checksum/content。路径通过 `resolve + relative` 限制在 `wiki/`。

## 4. Link Traversal

Search 直接结果 depth 为 0。按结果顺序读取页面 links，将可解析到现有 Wiki Page 的链接加入队列，depth 递增，最大 2。

链接扩展页面的选择原因记录为 `linked_from:<page-id>`，score 继承父页面的低权重衰减值，仅用于稳定排序。

## 5. Budget

- Source context 字符不计入 page maxChars，但记录独立 sourceChars。
- Page content 计入 maxChars。
- 截断按 Unicode string slice，记录 originalChars 和 includedChars。
- 达到 maxPages 或 maxChars 后，其余候选进入 omitted。

## 6. Source Context

只读取：

- Source Manifest metadata。
- Extraction summary。
- Information Item id、kind、content、confidence 和 evidence chunk id。

不把 Raw Source 全文自动放入 Context Pack。

## 7. 写入

Context Pack 先完整构造和校验，再写入：

```text
.pkwiki/runs/<run-id>/context-pack.json
```

Run 目录可以由 `build-context` 先创建，也可以来自 0008 MergePlan。`register-merge-plan` 允许接管只含 `context-pack.json` 的同名目录，并原子补充 `run.json` 和 `merge-plan.json`；其他已有内容仍按 `RUN_ALREADY_EXISTS` 拒绝。0009 不创建完整 Query Run Record。

## 8. 错误码

```text
INVALID_SEARCH_QUERY
INVALID_SEARCH_LIMIT
UNSAFE_READ_PATH
PAGE_NOT_FOUND
INVALID_CONTEXT_REQUEST
CONTEXT_SOURCE_NOT_FOUND
CONTEXT_BUDGET_INVALID
```

## 9. Validate

Validator 检查 Context Pack version、runId、budget、Source 引用、Page 路径和 checksum。Wiki Page 后续变化时报告 `CONTEXT_PAGE_CHECKSUM_STALE` warning，不把历史 Context Pack 判为非法。

合法的 context-only planning 目录对 merge 和 query workflow 都可通过 validate；当目录同时存在 merge Run Record 时，Context Pack workflow 必须为 merge。

# Wiki Schema

标准 Wiki 内容位于 `wiki/` 下，以 OKF v0.1 作为外部兼容目标，并叠加更严格的 `pkwiki/0.1` profile。

当前兼容承诺主要包括 Markdown 目录、概念页面、`index.md` 风格导航和版本字段。`pkwiki` 尚未提供完整 OKF conformance validator；后续应通过兼容性矩阵明确支持范围，不能只凭 `okf_version` 字段宣称完全兼容。

每个 concept 页面应包含符合 `pkwiki` profile 的 YAML frontmatter：

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

标准链接格式使用 Markdown links，不把 Obsidian wikilink 作为核心格式。

页面写作必须区分事实、推断、感受、问题和时间变化。新增长期 claim 应在页面 `sources` 中引用 Source ID；更细粒度的 Information Item 和 evidence 引用由后续 Extraction/Merge Contract 定义。

`pkwiki index` 会从 `wiki/` 扫描这些 Wiki Page，生成 `.pkwiki/page_manifest.json` 和 `outputs/index.json`。Page Manifest 与 Search Index 是可再生成的机器索引，不是长期知识事实来源；长期事实仍以 Wiki Page 本身为准。

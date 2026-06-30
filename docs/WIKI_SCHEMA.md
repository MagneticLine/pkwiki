# Wiki Schema

标准 Wiki 内容位于 `wiki/` 下，是一个 OKF 兼容 bundle。

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

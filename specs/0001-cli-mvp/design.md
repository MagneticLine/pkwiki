# 0001 CLI MVP 设计

## 1. 设计原则

- Agent first：命令输出和错误模型优先保证可自动化。
- Deterministic first：本阶段不引入模型推理。
- Contract first：先定义 Vault 契约，再做 ingest、index、PatchPlan。
- Human readable by default：默认输出给人看，`--json` 输出给 Agent 看。
- No surprise writes：除 `init` 外，`status` 和 `validate` 不修改文件系统。

## 2. 模块分工

```text
packages/core
  Vault 探测、路径、配置、常量、文件统计。

packages/validator
  Vault 结构校验、frontmatter 校验、Markdown link 校验。

packages/git
  Git 仓库识别、status summary。

packages/cli
  命令参数解析、输出格式、退出码。
```

## 3. Vault root 探测

从给定起点开始向上查找：

```text
.pkwiki/config.json
```

找到后读取配置，并确认：

- JSON 可解析。
- `profile` 等于 `pkwiki/0.1`。
- `okfVersion` 等于 `0.1`。
- `wikiRoot`、`rawRoot`、`extractedRoot` 存在或可被 validate 报错。

如果找不到，返回 `VaultNotFound`。

## 4. Vault 配置

`.pkwiki/config.json` 第一版结构：

```json
{
  "profile": "pkwiki/0.1",
  "okfVersion": "0.1",
  "wikiRoot": "wiki",
  "rawRoot": "raw",
  "extractedRoot": "extracted",
  "outputsRoot": "outputs"
}
```

后续可以增加 schema version、template version、feature flags。

## 5. 标准目录契约

第一版必需目录：

```text
raw/
extracted/
wiki/
outputs/
assets/
system/
.pkwiki/
```

第一版必需文件：

```text
AGENTS.md
SCHEMA.md
system/INDEX.md
system/LOG.md
system/PAGE_TYPES.md
system/INGEST_RULES.md
system/LINT_RULES.md
system/PRIVACY_RULES.md
.pkwiki/config.json
.pkwiki/source_manifest.json
.pkwiki/chunk_manifest.json
.pkwiki/page_manifest.json
```

缺失必需目录或文件是 error。

## 6. Wiki Page 校验

`wiki/` 下所有非 `index.md`、非 `log.md` 的 `.md` 文件视为 Wiki Page。

必需 frontmatter 字段：

```text
okf_version
profile
id
type
title
description
domain
status
created
updated
confidence
privacy
sources
tags
```

校验规则：

- 文件必须以 YAML frontmatter 开头。
- frontmatter 必须可解析为对象。
- 必需字段不能为空。
- `okf_version` 必须为 `"0.1"`。
- `profile` 必须为 `pkwiki/0.1`。
- `sources` 必须是数组。
- `tags` 必须是数组。

违反以上规则是 error。

## 7. Markdown link 校验

第一版只解析标准 Markdown links：

```md
[title](../concepts/example.md)
```

规则：

- 只校验指向本地 `.md` 的相对链接。
- 外部 URL 不校验。
- Obsidian `[[wikilink]]` 暂不解析。
- 断链是 warning，不是 error。

## 8. Git 状态

`status` 调用 `packages/git` 判断：

- 当前 Vault 是否是 Git 仓库或位于 Git 仓库内。
- 是否 clean。
- `git status --short` 文件数量。

Git 未初始化是 warning 级状态，不阻塞。因为 `init` 默认不执行 `git init`。

## 9. 命令设计

### 9.1 `pkwiki init`

```bash
pkwiki init <path> [--force] [--git] [--json]
```

行为：

1. 检查目标路径。
2. 默认拒绝非空目录。
3. 从 `templates/default-vault` 复制文件。
4. 确保 `.pkwiki/config.json` 存在。
5. 如果传入 `--git`，执行 `git init`。
6. 输出创建结果。

### 9.2 `pkwiki status`

```bash
pkwiki status [path] [--json]
```

行为：

1. 探测 Vault root。
2. 读取配置。
3. 统计 `raw/`、`extracted/`、`wiki/` 下文件数。
4. 读取 manifest 文件存在性。
5. 读取 Git 状态。
6. 输出状态。

### 9.3 `pkwiki validate`

```bash
pkwiki validate [path] [--json]
```

行为：

1. 探测 Vault root。
2. 校验配置、目录和必需文件。
3. 扫描 Wiki Page frontmatter。
4. 扫描 Markdown links。
5. 输出 error/warning。
6. 根据结果设置退出码。

## 10. JSON 输出模型

### 10.1 Status JSON

```json
{
  "ok": true,
  "vaultRoot": "/path/to/vault",
  "profile": "pkwiki/0.1",
  "okfVersion": "0.1",
  "counts": {
    "raw": 0,
    "extracted": 0,
    "wiki": 0
  },
  "manifests": {
    "source": true,
    "chunk": true,
    "page": true
  },
  "git": {
    "initialized": true,
    "clean": false,
    "changedFiles": 3
  }
}
```

### 10.2 Validate JSON

```json
{
  "ok": false,
  "vaultRoot": "/path/to/vault",
  "errors": [
    {
      "code": "MISSING_REQUIRED_FILE",
      "message": "缺少必需文件 system/INDEX.md",
      "path": "system/INDEX.md"
    }
  ],
  "warnings": [
    {
      "code": "BROKEN_MARKDOWN_LINK",
      "message": "Markdown link 指向不存在的文件",
      "path": "wiki/concepts/example.md",
      "target": "../missing.md"
    }
  ]
}
```

## 11. 错误码初稿

Error：

- `VAULT_NOT_FOUND`
- `INVALID_CONFIG`
- `MISSING_REQUIRED_DIRECTORY`
- `MISSING_REQUIRED_FILE`
- `INVALID_FRONTMATTER`
- `MISSING_FRONTMATTER_FIELD`
- `INVALID_PROFILE`
- `INVALID_OKF_VERSION`
- `INVALID_FIELD_TYPE`

Warning：

- `GIT_NOT_INITIALIZED`
- `GIT_DIRTY`
- `BROKEN_MARKDOWN_LINK`
- `SOURCE_NOT_REGISTERED`
- `RAW_NOT_REGISTERED`
- `OVERSIZED_PAGE`
- `ORPHAN_PAGE`

第一版可以先实现必要子集，但代码结构应允许扩展。

## 12. 测试设计

建议 fixture：

```text
fixtures/valid-vault/
fixtures/missing-required-file/
fixtures/missing-frontmatter-field/
fixtures/broken-markdown-link/
fixtures/non-vault/
```

测试类型：

- `core`：Vault root 探测、配置读取、路径解析。
- `validator`：结构校验、frontmatter 校验、link 校验。
- `cli`：命令输出、退出码、`--json`。
- `git`：Git 状态解析。


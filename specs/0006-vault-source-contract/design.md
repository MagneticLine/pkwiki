# 0006 Vault 与 Source 契约落地设计

## 1. 设计原则

- 文档契约优先转成确定性代码。
- Source Manifest 记录事实，不替代 Raw Source。
- `deleted` 是生命周期状态，不是删除记录。
- validate 应尽量发现不一致，但保持老 Vault 可用。
- Extracted Source 模板应服务 Agent merge，不只是给人看的空文档。

## 2. 模块分工

```text
packages/core
  SourceStatus、SourceManifestEntry、ingestSource、Extracted Source 模板。

packages/validator
  source manifest 字段、status、raw checksum、raw size、deleted 语义检查。

packages/cli
  ingest JSON 输出自动继承新增字段；可选暴露 privacy/language 参数。

templates/default-vault
  更新 system/INGEST_RULES.md 和必要规则说明。

docs
  必要时同步 VAULT_SPEC.md 和 EXTRACTED_SOURCE_SCHEMA.md。
```

## 3. Source Manifest v0.2

TypeScript 类型：

```ts
export type SourceStatus =
  | "registered"
  | "extracted"
  | "merged"
  | "archived"
  | "deleted";

export type SourceManifestEntry = {
  sourceId: string;
  originalPath: string;
  originalName?: string;
  rawPath: string;
  extractedPath: string;
  type: string;
  domain: string;
  checksum: string;
  sizeBytes?: number;
  created: string;
  ingestedAt?: string;
  mtime?: string;
  status: SourceStatus;
  privacy?: string;
  language?: string;
};
```

说明：

- `created` 暂时保留为当前兼容字段，语义等同首次登记时间。
- `ingestedAt` 是更明确的摄入时间。
- `mtime` 是原始输入文件在摄入时的修改时间。
- `originalName` 来自输入文件 basename。
- `sizeBytes` 来自输入文件 stat size。

## 4. ingest 行为

流程变化：

1. 读取输入文件 stat。
2. 计算 sha256。
3. 按 checksum 查找已有 source。
4. 如果复用，直接返回已有 entry，不更新 mtime/size。
5. 如果新增，复制到 `raw/inbox/`。
6. 写 Extracted Source 模板。
7. 写 v0.2 source manifest entry。

默认 options：

```ts
privacy: "private"
language: "zh-CN"
```

CLI 可增加：

```bash
--privacy <privacy>
--language <language>
```

这两个参数不是高风险参数，可以在 0006 一并暴露。

## 5. Extracted Source 模板

frontmatter：

```yaml
---
source_id: src:...
raw_path: raw/inbox/...
type: chat
domain: personal
created: 2026-07-09T10:00:00+08:00
status: registered
privacy: private
language: zh-CN
---
```

`status` 默认使用 `registered`，表示 source 已登记但尚未由 Agent 完成结构化提取。后续如果实现 extraction 命令，可以把状态推进到 `extracted`。

标准章节：

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

`Source` 章节应预填：

- Source ID。
- Raw path。
- Type。
- Domain。
- Privacy。
- Language。

## 6. validate 规则

### 6.1 必需字段

仍然 error：

- 缺少 `sourceId`
- 缺少 `rawPath`
- 缺少 `type`
- 缺少 `domain`
- 缺少 `checksum`
- 缺少 `status`
- manifest key 与 `sourceId` 不一致

### 6.2 status 枚举

合法值：

```text
registered
extracted
merged
archived
deleted
```

非法值报 error：`INVALID_SOURCE_STATUS`。

### 6.3 raw 文件缺失

- `status !== "deleted"` 且 raw 文件缺失：warning `RAW_SOURCE_MISSING`。
- `status === "deleted"` 且 raw 文件缺失：不报 warning。
- `status === "deleted"` 且 raw 文件仍存在：warning `DELETED_SOURCE_FILE_EXISTS`，提示状态和文件不一致。

### 6.4 extracted 文件缺失

不论 status 是否 deleted，`extractedPath` 缺失都可以继续 warning。

理由：Raw Source 被删不等于 Extracted Source 记录应消失。Extracted Source 可能是唯一剩余审计材料。

### 6.5 checksum 检查

当 raw 文件存在且 `checksum` 是字符串：

- 重新计算 sha256。
- 不一致时 warning `RAW_SOURCE_CHECKSUM_MISMATCH`。

### 6.6 size 检查

当 raw 文件存在且 `sizeBytes` 是 number：

- 比较 `stat.size`。
- 不一致时 warning `RAW_SOURCE_SIZE_MISMATCH`。

如果 `sizeBytes` 缺失，不报错，保持兼容。

## 7. 测试设计

### 7.1 core

- `ingestSource` 写入 v0.2 字段。
- `ingestSource` 默认 privacy/language。
- `ingestSource` 支持 options privacy/language。
- 重复 ingest 继续复用 checksum。
- Extracted Source 模板包含正式章节。

### 7.2 validator

- 非法 status 报 error。
- `deleted` + raw missing 不报 `RAW_SOURCE_MISSING`。
- 非 deleted + raw missing 报 warning。
- `deleted` + raw exists 报 warning。
- checksum mismatch 报 warning。
- size mismatch 报 warning。
- 老 manifest 缺少 v0.2 可选字段不报 error。

### 7.3 cli

- `pkwiki ingest --json` 输出新增字段。
- 如果暴露 `--privacy`、`--language`，测试参数生效。

## 8. 风险与取舍

- 增加 manifest 字段会让 diff 变大，但对 Agent 判断更有价值。
- validate checksum 会增加少量 IO，MVP 可接受。
- `deleted` 语义先由手动编辑 manifest 表达，不急于做命令。
- Extracted Source 模板变长，但这是为 Agent merge 准备的必要结构。

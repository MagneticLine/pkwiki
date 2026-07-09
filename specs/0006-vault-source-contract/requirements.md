# 0006 Vault 与 Source 契约落地需求

## 1. 背景

0001 到 0005 已经完成 `pkwiki` 的确定性 CLI 核心：初始化、状态读取、校验、摄入、索引、受控 Patch 和 Git diff 审查。

随后我们补充了 Vault Spec、Extracted Source Schema、Source-to-Wiki Merge 和页面类型设计。现在这些设计还主要停留在文档层，运行时代码仍是 MVP 契约：

- Source Manifest 只记录少量字段。
- Source status 只有 `registered`。
- `ingest` 生成的 Extracted Source 模板仍是早期简版。
- validate 只检查 source manifest 必需字段和文件存在，不检查 raw checksum、size、status 枚举等。
- `deleted` source status 已在文档中定义，但未落地到类型和校验。

0006 的目标是把 Vault/Source 契约落到代码里，为后续 Source-to-Wiki Merge 和 Agent 集成铺路。

## 2. 目标

### 2.1 产品目标

- Raw Source 登记记录更完整，便于追溯、审查和后续 Agent 判断。
- Source status 支持生命周期推进，尤其允许 `deleted` 表达 Raw Source 已缺失但记录仍保留。
- Extracted Source 模板对齐正式 schema，让 Agent 在合并前有固定填写位置。
- validate 能发现 source manifest 和 raw 文件之间的关键不一致。
- 保持与现有 Vault 的向后兼容，不让老的 source manifest 立即报错失效。

### 2.2 工程目标

- 扩展 `SourceStatus` 类型。
- 扩展 `SourceManifestEntry` 字段。
- 更新 `pkwiki ingest` 写入完整 source metadata。
- 更新 Extracted Source 模板。
- 更新 validate 的 source manifest 检查。
- 更新默认 Vault 文档和模板。
- 为新字段、deleted status、checksum/size 检查补测试。
- 保持 `pnpm build`、`pnpm test`、`pnpm lint` 通过。

## 3. 用户故事

### 3.1 Source manifest 保留更多元数据

作为 Agent，我希望读取 `.pkwiki/source_manifest.json` 时能知道 source 的原始文件名、大小、mtime、隐私级别和语言，避免只靠路径和 checksum 判断素材。

验收：

- 新 ingest 的 manifest entry 包含 `originalName`、`sizeBytes`、`ingestedAt`、`mtime`、`privacy`、`language`。
- `checksum` 继续使用 `sha256:...`。
- `created` 保留，作为兼容字段。
- `--json` 输出包含新增字段。

### 3.2 Raw Source 缺失时允许标记 deleted

作为 Human Maintainer，我可能会手动删除某个 raw 文件。我希望 source 记录不要被直接删除，而是能被标记为 `deleted`。

验收：

- `SourceStatus` 支持 `registered`、`extracted`、`merged`、`archived`、`deleted`。
- validate 遇到 `status: deleted` 且 raw 文件不存在时，不报 `RAW_SOURCE_MISSING` warning。
- validate 遇到非 deleted source 且 raw 文件不存在时，继续报 warning。
- validate 遇到非法 status 报 error。

### 3.3 validate 检查 raw checksum 和 size

作为维护者，我希望如果 raw 文件被手动改写，validate 能提示 manifest 与文件不一致。

验收：

- 对存在的 raw 文件，validate 重新计算 sha256。
- checksum 不一致时报 warning。
- `sizeBytes` 不一致时报 warning。
- 老 manifest 没有 `sizeBytes` 时不报错，只跳过 size 检查。

### 3.4 Extracted Source 模板对齐正式 schema

作为 Agent，我希望 `pkwiki ingest` 生成的 extracted 模板已经包含正式章节，便于后续填写 facts、events、candidate targets 和 merge coverage。

验收：

- 新模板包含 `Source`、`Normalized Content`、`Summary`、`Facts`、`Events`、`Entities`、`Decisions`、`Questions`、`Uncertainty`、`Candidate Wiki Targets`、`Merge Coverage`、`Deferred`、`Discarded`、`User Confirmation Needed`。
- frontmatter 使用 `source_id`、`raw_path`、`type`、`domain`、`created`、`status`、`privacy`、`language`。
- 默认 `status` 为 `registered` 或 `extracted` 需要在设计中明确。

## 4. 功能范围

### 4.1 Source Manifest v0.2

新 ingest 应写入：

```json
{
  "sourceId": "src:2026-07-09-example",
  "originalPath": "/absolute/input/example.md",
  "originalName": "example.md",
  "rawPath": "raw/inbox/2026-07-09-example.md",
  "extractedPath": "extracted/sources/src-2026-07-09-example.md",
  "type": "chat",
  "domain": "personal",
  "checksum": "sha256:...",
  "sizeBytes": 12345,
  "created": "2026-07-09T10:00:00+08:00",
  "ingestedAt": "2026-07-09T10:00:00+08:00",
  "mtime": "2026-07-09T09:59:00+08:00",
  "status": "registered",
  "privacy": "private",
  "language": "zh-CN"
}
```

### 4.2 默认参数

`pkwiki ingest` MVP 不强制增加 CLI 参数。

默认值：

- `privacy`: `private`
- `language`: `zh-CN`

后续可以增加：

```bash
pkwiki ingest <file> --type <type> --domain <domain> --privacy private --language zh-CN
```

0006 可以先在 core 层支持 options，在 CLI 层是否暴露视实现复杂度决定。

### 4.3 向后兼容

老 manifest entry 允许缺少：

- `originalName`
- `sizeBytes`
- `ingestedAt`
- `mtime`
- `privacy`
- `language`

validate 对这些字段可以 warning 或跳过，但不应 error。

必需字段仍是：

- `sourceId`
- `rawPath`
- `type`
- `domain`
- `checksum`
- `status`

### 4.4 非目标

- 不实现真正 LLM extraction。
- 不实现 MergePlan 命令。
- 不实现 `pkwiki source delete` 或 `pkwiki source status` 命令。
- 不迁移已有 vault 的 source manifest。
- 不做数据库索引。
- 不做 MCP 或 Web UI。

## 5. 验收标准

- 新 ingest 的 source manifest 包含 v0.2 字段。
- 重复 ingest 仍按 checksum 去重。
- validate 能识别非法 source status。
- validate 对 `deleted` source 缺失 raw 文件不报 raw missing warning。
- validate 对非 deleted source 缺失 raw 文件仍报 warning。
- validate 能提示 raw checksum mismatch。
- validate 能提示 raw size mismatch。
- Extracted Source 模板对齐正式章节。
- 文档和模板同步更新。
- `pnpm build` 通过。
- `pnpm test` 通过。
- `pnpm lint` 通过。

# 0006 Vault 与 Source 契约落地需求

## 1. 背景

0001 到 0005 已完成初始化、状态读取、校验、非 LLM ingest、索引、PatchPlan 和 Git diff review。

当前运行时 Source 契约仍是 MVP：

- Source Manifest metadata 较少。
- 单一 `status: registered` 无法表达后续 processing 和 lifecycle。
- Extracted Source 模板与正式设计不一致。
- validate 不检查 Raw Source checksum、size 和状态枚举。
- 文档曾把 registered、merged、archived 和 deleted 放进同一状态维度，无法表达“已经 merged，但 Raw 文件后来 deleted”的真实情况。

0006 负责修正并落地 Vault/Source 基础契约，为 0007 Extraction/Chunk、0008 MergePlan/Coverage 和 Agent Harness 提供稳定输入。

## 2. 目标

### 2.1 产品目标

- Source Manifest 保留足够的来源、完整性、隐私和语言 metadata。
- Source Processing Status 与 Source Lifecycle Status 相互独立。
- Raw Source 删除后保留 Source ID、历史引用和审计线索。
- Extracted Source 模板对齐正式人类可读结构。
- validate 能发现 manifest 与 Raw Source 的关键不一致。
- 现有 Vault 不因新字段立即失效。

### 2.2 工程目标

- 扩展 `SourceManifestEntry`。
- 新增 `SourceProcessingStatus` 和 `SourceLifecycleStatus`。
- 新 ingest 写入 Source Manifest v0.2 字段。
- CLI 明确支持 `--privacy` 和 `--language`。
- 更新 Extracted Source 模板。
- 更新 source manifest validate。
- 同步默认 Vault 文档和测试。

## 3. 用户故事

### 3.1 保留来源 metadata

作为 Agent，我希望读取 Source Manifest 时能知道原始文件名、大小、mtime、摄入时间、隐私和语言，避免只靠路径和 checksum 理解素材。

验收：

- 新 entry 包含 `originalName`、`sizeBytes`、`ingestedAt`、`mtime`、`privacy` 和 `language`。
- `checksum` 继续使用 `sha256:...`。
- `created` 保留，语义为首次登记时间。
- `pkwiki ingest --json` 返回新增字段。

### 3.2 独立表达处理进度和生命周期

作为 Human Maintainer，我希望一份已经 merge 的 Source 在 Raw 文件删除后仍能同时表达过去已处理和现在已删除。

验收：

- Processing Status 支持 `registered`、`extracted`、`partially_merged` 和 `merged`。
- Lifecycle Status 支持 `active`、`archived` 和 `deleted`。
- 新 ingest 默认 `processingStatus: registered`。
- 新 ingest 默认 `lifecycleStatus: active`。
- validate 分别校验两个枚举。

### 3.3 Raw Source 完整性检查

作为 Human Maintainer，我希望 Raw 文件被手动改写或异常缺失时，validate 能提示 manifest 与文件不一致。

验收：

- Raw 文件存在时重新计算 sha256。
- checksum 不一致时报 warning。
- `sizeBytes` 不一致时报 warning。
- 非 deleted Source 缺失 Raw 文件时报 warning。
- deleted Source 缺失 Raw 文件不报 missing warning。
- deleted Source 的 Raw 文件仍存在时报状态不一致 warning。

### 3.4 Extracted Source 模板

作为 Agent，我希望 ingest 生成的模板具有正式章节和 Source metadata，便于后续 extraction 和 merge。

验收：

- Frontmatter 包含 `source_id`、`raw_path`、`type`、`domain`、`created`、`processing_status`、`lifecycle_status`、`privacy` 和 `language`。
- 默认状态是 registered 和 active。
- 模板包含 Source、Normalized Content、Summary、Facts、Events、Entities、Decisions、Questions、Uncertainty、Candidate Wiki Targets、Merge Coverage、Deferred、Discarded 和 User Confirmation Needed。
- Source 章节预填基本 metadata。

### 3.5 向后兼容

作为已有 Vault 维护者，我希望旧 manifest 的 `status: registered` 仍然可读。

验收：

- 旧 entry 缺少 v0.2 metadata 时不报 error。
- 旧 `status: registered` 被解释为 registered + active。
- 旧 `status` 缺失且新双状态也缺失时报 error。
- 新写入不继续使用单一 `status` 作为权威字段。

## 4. Source Manifest v0.2

新 entry：

```json
{
  "sourceId": "src:2026-07-28-example",
  "originalPath": "/absolute/input/example.md",
  "originalName": "example.md",
  "rawPath": "raw/inbox/2026-07-28-example.md",
  "extractedPath": "extracted/sources/src-2026-07-28-example.md",
  "type": "chat",
  "domain": "personal",
  "checksum": "sha256:...",
  "sizeBytes": 12345,
  "created": "2026-07-28T10:00:00+08:00",
  "ingestedAt": "2026-07-28T10:00:00+08:00",
  "mtime": "2026-07-28T09:59:00+08:00",
  "processingStatus": "registered",
  "lifecycleStatus": "active",
  "privacy": "private",
  "language": "zh-CN"
}
```

CLI：

```bash
pkwiki ingest <file> \
  --type <type> \
  --domain <domain> \
  --privacy <privacy> \
  --language <language>
```

默认值：

- `privacy`: `private`
- `language`: `zh-CN`

## 5. 兼容规则

允许旧 entry 缺少：

- `originalName`
- `sizeBytes`
- `ingestedAt`
- `mtime`
- `privacy`
- `language`
- `processingStatus`
- `lifecycleStatus`

旧 entry 必须具有合法 `status: registered` 才能使用 legacy fallback。

以下情况报 error：

- 新旧状态字段全部缺失。
- 只有 `processingStatus` 或只有 `lifecycleStatus`。
- 新双状态与 legacy `status` 同时存在且语义冲突。
- 非法 Processing Status。
- 非法 Lifecycle Status。

0006 不自动迁移已有 manifest。后续 schema migration 阶段再提供批量迁移命令。

## 6. 非目标

- 不实现 LLM extraction。
- 不实现 Chunk Manifest 正式字段。
- 不实现 MergePlan 或 Merge Coverage 命令。
- 不实现 processing status 自动推进。
- 不实现 source lifecycle 修改命令。
- 不实现 Source revision。
- 不实现 `.pkwiki/runs/`。
- 不实现 MCP、HTTP 或 Web UI。

## 7. 验收标准

- 新 ingest 写入 Source Manifest v0.2。
- 重复 ingest 继续按 checksum 去重。
- privacy 和 language CLI 参数生效。
- validate 分别校验 processing 和 lifecycle status。
- validate 正确处理 active、archived、deleted 与 Raw 文件存在状态。
- validate 能提示 checksum 和 size mismatch。
- legacy manifest 保持可读。
- Extracted Source 模板与正式章节一致。
- 默认 Vault 规则与产品文档一致。
- `pnpm build`、`pnpm test`、`pnpm lint` 和 `pnpm -r lint` 通过。

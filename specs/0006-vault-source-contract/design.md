# 0006 Vault 与 Source 契约落地设计

## 1. 设计原则

- Source Manifest 记录来源事实和状态，不替代 Raw Source。
- Processing Status 与 Lifecycle Status 相互独立。
- 新数据使用明确双状态，旧数据通过兼容分支读取。
- validate 尽量发现不一致，但不让已有 Vault 因可选 metadata 缺失而失效。
- Extracted Source 模板服务后续 Agent workflow，但 0006 不伪装成已经实现 extraction。

## 2. 模块分工

```text
packages/core
  Source 类型、状态归一化、ingest metadata、Extracted Source 模板。

packages/validator
  manifest 字段、双状态、Raw checksum、size 和 deleted 语义。

packages/cli
  privacy/language 参数和 JSON 输出。

templates/default-vault
  更新规则、页面类型和推荐 policy 文件。

docs
  同步 Vault、Extraction、Merge、产品和路线图。
```

## 3. TypeScript 类型

```ts
export type SourceProcessingStatus =
  | "registered"
  | "extracted"
  | "partially_merged"
  | "merged";

export type SourceLifecycleStatus = "active" | "archived" | "deleted";

export type LegacySourceStatus = "registered";

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
  processingStatus?: SourceProcessingStatus;
  lifecycleStatus?: SourceLifecycleStatus;
  status?: LegacySourceStatus;
  privacy?: string;
  language?: string;
};

export type NormalizedSourceStatus = {
  processingStatus: SourceProcessingStatus;
  lifecycleStatus: SourceLifecycleStatus;
  legacy: boolean;
};
```

`SourceManifestEntry` 在兼容期允许 optional 状态字段。业务逻辑不能直接读取 optional 字段，应统一调用状态归一化函数。

## 4. 状态归一化

建议新增：

```ts
normalizeSourceStatus(entry): NormalizedSourceStatus
```

规则：

1. 同时存在 `processingStatus` 和 `lifecycleStatus` 时使用新状态。
2. 两个新字段都不存在，且 `status === "registered"` 时返回 registered + active，并标记 `legacy: true`。
3. 只存在一个新字段时抛出 manifest error。
4. 新双状态和 legacy status 同时存在时，允许兼容读取，但 legacy status 只能是 registered；如果新 processing status 不是 registered，则 validator 报冲突 error。
5. 新 ingest 只写 `processingStatus` 和 `lifecycleStatus`，不写 legacy `status`。

## 5. Ingest 行为

```text
1. 读取输入文件 stat。
2. 计算 sha256。
3. 按 checksum 查找已有 Source。
4. 已存在时返回原 entry，不修改其 metadata 或状态。
5. 新增时复制到 raw/inbox。
6. 写入 v0.2 manifest entry。
7. 创建正式 Extracted Source 模板。
```

新 entry 字段：

- `originalName`：输入文件 basename。
- `sizeBytes`：输入文件 `stat.size`。
- `created`：首次登记时间。
- `ingestedAt`：本次首次 ingest 时间，与 created 相同。
- `mtime`：输入文件 `stat.mtime` 的 ISO 字符串。
- `processingStatus`：registered。
- `lifecycleStatus`：active。
- `privacy`：CLI 参数或 private。
- `language`：CLI 参数或 zh-CN。

重复 checksum 复用旧 entry，因此不更新 mtime、size、privacy、language 或状态。Source revision 属于后续设计。

## 6. Extracted Source 模板

Frontmatter：

```yaml
---
source_id: src:...
raw_path: raw/inbox/...
type: chat
domain: personal
created: 2026-07-28T10:00:00+08:00
processing_status: registered
lifecycle_status: active
privacy: private
language: zh-CN
---
```

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

`Source` 章节预填 Source ID、Raw path、type、domain、privacy、language、processing status 和 lifecycle status。

模板中的状态是初始人类可读镜像。0006 不实现后续状态同步或 coverage finalize。

## 7. Validate 规则

### 7.1 必需字段

继续作为 error：

- 缺少 `sourceId`。
- 缺少 `rawPath`。
- 缺少 `type`。
- 缺少 `domain`。
- 缺少 `checksum`。
- manifest key 与 `sourceId` 不一致。
- 新旧状态均不可归一化。

### 7.2 Processing Status

合法值：

```text
registered
extracted
partially_merged
merged
```

非法值：`INVALID_SOURCE_PROCESSING_STATUS`。

### 7.3 Lifecycle Status

合法值：

```text
active
archived
deleted
```

非法值：`INVALID_SOURCE_LIFECYCLE_STATUS`。

### 7.4 Raw 文件存在状态

- lifecycle 不是 deleted 且 Raw 文件缺失：warning `RAW_SOURCE_MISSING`。
- lifecycle 是 deleted 且 Raw 文件缺失：不报 missing warning。
- lifecycle 是 deleted 但 Raw 文件存在：warning `DELETED_SOURCE_FILE_EXISTS`。
- lifecycle 是 archived 时仍检查文件完整性。

### 7.5 Checksum 与 Size

Raw 文件存在时：

- checksum 不一致：warning `RAW_SOURCE_CHECKSUM_MISMATCH`。
- `sizeBytes` 存在且不一致：warning `RAW_SOURCE_SIZE_MISMATCH`。
- 旧 entry 缺少 `sizeBytes`：跳过 size 检查。

### 7.6 Extracted 文件

`extractedPath` 缺失继续报告 warning。Raw Source deleted 不代表 Extracted Source 应被删除。

### 7.7 Legacy Entry

- `status: registered` 且无新状态：合法 legacy entry。
- 新状态只出现一个字段：error `INCOMPLETE_SOURCE_STATUS`。
- legacy status 非 registered：error `INVALID_LEGACY_SOURCE_STATUS`。
- 新双状态与 legacy status 冲突：error `CONFLICTING_SOURCE_STATUS`。

## 8. CLI

```bash
pkwiki ingest <file> \
  --type <type> \
  --domain <domain> \
  [--privacy <privacy>] \
  [--language <language>] \
  [--json]
```

参数必须是非空字符串。0006 不冻结 privacy 和 language 枚举，由 Vault policy 在后续阶段约束。

## 9. 测试设计

### 9.1 Core

- 新 ingest 写入 v0.2 metadata 和双状态。
- privacy/language 默认值与显式参数。
- 重复 checksum 复用旧 entry。
- legacy status 归一化。
- 不完整和冲突状态拒绝。
- Extracted Source 模板包含正式 frontmatter 和章节。

### 9.2 Validator

- Processing Status 和 Lifecycle Status 非法值。
- active、archived、deleted 与 Raw 文件存在状态。
- checksum 和 size mismatch。
- legacy entry 兼容。
- 新旧状态冲突。

### 9.3 CLI

- JSON 输出包含 v0.2 字段。
- privacy 和 language 参数生效。
- 空参数被拒绝。

## 10. 风险与取舍

- 双状态增加字段数量，但避免后续无法表达真实 Source 生命周期。
- optional 类型服务兼容，业务逻辑必须通过 normalize 函数消除不确定性。
- validate checksum 增加少量 IO，MVP 可接受。
- 0006 不做自动 migration，避免在基础契约尚未 dogfood 时批量改写私密 Vault。
- Extracted Source 模板比 MVP 更长，但这只是后续 workflow 的稳定入口，不代表 extraction 已实现。

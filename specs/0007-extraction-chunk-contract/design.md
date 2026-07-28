# 0007 Extraction 与 Chunk Contract 设计

## 1. 模块分工

```text
packages/core
  Chunk 类型、确定性分块、Chunk Manifest、Extraction Artifact 解析和登记。

packages/validator
  Chunk Manifest 和已登记 Extraction Artifact 一致性检查。

packages/cli
  chunk 与 register-extraction 命令。
```

## 2. 数据位置

```text
.pkwiki/chunk_manifest.json
extracted/chunks/<source-file-name>/<index>.md
extracted/data/<source-file-name>.json
extracted/sources/<source-file-name>.md
```

Chunk 文件和 Extraction Artifact 是受控工作层。Chunk Manifest 是 chunk 索引；Extraction Artifact 是机器可读 extraction 真相源；Extracted Source Markdown 是确定性生成的人类审查视图。

## 3. Chunk 算法

1. 校验 Source 和 Raw checksum。
2. 读取 UTF-8 文本并统一换行为 LF。
3. 按空行组成 paragraph block。
4. 在不超过 maxChars 的前提下合并 block。
5. 超长 block 按行切分，超长单行按字符切分。
6. 记录每个 chunk 的原始 startLine 和 endLine。
7. 写入临时目录，全部成功后替换正式目录和 manifest entries。

Chunk ID 只由 Source ID 和顺序决定。Source 内容变化由 sourceChecksum 和 checksum 检出，不在 0007 引入 Source revision。

## 4. 类型

```ts
type ChunkManifestEntry = {
  chunkId: string;
  sourceId: string;
  index: number;
  path: string;
  startLine: number;
  endLine: number;
  charCount: number;
  checksum: string;
  sourceChecksum: string;
  createdAt: string;
};

type ExtractionItemKind =
  | "fact"
  | "event"
  | "entity"
  | "decision"
  | "question"
  | "uncertainty";

type ExtractionItem = {
  itemId: string;
  kind: ExtractionItemKind;
  content: string;
  confidence: "high" | "medium" | "low";
  evidence: Array<{ chunkId: string; quote?: string }>;
};

type ExtractionArtifact = {
  version: "pkwiki.extraction/0.1";
  sourceId: string;
  sourceChecksum: string;
  createdAt: string;
  normalizedContent?: string;
  summary: string;
  items: ExtractionItem[];
};
```

## 5. 原子性

- chunk 在内存中完成切分和 manifest 构造后再写文件。
- 新 chunk 先写临时目录，再替换旧目录。
- register-extraction 先完成全部 schema 和引用校验，再写 JSON、Markdown 和 Source Manifest。
- 任一步失败时不推进 Source status。

## 6. Markdown 渲染

- Source metadata 由 Source Manifest 渲染。
- Normalized Content 来自 artifact 或 chunk 链接列表。
- Summary 来自 artifact。
- Items 按 kind 分组，保留 Item ID、confidence 和 evidence。
- Candidate Targets、Coverage、Deferred、Discarded 和 Confirmation 继续保留空 section，供 0008 使用。

## 7. Validate

Validator 检查：

- Chunk Manifest entry 必需字段和 key/chunkId 一致。
- chunk 文件存在、checksum 正确、Source 已登记、sourceChecksum 未过期。
- extraction JSON 能通过相同 parser。
- extraction Source、checksum 和 evidence chunk 仍然有效。
- processingStatus 为 extracted 或更后阶段时，extraction artifact 应存在。

## 8. 错误边界

确定性错误使用稳定 code，至少包括：

```text
SOURCE_NOT_FOUND
SOURCE_NOT_ACTIVE
RAW_SOURCE_MISSING
SOURCE_CHECKSUM_MISMATCH
UNSUPPORTED_SOURCE_TYPE
INVALID_MAX_CHARS
INVALID_EXTRACTION_ARTIFACT
EXTRACTION_SOURCE_MISMATCH
EXTRACTION_EVIDENCE_INVALID
```

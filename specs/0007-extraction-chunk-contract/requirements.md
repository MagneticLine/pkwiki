# 0007 Extraction 与 Chunk Contract 需求

## 1. 背景

0006 已能可靠登记 Raw Source，但大文件分块和结构化 extraction 仍只有文档概念。空 `chunk_manifest.json` 不能帮助 Agent 控制上下文，Extracted Source Markdown 也不适合作为机器唯一真相源。

0007 在不调用 LLM 的前提下建立稳定协议：确定性工具负责文本分块、artifact 校验、状态推进和人类可读视图生成；后续 Harness 或外部 Agent 负责产生语义 extraction artifact。

## 2. 目标

- 为文本和 Markdown Raw Source 生成稳定 Chunk Manifest 和 chunk 文件。
- 冻结 Extraction Artifact v0.1。
- 校验 Information Item、evidence 和 Source/Chunk 引用。
- 把合法 artifact 写入 Vault，并生成 Extracted Source 人类可读视图。
- 成功登记 extraction 后把 Source Processing Status 推进到 `extracted`。
- 保持 legacy Source status 可升级。

## 3. CLI

```bash
pkwiki chunk <source-id> [--max-chars <number>] [--json]
pkwiki register-extraction <artifact.json> [--json]
```

默认 `maxChars` 为 4000，最小 500，最大 20000。

## 4. Chunk Contract

Chunk ID：

```text
chunk:<source-id-without-src-prefix>:0001
```

Chunk 文件：

```text
extracted/chunks/<source-id-file-name>/0001.md
```

Chunk Manifest entry 至少包含：

```json
{
  "chunkId": "chunk:2026-07-28-example:0001",
  "sourceId": "src:2026-07-28-example",
  "index": 1,
  "path": "extracted/chunks/src-2026-07-28-example/0001.md",
  "startLine": 1,
  "endLine": 20,
  "charCount": 1200,
  "checksum": "sha256:...",
  "sourceChecksum": "sha256:...",
  "createdAt": "2026-07-28T10:00:00+08:00"
}
```

## 5. Chunk 行为

- 仅处理 active 或 legacy active Source。
- Raw 文件必须存在且 checksum 与 manifest 一致。
- v0.1 仅支持 UTF-8 文本和 Markdown。
- 优先在空行边界切分，单个段落超过预算时按行切分。
- 每个 chunk 保留原始文本，不做语义改写。
- 相同 Source checksum 和 maxChars 重跑必须得到相同 chunk 内容和 ID。
- 重跑时原子替换该 Source 的旧 chunk entries 和 chunk 目录。

## 6. Extraction Artifact v0.1

```json
{
  "version": "pkwiki.extraction/0.1",
  "sourceId": "src:2026-07-28-example",
  "sourceChecksum": "sha256:...",
  "createdAt": "2026-07-28T10:00:00+08:00",
  "normalizedContent": "可选的小型归一化文本",
  "summary": "素材摘要",
  "items": [
    {
      "itemId": "fact:f1",
      "kind": "fact",
      "content": "长期事实候选",
      "confidence": "high",
      "evidence": [
        {
          "chunkId": "chunk:2026-07-28-example:0001",
          "quote": "可选短证据"
        }
      ]
    }
  ]
}
```

合法 kind：

```text
fact
event
entity
decision
question
uncertainty
```

合法 confidence：`high`、`medium`、`low`。

## 7. Artifact 校验

- version 必须正确。
- Source 必须已登记且 lifecycle 不是 archived/deleted。
- `sourceChecksum` 必须等于 Source Manifest checksum。
- `itemId` 在 artifact 内唯一，并以 `<kind>:` 开头。
- content 必须是非空字符串。
- evidence 至少一项。
- evidence chunk 必须存在、属于同一 Source，且 source checksum 未过期。
- quote 可选，但存在时必须是非空字符串且不超过 500 字符。

## 8. 登记结果

合法 artifact 写入：

```text
extracted/data/<source-id-file-name>.json
```

同时重新生成：

```text
extracted/sources/<source-id-file-name>.md
```

Source Manifest 更新：

```text
processingStatus = extracted
lifecycleStatus 保持不变
移除 legacy status
```

## 9. 非目标

- 不调用 LLM。
- 不支持 PDF、图片、音频 OCR 或转写。
- 不生成 Candidate Wiki Target。
- 不生成 MergePlan 或 PatchPlan。
- 不推进 partially_merged 或 merged。
- 不做向量 embedding。

## 10. 验收

- chunk 命令对三份 mock source 生成稳定 manifest 和文件。
- register-extraction 能登记合法 artifact 并生成 Markdown 视图。
- 非法 version、重复 Item ID、错误 evidence 和过期 checksum 被拒绝。
- Source status 正确推进到 extracted。
- validate 能发现 stale chunk 和 invalid extraction artifact。
- build、test、lint 和 dogfood 通过。

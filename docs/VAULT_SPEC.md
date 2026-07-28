# Vault Spec

`pkwiki` Vault 是完整的个人知识工作区。它包含 Raw Source、Extracted Source、Wiki、规则、派生产物和机器状态，不等同于纯 OKF Bundle。

当前 profile 是 `pkwiki/0.1`。本文同时标明当前必需结构和已规划但尚未成为必需项的扩展，避免文档目标与运行时代码混淆。

## 1. 当前目录结构

```text
raw/
extracted/
wiki/
outputs/
assets/
system/
.pkwiki/
```

## 2. 目录职责

### 2.1 `raw/`

Raw Source 存放区。

- Human Maintainer 提供的素材通过 ingest 复制或登记进入该区域。
- Agent 默认只读，不能改写原始内容。
- 原则上 Raw Source 应长期保留。
- 文件被删除时保留 Source Manifest 记录，并更新生命周期状态。

### 2.2 `extracted/`

Raw Source 的归一化和提取工作层。

- 保存适合人阅读的 normalized content、summary、information items 和 uncertainty。
- 每个 Extracted Source 必须追溯到 Source ID。
- Agent 可以在 Harness 约束下更新。
- Extracted Source 不替代 Wiki Page，也不单独承担 Merge Coverage 的机器真相源。

### 2.3 `wiki/`

长期 Wiki 层，也是 OKF 兼容目标。

- Wiki Page 必须是 Markdown。
- Wiki Page 必须包含 `pkwiki/0.1` profile frontmatter。
- Agent 不自由改写页面，应通过 PatchPlan 修改。
- Wiki Page 是长期知识事实的主要来源。

### 2.4 `outputs/`

可再生成的索引、报告和发布产物。

- `outputs/index.json` 由 `pkwiki index` 生成。
- Human Maintainer 决定生成产物是否进入 Git。
- Agent 不手写可以由确定性工具生成的输出。

### 2.5 `assets/`

被 Wiki Page 引用的图片、附件和媒体资源。

`assets/` 不等同于 Managed Artifact 文件库。简历、证书和申请材料等可复用原始文件将在独立 Feature Spec 中定义归档位置和版本关系。

### 2.6 `system/`

Human Maintainer 管理的 Vault 目标和 Agent 规则。

核心规则包括：

```text
INDEX.md
INGEST_RULES.md
LINT_RULES.md
PAGE_TYPES.md
PRIVACY_RULES.md
MERGE_POLICY.md
STYLE_GUIDE.md
LOG.md
```

其中 `MERGE_POLICY.md` 和 `STYLE_GUIDE.md` 在当前运行时保持推荐文件，暂不加入 `pkwiki/0.1` 必需文件校验，避免已有 Vault 立即失效。

### 2.7 `.pkwiki/`

manifest、配置和运行状态目录。

当前文件：

```text
.pkwiki/config.json
.pkwiki/source_manifest.json
.pkwiki/chunk_manifest.json
.pkwiki/page_manifest.json
```

规划扩展：

```text
.pkwiki/runs/<run-id>/
```

Agent 不直接手写 manifest 或 Run Record，应通过确定性工具和 Harness 更新。

## 3. Config

`.pkwiki/config.json` 是 Vault root 标识。

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

`pkwiki` 从当前工作目录向上寻找 `.pkwiki/config.json`，找到后将该目录判定为 Vault root。

## 4. Source Manifest v0.2

`.pkwiki/source_manifest.json` 记录 Raw Source 的稳定身份、位置、完整性、处理进度和生命周期。

0006 目标 entry：

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

### 4.1 Processing Status

`processingStatus` 表示知识编译进度：

```text
registered
extracted
partially_merged
merged
```

- `registered`：已登记 Raw Source，尚未完成结构化提取。
- `extracted`：已产生可用 extraction，但尚未完成 Wiki merge。
- `partially_merged`：部分重要 Information Item 已处理，仍存在 deferred、needs confirmation 或未处理 item。
- `merged`：所有重要 Information Item 都有合法 coverage 决策，且需要写入的内容已完成审查。

Processing Status 不表达 Raw Source 文件是否仍存在。

### 4.2 Lifecycle Status

`lifecycleStatus` 表示 Source 的保留状态：

```text
active
archived
deleted
```

- `active`：参与默认 extraction、merge 和 query 流程。
- `archived`：保留记录和引用，但默认不参与新的处理流程。
- `deleted`：Raw Source 文件已缺失或被 Human Maintainer 删除，Source Manifest 和已有引用继续保留。

Lifecycle Status 与 Processing Status 独立。一份已完成 merge 的 Source 可以同时是 `processingStatus: merged` 和 `lifecycleStatus: deleted`。

### 4.3 向后兼容

现有 manifest 使用单字段：

```json
{
  "status": "registered"
}
```

读取旧 entry 时，运行时将其解释为：

```text
processingStatus = registered
lifecycleStatus = active
```

0006 新写入使用双状态字段。旧 `status` 字段在兼容期可读取，但不继续作为新数据的权威状态字段。

## 5. Raw Source 完整性

- `checksum` 使用 `sha256:...`。
- `sizeBytes` 记录 ingest 时文件大小。
- `mtime` 记录 ingest 时原输入文件修改时间，只作为来源 metadata，不用于证明内容相同。
- Raw 文件存在时，validate 比较 checksum 和 size。
- `lifecycleStatus !== deleted` 且 Raw 文件缺失时报告 warning。
- `lifecycleStatus === deleted` 且 Raw 文件仍存在时报告状态不一致 warning。

删除 Raw 文件不会删除 Source ID、Extracted Source、Wiki 引用或历史 Run Record。

## 6. Chunk Manifest

`.pkwiki/chunk_manifest.json` 记录确定性分块索引。每个 entry 包含 Chunk ID、Source ID、顺序、文件路径、原始行范围、字符数、chunk checksum、source checksum 和生成时间。

Chunk 文件位于：

```text
extracted/chunks/<source-id-file-name>/<index>.md
```

`pkwiki chunk` 目前支持 UTF-8 Markdown 和纯文本，优先按段落边界切分，并保证相同 Source checksum 与 maxChars 得到稳定 ID 和内容。

正式 Extraction Artifact 位于：

```text
extracted/data/<source-id-file-name>.json
```

它是 Information Item 和 evidence 的机器真相源；`extracted/sources/*.md` 是确定性生成的人类审查视图。

## 7. Page Manifest 与 Search Index

`.pkwiki/page_manifest.json` 和 `outputs/index.json` 由 `pkwiki index` 或 Search 命令重新生成。

- Page Manifest 记录页面 metadata 和 checksum。
- Search Index 聚合标题、摘要、链接、backlink 和反向 Source 引用。
- 二者用于定位候选页面，不承载长期知识事实。
- Agent 不直接编辑。
- `pkwiki list-pages`、`read-page`、`search` 和 `build-context` 提供受控读取入口。

## 8. Run Record

0008 已在 `.pkwiki/runs/<run-id>/` 建立 merge workflow 的最小审计记录；0009 已在同一目录加入 Context Pack。Agent Harness 阶段继续扩展工具调用、approval 和 feedback。

建议结构：

```text
run.json
context-pack.json
extraction.json
merge-plan.json
patch-plan.json
validation.json
diff.txt
review.json
feedback.json
```

Context planning 可以先生成只含 `context-pack.json` 的目录。`register-merge-plan` 在同一目录补充 `run.json` 和 `merge-plan.json` 并保留 Context Pack，finalize 后生成 `coverage.json`。Query 目前可以只保存 Context Pack；不同 workflow 只生成适用文件。Run Record 不保存 API key、access token 或其他 secret。

Merge Coverage 的机器真相源属于正式 extraction/merge artifact 和 Run Record；Extracted Source Markdown 提供人类可读视图，但不依赖自由文本解析推进 Source status。

## 9. 写入边界

| 区域 | Human Maintainer | Agent | 确定性工具或 Harness |
| --- | --- | --- | --- |
| `raw/` | 可提供或删除 | 默认只读 | `ingest` 可写 |
| `extracted/` | 可审查和修正 | 受 Harness 约束写 | extraction/finalize 流程写 |
| `wiki/` | 可写 | 通过 PatchPlan 写 | `apply-patch` 写 |
| `outputs/` | 可删除和审查 | 不手写 | `index`、report、publish 写 |
| `assets/` | 可写 | 需审查 | 后续 asset 工具写 |
| `system/` | 主要维护者 | 只能提出变更 | 后续 policy 工具写 |
| `.pkwiki/` | 谨慎编辑 | 不直接写 | manifest 和 Run 工具写 |

Merge、Search 和 Context Pack 均通过确定性工具写入 `.pkwiki/`。Agent 不能为完成流程而自由编辑 manifest、coverage 或 Run Artifact。

## 10. 版本管理

Git 是 Vault 的仓库级版本管理系统。

- PatchPlan 记录操作级修改意图。
- MergePlan 记录知识取舍。
- Run Record 记录一次 Agent 工作流。
- Git 记录仓库最终变化、commit、branch 和 rollback。

未来可以增加 inverse plan 和操作级 undo/redo，但不替代 Git。

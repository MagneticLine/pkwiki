# Vault Spec

`pkwiki` Vault 是完整的个人知识工作区。它不是纯 OKF Bundle，而是包含 Raw Source、Extracted Source、Wiki、生成产物、系统规则和机器状态的工作目录。

`wiki/` 是 OKF-compatible bundle；完整 Vault 是 `pkwiki/0.1` profile 自定义格式。

## 1. 目录结构

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

Raw Source 的存放区。

规则：

- Human Maintainer 提供的原始素材应进入 `raw/`。
- Agent 默认不能修改 `raw/` 中的文件内容。
- `pkwiki ingest` 可以复制文件进入 `raw/inbox/`。
- 原则上 Raw Source 不应删除；实际使用中如果文件被删除，Source Manifest 应把 source 标记为 `deleted`，而不是直接抹掉记录。

### 2.2 `extracted/`

Extracted Source 的存放区。

规则：

- Agent 可以写入和更新。
- 每个 Extracted Source 必须追溯到 Source ID。
- Extracted Source 记录归一化文本、事实、实体、事件、疑问、不确定性和合并状态。
- Extracted Source 是中间层，不是长期 Wiki。

### 2.3 `wiki/`

长期 Wiki 层，也是 OKF-compatible bundle。

规则：

- Wiki Page 必须是 Markdown。
- Wiki Page 必须包含 `pkwiki/0.1` profile frontmatter。
- Agent 不应自由改写 Wiki Page，应通过 PatchPlan 修改。
- Wiki Page 是长期知识事实的主要来源。

### 2.4 `outputs/`

生成产物目录。

规则：

- `outputs/index.json` 等文件可再生成。
- Agent 不应手写生成产物。
- 生成产物可以进入 Git，便于审查和静态站点/MCP 使用；是否提交由 Human Maintainer 决定。

### 2.5 `assets/`

图片、附件和媒体资源目录。

规则：

- 可被 Wiki Page 引用。
- 敏感资产必须遵守 `system/PRIVACY_RULES.md`。
- 后续可增加资产 manifest。

### 2.6 `system/`

Vault 内的人类规则和 Agent 操作规则。

规则：

- Human Maintainer 维护为主。
- Agent 可以提出修改，但必须通过审查。
- 这里放页面类型、摄入规则、隐私规则、风格规则和长期策略。

### 2.7 `.pkwiki/`

机器状态目录。

规则：

- Agent 不应直接修改 `.pkwiki/`。
- `.pkwiki/config.json` 用于识别 Vault root。
- manifest 文件应由 `pkwiki` CLI 读写。
- cache 和本地数据库可以被 `.gitignore` 排除。

## 3. Config

`.pkwiki/config.json` 是 Vault root 的标识。

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

`pkwiki` 命令从当前目录向上寻找 `.pkwiki/config.json`，找到后将该目录判定为 Vault root。

## 4. Source Manifest

`.pkwiki/source_manifest.json` 记录 Raw Source 的稳定索引。

当前 MVP 字段：

```json
{
  "src:2026-07-02-example": {
    "sourceId": "src:2026-07-02-example",
    "originalPath": "/absolute/input/example.md",
    "rawPath": "raw/inbox/2026-07-02-example.md",
    "extractedPath": "extracted/sources/src-2026-07-02-example.md",
    "type": "chat",
    "domain": "personal",
    "checksum": "sha256:...",
    "created": "2026-07-02T10:00:00+08:00",
    "status": "registered"
  }
}
```

后续应升级为：

```json
{
  "sourceId": "src:2026-07-02-example",
  "originalPath": "/absolute/input/example.md",
  "originalName": "example.md",
  "rawPath": "raw/inbox/2026-07-02-example.md",
  "extractedPath": "extracted/sources/src-2026-07-02-example.md",
  "type": "chat",
  "domain": "personal",
  "checksum": "sha256:...",
  "sizeBytes": 12345,
  "created": "2026-07-02T10:00:00+08:00",
  "ingestedAt": "2026-07-02T10:00:00+08:00",
  "mtime": "2026-07-02T09:59:00+08:00",
  "status": "registered",
  "privacy": "private",
  "language": "zh-CN"
}
```

## 5. Source Status

Source status 表示素材在 Vault 生命周期中的状态。

```text
registered
extracted
merged
archived
deleted
```

- `registered`：已登记，Raw Source 已复制到 `raw/`。
- `extracted`：已产生可用 Extracted Source。
- `merged`：重要内容已合并进 Wiki，并留下 coverage 记录。
- `archived`：保留历史记录，但不再参与默认 merge 流程。
- `deleted`：Raw Source 文件已缺失或被 Human Maintainer 删除，manifest 保留审计记录。

`deleted` 不代表删除 source 记录。它用于承认实际使用中会发生文件删除，同时保持 source_id、历史引用和审计线索稳定。

## 6. Page Manifest

`.pkwiki/page_manifest.json` 是 Wiki Page 的可再生成索引。

规则：

- 由 `pkwiki index` 生成。
- 不承载长期知识事实。
- checksum 过期时 validate 应提示 warning。
- Agent 不应直接编辑。

## 7. Search Index

`outputs/index.json` 是面向 Agent 查询和静态消费的搜索索引。

规则：

- 由 `pkwiki index` 生成。
- 用于定位候选页面、反向链接、source 引用和标题层级。
- 不替代 Wiki Page。

## 8. 写入边界

| 区域 | Human Maintainer | Agent | CLI |
| --- | --- | --- | --- |
| `raw/` | 可写 | 默认只读 | `ingest` 可写 |
| `extracted/` | 可写 | 可写 | 后续 extract/merge 可写 |
| `wiki/` | 可写 | 通过 PatchPlan 写 | `apply-patch` 可写 |
| `outputs/` | 可删除/审查 | 不手写 | `index` 可写 |
| `assets/` | 可写 | 需审查 | 后续 asset 命令可写 |
| `system/` | 可写 | 需审查 | 暂无专用命令 |
| `.pkwiki/` | 谨慎编辑 | 不直接写 | manifest/config 命令可写 |

## 9. 版本管理

Git 是 Vault 的仓库级版本管理系统。

`pkwiki` 不替代 Git。PatchPlan 记录操作级意图，Git 负责 diff、commit、branch、rollback 和远端协作。

未来可以增加 pkwiki 级 undo/redo，但必须建立在 PatchPlan 和 Source-to-Wiki Merge 记录稳定之后。

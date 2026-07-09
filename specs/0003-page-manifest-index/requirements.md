# 0003 Page Manifest 与 Index 生成需求

## 1. 背景

0001 已实现 Vault 初始化、状态读取和校验。0002 已实现 Raw Source 登记、Source Manifest、Extracted Source 模板和 ESLint 质量门禁。

下一步需要让 Agent 能稳定理解 Wiki 的页面结构。否则在 Source-to-Wiki Merge 之前，Agent 只能自由扫描目录和全文搜索，很难确定“这份素材应该影响哪些页面”。

本 spec 属于路线图阶段 2 的补完工作。Feature Spec 编号表示开发批次，不等同于路线图阶段编号；路线图阶段 3 仍然是 patch plan 协议和 `pkwiki apply-patch`。

0003 先不做 LLM 合并，也不生成 PatchPlan。它只做确定性索引：

- 扫描 `wiki/` 下的 Wiki Page。
- 解析每个页面的 frontmatter、正文标题、Markdown links 和 source 引用。
- 写入 `.pkwiki/page_manifest.json`。
- 写入 `outputs/index.json`。
- 提供 `pkwiki index` 命令。
- 让 `pkwiki validate` 能发现 page manifest / index 明显过期。

## 2. 目标

### 2.1 产品目标

- Agent 可以通过机器可读文件快速知道 Vault 中有哪些 Wiki Page。
- Agent 可以按 `id`、`type`、`domain`、`tags`、`sources` 和链接关系缩小候选页面范围。
- Human Maintainer 可以运行一个确定性命令刷新索引。
- 后续 PatchPlan 和 Source-to-Wiki Merge 可以依赖 page manifest，而不是临时自由扫描。

### 2.2 工程目标

- 在 `@pkwiki/indexer` 中实现 Wiki Page 扫描与索引生成。
- 在 CLI 中增加 `pkwiki index [path] [--json]`。
- 在 Validator 中增加 page manifest / index 的基础一致性检查。
- 保持 `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

## 3. 用户故事

### 3.1 Human Maintainer 刷新索引

作为 Human Maintainer，我希望执行：

```bash
pkwiki index
```

刷新当前 Vault 的 page manifest 和 index。

验收：

- `.pkwiki/page_manifest.json` 被写入。
- `outputs/index.json` 被写入。
- 命令输出 page 数、link 数和 source reference 数。
- `pkwiki validate` 通过。

### 3.2 Agent 查询 Wiki 页面结构

作为 Agent，我希望执行：

```bash
pkwiki index --json
```

获得机器可解析结果，并读取 `outputs/index.json` 来定位候选 Wiki Page。

验收：

- JSON 输出包含 `pageCount`、`linkCount`、`sourceReferenceCount`。
- `outputs/index.json` 包含每个页面的 `id`、`path`、`title`、`type`、`domain`、`tags`、`sources`、`links`。
- 页面 `id` 与 path 的映射稳定。

### 3.3 校验索引是否过期

作为维护者，我希望当 Wiki Page 变化但索引未刷新时，`pkwiki validate` 能提示我。

验收：

- page manifest 缺失已存在页面时报 warning。
- page manifest 包含不存在页面时报 warning。
- page manifest 中的 checksum 与页面当前内容不一致时报 warning。
- 这些 warning 不阻塞 validate，因为 Human Maintainer 可以重新运行 `pkwiki index` 修复。

## 4. 功能范围

### 4.1 `pkwiki index [path]`

命令：

```bash
pkwiki index [path] [--json]
```

要求：

- 从传入路径或当前工作目录向上寻找 Vault root。
- 扫描 `wiki/` 下所有 Markdown 文件。
- 跳过 OKF 保留文件 `index.md` 和 `log.md`。
- 解析 YAML frontmatter。
- 提取 Markdown links。
- 计算页面 checksum。
- 写入 `.pkwiki/page_manifest.json`。
- 写入 `outputs/index.json`。
- 支持 human-readable 和 `--json` 输出。

暂不要求：

- 全文搜索数据库。
- 向量索引。
- 增量索引。
- 反向链接可视化。
- 模糊匹配或 ranking。
- LLM 语义定位。

### 4.2 Page Manifest

第一版 manifest 结构：

```json
{
  "career/meituan-internship": {
    "id": "career/meituan-internship",
    "path": "wiki/career/meituan-internship.md",
    "title": "美团实习",
    "type": "Project",
    "domain": "career",
    "status": "active",
    "privacy": "private",
    "sources": ["src:example"],
    "tags": ["career"],
    "checksum": "sha256:...",
    "updated": "2026-06-30",
    "indexedAt": "2026-07-01T12:00:00+08:00"
  }
}
```

要求：

- 以 Wiki Page 的 `id` 为 key。
- `path` 使用 Vault 相对路径。
- `sources` 和 `tags` 必须是数组；缺失时由 validate 报 Wiki Page frontmatter error。
- manifest 写入时稳定排序，减少 diff 噪音。

### 4.3 Search Index

第一版 index 路径：

```text
outputs/index.json
```

结构：

```json
{
  "generatedAt": "2026-07-01T12:00:00+08:00",
  "pages": [
    {
      "id": "career/meituan-internship",
      "path": "wiki/career/meituan-internship.md",
      "title": "美团实习",
      "type": "Project",
      "domain": "career",
      "description": "关于美团实习准备、入职适应和阶段复盘的长期页面。",
      "status": "active",
      "privacy": "private",
      "sources": ["src:example"],
      "tags": ["career"],
      "links": ["wiki/career/resume.md"],
      "headings": ["阶段复盘", "待确认问题"]
    }
  ],
  "byType": {
    "Project": ["career/meituan-internship"]
  },
  "byDomain": {
    "career": ["career/meituan-internship"]
  },
  "bySource": {
    "src:example": ["career/meituan-internship"]
  },
  "backlinks": {
    "wiki/career/resume.md": ["career/meituan-internship"]
  }
}
```

要求：

- `pages` 保留完整页面摘要。
- `byType`、`byDomain`、`bySource` 支持 Agent 快速缩小候选页面。
- `backlinks` 支持后续级联修改检查。
- 第一版只索引 Markdown link，不索引 Obsidian wikilink。

## 5. 非目标

本 spec 不做：

- Source-to-Wiki Merge。
- PatchPlan 生成或应用。
- Agent Runtime 接入。
- MCP server。
- Web UI。
- 向量索引。
- SQLite / 搜索服务。
- Wiki Health 自维护。

## 6. 输出要求

### 6.1 Human-readable 输出

示例：

```text
Vault: /path/to/vault
Pages indexed: 12
Links indexed: 34
Source references: 8
Page manifest: .pkwiki/page_manifest.json
Search index: outputs/index.json
```

### 6.2 JSON 输出

示例：

```json
{
  "ok": true,
  "vaultRoot": "/path/to/vault",
  "pageCount": 12,
  "linkCount": 34,
  "sourceReferenceCount": 8,
  "pageManifestPath": ".pkwiki/page_manifest.json",
  "indexPath": "outputs/index.json"
}
```

## 7. 退出码

- `0`：命令成功。
- `1`：索引过程中发现 Wiki Page 结构错误，无法安全生成索引。
- `2`：参数错误、非 Vault、文件无法读取、JSON 无法写入等运行错误。

## 8. 验收标准

- `pkwiki index` 可用。
- `pkwiki index --json` 输出稳定 JSON。
- `.pkwiki/page_manifest.json` 正确生成。
- `outputs/index.json` 正确生成。
- 页面新增、删除、修改后，`pkwiki validate` 能给出索引过期 warning。
- `pkwiki validate` 对刷新后的索引不报 index 相关 warning。
- `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

# 0003 Page Manifest 与 Index 生成设计

## 1. 设计原则

- Index 是确定性产物，不包含 LLM 推理。
- Wiki Page 仍然是事实来源，manifest 和 index 都可以重新生成。
- Page Manifest 服务一致性校验和 diff 审查。
- Search Index 服务 Agent 定位和后续 Source-to-Wiki Merge。
- 第一版使用 JSON 文件，避免过早引入数据库。

## 2. 模块分工

```text
packages/indexer
  扫描 Wiki Page、解析 frontmatter、提取 links/headings、生成 manifest 和 index。

packages/core
  复用 Vault root、checksum、路径和 manifest 读写能力；必要时补通用 JSON 读写工具。

packages/cli
  增加 pkwiki index 命令、参数解析和输出格式。

packages/validator
  检查 page manifest / index 是否可解析、是否缺页、是否多页、checksum 是否过期。
```

## 3. 数据流

```text
wiki/**/*.md
  -> parse frontmatter
  -> extract links/headings
  -> compute checksum
  -> .pkwiki/page_manifest.json
  -> outputs/index.json
```

## 4. Wiki Page 扫描

扫描范围：

```text
wiki/**/*.md
```

跳过：

- `wiki/index.md`
- `wiki/log.md`
- `.gitkeep`
- 非 Markdown 文件

排序：

- 按 Vault 相对路径字典序排序。
- 输出 JSON 使用稳定 key 顺序，减少 diff 噪音。

## 5. Frontmatter 解析

复用 `@pkwiki/validator` 中已有的 frontmatter 解析思路，或下沉到 `@pkwiki/core` 形成共享函数。

第一版读取字段：

- `id`
- `title`
- `type`
- `description`
- `domain`
- `status`
- `privacy`
- `sources`
- `tags`
- `updated`

约束：

- 如果 frontmatter 无法解析，`pkwiki index` 返回失败，不写入新索引。
- 如果缺必需字段，`pkwiki index` 返回失败，不写入新索引。
- 如果 `id` 重复，`pkwiki index` 返回失败，不写入新索引。

## 6. Page Manifest

路径：

```text
.pkwiki/page_manifest.json
```

用途：

- 记录每个 Wiki Page 的稳定元数据。
- 支持 validate 识别新增、删除、修改但未刷新索引的页面。
- 支持后续 PatchPlan 校验目标页面是否存在、是否基于最新版本。

字段：

```ts
type PageManifestEntry = {
  id: string;
  path: string;
  title: string;
  type: string;
  domain: string;
  status: string;
  privacy: string;
  sources: string[];
  tags: string[];
  checksum: string;
  updated: string;
  indexedAt: string;
};
```

checksum：

- 使用 `sha256:<hex>`。
- 基于整个 Markdown 文件内容计算。
- validate 使用 checksum 判断索引是否过期。

## 7. Search Index

路径：

```text
outputs/index.json
```

用途：

- 给 Agent 提供低成本页面发现入口。
- 给后续 Source-to-Wiki Merge 提供候选页定位依据。
- 给后续 Wiki Health 提供链接图基础。

字段：

```ts
type SearchIndex = {
  generatedAt: string;
  pages: SearchIndexPage[];
  byType: Record<string, string[]>;
  byDomain: Record<string, string[]>;
  bySource: Record<string, string[]>;
  backlinks: Record<string, string[]>;
};
```

`SearchIndexPage`：

```ts
type SearchIndexPage = {
  id: string;
  path: string;
  title: string;
  type: string;
  domain: string;
  description: string;
  status: string;
  privacy: string;
  sources: string[];
  tags: string[];
  links: string[];
  headings: string[];
};
```

## 8. Markdown Links

提取规则：

- 只提取标准 Markdown links。
- 跳过图片链接。
- 跳过 `http://`、`https://`、`mailto:`。
- 对相对 Markdown link 解析为 Vault 相对路径。
- 保留无法解析的目标字符串，validate 仍负责断链 warning。

第一版不支持：

- Obsidian wikilink。
- 引用式链接。
- HTML `<a>`。

## 9. Headings

提取规则：

- 提取正文中的 ATX headings：`#` 到 `######`。
- 去掉 Markdown 标记，只保留标题文本。
- 不把 frontmatter 内容视为 heading。

用途：

- 让 Agent 能快速判断页面内部结构。
- 为后续 section-level patch 做准备。

## 10. `pkwiki index` 命令

命令：

```bash
pkwiki index [path] [--json]
```

执行流程：

1. 探测 Vault root。
2. 扫描 Wiki Page。
3. 解析 frontmatter。
4. 提取 links/headings。
5. 计算 checksum。
6. 构建 Page Manifest。
7. 构建 Search Index。
8. 写入 `.pkwiki/page_manifest.json`。
9. 写入 `outputs/index.json`。
10. 输出统计结果。

## 11. Validator 增强

新增检查：

- `.pkwiki/page_manifest.json` 必须是 JSON 对象。
- `outputs/index.json` 如果存在，必须是 JSON 对象。
- manifest 中每条记录必须包含 `id`、`path`、`title`、`type`、`domain`、`checksum`。
- Wiki Page 存在但 manifest 缺失，报 warning：`PAGE_MANIFEST_MISSING_PAGE`。
- Manifest 记录指向不存在的页面，报 warning：`PAGE_MANIFEST_STALE_PAGE`。
- Manifest checksum 与当前页面内容不一致，报 warning：`PAGE_MANIFEST_STALE_CHECKSUM`。
- Index 缺失但 Wiki Page 非空，报 warning：`SEARCH_INDEX_MISSING`。

这些检查第一版都作为 warning，不阻塞 validate。

## 12. 测试设计

新增测试：

- `@pkwiki/indexer` 能从 Wiki Page 生成 manifest。
- `@pkwiki/indexer` 能生成 byType/byDomain/bySource/backlinks。
- `pkwiki index --json` 能输出稳定结果。
- 重复运行 `pkwiki index` 输出稳定。
- 删除 Wiki Page 后 validate 报 stale page warning。
- 修改 Wiki Page 后 validate 报 stale checksum warning。

验证命令：

```bash
pnpm build
pnpm test
pnpm lint
```

Dogfood：

- 在临时 Vault 中创建 2-3 个带链接和 source 引用的 Wiki Page。
- 执行 `pkwiki index`。
- 执行 `pkwiki validate`。
- 在 `my-pkm-vault` 中刷新一次 index，但不引入敏感新内容。

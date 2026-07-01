# 0003 Page Manifest 与 Index 生成任务计划

## 1. Spec 和文档

- [x] 创建 `0003-page-manifest-index` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 2 状态。
- [x] 更新 CONTEXT.md 中的 Page Manifest 和 Search Index 术语。

## 2. Indexer 核心能力

- [x] 定义 Page Manifest 类型。
- [x] 定义 Search Index 类型。
- [x] 实现 Wiki Page 扫描。
- [x] 实现 frontmatter 解析复用或下沉。
- [x] 实现 Markdown links 提取。
- [x] 实现 headings 提取。
- [x] 实现页面 checksum。
- [x] 实现 Page Manifest 生成。
- [x] 实现 Search Index 生成。
- [x] 实现稳定排序输出。
- [x] 为 indexer 补单元测试。

## 3. CLI index

- [x] 在 CLI 中增加 `pkwiki index [path] [--json]`。
- [x] 支持从当前目录向上寻找 Vault root。
- [x] 支持显式 path。
- [x] 支持 human-readable 输出。
- [x] 支持 JSON 输出。
- [x] 处理 frontmatter 错误。
- [x] 处理重复 page id 错误。
- [x] 为 index 命令补集成测试。

## 4. Validator 增强

- [x] 校验 page manifest 是 JSON 对象。
- [x] 校验 page manifest 记录必需字段。
- [x] 检查 manifest 缺少已存在页面。
- [x] 检查 manifest 指向不存在页面。
- [x] 检查 manifest checksum 是否过期。
- [x] 检查 search index 是否缺失。
- [x] 缺失或过期索引报 warning，不阻塞。
- [x] 为 validate 索引检查补测试。

## 5. 文档联动

- [x] 更新 README 当前已实现命令。
- [x] 更新 AGENTS.md 开发命令示例。
- [x] 必要时更新 WIKI_SCHEMA.md，说明 page manifest 和 index 的关系。

## 6. Dogfood

- [x] 准备低敏测试 Wiki Page。
- [x] 对临时 Vault 执行 `pkwiki index`。
- [x] 对临时 Vault 执行 `pkwiki validate`。
- [x] 对 `my-pkm-vault` 执行一次 index 刷新。
- [x] 确认 page manifest、outputs index 和 validate warning 符合预期。
- [x] 记录发现的问题。

## 7. 验收

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm lint` 通过。
- [x] `pkwiki index` 可用。
- [x] `pkwiki index --json` 可用。
- [x] `.pkwiki/page_manifest.json` 正确生成。
- [x] `outputs/index.json` 正确生成。
- [x] `pkwiki validate` 能检查过期 page manifest / index。

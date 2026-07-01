# AGENTS.md

## 项目

这个仓库实现 `pkwiki`，用于维护 OKF 兼容的个人 Markdown Wiki，并尽量把校验、索引、Patch、Git 操作做成确定性工具。

## 硬性规则

- 不要把个人数据放进这个仓库。
- `templates/default-vault` 是默认 starter vault 的标准结构。
- 编辑 Markdown 模板时必须保留 YAML frontmatter。
- 校验、索引、Patch、Git 操作优先写成确定性代码。
- Agent 应输出结构化 patch plan，而不是随意重写整篇 Wiki 页面。
- 当前用户场景下，commit message、文档和注释使用中文。

## 命令

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
node packages/cli/dist/index.js init <vault>
node packages/cli/dist/index.js status <vault> --json
node packages/cli/dist/index.js validate <vault> --json
node packages/cli/dist/index.js ingest <file> --type <type> --domain <domain> --json
node packages/cli/dist/index.js index <vault> --json
```

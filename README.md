# pkwiki

`pkwiki` 是一个面向 LLM Agent 的文件优先个人知识编译工具。

它用于创建和维护私密 Markdown Wiki，让人、Agent、Obsidian、静态站点生成器以及后续 MCP 客户端都能读取。Wiki 格式兼容 OKF，并额外定义更严格的 `pkwiki` 个人知识管理 profile。

## 文档地图

建议按这个顺序阅读：

1. [产品定义](docs/PRODUCT.md)：说明 `pkwiki` 是什么、第一用户是谁、最终产物是什么、长期质量目标是什么。
2. [术语表](CONTEXT.md)：统一产品语言，避免 CLI、Agent、Vault、Wiki、Source 等概念混用。
3. [架构](docs/ARCHITECTURE.md)：说明内容层、确定性工具层和 Agent 层的关系。
4. [Vault Spec](docs/VAULT_SPEC.md)：说明完整 Vault 目录、manifest 和读写边界。
5. [Wiki Schema](docs/WIKI_SCHEMA.md)：说明 Wiki Page 的 frontmatter 和链接约定。
6. [Extracted Source Schema](docs/EXTRACTED_SOURCE_SCHEMA.md)：说明 Raw Source 到 Wiki 之间的中间层结构。
7. [Source-to-Wiki Merge](docs/SOURCE_TO_WIKI_MERGE.md)：说明 Agent 如何规划、覆盖和审查素材合并。
8. [Page Types And Style](docs/PAGE_TYPES_AND_STYLE.md)：说明个人 Wiki 的页面类型、风格和信息粒度。
9. [Agent Harness](docs/AGENT_HARNESS.md)：说明 Agent 如何通过受控工具维护 Vault。
10. [Ingest Pipeline](docs/INGEST_PIPELINE.md)：说明从 Raw Source 到 Wiki 的编译式摄入流程。
11. [PatchPlan](docs/PATCH_PLAN.md)：说明受控修改协议和 `apply-patch` 的边界。
12. [Git Diff Review](docs/GIT_DIFF_REVIEW.md)：说明 `apply-patch` 后如何审查 Git worktree 变更。
13. [路线图](docs/ROADMAP.md)：说明阶段性开发方向。

功能级 spec 放在 `specs/` 目录下。每个独立开发过程或模块都有自己的 Feature Spec：

Feature Spec 编号表示开发批次，不等同于路线图阶段编号。一个路线图阶段可以拆成多个 Feature Spec。

```text
specs/
  0001-cli-mvp/
    requirements.md
    design.md
    tasks.md
  0002-source-ingest-quality-gate/
    requirements.md
    design.md
    tasks.md
  0003-page-manifest-index/
    requirements.md
    design.md
    tasks.md
  0004-patch-plan-apply/
    requirements.md
    design.md
    tasks.md
  0005-git-diff-review/
    requirements.md
    design.md
    tasks.md
  0006-vault-source-contract/
    requirements.md
    design.md
    tasks.md
```

## 范围

这个仓库只放可复用代码和模板：

- vault 初始化模板
- schema 校验
- index 生成
- source/page manifest
- patch plan 应用
- git diff 和 commit 辅助
- 后续 agent、MCP、Web UI 集成

个人数据应放在独立的私密 vault 仓库里。

## 计划模块

- `packages/core`：workspace、路径、配置、source id、manifest 逻辑
- `packages/cli`：`pkwiki` 命令行入口
- `packages/validator`：OKF 与 pkwiki profile 校验
- `packages/indexer`：搜索和索引生成
- `packages/patch`：PatchPlan 解析和受控修改应用
- `packages/git`：git status、diff、commit 辅助
- `packages/agent`：agent harness 集成
- `packages/mcp`：MCP server 集成
- `packages/web`：本地 Web UI

## 当前已实现命令

```bash
pkwiki init <vault>
pkwiki status
pkwiki validate
pkwiki ingest <file> --type <type> --domain <domain>
pkwiki index
pkwiki apply-patch <plan>
pkwiki diff
```

这些命令支持 Agent 使用的 `--json` 输出：

```bash
pkwiki status --json
pkwiki validate --json
pkwiki ingest <file> --type <type> --domain <domain> --json
pkwiki index --json
pkwiki apply-patch <plan> --dry-run --json
pkwiki diff --json
```

后续规划命令包括 `commit`、`mcp` 和 `serve`。

## 开发命令

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

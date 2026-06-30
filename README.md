# pkwiki

`pkwiki` 是一个面向 LLM Agent 的文件优先个人知识编译工具。

它用于创建和维护私密 Markdown Wiki，让人、Agent、Obsidian、静态站点生成器以及后续 MCP 客户端都能读取。Wiki 格式兼容 OKF，并额外定义更严格的 `pkwiki` 个人知识管理 profile。

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
- `packages/git`：git status、diff、commit 辅助
- `packages/agent`：agent harness 集成
- `packages/mcp`：MCP server 集成
- `packages/web`：本地 Web UI

## 初始命令规划

```bash
pkwiki init <vault>
pkwiki status
pkwiki validate
pkwiki index
pkwiki diff
pkwiki commit -m "message"
```

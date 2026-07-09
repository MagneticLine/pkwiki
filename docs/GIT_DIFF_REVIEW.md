# Git Diff Review

Git Diff Review 是 `apply-patch` 之后的只读变更审查入口。

`pkwiki` 不替代 Git，也不自动提交。`pkwiki diff` 只把 Git worktree 的状态整理成面向 Vault 的摘要，让 Human Maintainer 和 Agent 都能看清楚当前改动范围。

## 命令

```bash
pkwiki diff [path] [--name-only] [--json]
```

## 输出内容

- Vault root。
- worktree 是否 clean。
- 变更文件列表。
- 文件状态：added、modified、deleted、renamed、copied、untracked、unknown。
- Vault 区域分类：wiki、raw、extracted、manifest、outputs、assets、system、other。
- diff stat 摘要。

JSON 输出默认不包含完整 patch 文本，避免把过多私密内容展开到 Agent 上下文。

## 推荐流程

```bash
pkwiki apply-patch ./outputs/patch-plans/example.json
pkwiki diff
pkwiki validate
```

Human Maintainer 审查通过后，再自行决定是否执行 Git commit 和 push。

# 0005 Git Diff 变更审查任务计划

## 1. Spec 和文档

- [x] 创建 `0005-git-diff-review` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 3 状态。
- [x] 更新 CONTEXT.md 中的 Git Diff Review 和 `pkwiki diff` 术语。

## 2. Git diff 基础能力

- [x] 在 `packages/git` 中定义 diff summary 类型。
- [x] 实现 Git worktree 检测错误码。
- [x] 实现 `git status --porcelain=v1` 解析。
- [x] 实现 rename path 解析。
- [x] 实现 `git diff --numstat` 解析。
- [x] 合并 staged 和 unstaged numstat。
- [x] 实现 Vault area 分类。
- [x] 为解析逻辑补单元测试。

## 3. 路径过滤

- [x] 实现 `[path]` 相对 Vault root 解析。
- [x] 拒绝绝对路径。
- [x] 拒绝 `.`、空 segment 和 `..`。
- [x] 确保传给 Git 的路径不会越过 Vault root。
- [x] 覆盖删除文件路径仍可审查的场景。

## 4. CLI diff

- [x] 增加 `pkwiki diff [path] [--json] [--name-only]`。
- [x] 支持 human-readable 输出。
- [x] 支持 JSON 输出。
- [x] 支持 name-only 输出。
- [x] 支持 clean worktree 输出。
- [x] 支持非 Git Vault 错误输出。
- [x] 支持业务错误返回退出码 1。
- [x] 支持参数错误返回退出码 2。
- [x] 为 CLI 补集成测试。

## 5. 文档联动

- [x] 更新 README 当前已实现命令。
- [x] 更新 AGENTS.md 或 Agent Harness 命令示例。
- [x] 必要时新增 docs/GIT_DIFF_REVIEW.md。
- [x] 检查 ROADMAP 阶段 3 状态。

## 6. Dogfood

- [x] 在临时 Vault 中制造 clean、modified、untracked、deleted 变更。
- [x] 执行 `pkwiki diff`。
- [x] 执行 `pkwiki diff --json`。
- [x] 执行 `pkwiki diff --name-only`。
- [x] 执行 path filter。
- [x] 在 `my-pkm-vault` 中用低敏变更 dogfood。
- [x] 确认输出能辅助 Human Maintainer 审查 apply-patch 后的改动。

## 7. 验收

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm lint` 通过。
- [x] `pkwiki diff` 可用。
- [x] `pkwiki diff --json` 可用。
- [x] `pkwiki diff --name-only` 可用。
- [x] path filter 可用。
- [x] unsafe path 被拒绝。
- [x] 未初始化 Git 时错误清晰。

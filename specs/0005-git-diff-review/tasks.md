# 0005 Git Diff 变更审查任务计划

## 1. Spec 和文档

- [x] 创建 `0005-git-diff-review` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 3 状态。
- [x] 更新 CONTEXT.md 中的 Git Diff Review 和 `pkwiki diff` 术语。

## 2. Git diff 基础能力

- [ ] 在 `packages/git` 中定义 diff summary 类型。
- [ ] 实现 Git worktree 检测错误码。
- [ ] 实现 `git status --porcelain=v1` 解析。
- [ ] 实现 rename path 解析。
- [ ] 实现 `git diff --numstat` 解析。
- [ ] 合并 staged 和 unstaged numstat。
- [ ] 实现 Vault area 分类。
- [ ] 为解析逻辑补单元测试。

## 3. 路径过滤

- [ ] 实现 `[path]` 相对 Vault root 解析。
- [ ] 拒绝绝对路径。
- [ ] 拒绝 `.`、空 segment 和 `..`。
- [ ] 确保传给 Git 的路径不会越过 Vault root。
- [ ] 覆盖删除文件路径仍可审查的场景。

## 4. CLI diff

- [ ] 增加 `pkwiki diff [path] [--json] [--name-only]`。
- [ ] 支持 human-readable 输出。
- [ ] 支持 JSON 输出。
- [ ] 支持 name-only 输出。
- [ ] 支持 clean worktree 输出。
- [ ] 支持非 Git Vault 错误输出。
- [ ] 支持业务错误返回退出码 1。
- [ ] 支持参数错误返回退出码 2。
- [ ] 为 CLI 补集成测试。

## 5. 文档联动

- [ ] 更新 README 当前已实现命令。
- [ ] 更新 AGENTS.md 或 Agent Harness 命令示例。
- [ ] 必要时新增 docs/GIT_DIFF_REVIEW.md。
- [ ] 检查 ROADMAP 阶段 3 状态。

## 6. Dogfood

- [ ] 在临时 Vault 中制造 clean、modified、untracked、deleted 变更。
- [ ] 执行 `pkwiki diff`。
- [ ] 执行 `pkwiki diff --json`。
- [ ] 执行 `pkwiki diff --name-only`。
- [ ] 执行 path filter。
- [ ] 在 `my-pkm-vault` 中用低敏变更 dogfood。
- [ ] 确认输出能辅助 Human Maintainer 审查 apply-patch 后的改动。

## 7. 验收

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pkwiki diff` 可用。
- [ ] `pkwiki diff --json` 可用。
- [ ] `pkwiki diff --name-only` 可用。
- [ ] path filter 可用。
- [ ] unsafe path 被拒绝。
- [ ] 未初始化 Git 时错误清晰。

# 0004 PatchPlan 与 apply-patch 任务计划

## 1. Spec 和文档

- [x] 创建 `0004-patch-plan-apply` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 3 状态。
- [x] 更新 CONTEXT.md 中的 PatchPlan 和 apply-patch 术语。

## 2. PatchPlan Schema

- [x] 定义 PatchPlan v0 类型。
- [x] 定义 Operation 类型。
- [x] 实现 PatchPlan JSON 解析。
- [x] 校验必需字段。
- [x] 校验版本号。
- [x] 校验 operation 类型。
- [x] 为 schema 校验补测试。

## 3. 安全路径与 checksum

- [x] 实现 Vault 内相对路径校验。
- [x] 拒绝绝对路径。
- [x] 拒绝 `..` 越权路径。
- [x] 拒绝修改 `raw/`。
- [x] 拒绝修改 `.pkwiki/`。
- [x] 拒绝修改 `outputs/`。
- [x] 拒绝非 Markdown 文件。
- [x] 实现 `expectedChecksum` 检查。
- [x] 为路径和 checksum 补测试。

## 4. Operation 应用

- [x] 实现 `create_markdown_page`。
- [x] 实现 `replace_text`。
- [x] 实现 `append_to_section`。
- [x] 实现 `replace_section`。
- [x] 实现唯一命中检查。
- [x] 实现内存应用、失败不写入。
- [x] 实现 dry-run 不写入。
- [x] 为每类 operation 补测试。

## 5. CLI apply-patch

- [x] 增加 `pkwiki apply-patch <plan> [--dry-run] [--json]`。
- [x] 支持 human-readable 输出。
- [x] 支持 JSON 输出。
- [x] 成功 apply 后运行 validate。
- [x] validate error 时返回退出码 1。
- [x] 业务规则阻塞返回退出码 1。
- [x] 参数或运行错误返回退出码 2。
- [x] 为 CLI 补集成测试。

## 6. 文档联动

- [x] 更新 README 当前已实现命令。
- [x] 更新 AGENTS.md 命令示例。
- [x] 更新 Agent Harness 文档，说明 PatchPlan v0 流程。
- [x] 必要时新增 docs/PATCH_PLAN.md。

## 7. Dogfood

- [x] 准备低敏临时 Wiki Page。
- [x] 准备 PatchPlan v0。
- [x] 执行 `pkwiki apply-patch --dry-run`。
- [x] 执行 `pkwiki apply-patch`。
- [x] 执行 `pkwiki validate`。
- [x] 确认 changed files、validate 输出和 Git diff 符合预期。

## 8. 验收

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm lint` 通过。
- [x] `pkwiki apply-patch` 可用。
- [x] `pkwiki apply-patch --dry-run` 不写文件。
- [x] `pkwiki apply-patch --json` 可用。
- [x] unsafe path 被拒绝。
- [x] checksum mismatch 被拒绝。
- [x] apply 后自动 validate。

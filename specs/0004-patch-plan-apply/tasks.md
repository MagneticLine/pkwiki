# 0004 PatchPlan 与 apply-patch 任务计划

## 1. Spec 和文档

- [x] 创建 `0004-patch-plan-apply` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 3 状态。
- [x] 更新 CONTEXT.md 中的 PatchPlan 和 apply-patch 术语。

## 2. PatchPlan Schema

- [ ] 定义 PatchPlan v0 类型。
- [ ] 定义 Operation 类型。
- [ ] 实现 PatchPlan JSON 解析。
- [ ] 校验必需字段。
- [ ] 校验版本号。
- [ ] 校验 operation 类型。
- [ ] 为 schema 校验补测试。

## 3. 安全路径与 checksum

- [ ] 实现 Vault 内相对路径校验。
- [ ] 拒绝绝对路径。
- [ ] 拒绝 `..` 越权路径。
- [ ] 拒绝修改 `raw/`。
- [ ] 拒绝修改 `.pkwiki/`。
- [ ] 拒绝修改 `outputs/`。
- [ ] 拒绝非 Markdown 文件。
- [ ] 实现 `expectedChecksum` 检查。
- [ ] 为路径和 checksum 补测试。

## 4. Operation 应用

- [ ] 实现 `create_markdown_page`。
- [ ] 实现 `replace_text`。
- [ ] 实现 `append_to_section`。
- [ ] 实现 `replace_section`。
- [ ] 实现唯一命中检查。
- [ ] 实现内存应用、失败不写入。
- [ ] 实现 dry-run 不写入。
- [ ] 为每类 operation 补测试。

## 5. CLI apply-patch

- [ ] 增加 `pkwiki apply-patch <plan> [--dry-run] [--json]`。
- [ ] 支持 human-readable 输出。
- [ ] 支持 JSON 输出。
- [ ] 成功 apply 后运行 validate。
- [ ] validate error 时返回退出码 1。
- [ ] 业务规则阻塞返回退出码 1。
- [ ] 参数或运行错误返回退出码 2。
- [ ] 为 CLI 补集成测试。

## 6. 文档联动

- [ ] 更新 README 当前已实现命令。
- [ ] 更新 AGENTS.md 命令示例。
- [ ] 更新 Agent Harness 文档，说明 PatchPlan v0 流程。
- [ ] 必要时新增 docs/PATCH_PLAN.md。

## 7. Dogfood

- [ ] 准备低敏临时 Wiki Page。
- [ ] 准备 PatchPlan v0。
- [ ] 执行 `pkwiki apply-patch --dry-run`。
- [ ] 执行 `pkwiki apply-patch`。
- [ ] 执行 `pkwiki validate`。
- [ ] 确认 changed files、validate 输出和 Git diff 符合预期。

## 8. 验收

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pkwiki apply-patch` 可用。
- [ ] `pkwiki apply-patch --dry-run` 不写文件。
- [ ] `pkwiki apply-patch --json` 可用。
- [ ] unsafe path 被拒绝。
- [ ] checksum mismatch 被拒绝。
- [ ] apply 后自动 validate。

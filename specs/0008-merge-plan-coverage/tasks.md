# 0008 MergePlan 与 Coverage Contract 任务

## 1. Spec

- [x] 定义 MergePlan v0.1。
- [x] 定义 Coverage Artifact v0.1。
- [x] 定义 Source status 推进规则。
- [x] 定义 Run 最小记录。

## 2. Merge Package

- [x] 创建 `packages/merge`。
- [x] 实现 MergePlan parser。
- [x] 实现全量 coverage 校验。
- [x] 实现 Candidate Target 校验。
- [x] 实现 Run 登记。
- [x] 实现 finalize target/source 检查。
- [x] 实现 Coverage Artifact。
- [x] 实现 Extracted Source coverage section 更新。
- [x] 实现 Source status 推进。

## 3. CLI

- [x] 实现 `register-merge-plan`。
- [x] 实现 `finalize-merge`。
- [x] 增加 JSON 和人类可读输出。

## 4. Validator

- [x] 校验 Run Record。
- [x] 校验 completed Run coverage。
- [x] 校验 Run Artifact 引用。

## 5. 测试

- [x] Parser 正反例。
- [x] Coverage 缺失、重复和额外 Item。
- [x] Target 缺失和 Source 引用缺失。
- [x] merged 与 partially_merged 状态。
- [x] CLI 和 Validator 回归。

## 6. Dogfood

- [x] 为两份 mock extraction 登记 MergePlan。
- [x] 通过 PatchPlan 创建或更新低敏 Wiki Page。
- [x] finalize 并检查 coverage/status/run。
- [x] 制造 target Source 引用缺失。
- [x] 检查 diff 范围。

## 7. 验收

- [x] build、test、lint 通过。
- [x] `git diff --check` 通过。
- [x] 文档与实际输出一致。

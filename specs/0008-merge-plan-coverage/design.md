# 0008 MergePlan 与 Coverage Contract 设计

## 1. 包结构

新增 `packages/merge`，负责 MergePlan、Coverage 和 finalize。该包依赖 `core` 与 `indexer`，不调用 LLM，也不依赖 Agent Runtime。

CLI 只做参数解析和结果输出。Validator 复用 `packages/merge` parser 检查已登记 Run Artifact。

## 2. Run 目录

```text
.pkwiki/runs/run-2026-07-28-example/
  run.json
  merge-plan.json
  coverage.json
```

Run ID 保留冒号形式，目录名将 `:` 替换为 `-`。

## 3. 登记流程

1. Parse MergePlan。
2. 读取 Source Manifest 和 Extraction Artifact。
3. 建立 `(sourceId, itemId)` 全量集合。
4. 校验 coverage 与全量集合严格相等。
5. 校验 Candidate Target 和 decision。
6. 写入 merge-plan.json 和 awaiting_apply run.json。

全部校验通过前不写任何文件。

## 4. Finalize 流程

1. 读取已登记 MergePlan。
2. 重新执行完整 plan 校验。
3. 调用 indexer 生成当前 Page Manifest/Search Index。
4. 校验 merged target 和 Source 引用。
5. 构造 Coverage Artifact 和每个 Source 的最终 processing status。
6. 更新 Extracted Source 的四个 coverage section。
7. 更新 Source Manifest。
8. 写入 coverage.json 和 completed run.json。

## 5. 原子性

Finalize 先在内存中生成所有目标内容，再写临时文件。全部临时文件成功后依次替换正式文件；失败时不更新 Source status 或 Run status。

0008 不解决多进程并发，但每次写入前重新读取和校验 Source/Extraction/Page 状态，避免基于明显过期计划 finalize。

## 6. 错误码

```text
INVALID_MERGE_PLAN
RUN_ALREADY_EXISTS
RUN_NOT_FOUND
MERGE_SOURCE_NOT_FOUND
MERGE_SOURCE_NOT_ACTIVE
MERGE_EXTRACTION_MISSING
MERGE_COVERAGE_INCOMPLETE
MERGE_COVERAGE_DUPLICATE
MERGE_COVERAGE_UNKNOWN_ITEM
MERGE_TARGET_INVALID
MERGE_TARGET_MISSING
MERGE_TARGET_SOURCE_MISSING
MERGE_PLAN_STALE
```

## 7. Validate

Validator 扫描 `.pkwiki/runs/*`：

- run.json 和 merge-plan.json 必须可解析。
- completed Run 必须具有 coverage.json。
- coverage runId 和 MergePlan runId 必须一致。
- coverage 中的 Source 和 Item 引用必须仍然有效。

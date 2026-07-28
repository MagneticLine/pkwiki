# 0008 MergePlan 与 Coverage Contract 需求

## 1. 背景

0007 已把 Source 转成带稳定 Information Item 和 evidence 的 Extraction Artifact。下一步必须把“为什么更新这些 Wiki Page、每个 Item 最终去了哪里”变成机器可校验协议，并解决 Merge Coverage、Source status 和人类审查视图的确定性写入问题。

## 2. 目标

- 冻结 MergePlan v0.1 和 Coverage Artifact v0.1。
- 校验 Candidate Target、Item coverage、隐私说明和待确认问题。
- 保存最小 Run Record。
- finalize 时验证 Wiki Page 存在并引用对应 Source。
- 确定性更新 Extracted Source coverage 视图和 Source Processing Status。
- 不允许 Agent 直接编辑 `.pkwiki/source_manifest.json` 或 coverage artifact。

## 3. CLI

```bash
pkwiki register-merge-plan <plan.json> [--json]
pkwiki finalize-merge <run-id> [--json]
```

`register-merge-plan` 只登记计划，不修改 Wiki。Human Maintainer 应在 PatchPlan 应用并审查后显式调用 `finalize-merge`。

## 4. MergePlan v0.1

```json
{
  "version": "pkwiki.merge-plan/0.1",
  "runId": "run:2026-07-28-example",
  "createdAt": "2026-07-28T14:00:00+08:00",
  "sourceIds": ["src:2026-07-28-example"],
  "summary": "合并低敏项目规划信息",
  "candidateTargets": [
    {
      "path": "wiki/projects/pkwiki.md",
      "reason": "现有项目页负责长期规划",
      "intent": "update",
      "confidence": "high"
    }
  ],
  "coverage": [
    {
      "sourceId": "src:2026-07-28-example",
      "itemId": "decision:d1",
      "decision": "merged",
      "target": "wiki/projects/pkwiki.md",
      "reason": "长期项目决策"
    }
  ],
  "unresolvedQuestions": [],
  "privacyNotes": [],
  "patchPlanPath": "outputs/patch-plans/run-example.json"
}
```

## 5. 规则

- runId 必须以 `run:` 开头并可安全映射为目录名。
- sourceIds 非空且不能重复。
- Source 必须 active，且具有合法 Extraction Artifact。
- Candidate path 只能位于 `wiki/**/*.md`。
- Candidate path 不能重复。
- 每个 Extraction Item 必须且只能有一条 coverage。
- coverage 不允许引用不存在的 Item。
- `merged` 必须提供 target，target 必须出现在 Candidate Targets。
- `deferred`、`discarded`、`needs_confirmation` 必须提供非空 reason。
- `unresolvedQuestions` 和 `privacyNotes` 是字符串数组。

合法 intent：`create`、`update`、`split`、`link`、`skip`。

合法 decision：`merged`、`deferred`、`discarded`、`needs_confirmation`。

## 6. Run Record

登记后写入：

```text
.pkwiki/runs/<run-id-file-name>/run.json
.pkwiki/runs/<run-id-file-name>/merge-plan.json
```

初始 run status 为 `awaiting_apply`。

## 7. Finalize

Finalize 前确定性执行或验证：

- 重新读取 Extraction Artifact 和 Source checksum。
- 生成最新 Page Manifest 和 Search Index。
- 每条 merged coverage 的 target 页面必须存在。
- target 页面 frontmatter `sources` 必须包含对应 Source ID。
- 所有 Item coverage 仍然完整。

Finalize 写入：

```text
.pkwiki/runs/<run-id-file-name>/coverage.json
.pkwiki/runs/<run-id-file-name>/run.json
extracted/sources/*.md coverage sections
.pkwiki/source_manifest.json processing status
```

状态规则：

- 存在 deferred 或 needs_confirmation：`partially_merged`。
- 其余 Item 均为 merged 或 discarded：`merged`。

## 8. 非目标

- 不生成 MergePlan 内容。
- 不自动生成或应用 PatchPlan。
- 不自动 commit 或 push。
- 不实现 Harness approval UI。
- 不实现跨 Run 并发锁。

## 9. 验收

- 合法计划可以登记和 finalize。
- 缺失、重复、额外 coverage 被拒绝。
- merged target 不存在或缺 Source 引用时 finalize 被拒绝。
- coverage 视图和 Source status 正确更新。
- Run Record 可审查。
- validate 能发现非法 Run Artifact。
- build、test、lint 和低敏 dogfood 通过。

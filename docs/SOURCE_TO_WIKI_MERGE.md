# Source-to-Wiki Merge

Source-to-Wiki Merge 是 `pkwiki` 的核心质量目标：把 Raw Source 中的重要信息完整、正确、可追溯地合并进长期 Wiki。

它不是摘要、文件复制或让 Agent 自由整理整个 Vault。

## 1. 原则

- 先登记和提取，再合并。
- 先定位，再修改。
- 先生成 MergePlan，再生成 PatchPlan。
- 重要 Information Item 不能无声丢失。
- 不确定内容不能写成确定事实。
- 新增事实必须能追溯到 Source ID，必要时追溯到 chunk 或 evidence。
- 多页面影响必须显式记录。
- Human Maintainer 保留最终判断权。

## 2. 输入

- Source Manifest。
- Raw Source。
- Extracted Source 和正式 extraction artifact。
- Chunk Manifest，如适用。
- Page Manifest 和 Search Index。
- Candidate Wiki Page。
- `system/` 下适用的规则。
- 当前 Git worktree 状态。

## 3. 输出

一次完整 merge 至少产生：

- Context Pack。
- MergePlan。
- PatchPlan。
- 更新后的 Wiki Page。
- Merge Coverage artifact 和人类可读视图。
- 更新后的 Source Processing Status。
- validate、index 和 diff 结果。
- Human Review 结果。
- Run Record。

## 4. MergePlan

MergePlan 回答“为什么这样合并”；PatchPlan 回答“怎样修改文件”。

目标结构：

```json
{
  "version": "pkwiki.merge-plan/0.1",
  "runId": "run:2026-07-28-example",
  "sourceIds": ["src:2026-07-28-example"],
  "summary": "本次 merge 的目标",
  "candidateTargets": [
    {
      "path": "wiki/me/profile.md",
      "reason": "素材包含长期个人画像信息",
      "intent": "update",
      "confidence": "medium",
      "evidence": ["fact:f1", "event:e1"]
    }
  ],
  "coverage": [
    {
      "itemId": "fact:f1",
      "decision": "merged",
      "target": "wiki/me/profile.md",
      "reason": "长期稳定事实"
    },
    {
      "itemId": "question:q1",
      "decision": "needs_confirmation",
      "reason": "与旧页面存在冲突"
    }
  ],
  "unresolvedQuestions": [],
  "privacyNotes": [],
  "patchPlanPath": ".pkwiki/runs/run-2026-07-28-example/patch-plan.json"
}
```

正式 schema 由 `0008-merge-plan-coverage` 冻结。

## 5. Merge Workflow

### 5.1 Preflight

Agent 或 Harness 先执行：

```bash
pkwiki status --json
pkwiki validate --json
```

确认 Vault root、manifest/index 状态、Source 状态和未审查 Git 变更。存在不相关 worktree 变更时，不应自动 apply。

### 5.2 Extraction

读取 Source Manifest、Raw Source、chunk 和 Extracted Source。

如果正式 extraction 不完整，先完成 extraction，不直接修改 Wiki。每个重要 Information Item 必须具有稳定 Item ID、evidence 和 confidence。

### 5.3 Candidate Location

使用以下证据定位候选页面：

- Page Manifest 和 Search Index。
- title、type、domain、tags 和 sources。
- 全文搜索。
- Markdown links 和 backlinks。
- 相关 Source 和历史 Run Record。

候选页面必须记录 reason、confidence 和定位证据。Agent 只读取满足上下文预算的少量候选页面和 section，并把实际读取内容写入 Context Pack。

### 5.4 Merge Decision

每个重要 Information Item 必须选择：

```text
merged
deferred
discarded
needs_confirmation
```

每个 Candidate Target 必须选择：

```text
create
update
split
link
skip
```

Deferred 和 Discarded 必须包含原因。Needs Confirmation 必须包含 Human Maintainer 可以回答的具体问题。

### 5.5 Plan And Approval

Harness 生成 MergePlan。MVP 默认在实质写入前等待 Human Maintainer 审查。

审查重点：

- 重要信息是否完整进入 coverage。
- Candidate Target 是否合理。
- 是否存在无依据推断。
- 是否泄露或扩大敏感信息。
- 是否发生不必要的跨页面改写。

### 5.6 Patch

批准后生成 PatchPlan。

- 只修改允许区域。
- 优先使用 section 级 operation。
- 使用 expectedChecksum 防止覆盖并发修改。
- 新增 claim 带 Source ID，后续支持更细 evidence 引用。
- 多页面修改必须与 MergePlan candidateTargets 对应。

### 5.7 Apply And Validate

```bash
pkwiki apply-patch <plan>
pkwiki validate --json
pkwiki index --json
pkwiki diff
```

validate error、index 失败、diff 超出 MergePlan 或 expectedChecksum 过期时，Run 停止并进入失败或重新规划状态。

### 5.8 Finalize Coverage

Wiki 修改通过校验和审查后，由确定性 finalize 流程：

- 保存 coverage artifact。
- 更新 Extracted Source coverage 视图。
- 推进 Source Processing Status。
- 保存 validate、diff 和 review 结果。

具体 CLI 命名和原子写入边界由 0008 决定。Agent 不能为完成 merge 而直接修改 `.pkwiki/source_manifest.json` 或 Run Record。

## 6. Coverage 与状态

`processingStatus: merged` 不表示每条内容都写入 Wiki，而表示每个重要 Information Item 都有明确、合法、可审查的处理结果。

如果仍存在未处理 item、需要确认且阻塞的重要问题，或者必要 patch 尚未完成，则状态为 `partially_merged`。

Lifecycle Status 独立于 merge。例如 Raw Source 后来被删除，不改变过去的 coverage 和 Wiki 引用。

## 7. 信息不丢失策略

`pkwiki` 不能数学证明语义完整，但可以把遗漏风险变成可观察对象。

Agent 不得无记录忽略：

- 身份、教育、职业、健康、心理、人际关系和长期偏好。
- 重要经历、失败、选择、反思和目标变化。
- 与已有 Wiki 矛盾的信息。
- Human Maintainer 明确表达的价值观、规则、边界、喜好和厌恶。
- 可复用材料，例如简历、申请材料、证书和项目成果。

Merge eval 应分别衡量重要信息召回、错误写入、错误定位、引用缺失和无关改写，而不是只判断命令是否成功。

## 8. 冲突与时间变化

新 Source 与旧 Wiki 冲突时：

- 不直接覆盖旧事实。
- 区分旧事实错误、事实随时间变化和来源观点不同。
- 在 Uncertainty 或 User Confirmation Needed 中记录。
- 可以保留历史变化，但必须标注时间、来源和 confidence。
- 需要 Human Maintainer 判断时停止。

## 9. 隐私

Agent 必须遵守 `system/PRIVACY_RULES.md` 和当前 Runtime 的数据发送策略。

- 健康、心理、身份、财务和人际关系信息默认 private。
- 不确定是否应写入长期 Wiki时选择 deferred 或 needs_confirmation。
- 未经授权，不把私密 Source 发送给不满足 Vault policy 的远程模型。
- Run Record 不保存 API key、token 或其他 secret。
- 不为了 coverage 完整而把敏感 Raw 内容复制到公开仓库或发布产物。

## 10. 与 Query 和 File-back 的关系

Query 默认只读，使用相同的 search 和 Context Pack 能力生成带引用回答。

File-back 把有长期价值的回答或运行结果登记为新 Source，再进入 Extraction 和 Merge，不直接绕过 coverage、privacy 和 review 规则写 Wiki。

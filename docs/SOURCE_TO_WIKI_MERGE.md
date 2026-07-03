# Source-to-Wiki Merge

Source-to-Wiki Merge 是 `pkwiki` 的核心质量目标：把 Raw Source 或 Extracted Source 中的重要信息完整、正确、可追溯地合并进长期 Wiki。

它不是摘要，也不是文件复制。

## 1. 原则

- 先提取，再合并。
- 先定位，再修改。
- 先计划，再应用 PatchPlan。
- 重要信息不能无声丢失。
- 不确定内容不能写成确定事实。
- 新增事实必须能追溯到 Source ID。
- 多页面影响必须显式记录。
- Human Maintainer 保留最终判断权。

## 2. 输入

Source-to-Wiki Merge 的输入包括：

- Source Manifest。
- Raw Source。
- Extracted Source。
- Page Manifest。
- Search Index。
- Wiki Page。
- `system/` 下的规则文件。

## 3. 输出

一次 merge 至少应产生：

- MergePlan。
- PatchPlan。
- 更新后的 Wiki Page。
- 更新后的 Extracted Source coverage。
- validate 结果。
- diff 审查结果。

## 4. MergePlan

MergePlan 是 Agent 的合并决策计划。

PatchPlan 回答“怎么改文件”；MergePlan 回答“为什么这样合并”。

推荐结构：

```json
{
  "version": "pkwiki.merge-plan/0.1",
  "sourceIds": ["src:2026-07-02-example"],
  "summary": "本次 merge 的目标",
  "candidateTargets": [
    {
      "path": "wiki/me/profile.md",
      "reason": "素材包含长期个人画像信息",
      "intent": "update",
      "confidence": "medium"
    }
  ],
  "coverage": [
    {
      "itemId": "f1",
      "kind": "fact",
      "claim": "...",
      "decision": "merged",
      "target": "wiki/me/profile.md",
      "reason": "长期稳定事实"
    },
    {
      "itemId": "q1",
      "kind": "question",
      "claim": "...",
      "decision": "needs_confirmation",
      "reason": "与旧页面存在冲突"
    }
  ],
  "patchPlanPath": "outputs/patch-plans/example.json"
}
```

## 5. Merge Workflow

### 5.1 读取状态

Agent 应先执行：

```bash
pkwiki status --json
pkwiki validate --json
```

目标：

- 确认 Vault root。
- 确认 manifest/index 状态。
- 确认是否存在未审查 Git 变更。

### 5.2 读取素材

Agent 读取 Source Manifest 和 Extracted Source。

如果 Extracted Source 不完整，Agent 应先补 Extracted Source，而不是直接修改 Wiki。

### 5.3 定位候选页面

Agent 使用：

- `outputs/index.json`
- `.pkwiki/page_manifest.json`
- Wiki links
- frontmatter `type/domain/sources/tags`
- 全文搜索

来找候选页面。

候选页面必须记录 reason 和 confidence。

### 5.4 判断合并策略

每个信息单元必须选择一种决策：

```text
merged
deferred
discarded
needs_confirmation
```

每个目标页面必须选择一种意图：

```text
create
update
split
link
skip
```

### 5.5 生成 MergePlan

MergePlan 必须包含：

- sourceIds。
- candidateTargets。
- coverage。
- unresolved questions。
- privacy notes，如有。

### 5.6 生成 PatchPlan

PatchPlan 只表达文件修改操作。

规则：

- 只能修改 `wiki/**/*.md`。
- 尽量使用 section 级操作。
- 提供 expectedChecksum，避免基于过期上下文覆盖用户修改。
- 新增事实应带 Source ID 引用。

### 5.7 应用和校验

```bash
pkwiki apply-patch <plan>
pkwiki validate --json
pkwiki diff
```

如果 validate error 或 diff 超出预期，Agent 应停止并请求 Human Maintainer 审查。

### 5.8 更新 coverage

Merge 完成后，Agent 应更新 Extracted Source 的 Merge Coverage。

目标是让后续审查能回答：

- 这份 source 的重要信息是否被处理。
- 哪些进入了 Wiki。
- 哪些被延后。
- 哪些被舍弃。
- 哪些仍需用户确认。

## 6. 信息不丢失策略

`pkwiki` 不可能完全自动证明信息没有丢失，但可以要求 Agent 明确记录取舍。

每个重要信息单元必须有处理状态。

Agent 不应无记录地忽略以下内容：

- 个人身份、教育、职业、健康、心理、人际关系、长期偏好。
- 重要经历、失败、选择、反思、目标变化。
- 与已有 Wiki 内容矛盾的信息。
- 用户明确表达的价值观、规则、边界、喜好和厌恶。
- 可复用材料，例如简历、申请材料、证书、项目成果。

## 7. 冲突处理

当新 source 与旧 Wiki 存在冲突：

- 不直接覆盖旧事实。
- 在 Extracted Source 的 Uncertainty 或 User Confirmation Needed 中记录冲突。
- 可以在 Wiki 中新增“历史变化”或“待确认”小节，但必须标注来源和不确定性。
- 需要用户判断时停止。

## 8. 隐私处理

Agent 应遵守 `system/PRIVACY_RULES.md`。

敏感素材可以被登记和提取，但进入 Wiki 时应更谨慎：

- 健康、心理、身份、财务、人际关系信息默认 private。
- 不确定是否该写入长期 Wiki 时，选择 deferred 或 needs_confirmation。
- 不应为了完整性而泄露敏感 raw 内容到公开仓库。

## 9. 与 PatchPlan 的关系

MergePlan 是决策层，PatchPlan 是修改层。

```text
Extracted Source -> MergePlan -> PatchPlan -> apply-patch -> validate -> diff
```

后续 `pkwiki merge` 可以围绕 MergePlan 实现，但第一阶段可以先要求 Agent 按文档生成 MergePlan。

# PatchPlan

PatchPlan 是 Agent 修改 Wiki 的受控协议。

Agent 不应直接自由重写 Wiki Page，而应生成 PatchPlan，由 `pkwiki apply-patch` 用确定性逻辑应用。

## v0 命令

```bash
pkwiki apply-patch <plan> [--dry-run] [--json]
```

## v0 操作

- `create_markdown_page`：创建新的 `wiki/**/*.md`。
- `replace_text`：精确替换唯一命中的文本。
- `append_to_section`：向唯一命中的 ATX heading section 追加内容。
- `replace_section`：替换唯一命中的 ATX heading section body。

## 安全边界

PatchPlan v0 只允许修改 `wiki/**/*.md`。

拒绝修改：

- `raw/**`
- `extracted/**`
- `.pkwiki/**`
- `outputs/**`
- `assets/**`
- `system/**`
- Vault 外路径
- 非 Markdown 文件

Merge Coverage、Source Processing Status 和 Run Record 不由 Agent 绕过 PatchPlan 直接写入。后续 Merge finalize 流程将通过独立的确定性协议更新这些状态；PatchPlan v0 继续只负责 `wiki/**/*.md` 修改。

## 版本管理关系

短期内 Git 仍然负责仓库级历史、diff、审查和回滚。

PatchPlan 负责操作级意图和安全边界。未来可以在 apply 时记录 inverse plan，用于 pkwiki 级 undo/redo，但这应建立在 PatchPlan 稳定和 dogfood 充分之后，不在 v0 中替代 Git。

MergePlan、PatchPlan、Run Record 和 Git 的分工：

- MergePlan：为什么这样处理知识。
- PatchPlan：怎样修改 Wiki 文件。
- Run Record：本次 Agent 工作流发生了什么。
- Git：仓库最终如何变化。

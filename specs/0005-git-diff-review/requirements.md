# 0005 Git Diff 变更审查需求

## 1. 背景

0004 已经实现 PatchPlan v0 和 `pkwiki apply-patch`。Agent 可以用结构化操作修改 Wiki Page，`pkwiki` 可以负责路径安全、checksum 和 apply 后校验。

但 Source-to-Wiki Merge 的闭环还缺少一个关键环节：Human Maintainer 需要快速理解 Agent 到底改了什么，Agent 也需要用机器可读方式判断当前 Vault 是否还有待审查变更。

直接使用 `git diff` 当然可行，但它不是面向 `pkwiki` 工作流设计的：

- Git 输出对 Agent 不够结构化。
- Human Maintainer 需要同时看 status、stat、文件列表和具体 diff。
- `apply-patch` 后如果 index 或 manifest stale，需要能被审查流程看见。
- 后续 Self-maintenance 和 commit 辅助需要稳定的变更摘要输入。

0005 的目标是增加只读的 `pkwiki diff` 命令，作为 PatchPlan 应用后的变更审查入口。

## 2. 目标

### 2.1 产品目标

- Human Maintainer 可以用 `pkwiki diff` 审查 Agent 改动。
- Agent 可以用 `pkwiki diff --json` 获取结构化变更摘要。
- `pkwiki diff` 只读，不负责提交、推送或回滚。
- 变更审查结果能区分 Wiki、Raw Source、Extracted Source、manifest、index 等不同区域。
- 为后续 commit 辅助、Wiki Health 修复和 Self-maintenance 提供稳定输入。

### 2.2 工程目标

- 在 `packages/git` 中扩展 Git diff/status 能力。
- 增加 `pkwiki diff [path] [--json] [--name-only]` 命令。
- 支持未跟踪文件、已修改文件、已删除文件和暂存区变更的摘要。
- 支持可选路径过滤，路径必须限制在 Vault root 内。
- 支持 human-readable 和 JSON 输出。
- 不引入自动 commit/push。
- 保持 `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

## 3. 用户故事

### 3.1 Human Maintainer 审查 apply-patch 后的变更

作为 Human Maintainer，我希望执行：

```bash
pkwiki diff
```

看到当前 Vault 中有哪些文件被修改、每个区域的变更数量，以及 Git diff 摘要，从而决定是否继续查看具体文件或提交。

验收：

- 输出包含 Vault root。
- 输出包含 Git worktree 是否 clean。
- 输出包含 changed files。
- 输出包含按区域分类的统计。
- 输出包含 diff stat。
- 未初始化 Git 仓库时给出明确错误。

### 3.2 Agent 获取机器可读变更摘要

作为 Agent，我希望执行：

```bash
pkwiki diff --json
```

得到稳定 JSON，判断当前是否存在待审查变更、哪些文件受影响、是否只改了允许的 Wiki 区域。

验收：

- JSON 包含 `ok`、`vaultRoot`、`clean`、`files`、`areas`、`stat`。
- 文件列表包含路径、状态、区域和插入/删除行数。
- JSON 不默认包含完整 patch 文本，避免输出过大。
- 命令失败时 JSON 输出错误码和 message。

### 3.3 Human Maintainer 只看文件名

作为 Human Maintainer，我希望执行：

```bash
pkwiki diff --name-only
```

只看到变更文件列表，便于快速确认 Agent 是否改了预期范围。

验收：

- human-readable 输出只列文件路径。
- JSON 输出仍保留结构化字段，但不包含 stat 详情。
- clean worktree 输出为空列表，并返回 0。

### 3.4 审查某个路径范围

作为维护者，我希望执行：

```bash
pkwiki diff wiki/profile
```

只查看某个目录或文件的变更。

验收：

- 路径相对 Vault root 解析。
- 路径不能是绝对路径。
- 路径不能越过 Vault root。
- 路径不存在但在 Git 中存在删除记录时，仍能展示删除变更。

## 4. 功能范围

### 4.1 命令

```bash
pkwiki diff [path] [--json] [--name-only]
```

要求：

- 默认从当前目录向上寻找 Vault root。
- 默认审查整个 Vault。
- `[path]` 可选，表示相对 Vault root 的文件或目录。
- `--json` 输出机器可读结果。
- `--name-only` 只输出文件路径。
- 命令只读，不写入任何文件。

暂不要求：

- 自动 commit。
- 自动 push。
- 自动 rollback。
- 图形化 diff。
- merge conflict 解决。
- pkwiki 自有版本库。
- 输出完整 patch 到 JSON。

### 4.2 变更区域

第一版按路径前缀分类：

- `wiki`：长期 Wiki Page。
- `raw`：Raw Source。
- `extracted`：Extracted Source。
- `manifest`：`.pkwiki/**`。
- `outputs`：`outputs/**`。
- `assets`：`assets/**`。
- `system`：`system/**`。
- `other`：其他路径。

分类只用于审查提示，不阻塞命令。

### 4.3 文件状态

第一版需要识别：

- `added`
- `modified`
- `deleted`
- `renamed`
- `copied`
- `untracked`
- `unknown`

状态来自 `git status --porcelain=v1` 和 `git diff --numstat` 的组合。

### 4.4 输出边界

human-readable 输出应该便于人快速扫读：

```text
Vault: /path/to/vault
Clean: false

Changed files:
  M wiki/profile/basic.md
  ?? raw/inbox/example.md

Areas:
  wiki: 1
  raw: 1

Diff stat:
  wiki/profile/basic.md | 10 +++++-----
```

JSON 输出面向 Agent：

```json
{
  "ok": true,
  "vaultRoot": "/path/to/vault",
  "clean": false,
  "files": [
    {
      "path": "wiki/profile/basic.md",
      "status": "modified",
      "area": "wiki",
      "insertions": 5,
      "deletions": 3
    }
  ],
  "areas": {
    "wiki": 1
  },
  "stat": {
    "filesChanged": 1,
    "insertions": 5,
    "deletions": 3
  }
}
```

## 5. 非目标

- 0005 不替代 Git。
- 0005 不实现 pkwiki undo/redo。
- 0005 不定义 commit message 生成策略。
- 0005 不自动判断变更质量是否正确。
- 0005 不做 Source-to-Wiki Merge 的完整性评分。

## 6. 验收标准

- `pkwiki diff` 在 Git Vault 中可输出 human-readable 变更摘要。
- `pkwiki diff --json` 输出稳定 JSON。
- `pkwiki diff --name-only` 可用。
- `pkwiki diff <path>` 可限制路径范围。
- 未初始化 Git 时错误清晰。
- unsafe path 被拒绝。
- clean worktree 返回成功且 clean 为 true。
- 单元测试覆盖 status 解析、numstat 解析、area 分类和 unsafe path。
- CLI 集成测试覆盖 clean、dirty、path filter、json、name-only。
- `pnpm build`、`pnpm test`、`pnpm lint` 通过。

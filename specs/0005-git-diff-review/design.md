# 0005 Git Diff 变更审查设计

## 1. 设计原则

- `pkwiki diff` 是只读审查命令，不做提交或修改。
- Git 仍是仓库级版本管理系统，`pkwiki` 只提供面向 Vault 的摘要和结构化输出。
- human-readable 输出服务 Human Maintainer，JSON 输出服务 Agent。
- JSON 默认不输出完整 patch，避免上下文污染和隐私材料过量展开。
- 第一版以可靠解析 Git porcelain 输出为主，不实现复杂 Git 工作流。

## 2. 模块分工

```text
packages/git
  Git status、diff stat、numstat、文件状态解析、区域分类。

packages/cli
  diff 命令参数解析、路径过滤、输出格式和退出码。

packages/core
  复用 Vault root 查找和安全路径解析。
```

## 3. 命令设计

```bash
pkwiki diff [path] [--json] [--name-only]
```

参数：

- `[path]`：可选，相对 Vault root 的文件或目录。
- `--json`：输出机器可读 JSON。
- `--name-only`：只输出文件路径。

退出码：

- `0`：命令成功，包括 clean worktree。
- `1`：业务规则阻塞，例如当前目录不在 Git worktree 内。
- `2`：参数或运行错误，例如 unsafe path。

## 4. Git 命令

第一版使用同步子进程执行 Git，保持现有 `packages/git` 风格。

### 4.1 仓库检测

```bash
git rev-parse --is-inside-work-tree
```

如果失败或输出不是 `true`，返回 `GIT_NOT_INITIALIZED`。

### 4.2 文件状态

```bash
git status --porcelain=v1 -- <path?>
```

解析前两列状态码：

- `??` -> `untracked`
- `A `、` A`、`AA` -> `added`
- `M `、` M`、`MM` -> `modified`
- `D `、` D`、`DD` -> `deleted`
- `R `、` R` -> `renamed`
- `C `、` C` -> `copied`
- 其他 -> `unknown`

重命名输出形如 `old -> new` 时，结果路径使用新路径，同时保留 `previousPath`。

### 4.3 行数统计

```bash
git diff --numstat -- <path?>
git diff --cached --numstat -- <path?>
```

合并 unstaged 和 staged 统计。未跟踪文件不会出现在 `git diff --numstat` 中，第一版未跟踪文件的 `insertions/deletions` 可为空。

numstat 中二进制文件使用 `-`，解析为 `null`。

### 4.4 Diff stat

human-readable 默认追加：

```bash
git diff --stat -- <path?>
git diff --cached --stat -- <path?>
```

如果只有未跟踪文件，diff stat 可以为空，但文件列表仍展示。

## 5. 路径过滤

`[path]` 解析规则：

1. 必须是相对路径。
2. 不能包含空 segment、`.` 或 `..`。
3. 解析后的绝对路径必须仍在 Vault root 内。
4. 传给 Git 时使用 `-- <path>`，避免路径被解释为 option。

路径不存在时不提前失败，因为删除文件在文件系统中已不存在，但 Git 仍可能有删除记录。

## 6. 区域分类

```ts
type VaultArea =
  | "wiki"
  | "raw"
  | "extracted"
  | "manifest"
  | "outputs"
  | "assets"
  | "system"
  | "other";
```

分类规则：

- `wiki/**` -> `wiki`
- `raw/**` -> `raw`
- `extracted/**` -> `extracted`
- `.pkwiki/**` -> `manifest`
- `outputs/**` -> `outputs`
- `assets/**` -> `assets`
- `system/**` -> `system`
- 其他 -> `other`

## 7. 类型设计

```ts
type GitDiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

type GitDiffFile = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  area: VaultArea;
  insertions: number | null;
  deletions: number | null;
};

type GitDiffSummary = {
  ok: true;
  vaultRoot: string;
  clean: boolean;
  files: GitDiffFile[];
  areas: Record<VaultArea, number>;
  stat: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  rawStatText?: string;
};
```

错误输出：

```ts
type GitDiffError = {
  ok: false;
  code: "GIT_NOT_INITIALIZED" | "UNSAFE_DIFF_PATH" | "GIT_COMMAND_FAILED";
  message: string;
};
```

## 8. 输出策略

### 8.1 Human-readable

默认输出：

- Vault root。
- Clean 状态。
- Changed files。
- Areas。
- Diff stat。

`--name-only` 输出：

- 只输出相对路径。
- clean 时不输出文件路径。

### 8.2 JSON

`--json` 输出完整 `GitDiffSummary` 或 `GitDiffError`。

`--name-only --json` 时仍输出结构化 JSON，但可以省略 `rawStatText`，并保留 `files` 列表。

## 9. 与 validate/index/apply-patch 的关系

- `pkwiki diff` 不自动运行 validate。
- `pkwiki diff` 不自动运行 index。
- `apply-patch` 后 Human Maintainer 可以先运行 `pkwiki diff`，再根据提示决定是否运行 `pkwiki index`。
- 后续可以在 `status` 中提示 dirty worktree，也可以让 `commit` 辅助复用 `pkwiki diff --json` 的结果。

## 10. 测试设计

### 10.1 Unit

- 解析 porcelain status。
- 解析 rename path。
- 解析 numstat。
- 合并 staged/unstaged numstat。
- 区域分类。
- unsafe path 拒绝。

### 10.2 CLI integration

使用临时 Vault 和临时 Git 仓库：

- clean worktree。
- 修改 Wiki Page。
- 新增 Raw Source。
- 删除 Wiki Page。
- 暂存变更。
- `--json` 输出。
- `--name-only` 输出。
- path filter。
- 非 Git Vault 错误。

## 11. 后续扩展

- `pkwiki commit`：基于 diff summary 生成提交辅助，但仍由 Human Maintainer 确认。
- `pkwiki diff --patch`：显式输出完整 patch，用于需要深度审查的场景。
- `pkwiki review`：结合 validate、index stale、source/page manifest，输出更高层的 Wiki 变更审查报告。
- pkwiki undo/redo：如果未来 PatchPlan 记录 inverse plan，可以作为 Git 之外的操作级回退能力，但不属于 0005。

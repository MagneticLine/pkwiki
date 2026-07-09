# 0004 PatchPlan 与 apply-patch 需求

## 1. 背景

0001 建立了 Vault 契约和 `init/status/validate`。0002 让 Raw Source 可登记、可追溯。0003 让 Wiki Page 可索引、可定位。

下一步进入路线图阶段 3：受控修改协议。

在 Source-to-Wiki Merge 中，Agent 最终必须修改 Wiki Page。但如果允许 Agent 直接自由重写文件，风险很高：

- 可能覆盖整页并丢失细节。
- 可能绕过 frontmatter、source 引用和链接规则。
- Human Maintainer 很难判断修改意图。
- 后续无法把失败模式固化成 Harness 规则。

0004 的目标是定义 PatchPlan v0，并实现 `pkwiki apply-patch` MVP。Agent 先生成结构化 PatchPlan，`pkwiki` 再用确定性逻辑应用修改、检查约束并输出可审查结果。

## 2. 目标

### 2.1 产品目标

- Agent 用结构化 PatchPlan 表达修改意图，而不是直接随意改 Wiki。
- Human Maintainer 可以通过 dry-run 和 Git diff 审查变更。
- `pkwiki` 能拒绝明显危险的 patch，例如修改 `raw/`、越权路径、缺少 source 引用、文件版本过期。
- PatchPlan 能成为后续 Source-to-Wiki Merge、Wiki Health 修复和 Self-maintenance 的统一修改协议。

### 2.2 工程目标

- 定义 PatchPlan v0 JSON schema。
- 增加 `pkwiki apply-patch <plan>` 命令。
- 支持 `--dry-run` 和 `--json`。
- 支持安全路径检查。
- 支持基于 checksum 的目标页面版本检查。
- 支持有限的 Markdown 修改操作。
- 应用后可运行 validate，并把结果纳入输出。
- 保持 `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

## 3. 用户故事

### 3.1 Agent 提交受控修改计划

作为 Agent，我希望生成：

```json
{
  "version": "pkwiki.patch-plan/0.1",
  "summary": "把实习复盘素材合并到 career/internship 页面",
  "sourceIds": ["src:2026-07-01-internship-review"],
  "operations": [
    {
      "type": "append_to_section",
      "path": "wiki/career/internship.md",
      "heading": "阶段复盘",
      "content": "- 2026-07-01：补充一条低敏复盘。 ^[src:2026-07-01-internship-review]"
    }
  ]
}
```

然后执行：

```bash
pkwiki apply-patch ./outputs/patch-plans/internship-review.json --json
```

让确定性工具应用修改。

验收：

- 命令能读取 PatchPlan。
- 命令只修改 PatchPlan 声明的目标文件。
- 修改后运行 validate。
- JSON 输出包含操作数、修改文件、validate errors/warnings。

### 3.2 Human Maintainer 预览修改

作为 Human Maintainer，我希望执行：

```bash
pkwiki apply-patch ./outputs/patch-plans/internship-review.json --dry-run
```

看到将修改哪些文件，但不写入磁盘。

验收：

- dry-run 不修改任何文件。
- 输出包含 planned operations 和 affected files。
- 如果 PatchPlan 不合法，dry-run 同样失败。

### 3.3 拒绝危险修改

作为维护者，我希望当 PatchPlan 尝试修改 `raw/` 或 Vault 外路径时，命令必须拒绝。

验收：

- 修改 `raw/` 报 error。
- 修改绝对路径或 `../` 越权路径报 error。
- 修改 `.pkwiki/` manifest 需显式禁止，避免 Agent 绕过工具生成索引。
- 错误输出支持 `--json`。

## 4. 功能范围

### 4.1 命令

```bash
pkwiki apply-patch <plan> [--dry-run] [--json]
```

要求：

- `<plan>` 必须是 JSON 文件。
- 默认从当前目录向上寻找 Vault root。
- `--dry-run` 只校验和预览，不写文件。
- `--json` 输出机器可读结果。
- 非 dry-run 成功应用后运行 `pkwiki validate` 等价校验。

暂不要求：

- 自动 commit。
- 自动 push。
- Git branch 管理。
- LLM 调用。
- 图形化 diff。
- 多人并发锁。

### 4.2 PatchPlan v0

顶层结构：

```json
{
  "version": "pkwiki.patch-plan/0.1",
  "summary": "本次修改的目的",
  "sourceIds": ["src:..."],
  "createdBy": "agent",
  "operations": []
}
```

必需字段：

- `version`
- `summary`
- `operations`

推荐字段：

- `sourceIds`
- `createdBy`
- `createdAt`
- `notes`

### 4.3 Operation v0

第一版支持四类操作。

#### 4.3.1 `create_markdown_page`

创建新的 Wiki Page。

```json
{
  "type": "create_markdown_page",
  "path": "wiki/career/new-page.md",
  "content": "---\n...\n---\n\n# New Page\n"
}
```

要求：

- 目标必须在 `wiki/` 下。
- 文件不能已存在。
- content 必须包含合法 frontmatter。
- validate 负责最终结构检查。

#### 4.3.2 `replace_text`

精确替换文本。

```json
{
  "type": "replace_text",
  "path": "wiki/career/internship.md",
  "find": "旧文本",
  "replace": "新文本"
}
```

要求：

- `find` 必须非空。
- `find` 必须且只能命中一次。
- 不允许正则替换。

#### 4.3.3 `append_to_section`

向 ATX heading section 追加内容。

```json
{
  "type": "append_to_section",
  "path": "wiki/career/internship.md",
  "heading": "阶段复盘",
  "content": "- 新条目"
}
```

要求：

- heading 必须且只能命中一次。
- content 追加到该 section 末尾、下一个同级或更高级 heading 之前。
- 第一版只支持纯文本 heading，不支持重复 heading 路径 disambiguation。

#### 4.3.4 `replace_section`

替换 ATX heading section 的正文。

```json
{
  "type": "replace_section",
  "path": "wiki/career/internship.md",
  "heading": "阶段复盘",
  "content": "新的 section 正文"
}
```

要求：

- 保留 heading 行本身。
- 只替换 section body。
- heading 必须且只能命中一次。

### 4.4 安全约束

PatchPlan v0 必须拒绝：

- Vault 外路径。
- 绝对路径。
- 包含 `..` 的路径。
- 修改 `raw/`。
- 修改 `.pkwiki/`。
- 修改 `outputs/index.json`、`.pkwiki/page_manifest.json` 等生成产物。
- 修改非 Markdown 文件。

第一版允许：

- 修改 `wiki/**/*.md`。
- 后续可评估是否允许修改 `extracted/**/*.md`。

### 4.5 版本检查

Operation 可选：

```json
{
  "expectedChecksum": "sha256:..."
}
```

要求：

- 如果提供，当前文件 checksum 必须匹配。
- 不匹配时报 error，提示先刷新 index 或重新生成 PatchPlan。
- `create_markdown_page` 不使用 `expectedChecksum`。

## 5. 非目标

本 spec 不做：

- Agent 自动生成 PatchPlan。
- Source-to-Wiki Merge 完整质量判断。
- 语义去重。
- 冲突自动解决。
- Git commit / push。
- Web UI diff。
- MCP server。
- Wiki Health 自维护。

## 6. 输出要求

### 6.1 Human-readable 输出

示例：

```text
Vault: /path/to/vault
PatchPlan: outputs/patch-plans/internship-review.json
Mode: apply
Operations: 1
Changed files:
  wiki/career/internship.md
Validation:
  errors: 0
  warnings: 0
```

### 6.2 JSON 输出

示例：

```json
{
  "ok": true,
  "vaultRoot": "/path/to/vault",
  "planPath": "outputs/patch-plans/internship-review.json",
  "dryRun": false,
  "operationCount": 1,
  "changedFiles": ["wiki/career/internship.md"],
  "validation": {
    "errors": [],
    "warnings": []
  }
}
```

## 7. 退出码

- `0`：PatchPlan 合法，dry-run 成功或实际应用成功。
- `1`：PatchPlan 合法但业务规则阻塞，例如 checksum 不匹配、文本命中次数不等于 1、validate 出现 error。
- `2`：参数错误、非 Vault、PatchPlan JSON 无法解析、路径越权等运行错误。

## 8. 验收标准

- `pkwiki apply-patch <plan>` 可用。
- `pkwiki apply-patch <plan> --dry-run` 不写文件。
- `pkwiki apply-patch <plan> --json` 输出稳定 JSON。
- 能创建新的 Wiki Page。
- 能精确替换文本。
- 能向 section 追加内容。
- 能替换 section body。
- 能拒绝 raw、`.pkwiki`、Vault 外路径和非 Markdown 文件。
- checksum 不匹配时拒绝应用。
- apply 后运行 validate。
- `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

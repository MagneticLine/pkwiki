# 0001 CLI MVP 需求

## 1. 背景

`pkwiki` 的第一用户是 Agent。Agent 在维护 Vault 前，需要可靠地知道：

- 当前目录是不是一个合法 Vault。
- Vault 的 profile、目录和系统文件是否符合预期。
- Vault 当前是否健康，是否适合继续执行后续任务。

因此第一阶段先实现三个确定性 CLI Command：

```bash
pkwiki init
pkwiki status
pkwiki validate
```

本阶段不接入 LLM、Pi、MCP、Web UI、PatchPlan 或 Source-to-Wiki Merge。

## 2. 目标

### 2.1 产品目标

- 让 Human Maintainer 可以创建标准 Vault。
- 让 Agent 可以识别并读取 Vault 状态。
- 让 Agent 可以在操作前后校验 Vault 契约。
- 为后续 ingest、index、PatchPlan、Self-maintenance 提供稳定地基。

### 2.2 工程目标

- 建立 `core`、`validator`、`cli`、`git` 的最小可用能力。
- 关键命令支持人类可读输出和 `--json` 输出。
- 输出和退出码稳定，方便 Agent 和脚本调用。

## 3. 用户故事

### 3.1 初始化 Vault

作为 Human Maintainer，我希望执行：

```bash
pkwiki init my-pkm-vault
```

创建一个完整 Vault，这样后续 Agent 能按固定结构维护个人 Wiki。

验收：

- 生成完整目录结构。
- 写入 `.pkwiki/config.json`。
- 写入必要系统文件。
- 默认不执行 `git init`。

### 3.2 Agent 读取状态

作为 Agent，我希望执行：

```bash
pkwiki status --json
```

获得机器可解析的 Vault 状态，这样我能判断当前是否可以继续操作。

验收：

- 能从当前工作目录向上找到 Vault root。
- 输出 profile、okf version、目录统计、manifest 状态、Git 状态。
- 非 Vault 目录返回清晰错误。

### 3.3 Agent 校验 Vault

作为 Agent，我希望执行：

```bash
pkwiki validate --json
```

获得结构化 error/warning 列表，这样我能在修改前后判断 Vault 是否仍然合规。

验收：

- 有 error 时退出码为 `1`。
- 只有 warning 或无问题时退出码为 `0`。
- 命令参数或运行环境错误时退出码为 `2`。

## 4. 功能范围

### 4.1 `pkwiki init <path>`

要求：

- 从 `templates/default-vault` 创建完整 Vault。
- 默认拒绝初始化到非空目录。
- `--force` 允许写入已有目录。
- `--git` 才执行 `git init`。
- 写入 `.pkwiki/config.json`。

暂不要求：

- 自动创建 GitHub 仓库。
- 自动 commit。
- 自动安装 Obsidian 配置。

### 4.2 `pkwiki status [path]`

要求：

- 默认从当前工作目录向上查找 Vault root。
- 传入 `path` 时从该路径开始查找或直接识别。
- 支持 `--json`。
- 展示 Vault 基本信息和统计。
- 展示 Git 是否初始化、是否 clean。

暂不要求：

- 展示复杂 index 统计。
- 展示 Wiki Health 分析。
- 展示 Source-to-Wiki Merge 进度。

### 4.3 `pkwiki validate [path]`

要求：

- 默认校验当前或上级探测到的 Vault。
- 传入 `path` 时校验指定路径。
- 支持 `--json`。
- 输出 error/warning。
- 校验目录、系统文件、配置、Wiki Page frontmatter 和 Markdown links。

暂不要求：

- 语义矛盾检测。
- 页面重复检测。
- Source 完整合并检测。
- Obsidian wikilink 解析。

## 5. 非目标

本 spec 不做：

- `pkwiki ingest`
- `pkwiki index`
- `pkwiki apply-patch`
- Agent Runtime 集成
- MCP server
- Web UI
- LLM 调用
- Wiki Health 自维护
- Source-to-Wiki Merge

## 6. 输出要求

### 6.1 人类可读输出

默认输出应简洁，适合终端阅读。

示例：

```text
Vault: /path/to/my-pkm-vault
Profile: pkwiki/0.1
OKF: 0.1
Files:
  raw: 3
  extracted: 1
  wiki: 8
Git:
  initialized: yes
  clean: no
Validation:
  errors: 0
  warnings: 2
```

### 6.2 JSON 输出

`status` 和 `validate` 必须支持 `--json`，供 Agent 使用。

JSON 输出必须稳定，不应包含只适合人读的装饰性文本。

## 7. 退出码

- `0`：命令成功。`validate` 可包含 warning。
- `1`：`validate` 发现 error，或命令发现业务规则阻塞。
- `2`：命令参数错误、无法读取路径、非 Vault 且无法继续等运行错误。

## 8. 验收标准

阶段完成时必须满足：

- `pkwiki init /tmp/test-vault` 生成可识别 Vault。
- `pkwiki status /tmp/test-vault --json` 输出结构化状态。
- `pkwiki validate /tmp/test-vault --json` 无 error。
- 删除必需目录后，`validate` 报 error。
- 制造断链后，`validate` 报 warning。
- 在 `my-pkm-vault` 上运行 `status` 和 `validate` 可作为 dogfood。


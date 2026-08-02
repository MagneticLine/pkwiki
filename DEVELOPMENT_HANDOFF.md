# pkwiki 开发中继文档

更新时间：2026-08-02

本文档用于开发机器迁移和对话上下文中继，只记录可以进入公开仓库的信息，不包含 API Key、SSH 私钥、个人 Vault 数据或内部服务地址。

## 1. 产品目标

`pkwiki` 参考 LLM Wiki 思想，为个人和 Agent 提供本地优先、文件为真相源的知识编译系统。用户持续投入聊天记录、笔记、日记、简历、学习资料、健康记录等 Raw Source，由 Agent 完成提取、定位、规划和查询，再由确定性工具完成受控写入、校验、索引和差异审查。

第一用户是 Agent，第二用户是会使用终端的个人知识库维护者。Human Maintainer 始终保留知识取舍、实际写入、Git commit、push 和发布的最终决定权。

个人 Wiki 的目的不是单纯的百科、日记或传记，而是形成长期、规整、可追溯的数字知识仓库，让未来 Agent 能快速理解用户的经历、思想、决策、偏好和已有知识，不必每次从问答或网盘文件中重新摸索。

## 2. 工作区与仓库边界

原工作区：

```text
/Users/wangzhiyuan/Project/llm-wiki/
```

主要目录：

```text
pkwiki/             公开产品代码和低敏测试素材，独立 Git 仓库
my-pkm-vault/       私密个人 Vault，独立私有 Git 仓库
references/         不上传 Git 的参考资料
knowledge-catalog/  Google OKF 参考仓库或资料
```

当前开发仓库是 `pkwiki/`，当前分支已于 2026-08-02 确认为：

```text
feature/wangzhiyuan36-20260728/agent-harness-mvp
```

## 3. 已完成的产品阶段

阶段 1 至阶段 4 已完成，对应 Feature Spec `0001` 至 `0009`：

- Core CLI：`init`、`status`、`validate`。
- Source ingest、Source Manifest、checksum、size、mtime、privacy、language 和 `deleted` lifecycle。
- Page Manifest、Search Index、PatchPlan、`apply-patch` 和 Git diff review。
- 稳定 chunk、Extraction Artifact、evidence 校验、MergePlan、Coverage 和 finalize。
- Wiki Page list、read、search、Context Request、Context Pack、链接扩展和上下文预算。
- 从低敏 Raw Source 到 Patch、Coverage、validate 和 diff 的阶段 4 端到端 mock 验收。

Vault root 通过从当前目录向上查找 `.pkwiki/config.json` 判定。Raw Source 原则上不可变；如果实际文件被删除，manifest、Extracted Source、Wiki 引用和历史 Run Record 仍保留。

## 4. 阶段 5 Agent Harness MVP 决策

阶段 5 不是简单接入模型 API，而是 Wiki 场景的应用运行层和质量适配层：

```text
CLI / future MCP or HTTP
        -> Runtime-neutral Harness Core
        -> Runtime Adapter
        -> Pi Coding Agent / model provider
        -> deterministic pkwiki packages
        -> Markdown Vault + Git
```

冻结边界：

- Harness Core 不暴露 Pi 消息和 Session 类型。
- Pi 是第一个 Runtime Adapter，不是确定性 core 的硬依赖。
- Pi 默认 coding tools 全部禁用，只允许当前步骤的结构化 submit tool。
- 模型不能直接写 manifest、Run Record 或 Wiki 文件。
- MergePlan 审批和 Patch apply 审批必须分离。
- File-back 先生成 Source 候选，审批后 ingest，不直接绕过 Source-to-Wiki Merge。
- 不自动 commit、push 或发布。
- MCP、HTTP、Web UI、TUI 和 Self-maintenance 不属于阶段 5 MVP。

冻结 CLI：

```text
pkwiki agent plan-ingest <source-id> [--json]
pkwiki agent merge <run-id> [--approve merge-plan|patch-apply] [--reject merge-plan|patch-apply --reason <text>] [--json]
pkwiki agent query <question> [--json]
pkwiki agent file-back <query-or-file-back-run-id> [--domain <domain>] [--privacy <privacy>] [--approve] [--json]
pkwiki agent status <run-id> [--json]
```

Run lifecycle：

```text
created
preparing
generating
planning
awaiting_approval
applying
validating
completed | failed | cancelled
```

## 5. Pi 与模型配置

锁定版本：

```text
@earendil-works/pi-coding-agent 0.82.1
@earendil-works/pi-agent-core   0.82.1
@earendil-works/pi-ai           0.82.1
@earendil-works/pi-tui          0.82.1
```

实际使用 Coding Agent SDK、Agent Core 和 Pi AI；TUI 只是 Coding Agent 的依赖，Harness 不调用它。

`pi-ai@0.82.1` 已内置 `gpt-5.6-luna`：

```text
contextWindow = 272000
maxTokens     = 128000
thinking      = max
```

模型网关使用 OpenAI-compatible Chat Completions，pkwiki 配置使用：

```text
PKWIKI_MODEL_API=openai-completions
PKWIKI_MODEL_REASONING_EFFORT=max
```

Base URL 保存到 `/v1` 根路径，不追加 `/chat/completions`，由 Pi client 拼接 endpoint。

真实 API Key 和内部 Base URL 位于被 Git 忽略的 `.env.local`。仓库只提交 `.env.example`。换机前必须通过密码管理器或其他安全通道单独保存 `.env.local`，不能写入本文档或 Git。

## 6. 当前阶段 5 实现状态

主要实现：

```text
packages/agent/src/config.ts
packages/agent/src/errors.ts
packages/agent/src/runtime.ts
packages/agent/src/run-store.ts
packages/agent/src/schemas.ts
packages/agent/src/harness.ts
packages/agent/src/adapters/fake.ts
packages/agent/src/adapters/pi.ts
packages/agent/test/agent.test.mjs
```

关联改动：

- `packages/cli` 接入 `pkwiki agent` 嵌套命令和稳定 JSON 错误。
- `packages/merge` 增加 `manageRunRecord: false`，允许 Harness 管理唯一 Run Record，同时保持阶段 4 CLI 默认行为。
- `packages/validator` 识别 `pkwiki.agent-run/0.1`，分别校验 plan-ingest、query 和 file-back Run。
- 根 `package.json` 用 pnpm overrides 锁定 Pi 版本族。
- `packages/agent/package.json` 增加 Pi 和确定性 package 依赖。
- `.gitignore` 忽略 `.env.local` 和 `.env.*.local`。
- `.env.example` 提供脱敏模型配置示例。
- `specs/0010-agent-harness-mvp/` 已建立 requirements、design 和 tasks。

已实现能力：

- GPT-5.6 Luna 默认容量和未知模型显式容量校验。
- API Key 包装和错误消息脱敏。
- RuntimeAdapter、RuntimeEvent 和 FakeRuntime。
- Pi custom provider 注册和单 submit tool allowlist。
- Extraction、MergePlan、PatchPlan 和 Query Answer 结构化提交。
- 最多两次结构化修复重试。
- 原子 RunStore、状态迁移、usage 和脱敏事件。
- Approval checksum 和 stale 检测。
- `plan-ingest`、两阶段 `merge`、`query`、`file-back`。
- Patch 后 validate、index、finalize 和 Wiki diff scope 检查。
- 新旧 Run Record 的 Validator 兼容。

阶段 5 尚不能标记为完成，因为真实 Provider 端到端验收被 Pi timeout/abort 行为阻塞。

## 7. 已通过的测试

开发过程中已通过：

- `pnpm build`。
- `pnpm lint`。
- 一次完整 `pnpm test`，包含阶段 1 至阶段 4 回归。
- Agent 配置默认值和 secret summary 测试。
- 未知模型容量失败测试。
- 结构化输出修复重试测试。
- Approval stale 测试。
- FakeRuntime 完整 plan-ingest、两次审批、merge、query、file-back 和再次 plan-ingest。
- CLI `agent status` 嵌套命令测试。
- `@pkwiki/merge` 外层 Run Record 保留测试。

最后一次完整 `pnpm test` 之后增加了 merge 外层 Run Record 测试，该测试已单独通过；换机恢复后仍应重新运行全量测试。

## 8. 真实 Provider 验收阻塞

低敏真实验收使用 `mock-sources/2026-07-03-learning-note-sample.md` 和 `/private/tmp` 中的独立临时 Git Vault，没有修改 `my-pkm-vault`。

第一次执行在请求模型前发现 `.env.local` 仍使用早期名称 `chat-completions`，已经迁移为 Pi 正式 API ID `openai-completions`。

第二次执行创建了 Run，完成 Source preflight 和 chunk，进入 Extraction 模型调用。超过配置的 180 秒后：

- `session.abort()` 被调用。
- Pi 的 `session.prompt()` 没有及时返回。
- 测试进程需要人工终止。
- Run 停留在 `generating/extraction`。
- 没有生成 Extraction、MergePlan 或 PatchPlan。
- 没有执行 apply。
- 没有修改真实 Vault。

## 9. 恢复开发后的最高优先级

### 9.1 修复 Pi timeout 和取消

不能只依赖 `session.abort()`：

1. 用 `Promise.race` 对 `session.prompt()` 建立强制完成边界。
2. timeout 时调用 `session.abort()`，Runtime Adapter 立即返回稳定的 `PROVIDER_TIMEOUT`。
3. 后台 prompt 如果稍后结束，不得再次向已关闭的事件队列写入。
4. CLI 收到 SIGINT/SIGTERM 时调用 adapter abort，并把 Run 原子更新为 `cancelled` 或 `failed`。
5. 增加“abort 永远不返回”的 Fake Session 测试，证明调用方仍能按时结束。

### 9.2 缩减 Run Record 模型摘要

当前 ModelConfigSummary 已移除 API Key，但真实临时 Run 仍保存了 Base URL。内部地址不应成为可提交的 Vault 审计内容。

Run Record 应只保存：

```text
provider id
api id
model id
reasoning level
context window
max tokens
```

移除 `baseUrl`、headers 和所有 auth 信息，并增加 secret/internal URL 扫描测试。

### 9.3 重新执行真实低敏验收

1. 临时 Vault ingest 低敏 mock source 并 commit baseline。
2. 真实 `agent plan-ingest`，审查 Extraction 和 MergePlan。
3. 显式批准 MergePlan，审查 PatchPlan 和 dry-run。
4. 只在临时 Vault 批准 patch apply。
5. 检查 validate、index、coverage 和 diff。
6. 执行带引用 query。
7. 执行 file-back 并再次 plan-ingest。
8. 扫描 Run artifacts，确保不存在 API Key、Authorization、内部 Base URL 和原始 Provider 响应。

如果 Provider 鉴权、协议、tool call 或结构化输出异常，应停止，不继续 apply，保留脱敏证据。

### 9.4 文档收尾

真实验收通过后：

- 更新 `specs/0010-agent-harness-mvp/tasks.md` checkbox。
- 更新 `docs/AGENT_HARNESS.md` 的最终 CLI、Pi 配置和 timeout 语义。
- 更新 `docs/ARCHITECTURE.md` 和 `docs/VAULT_SPEC.md` 的唯一 Run Record 所有权。
- 更新 `README.md` 的已实现命令。
- 将 `docs/ROADMAP.md` 阶段 5 标记为完成。

## 10. 新机器恢复步骤

建议环境：

```text
Node >= 22.19.0
pnpm 9.0.0
```

恢复流程：

```bash
git clone <pkwiki-remote>
cd pkwiki
git switch feature/wangzhiyuan36-20260728/agent-harness-mvp
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
git diff --check
```

随后从安全存储恢复 `.env.local`，不要从聊天、公开 Git 或本文档恢复 API Key。

需要检查：

```bash
git status --short --branch
git remote -v
git config --local user.name
git config --local user.email
ssh -T git@github-personal
```

个人 GitHub 多账号使用独立 SSH Host alias，不要把个人 IdentityFile 直接覆盖全局 `github.com`，否则可能影响公司 Git 账号。

## 11. 换机前不可遗漏的非 Git 内容

根目录中的开发计划、项目 README、历史聊天、素材压缩包和 Google Knowledge Catalog 源码快照已于 2026-08-02 归档到私有 Vault：

```text
repository: MagneticLine/my-pkm-vault
branch: main
commit: dcf7a7b
path: archive/llm-wiki-root-2026-08-02/
```

以下内容不会随两个仓库 push，删除旧机器前仍必须单独确认：

- `pkwiki/.env.local` 中的模型 API Key 和内部 Provider 配置。
- 个人 GitHub SSH 私钥和 `~/.ssh/config` 中的 Host alias。
- Codex 自定义 skills、memory 或其他仅位于旧机器用户目录的资料。

不要删除旧机器文件，直到新机器能够 clone 两个仓库、安装依赖、读取私有 Vault，并确认秘密配置已安全恢复。

## 12. 本次迁移提交语义

迁移前提交保存 Agent Harness MVP 当前实现、中继文档和测试，但不代表阶段 5 已通过真实 Provider 最终验收。

建议提交信息：

```text
feat(agent): 保存 Agent Harness MVP 开发中继
```

恢复开发后继续在同一分支修复 timeout、完成真实验收，再决定是否合并主分支。

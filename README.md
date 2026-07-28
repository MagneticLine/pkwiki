# pkwiki

`pkwiki` 是一个本地优先、文件为真相源、由 Agent 驱动的个人知识编译与维护系统。

它把聊天、文档、日记、经历、健康记录和学习资料等零散 Raw Source，增量编译成可追溯、可查询、可演进的 Markdown Wiki。Human Maintainer 拥有最终控制权；Agent 负责提取、定位、规划、合并、查询和维护；确定性工具负责约束写入、校验结果和保留审计记录。

Wiki 层以 OKF v0.1 作为外部兼容目标，并使用更严格的 `pkwiki/0.1` profile。完整 Vault 还包含 Raw Source、Extracted Source、规则、manifest 和后续 Run Record。

## 文档地图

建议按以下顺序阅读：

1. [产品定义](docs/PRODUCT.md)：产品目的、用户、核心工作流和非目标。
2. [术语表](CONTEXT.md)：Human Maintainer、Agent、Vault、Source、Harness 和 Merge 等领域语言。
3. [架构](docs/ARCHITECTURE.md)：确定性引擎、Harness Core、Runtime Adapter 和外部入口。
4. [路线图](docs/ROADMAP.md)：唯一权威产品阶段和 Feature Spec 顺序。
5. [Vault Spec](docs/VAULT_SPEC.md)：Vault 目录、manifest、状态、Run Record 和读写边界。
6. [Wiki Schema](docs/WIKI_SCHEMA.md)：Wiki Page frontmatter、链接和 OKF 兼容边界。
7. [Page Types And Style](docs/PAGE_TYPES_AND_STYLE.md)：页面类型、信息粒度和用户偏好学习。
8. [Extracted Source Schema](docs/EXTRACTED_SOURCE_SCHEMA.md)：人类可读 extraction 工作层。
9. [Ingest Pipeline](docs/INGEST_PIPELINE.md)：编译器式 Source 摄入流水线。
10. [Source-to-Wiki Merge](docs/SOURCE_TO_WIKI_MERGE.md)：定位、取舍、coverage、冲突和审查。
11. [Agent Harness](docs/AGENT_HARNESS.md)：Context Pack、Run、Runtime Adapter、Query 和 File-back。
12. [PatchPlan](docs/PATCH_PLAN.md)：受控修改协议和 `apply-patch` 边界。
13. [Git Diff Review](docs/GIT_DIFF_REVIEW.md)：Patch 后的 worktree 变更审查。

`docs/PRODUCT.md` 定义产品，`docs/ROADMAP.md` 定义阶段，`specs/<feature>/` 定义单次开发批次。其他文档不能各自维护新的产品路线图。

## Feature Spec

```text
specs/
  0001-cli-mvp/
  0002-source-ingest-quality-gate/
  0003-page-manifest-index/
  0004-patch-plan-apply/
  0005-git-diff-review/
  0006-vault-source-contract/
```

每个目录包含：

```text
requirements.md
design.md
tasks.md
```

Feature Spec 编号表示开发批次，不等同于路线图阶段。后续计划批次见 [路线图](docs/ROADMAP.md)。

## 仓库边界

这个公开仓库只放可复用产品代码、模板、协议、文档和低敏测试素材。真实个人数据应放在独立 private Vault 仓库中。

## 模块

- `packages/core`：Vault、配置、Source 和 manifest 契约。
- `packages/validator`：结构、链接、manifest、引用和完整性校验。
- `packages/indexer`：Page Manifest 和 Search Index。
- `packages/merge`：MergePlan、Coverage、Run Record 和 finalize。
- `packages/patch`：PatchPlan 解析和受控应用。
- `packages/git`：Git status 和 diff 审查。
- `packages/cli`：面向人和 Agent 的确定性命令入口。
- `packages/agent`：Runtime-neutral Harness Core 和 Runtime Adapter 边界。
- `packages/mcp`：MCP server。
- `packages/web`：本地审查型 Web UI。

## 当前已实现

0001 到 0005 已实现：

```bash
pkwiki init <vault>
pkwiki status
pkwiki validate
pkwiki ingest <file> --type <type> --domain <domain>
pkwiki chunk <source-id> --max-chars <number>
pkwiki register-extraction <artifact.json>
pkwiki index
pkwiki register-merge-plan <plan.json>
pkwiki finalize-merge <run-id>
pkwiki apply-patch <plan>
pkwiki diff
```

关键命令支持 Agent 使用的 `--json` 输出。

0006 到 0008 已实现 Source Contract、稳定 chunk、Extraction Artifact、MergePlan、Coverage、最小 Run Record 和 finalize。下一步进入 0009 Search 与 Context Pack；Agent Harness、Query、File-back、MCP、HTTP、Web UI 和 Self-maintenance 尚未实现。

## 开发命令

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm -r lint
```

详细开发状态和下一阶段以 [路线图](docs/ROADMAP.md) 为准。

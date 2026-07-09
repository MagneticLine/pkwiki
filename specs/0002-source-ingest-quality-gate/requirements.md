# 0002 Source Ingest 与质量门禁需求

## 1. 背景

0001 已实现 `pkwiki init/status/validate`，解决了 Vault 的创建、识别和校验问题。

下一步需要让 Vault 能登记 Raw Source，并把源文件纳入可追溯的 Source 管理。同时，项目代码已经开始跨多个 package 演进，需要把 `pnpm lint` 从占位脚本升级为真正的 ESLint 质量门禁。

本 spec 合并两个目标：

- 实现 `pkwiki ingest` 的非 LLM MVP。
- 接入 ESLint，建立真实代码质量门禁。

这两个目标共同服务于 Harness：Source ingest 让 Agent 能稳定处理素材；ESLint 让工具层自身保持可维护。

## 2. 目标

### 2.1 产品目标

- Human Maintainer 或 Agent 可以把文件登记为 Raw Source。
- `pkwiki` 为 Raw Source 生成稳定 `source_id`。
- `pkwiki` 复制文件到 Vault 内部，避免外部路径失效。
- `.pkwiki/source_manifest.json` 能记录 source 元数据。
- `extracted/sources/` 下生成 Extracted Source 模板，为后续 Agent 提取做准备。

### 2.2 工程目标

- 接入 ESLint flat config。
- `pnpm lint` 对源码和测试执行真实检查。
- 去掉各 package 中 `echo "TODO: ... lint"` 的占位脚本。
- 保持 `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。

## 3. 用户故事

### 3.1 登记 Raw Source

作为 Human Maintainer，我希望执行：

```bash
pkwiki ingest ./notes/gemini-chat.md --type chat --domain personal
```

把一个本地文件复制进 Vault，并登记到 source manifest。

验收：

- 文件被复制到 `raw/inbox/`。
- 生成稳定 `source_id`。
- `.pkwiki/source_manifest.json` 被更新。
- `extracted/sources/<source_id>.md` 被创建。
- 命令输出 human-readable 和 `--json` 两种格式。

### 3.2 Agent 登记素材

作为 Agent，我希望执行：

```bash
pkwiki ingest ./input.md --type document --domain learning --json
```

获得机器可解析的结果，后续可继续读取 Extracted Source 模板。

验收：

- JSON 输出包含 `sourceId`、`rawPath`、`extractedPath`、`checksum`。
- 命令失败时返回稳定错误。

### 3.3 代码质量门禁

作为维护者，我希望执行：

```bash
pnpm lint
```

真正检查 TypeScript、JavaScript 和测试文件，而不是执行占位脚本。

验收：

- `pnpm lint` 对所有相关文件执行 ESLint。
- lint 失败会返回非 0 退出码。
- `dist/`、`node_modules/` 等生成目录被忽略。

## 4. 功能范围

### 4.1 `pkwiki ingest <file>`

参数：

```bash
pkwiki ingest <file> --type <type> --domain <domain> [--title <title>] [--json]
```

要求：

- 输入文件必须存在且是普通文件。
- 默认复制到 `raw/inbox/`。
- 根据日期和文件名生成 `source_id`。
- 计算 SHA-256 checksum。
- 写入 `.pkwiki/source_manifest.json`。
- 创建 `extracted/sources/<source_id>.md`。
- 重复 ingest 同一路径或同 checksum 时不破坏已有记录。

暂不要求：

- LLM 总结。
- 自动分块。
- 写入 Wiki Page。
- 自动判断 domain。
- 批量目录 ingest。

### 4.2 Source Manifest

第一版 manifest 结构：

```json
{
  "src:2026-07-01-gemini-chat": {
    "sourceId": "src:2026-07-01-gemini-chat",
    "originalPath": "/absolute/path/to/gemini-chat.md",
    "rawPath": "raw/inbox/2026-07-01-gemini-chat.md",
    "extractedPath": "extracted/sources/src-2026-07-01-gemini-chat.md",
    "type": "chat",
    "domain": "personal",
    "checksum": "sha256:...",
    "created": "2026-07-01T12:00:00+08:00",
    "status": "registered"
  }
}
```

### 4.3 Extracted Source 模板

模板应包含：

```md
---
source_id: src:2026-07-01-gemini-chat
source_file: raw/inbox/2026-07-01-gemini-chat.md
type: chat
domain: personal
status: pending
created: 2026-07-01T12:00:00+08:00
---

# Extracted Source

## Summary

## Key Facts

## Entities

## Decisions

## Open Questions

## Uncertainty

## Merge Notes
```

### 4.4 ESLint

要求：

- 使用 ESLint flat config。
- 支持 TypeScript。
- 支持 `.mjs` 测试文件。
- 忽略生成目录。
- 根命令 `pnpm lint` 必须真实执行 ESLint。

暂不要求：

- Prettier。
- commit hook。
- lint-staged。
- 自动修复。

## 5. 非目标

本 spec 不做：

- `pkwiki index`
- `pkwiki apply-patch`
- Source-to-Wiki Merge
- Agent Runtime 接入
- MCP server
- Web UI
- 批量 ingest
- 多模态解析
- OCR / PDF / 音频转写

## 6. 输出要求

### 6.1 Human-readable 输出

示例：

```text
Source: src:2026-07-01-gemini-chat
Raw: raw/inbox/2026-07-01-gemini-chat.md
Extracted: extracted/sources/src-2026-07-01-gemini-chat.md
Checksum: sha256:...
Status: registered
```

### 6.2 JSON 输出

示例：

```json
{
  "ok": true,
  "sourceId": "src:2026-07-01-gemini-chat",
  "rawPath": "raw/inbox/2026-07-01-gemini-chat.md",
  "extractedPath": "extracted/sources/src-2026-07-01-gemini-chat.md",
  "checksum": "sha256:...",
  "status": "registered"
}
```

## 7. 退出码

- `0`：命令成功。
- `1`：业务规则阻塞，例如 source 已存在但不能安全复用。
- `2`：参数错误、文件不存在、非 Vault、manifest 无法解析等运行错误。

## 8. 验收标准

- `pkwiki ingest <file> --type chat --domain personal` 可用。
- `pkwiki ingest <file> --json` 输出稳定 JSON。
- source manifest 正确更新。
- extracted template 正确生成。
- 重复 ingest 不破坏已有记录。
- `pkwiki validate` 仍然通过。
- `pnpm lint` 执行真实 ESLint。
- `pnpm build`、`pnpm test`、`pnpm lint` 全部通过。


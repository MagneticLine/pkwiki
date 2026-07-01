# 0002 Source Ingest 与质量门禁设计

## 1. 设计原则

- Source ingest 只做登记和准备，不做 LLM 推理。
- Raw Source 复制进 Vault，避免外部路径失效。
- Raw Source 原始内容不可被 Agent 修改。
- Extracted Source 是 Agent 可写的中间层。
- Manifest 是机器可读事实来源。
- ESLint 是开发质量门禁，不应停留在占位脚本。

## 2. 模块分工

```text
packages/core
  source_id、checksum、manifest 读写、路径工具。

packages/cli
  ingest 命令参数解析、输出格式、退出码。

packages/validator
  校验 source manifest 与文件的一致性。

根目录 ESLint 配置
  统一 lint TypeScript、JavaScript、测试文件。
```

## 3. Source ID 生成

默认格式：

```text
src:YYYY-MM-DD-slug
```

生成规则：

1. 日期使用本地日期。
2. slug 优先来自 `--title`，否则来自文件名。
3. slug 转小写。
4. 非字母数字字符替换为 `-`。
5. 连续 `-` 合并。
6. 去掉首尾 `-`。
7. 冲突时追加 `-2`、`-3`。

文件名中的中文如何处理：

- 第一版保留中文 slug。
- 仅替换空白和明显路径非法字符。
- 后续如遇跨平台问题再调整。

## 4. Raw 文件复制

默认目标：

```text
raw/inbox/<YYYY-MM-DD>-<slug><ext>
```

规则：

- 不修改输入文件。
- 如果目标文件名冲突，追加 `-2`。
- 写入 manifest 后，后续流程使用 Vault 内相对路径。

## 5. Checksum

使用 SHA-256：

```text
sha256:<hex>
```

用途：

- 检测重复 ingest。
- 支持未来 Source-to-Wiki Merge 完整性检查。
- 支持未来 raw 文件变更检测。

## 6. Source Manifest 读写

manifest 路径：

```text
.pkwiki/source_manifest.json
```

读写规则：

- 文件不存在时创建 `{}`。
- 文件无法解析时报运行错误。
- 以 `sourceId` 为 key。
- 写入时保留其他已有记录。
- 第一版不做并发锁。

## 7. 重复 ingest 策略

第一版策略：

- 如果 checksum 已存在，返回已有 source 记录，不重复复制。
- 如果 sourceId 冲突但 checksum 不同，生成新的 sourceId。
- 如果 rawPath 冲突但内容不同，生成新的 raw 文件名。

这样可以避免用户多次丢同一个文件时产生冗余。

## 8. Extracted Source 模板

模板路径：

```text
extracted/sources/<source-id-file-name>.md
```

其中 `source-id-file-name` 将 `src:` 转为 `src-`，避免路径中使用冒号。

模板 frontmatter：

```yaml
---
source_id: src:...
source_file: raw/inbox/...
type: chat
domain: personal
status: pending
created: 2026-07-01T12:00:00+08:00
---
```

正文包含面向后续 Agent 的固定 section。

## 9. `pkwiki ingest` 命令

命令：

```bash
pkwiki ingest <file> --type <type> --domain <domain> [--title <title>] [--json]
```

参数规则：

- `<file>` 必需。
- `--type` 必需。
- `--domain` 必需。
- `--title` 可选。
- `--json` 可选。

执行流程：

1. 探测 Vault root。
2. 校验输入文件存在且是文件。
3. 读取 source manifest。
4. 计算 checksum。
5. 检查是否已有同 checksum 记录。
6. 生成 sourceId、rawPath、extractedPath。
7. 复制文件到 `raw/inbox/`。
8. 写 extracted template。
9. 更新 source manifest。
10. 输出结果。

## 10. Validator 增强

0002 中 `validate` 增加 source manifest 基础检查：

- `.pkwiki/source_manifest.json` 必须是 JSON 对象。
- manifest 中每条记录必须包含 `sourceId`、`rawPath`、`type`、`domain`、`checksum`、`status`。
- `rawPath` 指向文件不存在时报 warning。
- `extractedPath` 指向文件不存在时报 warning。

第一版不校验 source 是否已合并进 Wiki。

## 11. ESLint 配置

使用 flat config：

```text
eslint.config.js
```

检查范围：

- `packages/**/*.ts`
- `packages/**/*.mjs`
- `*.js`

忽略范围：

- `dist/`
- `node_modules/`
- `coverage/`
- `.git/`
- `templates/default-vault/`

规则原则：

- 不追求过度严格。
- 优先发现明显 bug、未使用变量、错误 promise、语法和类型相关问题。
- 测试文件允许 Node.js 全局对象。

## 12. package scripts

根目录：

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

各 package：

- 可以删除占位 lint，统一由根目录 lint。
- 或保留 `pnpm -w lint`，但避免递归循环。

推荐：根目录 `pnpm lint` 统一跑 ESLint；各 package 暂时不单独定义 lint。

## 13. 测试设计

新增测试：

- sourceId 生成。
- checksum 计算。
- manifest 读写。
- ingest 命令 JSON 输出。
- 重复 ingest 复用已有 source。
- validate source manifest 缺字段。

验证命令：

```bash
pnpm build
pnpm test
pnpm lint
```


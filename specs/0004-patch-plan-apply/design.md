# 0004 PatchPlan 与 apply-patch 设计

## 1. 设计原则

- Agent 表达意图，`pkwiki` 执行确定性修改。
- PatchPlan 是修改协议，不是 prompt。
- 第一版宁可保守拒绝，也不做模糊猜测。
- 修改必须可审查、可校验、可回滚。
- 不允许 PatchPlan 修改 Raw Source 或生成型 manifest/index。

## 2. 模块分工

```text
packages/patch
  PatchPlan 类型、解析、校验、操作应用、dry-run 结果。

packages/cli
  apply-patch 命令参数解析、输出格式和退出码。

packages/validator
  apply 后复用 validateVault。

packages/core
  复用 Vault root、checksum、路径工具。
```

如果不想新增 package，MVP 可先放在 `packages/core`，但推荐新增 `@pkwiki/patch`，避免 core 继续变大。

## 3. PatchPlan Schema

TypeScript 结构：

```ts
type PatchPlan = {
  version: "pkwiki.patch-plan/0.1";
  summary: string;
  sourceIds?: string[];
  createdBy?: string;
  createdAt?: string;
  notes?: string[];
  operations: PatchOperation[];
};
```

Operation：

```ts
type PatchOperation =
  | CreateMarkdownPageOperation
  | ReplaceTextOperation
  | AppendToSectionOperation
  | ReplaceSectionOperation;
```

公共字段：

```ts
type PatchOperationBase = {
  type: string;
  path: string;
  expectedChecksum?: string;
};
```

## 4. 文件路径策略

校验规则：

1. `path` 必须是相对路径。
2. `path` 不能包含空 segment、`.` 或 `..`。
3. `path` 必须以 `wiki/` 开头。
4. `path` 必须以 `.md` 结尾。
5. 解析后的绝对路径必须仍在 Vault root 内。

第一版只允许修改 `wiki/**/*.md`。

拒绝：

- `raw/**`
- `extracted/**`
- `.pkwiki/**`
- `outputs/**`
- `assets/**`
- `system/**`

## 5. 操作语义

### 5.1 create_markdown_page

流程：

1. 校验目标路径合法。
2. 校验文件不存在。
3. 校验 content 非空。
4. 校验 content 以 YAML frontmatter 开头。
5. dry-run 时只记录 planned change。
6. apply 时创建父目录并写入文件。

### 5.2 replace_text

流程：

1. 读取目标文件。
2. 校验 expectedChecksum。
3. 查找 `find` 的命中次数。
4. 命中次数不是 1 则失败。
5. 将唯一命中替换为 `replace`。

不支持：

- 正则。
- 多处替换。
- 忽略空白差异。

### 5.3 append_to_section

Section 定位：

- 只识别 ATX heading：`#` 到 `######`。
- heading 文本去掉收尾空格和尾部 `#`。
- heading 必须且只能命中一次。
- section 范围为该 heading 后，到下一个同级或更高级 heading 前。

追加规则：

- 如果 section body 末尾没有空行，先补一个空行。
- 追加 content。
- 文件末尾保留单个换行。

### 5.4 replace_section

替换规则：

- 保留 heading 行。
- 删除原 section body。
- 写入新的 content。
- 文件末尾保留单个换行。

## 6. Checksum 策略

`expectedChecksum` 是可选字段，但 Agent 应优先提供。

应用规则：

- 如果 operation 包含 `expectedChecksum`，当前文件 checksum 必须一致。
- checksum 不一致返回业务阻塞错误，退出码 1。
- `create_markdown_page` 不检查 checksum。

这样可以避免 Agent 基于过期 index 或过期上下文覆盖用户刚刚修改的页面。

## 7. 执行策略

PatchPlan 应用需要尽量接近事务语义：

1. 解析并校验整个 PatchPlan。
2. 读取所有目标文件。
3. 在内存中应用全部 operation。
4. 如果任一 operation 失败，不写入任何文件。
5. dry-run 不写入任何文件。
6. apply 成功后一次性写入所有 changed files。
7. apply 后运行 validate。

第一版不实现跨进程文件锁。

## 8. 输出结构

内部结果：

```ts
type ApplyPatchResult = {
  ok: boolean;
  vaultRoot: string;
  planPath: string;
  dryRun: boolean;
  operationCount: number;
  changedFiles: string[];
  validation?: ValidationResult;
};
```

失败结果：

```ts
type PatchPlanError = {
  code: string;
  message: string;
  path?: string;
  operationIndex?: number;
};
```

错误码第一版：

- `INVALID_PATCH_PLAN`
- `UNSUPPORTED_PATCH_VERSION`
- `UNSUPPORTED_OPERATION`
- `UNSAFE_PATCH_PATH`
- `TARGET_FILE_EXISTS`
- `TARGET_FILE_MISSING`
- `CHECKSUM_MISMATCH`
- `TEXT_MATCH_COUNT_MISMATCH`
- `HEADING_MATCH_COUNT_MISMATCH`
- `VALIDATION_FAILED`

## 9. CLI

命令：

```bash
pkwiki apply-patch <plan> [--dry-run] [--json]
```

参数：

- `<plan>`：PatchPlan JSON 文件。
- `--dry-run`：校验并预览，不写文件。
- `--json`：输出 JSON。

输出 human-readable：

- Vault root。
- PatchPlan path。
- Mode。
- Operation count。
- Changed files。
- Validation summary。

退出码：

- `0`：成功。
- `1`：业务规则阻塞。
- `2`：参数或运行错误。

## 10. Validate 集成

apply 成功后运行 `validateVault(vaultRoot)`。

规则：

- validate error 存在时，命令返回退出码 1。
- validate warning 不阻塞，但必须输出。
- dry-run 不运行实际写入后的 validate，但可以输出 planned changed files。

后续可增加 `--no-validate`，MVP 不提供，避免 Agent 绕过质量门禁。

## 11. 与 Index 的关系

apply-patch MVP 不自动运行 `pkwiki index`。

原因：

- index 是生成产物，自动刷新会扩大 diff。
- Human Maintainer 需要先审查 Wiki Page 内容变更。
- 后续可在 apply 后输出 `INDEX_STALE` 提示或增加 `--update-index`。

0004 中 apply 后如果 validate 出现 page manifest/index stale warning，不阻塞。

## 12. 测试设计

新增测试：

- PatchPlan JSON 解析。
- 不支持版本时报错。
- unsafe path 被拒绝。
- raw / `.pkwiki` / outputs 路径被拒绝。
- create_markdown_page 成功创建页面。
- replace_text 只允许唯一命中。
- append_to_section 能追加到正确 section。
- replace_section 能替换正文并保留 heading。
- expectedChecksum 不匹配时报错。
- dry-run 不写文件。
- apply 后 validate error 导致命令失败。
- CLI `apply-patch --json` 输出稳定。

验证命令：

```bash
pnpm build
pnpm test
pnpm lint
```

Dogfood：

- 在临时 Vault 创建低敏 Wiki Page。
- 生成 PatchPlan v0。
- dry-run 一次。
- apply 一次。
- validate 一次。
- 不对 `my-pkm-vault` 做真实内容 patch，除非 Human Maintainer 明确提供低敏目标页面。

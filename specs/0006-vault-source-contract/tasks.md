# 0006 Vault 与 Source 契约落地任务计划

## 1. Spec 与产品文档

- [x] 修订产品定位、架构和路线图。
- [x] 拆分 Source Processing Status 与 Source Lifecycle Status。
- [x] 同步 Vault Spec、Extracted Source Schema 和 Source-to-Wiki Merge。
- [x] 修订 0006 requirements、design 和 tasks。
- [x] 实现后检查文档示例与实际 JSON 输出一致。

## 2. Core 类型与兼容

- [x] 新增 `SourceProcessingStatus`。
- [x] 新增 `SourceLifecycleStatus`。
- [x] 保留 legacy `status: registered` 读取能力。
- [x] 实现 `normalizeSourceStatus`。
- [x] 拒绝不完整或冲突状态。
- [x] 保持旧 manifest 读取兼容。

## 3. Ingest Metadata

- [x] 读取输入文件 stat。
- [x] 写入 `originalName`。
- [x] 写入 `sizeBytes`。
- [x] 写入 `ingestedAt`。
- [x] 写入 `mtime`。
- [x] 写入 `processingStatus: registered`。
- [x] 写入 `lifecycleStatus: active`。
- [x] 写入默认 `privacy: private`。
- [x] 写入默认 `language: zh-CN`。
- [x] 重复 checksum 继续复用旧 entry。

## 4. CLI

- [x] 支持 `--privacy <privacy>`。
- [x] 支持 `--language <language>`。
- [x] 拒绝空字符串参数。
- [x] JSON 输出包含 v0.2 字段。
- [x] 人类可读输出保持简洁。

## 5. Extracted Source 模板

- [x] Frontmatter 使用 `raw_path`。
- [x] Frontmatter 包含 processing 和 lifecycle status。
- [x] Frontmatter 包含 privacy 和 language。
- [x] 模板包含正式标准章节。
- [x] Source 章节预填 metadata。
- [x] 模板不声称 extraction 或 merge 已完成。

## 6. Validator

- [x] 校验 Processing Status 枚举。
- [x] 校验 Lifecycle Status 枚举。
- [x] 校验 legacy status。
- [x] 校验新状态字段完整性和冲突。
- [x] 非 deleted Source 缺失 Raw 文件报告 warning。
- [x] deleted Source 缺失 Raw 文件不报告 missing warning。
- [x] deleted Source 仍有 Raw 文件报告 warning。
- [x] archived Source 继续检查 Raw 完整性。
- [x] checksum mismatch 报告 warning。
- [x] size mismatch 报告 warning。
- [x] 旧 entry 缺少 v0.2 可选 metadata 不报 error。

## 7. 默认 Vault 模板

- [x] 增加推荐 `MERGE_POLICY.md`。
- [x] 增加推荐 `STYLE_GUIDE.md`。
- [x] 统一 `PAGE_TYPES.md` 与产品文档。
- [x] 更新 `AGENTS.md` 和 `INGEST_RULES.md`。
- [x] 实现后确认新 init Vault 的规则文件完整。

## 8. 测试

- [x] Core 覆盖 v0.2 metadata 和双状态。
- [x] Core 覆盖 legacy status 归一化。
- [x] Core 覆盖状态不完整和冲突。
- [x] Core 覆盖 privacy/language 默认值和显式参数。
- [x] Core 覆盖 Extracted Source 模板。
- [x] Validator 覆盖双状态枚举和 legacy entry。
- [x] Validator 覆盖 active、archived、deleted。
- [x] Validator 覆盖 checksum 和 size mismatch。
- [x] CLI 覆盖 JSON 新字段和参数。

## 9. Dogfood

- [x] 用 `mock-sources/` 创建临时 Vault。
- [x] ingest 三份 mock source。
- [x] 检查 Source Manifest v0.2。
- [x] 检查 Extracted Source 模板。
- [x] 制造 checksum mismatch 并 validate。
- [x] 制造 deleted + Raw missing 并 validate。
- [x] 制造 merged + deleted 组合，确认双状态可表达。
- [x] 用 legacy fixture 确认兼容。
- [x] 确认 diff 可审查。

## 10. 验收

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm lint` 通过。
- [x] `pnpm -r lint` 通过。
- [x] `git diff --check` 通过。

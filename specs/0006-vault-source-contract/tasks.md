# 0006 Vault 与 Source 契约落地任务计划

## 1. Spec 与产品文档

- [x] 修订产品定位、架构和路线图。
- [x] 拆分 Source Processing Status 与 Source Lifecycle Status。
- [x] 同步 Vault Spec、Extracted Source Schema 和 Source-to-Wiki Merge。
- [x] 修订 0006 requirements、design 和 tasks。
- [ ] 实现后检查文档示例与实际 JSON 输出一致。

## 2. Core 类型与兼容

- [ ] 新增 `SourceProcessingStatus`。
- [ ] 新增 `SourceLifecycleStatus`。
- [ ] 保留 legacy `status: registered` 读取能力。
- [ ] 实现 `normalizeSourceStatus`。
- [ ] 拒绝不完整或冲突状态。
- [ ] 保持旧 manifest 读取兼容。

## 3. Ingest Metadata

- [ ] 读取输入文件 stat。
- [ ] 写入 `originalName`。
- [ ] 写入 `sizeBytes`。
- [ ] 写入 `ingestedAt`。
- [ ] 写入 `mtime`。
- [ ] 写入 `processingStatus: registered`。
- [ ] 写入 `lifecycleStatus: active`。
- [ ] 写入默认 `privacy: private`。
- [ ] 写入默认 `language: zh-CN`。
- [ ] 重复 checksum 继续复用旧 entry。

## 4. CLI

- [ ] 支持 `--privacy <privacy>`。
- [ ] 支持 `--language <language>`。
- [ ] 拒绝空字符串参数。
- [ ] JSON 输出包含 v0.2 字段。
- [ ] 人类可读输出保持简洁。

## 5. Extracted Source 模板

- [ ] Frontmatter 使用 `raw_path`。
- [ ] Frontmatter 包含 processing 和 lifecycle status。
- [ ] Frontmatter 包含 privacy 和 language。
- [ ] 模板包含正式标准章节。
- [ ] Source 章节预填 metadata。
- [ ] 模板不声称 extraction 或 merge 已完成。

## 6. Validator

- [ ] 校验 Processing Status 枚举。
- [ ] 校验 Lifecycle Status 枚举。
- [ ] 校验 legacy status。
- [ ] 校验新状态字段完整性和冲突。
- [ ] 非 deleted Source 缺失 Raw 文件报告 warning。
- [ ] deleted Source 缺失 Raw 文件不报告 missing warning。
- [ ] deleted Source 仍有 Raw 文件报告 warning。
- [ ] archived Source 继续检查 Raw 完整性。
- [ ] checksum mismatch 报告 warning。
- [ ] size mismatch 报告 warning。
- [ ] 旧 entry 缺少 v0.2 可选 metadata 不报 error。

## 7. 默认 Vault 模板

- [x] 增加推荐 `MERGE_POLICY.md`。
- [x] 增加推荐 `STYLE_GUIDE.md`。
- [x] 统一 `PAGE_TYPES.md` 与产品文档。
- [x] 更新 `AGENTS.md` 和 `INGEST_RULES.md`。
- [ ] 实现后确认新 init Vault 的规则文件完整。

## 8. 测试

- [ ] Core 覆盖 v0.2 metadata 和双状态。
- [ ] Core 覆盖 legacy status 归一化。
- [ ] Core 覆盖状态不完整和冲突。
- [ ] Core 覆盖 privacy/language 默认值和显式参数。
- [ ] Core 覆盖 Extracted Source 模板。
- [ ] Validator 覆盖双状态枚举和 legacy entry。
- [ ] Validator 覆盖 active、archived、deleted。
- [ ] Validator 覆盖 checksum 和 size mismatch。
- [ ] CLI 覆盖 JSON 新字段和参数。

## 9. Dogfood

- [ ] 用 `mock-sources/` 创建临时 Vault。
- [ ] ingest 三份 mock source。
- [ ] 检查 Source Manifest v0.2。
- [ ] 检查 Extracted Source 模板。
- [ ] 制造 checksum mismatch 并 validate。
- [ ] 制造 deleted + Raw missing 并 validate。
- [ ] 制造 merged + deleted 组合，确认双状态可表达。
- [ ] 用 legacy fixture 确认兼容。
- [ ] 确认 diff 可审查。

## 10. 验收

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm -r lint` 通过。
- [ ] `git diff --check` 通过。

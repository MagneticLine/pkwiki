# 0006 Vault 与 Source 契约落地任务计划

## 1. Spec 和文档

- [x] 创建 `0006-vault-source-contract` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 4 状态。
- [ ] 根据实现结果同步 `docs/VAULT_SPEC.md`。
- [ ] 根据实现结果同步 `docs/EXTRACTED_SOURCE_SCHEMA.md`。

## 2. Source Manifest 类型

- [ ] 扩展 `SourceStatus`：`registered`、`extracted`、`merged`、`archived`、`deleted`。
- [ ] 扩展 `SourceManifestEntry` 可选字段。
- [ ] 增加 `privacy` 和 `language` ingest options。
- [ ] 保持旧 manifest 读取兼容。

## 3. ingest 写入

- [ ] 读取输入文件 stat。
- [ ] 写入 `originalName`。
- [ ] 写入 `sizeBytes`。
- [ ] 写入 `ingestedAt`。
- [ ] 写入 `mtime`。
- [ ] 写入默认 `privacy: private`。
- [ ] 写入默认 `language: zh-CN`。
- [ ] 重复 ingest 继续按 checksum 复用。
- [ ] 更新 CLI `--json` 输出。
- [ ] 可选支持 `--privacy`。
- [ ] 可选支持 `--language`。

## 4. Extracted Source 模板

- [ ] frontmatter 使用 `raw_path`。
- [ ] frontmatter 包含 `privacy`。
- [ ] frontmatter 包含 `language`。
- [ ] 模板包含 `Source` 章节。
- [ ] 模板包含 `Normalized Content`。
- [ ] 模板包含 `Facts`、`Events`、`Entities`、`Decisions`、`Questions`。
- [ ] 模板包含 `Candidate Wiki Targets`。
- [ ] 模板包含 `Merge Coverage`。
- [ ] 模板包含 `Deferred`、`Discarded`、`User Confirmation Needed`。
- [ ] Source 章节预填 source metadata。

## 5. validate

- [ ] 校验 source status 枚举。
- [ ] 非法 status 报 `INVALID_SOURCE_STATUS`。
- [ ] 非 deleted source 缺失 raw 继续报 `RAW_SOURCE_MISSING`。
- [ ] deleted source 缺失 raw 不报 `RAW_SOURCE_MISSING`。
- [ ] deleted source 但 raw 仍存在时报 `DELETED_SOURCE_FILE_EXISTS`。
- [ ] raw checksum mismatch 报 `RAW_SOURCE_CHECKSUM_MISMATCH`。
- [ ] raw size mismatch 报 `RAW_SOURCE_SIZE_MISMATCH`。
- [ ] 老 manifest 缺少 v0.2 可选字段不报 error。

## 6. 测试

- [ ] core 测试覆盖 v0.2 source manifest 字段。
- [ ] core 测试覆盖 privacy/language 默认值。
- [ ] core 测试覆盖 Extracted Source 新模板。
- [ ] validator 测试覆盖 status 枚举。
- [ ] validator 测试覆盖 deleted raw missing。
- [ ] validator 测试覆盖 checksum mismatch。
- [ ] validator 测试覆盖 size mismatch。
- [ ] cli 测试覆盖 ingest JSON 新字段。
- [ ] cli 测试覆盖 privacy/language 参数，如实现。

## 7. Dogfood

- [ ] 用 `mock-sources/` 创建临时 Vault。
- [ ] ingest 三份 mock source。
- [ ] 检查 source manifest v0.2 字段。
- [ ] 检查 Extracted Source 模板。
- [ ] 手动制造 raw checksum mismatch 并 validate。
- [ ] 手动制造 deleted source raw missing 并 validate。
- [ ] 确认 diff 输出可审查。

## 8. 验收

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm -r lint` 通过。
- [ ] `git diff --check` 通过。

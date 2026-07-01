# 0002 Source Ingest 与质量门禁任务计划

## 1. Spec 和文档

- [x] 创建 `0002-source-ingest-quality-gate` Feature Spec。
- [ ] 更新 README 的 Feature Spec 索引。
- [ ] 更新 ROADMAP 阶段 2。
- [ ] 如新增术语，更新 CONTEXT.md。

## 2. ESLint 质量门禁

- [ ] 确认 ESLint 依赖版本。
- [ ] 创建 `eslint.config.js`。
- [ ] 配置 TypeScript lint。
- [ ] 配置 `.mjs` 测试文件 lint。
- [ ] 配置忽略目录。
- [ ] 将根目录 `lint` 脚本改为真实 ESLint。
- [ ] 去掉或修正各 package 的占位 lint 脚本。
- [ ] 修复现有 lint 问题。
- [ ] 确认 `pnpm lint` 失败时返回非 0。

## 3. Core Source 能力

- [ ] 定义 Source manifest 类型。
- [ ] 实现 source manifest 读写。
- [ ] 实现 SHA-256 checksum。
- [ ] 实现 sourceId 生成。
- [ ] 实现 raw 文件目标路径生成。
- [ ] 实现 extracted source 文件名生成。
- [ ] 实现重复 checksum 检测。
- [ ] 为 sourceId、checksum、manifest 补测试。

## 4. CLI ingest

- [ ] 扩展 CLI 参数解析，支持带值参数。
- [ ] 实现 `pkwiki ingest <file>`。
- [ ] 支持 `--type`。
- [ ] 支持 `--domain`。
- [ ] 支持 `--title`。
- [ ] 支持 `--json`。
- [ ] 复制文件到 `raw/inbox/`。
- [ ] 创建 Extracted Source 模板。
- [ ] 更新 source manifest。
- [ ] 输出 human-readable 结果。
- [ ] 输出 JSON 结果。
- [ ] 为 ingest 命令补集成测试。

## 5. Validator 增强

- [ ] 校验 source manifest 是 JSON 对象。
- [ ] 校验 manifest 记录必需字段。
- [ ] 检查 `rawPath` 是否存在。
- [ ] 检查 `extractedPath` 是否存在。
- [ ] 缺文件报 warning，不阻塞。
- [ ] 为 manifest 校验补测试。

## 6. Dogfood

- [ ] 准备低敏测试 source。
- [ ] 对临时 Vault 执行 `pkwiki ingest`。
- [ ] 对临时 Vault 执行 `pkwiki validate`。
- [ ] 对 `my-pkm-vault` 执行一次低敏 ingest。
- [ ] 确认 source manifest、raw copy、extracted template 符合预期。
- [ ] 记录发现的问题。

## 7. 验收

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm lint` 真实执行并通过。
- [ ] `pkwiki ingest` 可用。
- [ ] `pkwiki ingest --json` 可用。
- [ ] 重复 ingest 行为符合设计。
- [ ] `pkwiki validate` 能检查 source manifest。


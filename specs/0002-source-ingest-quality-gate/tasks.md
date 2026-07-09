# 0002 Source Ingest 与质量门禁任务计划

## 1. Spec 和文档

- [x] 创建 `0002-source-ingest-quality-gate` Feature Spec。
- [x] 更新 README 的 Feature Spec 索引。
- [x] 更新 ROADMAP 阶段 2。
- [x] 如新增术语，更新 CONTEXT.md。

## 2. ESLint 质量门禁

- [x] 确认 ESLint 依赖版本。
- [x] 创建 `eslint.config.js`。
- [x] 配置 TypeScript lint。
- [x] 配置 `.mjs` 测试文件 lint。
- [x] 配置忽略目录。
- [x] 将根目录 `lint` 脚本改为真实 ESLint。
- [x] 去掉或修正各 package 的占位 lint 脚本。
- [x] 修复现有 lint 问题。
- [x] 确认 `pnpm lint` 失败时返回非 0。

## 3. Core Source 能力

- [x] 定义 Source manifest 类型。
- [x] 实现 source manifest 读写。
- [x] 实现 SHA-256 checksum。
- [x] 实现 sourceId 生成。
- [x] 实现 raw 文件目标路径生成。
- [x] 实现 extracted source 文件名生成。
- [x] 实现重复 checksum 检测。
- [x] 为 sourceId、checksum、manifest 补测试。

## 4. CLI ingest

- [x] 扩展 CLI 参数解析，支持带值参数。
- [x] 实现 `pkwiki ingest <file>`。
- [x] 支持 `--type`。
- [x] 支持 `--domain`。
- [x] 支持 `--title`。
- [x] 支持 `--json`。
- [x] 复制文件到 `raw/inbox/`。
- [x] 创建 Extracted Source 模板。
- [x] 更新 source manifest。
- [x] 输出 human-readable 结果。
- [x] 输出 JSON 结果。
- [x] 为 ingest 命令补集成测试。

## 5. Validator 增强

- [x] 校验 source manifest 是 JSON 对象。
- [x] 校验 manifest 记录必需字段。
- [x] 检查 `rawPath` 是否存在。
- [x] 检查 `extractedPath` 是否存在。
- [x] 缺文件报 warning，不阻塞。
- [x] 为 manifest 校验补测试。

## 6. Dogfood

- [x] 准备低敏测试 source。
- [x] 对临时 Vault 执行 `pkwiki ingest`。
- [x] 对临时 Vault 执行 `pkwiki validate`。
- [x] 对 `my-pkm-vault` 执行一次低敏 ingest。
- [x] 确认 source manifest、raw copy、extracted template 符合预期。
- [x] 记录发现的问题。

## 7. 验收

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm lint` 真实执行并通过。
- [x] `pkwiki ingest` 可用。
- [x] `pkwiki ingest --json` 可用。
- [x] 重复 ingest 行为符合设计。
- [x] `pkwiki validate` 能检查 source manifest。

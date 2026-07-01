# 0001 CLI MVP 任务计划

## 1. 准备工作

- [x] 确认 pnpm workspace 可安装依赖。
- [x] 增加必要依赖：YAML 解析、Node 类型定义。
- [x] 确认包构建顺序和 TypeScript 配置。

## 2. `packages/core`

- [x] 定义 `PKWIKI_PROFILE`、`OKF_VERSION`。
- [x] 定义标准目录和必需文件列表。
- [x] 实现 `findVaultRoot(startPath)`。
- [x] 实现 `.pkwiki/config.json` 读取和解析。
- [x] 实现 Vault 路径解析。
- [x] 实现文件计数工具。
- [x] 为 root 探测和配置读取补测试。

## 3. `packages/validator`

- [x] 定义 `ValidationIssue`、`ValidationResult`。
- [x] 定义 error/warning code。
- [x] 实现 YAML frontmatter 解析。
- [x] 实现必需目录校验。
- [x] 实现必需文件校验。
- [x] 实现 Wiki Page frontmatter 校验。
- [x] 实现标准 Markdown link 提取。
- [x] 实现断链 warning。
- [x] 为 valid/missing/broken fixtures 补测试。

## 4. `packages/git`

- [x] 实现 Git 仓库识别。
- [x] 实现 `git status --short` 解析。
- [x] 定义 `GitStatusSummary`。
- [x] 在 Git 不存在或非 Git 仓库时返回稳定状态。

## 5. `packages/cli`

- [x] 接入 CLI 参数解析。
- [x] 实现 `pkwiki init <path>`。
- [x] 实现 `pkwiki init --force`。
- [x] 实现 `pkwiki init --git`。
- [x] 实现 `pkwiki status [path]`。
- [x] 实现 `pkwiki status --json`。
- [x] 实现 `pkwiki validate [path]`。
- [x] 实现 `pkwiki validate --json`。
- [x] 统一退出码：`0`、`1`、`2`。
- [x] 为 CLI 命令补最小集成测试。

## 6. 模板调整

- [x] 检查 `templates/default-vault` 是否包含所有必需目录。
- [x] 检查 `templates/default-vault` 是否包含所有必需文件。
- [x] 补齐模板中的 `.pkwiki/config.json` 和 manifest 空文件。
- [x] 确保模板生成后可通过 `validate`。

## 7. Dogfood

- [x] 在临时目录运行 `pkwiki init`。
- [x] 对临时 Vault 运行 `pkwiki status --json`。
- [x] 对临时 Vault 运行 `pkwiki validate --json`。
- [x] 对 `my-pkm-vault` 运行 `status`。
- [x] 对 `my-pkm-vault` 运行 `validate`。
- [x] 记录发现的问题，并决定是修模板、修校验，还是进入后续 spec。

## 8. 文档更新

- [x] 更新 `README.md` 的初始命令说明。
- [ ] 更新 `docs/ROADMAP.md` 的阶段 1 状态。
- [ ] 如实现中新增术语，更新 `CONTEXT.md`。
- [ ] 如出现难以逆转的架构取舍，再考虑 ADR。

## 9. 完成标准

- [x] `pnpm build` 通过。
- [x] `pnpm test` 通过。
- [x] `pkwiki init /tmp/test-vault` 可用。
- [x] `pkwiki status /tmp/test-vault --json` 可用。
- [x] `pkwiki validate /tmp/test-vault --json` 可用。
- [x] `my-pkm-vault` dogfood 结果可解释。

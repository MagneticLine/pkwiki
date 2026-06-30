# 0001 CLI MVP 任务计划

## 1. 准备工作

- [ ] 确认 pnpm workspace 可安装依赖。
- [ ] 增加必要依赖：CLI 参数解析、YAML 解析、测试框架。
- [ ] 确认包构建顺序和 TypeScript 配置。

## 2. `packages/core`

- [ ] 定义 `PKWIKI_PROFILE`、`OKF_VERSION`。
- [ ] 定义标准目录和必需文件列表。
- [ ] 实现 `findVaultRoot(startPath)`。
- [ ] 实现 `.pkwiki/config.json` 读取和解析。
- [ ] 实现 Vault 路径解析。
- [ ] 实现文件计数工具。
- [ ] 为 root 探测和配置读取补测试。

## 3. `packages/validator`

- [ ] 定义 `ValidationIssue`、`ValidationResult`。
- [ ] 定义 error/warning code。
- [ ] 实现 YAML frontmatter 解析。
- [ ] 实现必需目录校验。
- [ ] 实现必需文件校验。
- [ ] 实现 Wiki Page frontmatter 校验。
- [ ] 实现标准 Markdown link 提取。
- [ ] 实现断链 warning。
- [ ] 为 valid/missing/broken fixtures 补测试。

## 4. `packages/git`

- [ ] 实现 Git 仓库识别。
- [ ] 实现 `git status --short` 解析。
- [ ] 定义 `GitStatusSummary`。
- [ ] 在 Git 不存在或非 Git 仓库时返回稳定状态。

## 5. `packages/cli`

- [ ] 接入 CLI 参数解析。
- [ ] 实现 `pkwiki init <path>`。
- [ ] 实现 `pkwiki init --force`。
- [ ] 实现 `pkwiki init --git`。
- [ ] 实现 `pkwiki status [path]`。
- [ ] 实现 `pkwiki status --json`。
- [ ] 实现 `pkwiki validate [path]`。
- [ ] 实现 `pkwiki validate --json`。
- [ ] 统一退出码：`0`、`1`、`2`。
- [ ] 为 CLI 命令补最小集成测试。

## 6. 模板调整

- [ ] 检查 `templates/default-vault` 是否包含所有必需目录。
- [ ] 检查 `templates/default-vault` 是否包含所有必需文件。
- [ ] 补齐模板中的 `.pkwiki/config.json` 和 manifest 空文件。
- [ ] 确保模板生成后可通过 `validate`。

## 7. Dogfood

- [ ] 在临时目录运行 `pkwiki init`。
- [ ] 对临时 Vault 运行 `pkwiki status --json`。
- [ ] 对临时 Vault 运行 `pkwiki validate --json`。
- [ ] 对 `my-pkm-vault` 运行 `status`。
- [ ] 对 `my-pkm-vault` 运行 `validate`。
- [ ] 记录发现的问题，并决定是修模板、修校验，还是进入后续 spec。

## 8. 文档更新

- [ ] 更新 `README.md` 的初始命令说明。
- [ ] 更新 `docs/ROADMAP.md` 的阶段 1 状态。
- [ ] 如实现中新增术语，更新 `CONTEXT.md`。
- [ ] 如出现难以逆转的架构取舍，再考虑 ADR。

## 9. 完成标准

- [ ] `pnpm build` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pkwiki init /tmp/test-vault` 可用。
- [ ] `pkwiki status /tmp/test-vault --json` 可用。
- [ ] `pkwiki validate /tmp/test-vault --json` 可用。
- [ ] `my-pkm-vault` dogfood 结果可解释。


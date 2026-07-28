# pkwiki vault

这个 Vault 由 `pkwiki` 默认模板生成。

- `raw/` 保存原始素材。
- `extracted/` 保存归一化和提取工作层。
- `wiki/` 保存长期 Markdown Wiki。
- `system/` 保存 Human Maintainer 管理的规则。
- `.pkwiki/` 保存配置、manifest 和后续运行记录。
- `outputs/` 保存可再生成索引、报告和发布产物。

Agent 工作前应读取 `AGENTS.md`、`SCHEMA.md` 和 `system/` 中适用的规则。

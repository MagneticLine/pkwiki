# Wiki Schema

这个 Vault 使用 `pkwiki/0.1` profile，Wiki 层以 OKF v0.1 作为外部兼容目标。

知识真相源是 `wiki/**/*.md`，原始证据位于 `raw/`，归一化和提取工作层位于 `extracted/`。

每个 Wiki Page 必须包含合法 YAML frontmatter、稳定 page id、privacy、confidence 和 Source 引用。

详细规则见：

- `system/PAGE_TYPES.md`
- `system/MERGE_POLICY.md`
- `system/STYLE_GUIDE.md`
- `system/PRIVACY_RULES.md`
- `system/INGEST_RULES.md`
- `system/LINT_RULES.md`

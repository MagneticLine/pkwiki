# Ingest Pipeline

摄入流程采用编译器式流水线：

1. 注册 source。
2. 归一化为 extracted Markdown。
3. 对大 source 分块。
4. 提取 facts、entities、events、decisions、questions 和 uncertainty。
5. 合并为 source summary。
6. 分析受影响的 Wiki 页面。
7. 生成 patch plan。
8. 应用 patch。
9. 校验。
10. 查看 diff 并提交。

详细契约见：

- [Vault Spec](VAULT_SPEC.md)
- [Extracted Source Schema](EXTRACTED_SOURCE_SCHEMA.md)
- [Source-to-Wiki Merge](SOURCE_TO_WIKI_MERGE.md)

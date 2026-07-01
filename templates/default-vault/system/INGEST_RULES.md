# 摄入规则

1. 为每个 Raw Source 注册稳定的 `source_id`。
2. 原始文件保留在 `raw/` 下。
3. 将 source 内容归一化到 `extracted/`。
4. 大 source 在交给 Agent 前先分块。
5. 只更新受影响的 Wiki Page。
6. 优先使用 section 级 patch。
7. 查看 diff 前先校验。


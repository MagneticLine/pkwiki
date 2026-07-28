# 摄入规则

1. 为每个 Raw Source 注册稳定 Source ID。
2. 保留 Raw Source 原始内容和 checksum。
3. 在 Extracted Source 中完成 normalize、chunk、extraction 和 uncertainty 记录。
4. 为重要 Information Item 分配稳定 Item ID，并保留 evidence。
5. 先搜索和读取少量 Candidate Wiki Page，再生成 MergePlan。
6. 每个重要 Item 必须进入 Merge Coverage。
7. 优先使用 section 级 PatchPlan，避免无关改写。
8. 应用后运行 validate、index 和 diff。
9. Human Maintainer 审查后再决定 commit 和 push。

# Agent Harness

Agent 不应自由重写整个 vault。

推荐流程：

1. 搜索并读取少量 source 和目标页面。
2. 生成结构化 patch plan。
3. 由 `pkwiki` 应用 patch。
4. 运行 validate 和 lint。
5. 查看 git diff。
6. 人确认后再 commit。

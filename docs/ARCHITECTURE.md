# 架构

`pkwiki` 分为三层：

1. 内容层：由人和 Agent 共同维护的私密 Markdown vault。
2. 确定性工具层：校验、索引、Patch、Git 辅助。
3. Agent 层：Claude Code、OpenClaw、Pi 或 MCP 客户端调用工具。

文件系统是真相源，Git 负责历史和审查。

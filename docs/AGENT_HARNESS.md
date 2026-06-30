# Agent Harness

Agent Harness 是 `pkwiki` 面向 Wiki 维护场景提供的质量适配层。

它的目标不是替代 Agent Runtime，而是让 Claude Code、OpenClaw、Pi 或 MCP 客户端在维护 Vault 时有稳定、可验证、可审查的操作边界。

## 原则

- Agent 不应自由重写整个 Vault。
- Agent 应先读取状态，再规划修改。
- Agent 应通过受控结构表达修改意图。
- 实质修改后必须校验。
- 重要修改必须能通过 Git diff 审查。
- Harness 应随着真实 dogfood 反馈持续演进。

## 推荐流程

1. 搜索并读取少量 source 和目标页面。
2. 生成结构化 patch plan。
3. 由 `pkwiki` 应用 patch。
4. 运行 validate 和 lint。
5. 查看 git diff。
6. 人确认后再 commit。

## 能力方向

Harness 后续需要围绕 Wiki 场景补足 Agent 的能力短板：

- **定位能力**：根据 Raw Source、Extracted Source、frontmatter、manifest、目录和 Markdown links 找到候选 Wiki Page。
- **完整性检查**：判断素材中的重要 facts、entities、decisions、questions 是否已进入 Wiki 或明确留在 Extracted Source。
- **引用检查**：检查新增事实是否能追溯到 `source_id`。
- **级联修改检查**：当一个 Source 影响多个页面时，检查相关页面、反向链接和索引是否一致。
- **矛盾检查**：发现新旧 claim 冲突时，不直接覆盖，而是提示 Agent 生成决策或待确认问题。
- **页面健康检查**：识别过长页面、重复页面、孤儿页面、断链和过期页面。
- **变更审查**：让 Human Maintainer 可以通过 diff 理解 Agent 修改了什么。

## 迭代方式

这些能力不应一次性设计完。更现实的方式是：

1. 先实现 `init/status/validate`，建立 Vault 契约。
2. 用 `my-pkm-vault` 做 dogfood。
3. 在真实素材摄入中记录 Agent 失败模式。
4. 把高频失败模式固化为新的 validate、index、manifest 或 PatchPlan 规则。
5. 必要时参考其他 LLM Wiki、coding agent、knowledge graph 和文档维护工具的做法。

因此，Harness 的具体机制会边做边收敛，但它的边界必须稳定：它约束和增强 Agent，不绑定某个 Agent Runtime，也不替 Human Maintainer 做最终判断。

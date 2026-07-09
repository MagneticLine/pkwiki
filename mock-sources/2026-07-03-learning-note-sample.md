# 学习笔记样本 — AI Agent 工具链入门

> 页面类型：LearningMap
> 主题：AI Agent 工具链
> 掌握程度：入门实践阶段
> 最后更新：2026-07-03
> 关联 Project：pkwiki

---

## 主题概述

学习如何构建以 AI Agent 为核心的个人工具链，重点关注：

- Agent 的感知-决策-执行循环
- 本地模型的部署与调用
- 工具（Tool）定义与编排模式
- 低敏数据处理流程

---

## 前置知识

- [x] 基础 LLM 使用经验（Prompt Engineering）
- [x] REST API 设计基础
- [x] 文件系统操作
- [ ] LangChain / LlamaIndex 框架使用
- [ ] Function Calling 深入
- [ ] MCP（Model Context Protocol）规范

---

## 核心概念笔记

### 1. Agent 的三大组件

| 组件 | 职责 | 常见实现 |
|------|------|---------|
| LLM Brain | 推理、决策 | Claude / GPT / 本地 7B-13B 模型 |
| Memory | 短期+长期记忆 | 向量数据库 / 文件索引 |
| Tools | 可执行能力 | 函数定义、API 调用、CLI 命令 |

**学习心得**：本地优先的关键不是"不用云服务器"，而是"敏感数据不出本机"。LLM 调用的安全性取决于 prompt 内容的可见范围。

### 2. Tool Use 模式

两种主流模式：

- **ReAct**：Reasoning + Acting 交替，每次思考后选工具
- **Plan-and-Execute**：先规划完整步骤，再批量执行

对于个人知识库场景，Plan-and-Execute 更适合批量处理任务，ReAct 更适合交互式实时问答。

### 3. 来源引用（Source Attribution）

每个 AI 生成的结论应保留其引用的原始来源。本次学习的关键来源：

- [OpenAI Function Calling 文档](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use 指南](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [LocalAI 项目](https://github.com/mudler/LocalAI)

---

## 实践练习

### 练习 1：实现一个简单的工具调用循环

已完成。使用 Node.js 实现了 ReAct 模式的 demo：
- 输入自然语言问题 → LLM 决定调用哪个工具 → 执行工具并将结果反馈给 LLM → 生成最终答案

### 练习 2：聊天记录解析为结构化 wiki

进行中。目标：将 AI 对话中的"决策"、"项目信息"、"学习要点"自动提取并写入对应页面类型。

当前卡点：如何区分"日常闲聊"和"有价值的知识沉淀"——尝试用置信度阈值 + 人工确认的组合策略。

### 练习 3：本地模型选型

待开始。候选方案：Ollama + qwen2.5-7b / llamacpp + mistral-7b。

---

## 掌握程度自评

| 维度 | 等级 | 说明 |
|------|------|------|
| 概念理解 | ★★★☆☆ | 知道 Agent 是什么，了解核心循环 |
| 工程实践 | ★★☆☆☆ | 跑通了 demo，尚未用于生产场景 |
| 低敏设计 | ★★★☆☆ | 有清晰原则，实践验证中 |
| 工具选型 | ★★☆☆☆ | 初步了解，还没深入比较 |

---

## 关联页面

- **pkwiki Project 页面**：当前实践的主要载体
- **Decision 记录#2026-07-03**：关于页面类型划分的决策
- **CareerMaterial 简历摘要**：相关技能已更新到公共档案

---

## 下一步计划

1. 完成 pkwiki 的聊天记录解析 MVP
2. 试跑 Ollama + qwen2.5-7b 的 Function Calling 场景
3. 阅读 MCP 规范文档，评估是否采用作为工具协议标准

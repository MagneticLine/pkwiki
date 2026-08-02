# 0010 Agent Harness MVP 任务

## 1. Spec 与基线

- [x] 固定阶段 5 产品范围和非目标。
- [x] 定义 Harness Core 与 Runtime Adapter 边界。
- [x] 定义四个 MVP workflow。
- [x] 定义审批、安全、错误和验收边界。
- [x] 验证第一 OpenAI-compatible Provider 的 models、chat、tool call、stream 和 usage。
- [x] 确认 Node 环境满足 Pi 版本要求。
- [ ] 确认自定义模型 contextWindow 和 maxTokens。

## 2. Harness Foundation

- [ ] 清理 `packages/agent` 占位类型。
- [ ] 实现 ModelConfig 和脱敏 summary。
- [ ] 实现 HarnessError 和错误分类。
- [ ] 实现 RuntimeAdapter contract。
- [ ] 实现 RuntimeEvent 类型。
- [ ] 实现 FakeRuntime。
- [ ] 实现 Run schema 和 parser。
- [ ] 实现 RunStore 原子读写。
- [ ] 实现状态迁移和 resume 规则。
- [ ] 增加真实 agent test script。

## 3. Pi Runtime Adapter

- [ ] 安装并固定 `@earendil-works/pi-coding-agent@0.82.1`。
- [ ] 实现 Pi model/provider 注册。
- [ ] 映射 `xhigh` 到 Provider `max`。
- [ ] 禁用全部 Pi 默认 tools。
- [ ] 注册 pkwiki submit tools。
- [ ] 映射 Pi event 到 RuntimeEvent。
- [ ] 实现 timeout 和 abort。
- [ ] 实现 usage 和安全错误映射。
- [ ] 验证 API Key 不进入日志和 artifact。

## 4. Structured Output

- [ ] 定义 `submit_extraction` schema。
- [ ] 定义 `submit_merge_plan` schema。
- [ ] 定义 `submit_patch_plan` schema。
- [ ] 定义 `submit_query_answer` schema。
- [ ] 复用现有 parser 二次校验。
- [ ] 实现最多两次修复重试。
- [ ] 拒绝多个互相冲突的提交 tool call。

## 5. Plan Ingest

- [ ] 实现 Source preflight。
- [ ] 自动复用或生成 chunk。
- [ ] 构建 extraction prompt/context。
- [ ] 生成并登记 Extraction Artifact。
- [ ] 构建 merge Context Pack。
- [ ] 生成并登记 MergePlan。
- [ ] 写入 Run artifact 和 usage。
- [ ] 停在 merge plan approval。

## 6. Merge

- [ ] 实现 MergePlan 审批 artifact。
- [ ] 审批时校验计划 checksum。
- [ ] 生成 PatchPlan。
- [ ] 校验 PatchPlan 与 candidateTargets 范围。
- [ ] 执行 dry-run 并生成审查摘要。
- [ ] 实现 patch apply 二次审批。
- [ ] 编排 apply、validate、index 和 diff。
- [ ] 检查无关文件修改。
- [ ] finalize coverage 和 Run。
- [ ] 保证不自动 commit 或 push。

## 7. Query

- [ ] 构建 query Context Request。
- [ ] 生成带引用 Query Answer。
- [ ] 校验 Page/Source citation。
- [ ] 保存 context、answer 和 usage。
- [ ] 保持 workflow 全程只读。
- [ ] 输出 suggested file-back。

## 8. File-back

- [ ] 从 Query Answer 生成 Source 候选。
- [ ] 展示内容和隐私级别。
- [ ] 实现显式审批。
- [ ] ingest 新 Source。
- [ ] 把新 Source ID 写回原 Run。
- [ ] 不直接修改 Wiki。

## 9. CLI

- [ ] 冻结 `pkwiki agent` 子命令和参数。
- [ ] 实现 plan-ingest。
- [ ] 实现 merge plan approval。
- [ ] 实现 patch apply approval。
- [ ] 实现 query。
- [ ] 实现 file-back。
- [ ] 实现 run status。
- [ ] 支持稳定 JSON 输出和下一步命令。
- [ ] 支持流式人类可读进度。

## 10. 测试与 Eval

- [ ] Config、RunStore、状态机和错误单元测试。
- [ ] FakeRuntime workflow 集成测试。
- [ ] Pi Adapter contract 测试。
- [ ] Approval 正反例。
- [ ] Provider timeout、鉴权和非法输出测试。
- [ ] Secret 泄漏扫描。
- [ ] 使用低敏 mock source 完成 plan-ingest/merge。
- [ ] 完成带引用 query。
- [ ] 完成 file-back 后再次 plan-ingest。
- [ ] 审查 coverage、diff 和 Run Record。

## 11. 文档与验收

- [ ] 更新 Agent Harness、Architecture、Vault Spec 和 Roadmap。
- [ ] 补充本地模型配置示例，不包含真实 Key 或内部地址。
- [ ] build、test、lint 和 `git diff --check` 通过。
- [ ] 阶段 5 端到端低敏验收通过。
- [ ] 提供中文 commit message 参考。

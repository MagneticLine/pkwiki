# 0007 Extraction 与 Chunk Contract 任务

## 1. Spec

- [x] 定义 Chunk Contract。
- [x] 定义 Extraction Artifact v0.1。
- [x] 明确机器真相源与 Markdown 审查视图。
- [x] 明确无 LLM 边界。

## 2. Core

- [x] 实现 Chunk 类型和 manifest 读写。
- [x] 实现稳定 Chunk ID 和路径。
- [x] 实现 paragraph/line/character 分块。
- [x] 实现 chunk 原子替换。
- [x] 实现 Extraction Artifact parser。
- [x] 实现 evidence 和 Item ID 校验。
- [x] 实现 extraction 登记和 Markdown 渲染。
- [x] 推进 Source status 到 extracted。

## 3. Validator

- [x] 校验 Chunk Manifest 字段和引用。
- [x] 校验 chunk 文件 checksum。
- [x] 校验 sourceChecksum stale。
- [x] 校验 Extraction Artifact。
- [x] 校验 extracted 状态与 artifact 是否一致。

## 4. CLI

- [x] 实现 `pkwiki chunk`。
- [x] 支持 `--max-chars` 和 `--json`。
- [x] 实现 `pkwiki register-extraction`。
- [x] 增加 help 和人类可读输出。

## 5. 测试

- [x] Core 覆盖稳定分块和超长 block。
- [x] Core 覆盖重跑替换。
- [x] Core 覆盖 artifact 正反例。
- [x] Validator 覆盖 stale 和 missing。
- [x] CLI 覆盖两个新命令。

## 6. Dogfood

- [x] 对三份 mock source 执行 chunk。
- [x] 登记至少两份低敏 extraction artifact。
- [x] 验证 Markdown 视图和 status。
- [x] 制造 stale chunk 和 invalid evidence。
- [x] 检查 diff 范围。

## 7. 验收

- [x] build、test、lint 通过。
- [x] `git diff --check` 通过。
- [x] 文档和实际 JSON 输出一致。

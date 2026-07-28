# 0009 Search 与 Context Pack 任务

## 1. Spec

- [x] 定义 list/read/search 接口。
- [x] 定义 Search 评分。
- [x] 定义 Context Request/Pack v0.1。
- [x] 定义预算和链接扩展。

## 2. Search Package

- [x] 创建 `packages/search`。
- [x] 实现 list pages。
- [x] 实现安全 read page。
- [x] 实现确定性 search 和 excerpt。
- [x] 实现 Context Request parser。
- [x] 实现 Source context。
- [x] 实现 link traversal。
- [x] 实现 page/char budget。
- [x] 写入 Context Pack。

## 3. CLI

- [x] 实现 `list-pages`。
- [x] 实现 `read-page`。
- [x] 实现 `search` 和 `--limit`。
- [x] 实现 `build-context`。

## 4. Validator

- [x] 校验 Context Pack schema。
- [x] 校验 Source 和 Page 引用。
- [x] Page checksum stale 报 warning。

## 5. 测试

- [x] Search 多字段评分和稳定排序。
- [x] 安全 path 正反例。
- [x] Context budget 和 linkDepth。
- [x] Source extraction context。
- [x] CLI 和 Validator 回归。

## 6. Dogfood

- [x] 用 mock Wiki Page 测试 title/tag/source/body 搜索。
- [x] 为 0008 merge run 构建 Context Pack。
- [x] 验证链接扩展和预算截断。
- [x] 篡改页面验证 stale warning。
- [x] 检查 diff 范围。

## 7. 验收

- [x] build、test、lint 通过。
- [x] `git diff --check` 通过。
- [x] 阶段 4 集成测试可消费 Context Pack。

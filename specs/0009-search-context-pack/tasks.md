# 0009 Search 与 Context Pack 任务

## 1. Spec

- [x] 定义 list/read/search 接口。
- [x] 定义 Search 评分。
- [x] 定义 Context Request/Pack v0.1。
- [x] 定义预算和链接扩展。

## 2. Search Package

- [ ] 创建 `packages/search`。
- [ ] 实现 list pages。
- [ ] 实现安全 read page。
- [ ] 实现确定性 search 和 excerpt。
- [ ] 实现 Context Request parser。
- [ ] 实现 Source context。
- [ ] 实现 link traversal。
- [ ] 实现 page/char budget。
- [ ] 写入 Context Pack。

## 3. CLI

- [ ] 实现 `list-pages`。
- [ ] 实现 `read-page`。
- [ ] 实现 `search` 和 `--limit`。
- [ ] 实现 `build-context`。

## 4. Validator

- [ ] 校验 Context Pack schema。
- [ ] 校验 Source 和 Page 引用。
- [ ] Page checksum stale 报 warning。

## 5. 测试

- [ ] Search 多字段评分和稳定排序。
- [ ] 安全 path 正反例。
- [ ] Context budget 和 linkDepth。
- [ ] Source extraction context。
- [ ] CLI 和 Validator 回归。

## 6. Dogfood

- [ ] 用 mock Wiki Page 测试 title/tag/source/body 搜索。
- [ ] 为 0008 merge run 构建 Context Pack。
- [ ] 验证链接扩展和预算截断。
- [ ] 篡改页面验证 stale warning。
- [ ] 检查 diff 范围。

## 7. 验收

- [ ] build、test、lint 通过。
- [ ] `git diff --check` 通过。
- [ ] 阶段 4 集成测试可消费 Context Pack。

# 协作指南

本仓库可以独立克隆、构建和测试。协作者不需要 `my-pkm-vault`、本地参考资料或真实模型凭据。

## 开发环境

- Git。
- Node.js 22.20.0，版本记录在 `.node-version`；支持范围为 Node 22.13 以上的 22.x。
- Corepack 和 pnpm 9.0.0，版本记录在 `package.json`。以下命令显式使用该版本，避免全局 pnpm 版本冲突。

```bash
git clone https://github.com/MagneticLine/pkwiki.git
cd pkwiki
corepack pnpm@9.0.0 install --frozen-lockfile --registry=https://registry.npmjs.org/
corepack pnpm@9.0.0 test
corepack pnpm@9.0.0 lint
```

`test` 包含构建。测试使用临时目录和 FakeRuntime，不需要 API Key；MCP/Web 包仍是占位，不能将其测试脚本视为功能验收。三平台 CI 覆盖 Windows、macOS 和 Linux，是否通过以实际运行结果为准。

若 Corepack 不可用，先检查 Node 安装是否包含 Corepack。不要为解决安装失败而删除锁文件或使用 `--no-lockfile`。网络受限时可以把上述安装命令的 registry 改为组织信任的镜像，保留 `--frozen-lockfile`。锁文件保留版本和 integrity，不固定公司内网下载地址。

迁移整个目录后，`node_modules` 中的绝对链接和命令 shim 可能仍指向旧位置。需要重新安装依赖，不要把旧目录的构建成功视为新目录验收。出现权限错误应停止，由本机用户处理；不要绕过权限或随意递归删除目录。

## 本地试用

构建后，在仓库外创建独立测试 Vault：

```bash
node packages/cli/dist/index.js init ../pkwiki-demo-vault
node packages/cli/dist/index.js status ../pkwiki-demo-vault --json
node packages/cli/dist/index.js validate ../pkwiki-demo-vault --json
```

使用 `templates/default-vault` 和 `mock-sources` 中的低敏素材。真实数据、API Key、`.env.local`、运行记录和私密 Git 历史不得进入本仓库。真实模型联调需要单独配置，参见 `.env.example` 和 `docs/AGENT_HARNESS.md`；目前真实模型超时与取消仍待验收。

## 分支与审查

当前 Harness 开发基线在 `feature/wangzhiyuan36-20260728/agent-harness-mvp`，不要假定 `main` 包含这些实现。首次协作先与维护者确认基线，待相关改动推送后再拉取。

从约定基线创建自己的 `feature/<用户名>-<YYYYMMDD>/<主题>` 分支，通过 Pull Request 协作。不要直接改写他人分支或强制推送。提交说明、文档和注释使用中文。

功能开发遵循 `specs/<编号-主题>/requirements.md`、`design.md`、`tasks.md`：先明确边界和验收，再实现与测试。产品阶段只在 `docs/ROADMAP.md` 维护，不另建一套路线图。

提交前运行上述 test、lint 和 `git diff --check`，审查新增文件、隐私信息以及不必要的生成产物。PR 说明应包含改动范围、验证结果、已知限制和关联 Spec。Agent 未经明确要求不 commit、不 push；遇到 Git 或权限错误立即停止并交由用户处理。

## 跨平台与文件安全

- 持久化的 Vault 相对路径统一使用 `/`；文件系统访问使用 Node 路径 API。
- 从模块 URL 获取本机路径使用 `fileURLToPath`，不要直接取 `.pathname`。
- 文本采用 UTF-8；`.gitattributes` 统一普通文本换行，但保留 Raw fixture 的原始字节，避免影响 checksum。
- PowerShell 读取中文文件时显式使用 `Get-Content -Encoding UTF8`。Agent 编辑文件只用 `apply_patch`，发现乱码立即停止，不通过终端字符串覆盖文件。

`DEVELOPMENT_HANDOFF.md` 是历史迁移记录；当前入口以 README、本指南和路线图为准。

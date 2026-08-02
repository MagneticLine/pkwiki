import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Type } from "typebox";
import { ingestSource } from "@pkwiki/core";
import {
  AgentHarness,
  FakeRuntimeAdapter,
  HarnessError,
  RunStore,
  generateStructured,
  loadModelConfig,
  summarizeModelConfig,
} from "../dist/index.js";

const CLI_PATH = new URL("../../cli/dist/index.js", import.meta.url).pathname;

test("GPT-5.6 Luna 使用 Pi 官方容量且配置摘要不包含密钥", () => {
  const config = loadModelConfig({
    PKWIKI_MODEL_PROVIDER: "test-provider",
    PKWIKI_MODEL_BASE_URL: "https://example.test/v1",
    PKWIKI_MODEL_API: "openai-completions",
    PKWIKI_MODEL_API_KEY: "test-secret-key",
    PKWIKI_MODEL_NAME: "gpt-5.6-luna",
    PKWIKI_MODEL_REASONING_EFFORT: "max",
  });
  assert.equal(config.contextWindow, 272000);
  assert.equal(config.maxTokens, 128000);
  assert.equal(config.apiKey.toString(), "[REDACTED]");
  assert.equal(JSON.stringify(summarizeModelConfig(config)).includes("test-secret-key"), false);
});

test("未知模型必须显式提供容量", () => {
  assert.throws(
    () =>
      loadModelConfig({
        PKWIKI_MODEL_PROVIDER: "test-provider",
        PKWIKI_MODEL_BASE_URL: "https://example.test/v1",
        PKWIKI_MODEL_API: "openai-completions",
        PKWIKI_MODEL_API_KEY: "test-secret-key",
        PKWIKI_MODEL_NAME: "custom-model",
        PKWIKI_MODEL_REASONING_EFFORT: "max",
      }),
    (error) => error instanceof HarnessError && error.code === "MODEL_CONFIG_INVALID",
  );
});

test("结构化输出失败后最多按约定修复重试", async () => {
  const runtime = new FakeRuntimeAdapter([
    [{ type: "completed" }],
    [
      { type: "tool_call", name: "submit_test", input: { value: "ok" } },
      usageEvent(),
      { type: "completed" },
    ],
  ]);
  const result = await generateStructured({
    adapter: runtime,
    request: {
      runId: "run:test-retry",
      systemPrompt: "test",
      messages: [{ role: "user", content: "submit" }],
      tools: [
        {
          name: "submit_test",
          description: "test",
          parameters: Type.Object({ value: Type.String() }),
        },
      ],
      thinkingLevel: "max",
      timeoutMs: 1000,
    },
    expectedTool: "submit_test",
    parse: (value) => value,
  });
  assert.equal(result.attempts, 2);
  assert.match(runtime.requests[1].messages.at(-1).content, /上一次结构化输出无效/);
});

test("审批后 artifact 改变会被判定为 stale", () => {
  const fixture = createVaultFixture();
  try {
    const store = new RunStore(fixture.vault);
    const run = store.create({ workflow: "query", adapter: "fake" });
    store.writeArtifact(run.runId, "query-answer.json", { answer: "before" });
    store.recordApproval({
      runId: run.runId,
      checkpoint: "file-back",
      artifact: "query-answer.json",
      status: "approved",
    });
    writeFileSync(
      join(store.absoluteRunDirectory(run.runId), "query-answer.json"),
      '{"answer":"after"}\n',
      "utf8",
    );
    assert.throws(
      () => store.assertApproval(run.runId, "file-back"),
      (error) => error instanceof HarnessError && error.code === "APPROVAL_STALE",
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("FakeRuntime 完成 plan-ingest、两次审批、query 和 file-back", async () => {
  const fixture = createVaultFixture();
  try {
    const sourceFile = join(fixture.root, "source.md");
    writeFileSync(
      sourceFile,
      "# Harness 学习记录\n\n我决定使用结构化计划和两次人工审批维护个人 Wiki。\n",
      "utf8",
    );
    const source = ingestSource(fixture.vault, sourceFile, {
      type: "note",
      domain: "learning",
      privacy: "private",
      title: "Harness 学习记录",
      now: new Date("2026-07-28T08:00:00.000Z"),
    });
    commitVault(fixture.vault, "test: 初始化低敏 source");

    let fileBackSourceId;
    const runtime = new FakeRuntimeAdapter([
      extractionScript(() => source.sourceId, () => source.checksum),
      mergePlanScript(() => source.sourceId, "fact:harness-approval"),
      patchPlanScript(() => source.sourceId),
      queryAnswerScript(),
      extractionScript(() => fileBackSourceId, () => {
        const manifest = JSON.parse(
          readFileSync(join(fixture.vault, ".pkwiki/source_manifest.json"), "utf8"),
        );
        return manifest[fileBackSourceId].checksum;
      }),
      mergePlanScript(() => fileBackSourceId, "fact:harness-approval", "update"),
    ]);
    const harness = new AgentHarness(fixture.vault, runtime, {
      provider: "fake",
      baseUrl: "https://example.test/v1",
      api: "openai-completions",
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      contextWindow: 272000,
      maxTokens: 128000,
    });

    const planned = await harness.planIngest(source.sourceId);
    assert.equal(planned.status, "awaiting_approval");
    assert.equal(planned.approvalRequired, "merge-plan");

    const patchReady = await harness.merge({
      runId: planned.runId,
      approve: "merge-plan",
    });
    assert.equal(patchReady.approvalRequired, "patch-apply");

    const merged = await harness.merge({
      runId: planned.runId,
      approve: "patch-apply",
    });
    assert.equal(merged.status, "completed");
    assert.match(
      readFileSync(join(fixture.vault, "wiki/learning/harness-testing.md"), "utf8"),
      /结构化计划/,
    );

    const queried = await harness.query("Harness 为什么需要两次审批？");
    assert.equal(queried.status, "completed");
    const answer = JSON.parse(
      readFileSync(
        join(fixture.vault, `.pkwiki/runs/${queried.runId.replaceAll(":", "-")}/query-answer.json`),
        "utf8",
      ),
    );
    assert.equal(answer.claims[0].citations[0].kind, "page");

    const fileBackCandidate = harness.fileBack({
      runId: queried.runId,
      domain: "learning",
      privacy: "private",
    });
    assert.equal(fileBackCandidate.approvalRequired, "file-back");
    const fileBack = harness.fileBack({
      runId: fileBackCandidate.runId,
      approve: true,
    });
    assert.equal(fileBack.status, "completed");
    fileBackSourceId = harness.store.read(fileBack.runId).sourceIds[0];
    assert.ok(fileBackSourceId.startsWith("src:"));

    commitVault(fixture.vault, "test: 固化第一轮 Harness 结果");
    const replanned = await harness.planIngest(fileBackSourceId);
    assert.equal(replanned.approvalRequired, "merge-plan");

    const runText = readFileSync(
      join(fixture.vault, `.pkwiki/runs/${planned.runId.replaceAll(":", "-")}/run.json`),
      "utf8",
    );
    assert.equal(runText.includes("test-secret-key"), false);
    assert.equal(runtime.requests.every((request) => request.tools.length === 1), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function extractionScript(sourceId, checksum) {
  return (request) => [
    {
      type: "tool_call",
      name: "submit_extraction",
      input: {
        version: "pkwiki.extraction/0.1",
        sourceId: sourceId(),
        sourceChecksum: checksum(),
        createdAt: "2026-07-28 16:00:00",
        summary: "Harness 使用结构化计划和人工审批维护 Wiki。",
        items: [
          {
            itemId: "fact:harness-approval",
            kind: "fact",
            content: "Harness 使用结构化计划和两次人工审批维护个人 Wiki。",
            confidence: "high",
            evidence: [{ chunkId: extractChunkId(request) }],
          },
        ],
      },
    },
    usageEvent(),
    { type: "completed" },
  ];
}

function extractChunkId(request) {
  const match = request.messages[0].content.match(/"chunkId":"([^"]+)"/);
  assert.ok(match, "Extraction prompt 应包含 chunkId");
  return match[1];
}

function mergePlanScript(sourceId, itemId, intent = "create") {
  return (request) => [
    {
      type: "tool_call",
      name: "submit_merge_plan",
      input: {
        version: "pkwiki.merge-plan/0.1",
        runId: request.runId,
        createdAt: "2026-07-28 16:01:00",
        sourceIds: [sourceId()],
        summary: "创建长期学习页面。",
        candidateTargets: [
          {
            path: "wiki/learning/harness-testing.md",
            intent,
            reason: "形成稳定的 Harness 实践主题。",
            confidence: "high",
          },
        ],
        coverage: [
          {
            sourceId: sourceId(),
            itemId,
            decision: "merged",
            target: "wiki/learning/harness-testing.md",
            reason: "该事实适合长期学习页面。",
          },
        ],
        unresolvedQuestions: [],
        privacyNotes: ["保持 private"],
      },
    },
    usageEvent(),
    { type: "completed" },
  ];
}

function patchPlanScript(sourceId) {
  return () => [
    {
      type: "tool_call",
      name: "submit_patch_plan",
      input: {
        version: "pkwiki.patch-plan/0.1",
        summary: "创建 Harness 学习页面。",
        sourceIds: [sourceId()],
        createdBy: "pkwiki-agent",
        createdAt: "2026-07-28 16:02:00",
        operations: [
          {
            type: "create_markdown_page",
            path: "wiki/learning/harness-testing.md",
            content: `---
okf_version: "0.1"
profile: pkwiki/0.1
id: learning/harness-testing
type: LearningNote
title: Harness 测试
description: 结构化计划和人工审批的长期实践记录。
domain: learning
status: active
created: 2026-07-28
updated: 2026-07-28
confidence: high
privacy: private
sources:
  - ${sourceId()}
tags:
  - pkwiki
  - harness
---

# Harness 测试

Harness 使用结构化计划和两次人工审批维护个人 Wiki。
`,
          },
        ],
      },
    },
    usageEvent(),
    { type: "completed" },
  ];
}

function queryAnswerScript() {
  return (request) => [
    {
      type: "tool_call",
      name: "submit_query_answer",
      input: {
        version: "pkwiki.query-answer/0.1",
        runId: request.runId,
        answer: "两次审批分别控制知识决策和实际文件写入。",
        claims: [
          {
            text: "Harness 使用两次人工审批。",
            citations: [
              {
                kind: "page",
                id: "learning/harness-testing",
                path: "wiki/learning/harness-testing.md",
              },
            ],
          },
        ],
        uncertainties: [],
        suggestedFileBack: {
          recommended: true,
          reason: "该回答概括了稳定的工作流规则。",
        },
      },
    },
    usageEvent(),
    { type: "completed" },
  ];
}

function usageEvent() {
  return {
    type: "usage",
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 10,
      totalTokens: 150,
    },
  };
}

function createVaultFixture() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-agent-test-"));
  const vault = join(root, "vault");
  execFileSync(process.execPath, [CLI_PATH, "init", vault, "--git", "--json"], {
    stdio: "pipe",
  });
  execFileSync("git", ["-C", vault, "config", "user.name", "pkwiki-test"]);
  execFileSync("git", ["-C", vault, "config", "user.email", "test@example.com"]);
  commitVault(vault, "test: 初始化 Vault");
  return { root, vault };
}

function commitVault(vault, message) {
  execFileSync("git", ["-C", vault, "add", "-A"]);
  execFileSync("git", ["-C", vault, "commit", "-m", message], { stdio: "pipe" });
}

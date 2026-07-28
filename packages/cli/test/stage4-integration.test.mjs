import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const cliPath = resolve(__dirname, "../dist/index.js");
const mockSourcePath = join(
  repoRoot,
  "mock-sources/2026-07-03-chat-pkwiki-planning.md",
);

function run(args, cwd) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    cwd,
  });
}

function git(args, cwd) {
  return execFileSync("git", args, { encoding: "utf8", cwd });
}

test("阶段 4 从低敏 Raw Source 到 Context、Merge、Patch 和 Coverage 完整闭环", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-stage4-acceptance-"));
  const vault = join(parent, "vault");
  const artifactPath = join(parent, "extraction.json");
  const contextRequestPath = join(parent, "context-request.json");
  const mergePlanPath = join(parent, "merge-plan.json");
  const patchPlanPath = join(parent, "patch-plan.json");
  const runId = "run:2026-07-28-stage4-acceptance";
  const runDirectory = ".pkwiki/runs/run-2026-07-28-stage4-acceptance";

  run(["init", vault, "--git", "--json"], parent);
  git(["config", "user.name", "pkwiki-stage4-test"], vault);
  git(["config", "user.email", "pkwiki-stage4@example.com"], vault);
  git(["add", "."], vault);
  git(["commit", "-m", "test: 初始化阶段四验收 vault"], vault);

  const source = JSON.parse(
    run(
      [
        "ingest",
        mockSourcePath,
        "--type",
        "chat",
        "--domain",
        "project",
        "--privacy",
        "public",
        "--language",
        "zh-CN",
        "--json",
      ],
      vault,
    ),
  );
  const chunks = JSON.parse(
    run(["chunk", source.sourceId, "--max-chars", "1200", "--json"], vault),
  );
  assert.equal(chunks.chunkCount > 1, true);

  const evidenceChunks = [
    chunks.chunks[0].chunkId,
    chunks.chunks[Math.min(1, chunks.chunks.length - 1)].chunkId,
    chunks.chunks.at(-1).chunkId,
  ];
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:10:00+08:00",
      summary: "讨论确定了 pkwiki 页面类型、低敏原则和聊天记录解析卡点。",
      items: [
        {
          itemId: "decision:d1",
          kind: "decision",
          content: "MVP 使用 Project、Decision、LearningMap、CareerMaterial 和 DailyNote 五类页面。",
          confidence: "high",
          evidence: [{ chunkId: evidenceChunks[0] }],
        },
        {
          itemId: "fact:f1",
          kind: "fact",
          content: "知识库默认本地存储，模型调用只发送当前任务所需上下文。",
          confidence: "high",
          evidence: [{ chunkId: evidenceChunks[1] }],
        },
        {
          itemId: "question:q1",
          kind: "question",
          content: "如何稳定区分日常闲聊和需要长期沉淀的信息？",
          confidence: "medium",
          evidence: [{ chunkId: evidenceChunks[2] }],
        },
      ],
    }),
  );
  const extraction = JSON.parse(
    run(["register-extraction", artifactPath, "--json"], vault),
  );
  assert.equal(extraction.itemCount, 3);

  mkdirSync(join(vault, "wiki/projects"), { recursive: true });
  writeFileSync(
    join(vault, "wiki/projects/pkwiki.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: projects/pkwiki",
      "type: Project",
      "title: pkwiki",
      "description: 本地优先的个人知识编译与维护系统。",
      "domain: project",
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: high",
      "privacy: private",
      `sources: [${source.sourceId}]`,
      "tags: [pkwiki, knowledge]",
      "---",
      "",
      "# pkwiki",
      "",
      "## 知识合并",
      "",
      "- 阶段 4 验收前基线。",
    ].join("\n"),
  );
  writeFileSync(
    contextRequestPath,
    JSON.stringify({
      version: "pkwiki.context-request/0.1",
      runId,
      workflow: "merge",
      query: "pkwiki 页面类型 低敏",
      sourceIds: [source.sourceId],
      maxPages: 5,
      maxChars: 20000,
      linkDepth: 1,
    }),
  );
  const context = JSON.parse(
    run(["build-context", contextRequestPath, "--json"], vault),
  );
  assert.equal(context.contextPack.sources[0].extraction.items.length, 3);
  assert.equal(context.contextPack.pages[0].id, "projects/pkwiki");
  assert.equal(context.contextPack.pages[0].selectionReason.startsWith("search:"), true);

  const coverage = [
    {
      sourceId: source.sourceId,
      itemId: "decision:d1",
      decision: "merged",
      target: "wiki/projects/pkwiki.md",
      reason: "页面类型是长期产品决策",
    },
    {
      sourceId: source.sourceId,
      itemId: "fact:f1",
      decision: "merged",
      target: "wiki/projects/pkwiki.md",
      reason: "低敏原则属于长期产品约束",
    },
    {
      sourceId: source.sourceId,
      itemId: "question:q1",
      decision: "needs_confirmation",
      reason: "需要真实使用反馈后再确定分类规则",
    },
  ];
  writeFileSync(
    mergePlanPath,
    JSON.stringify({
      version: "pkwiki.merge-plan/0.1",
      runId,
      createdAt: "2026-07-28T10:20:00+08:00",
      sourceIds: [source.sourceId],
      summary: "合并低敏 pkwiki 规划信息",
      candidateTargets: [
        {
          path: "wiki/projects/pkwiki.md",
          reason: "现有项目页承载长期产品决策",
          intent: "update",
          confidence: "high",
        },
      ],
      coverage,
      unresolvedQuestions: ["如何稳定判断值得沉淀的信息？"],
      privacyNotes: ["素材为公开低敏 mock source"],
      patchPlanPath: "outputs/patch-plans/stage4-acceptance.json",
    }),
  );
  const registered = JSON.parse(
    run(["register-merge-plan", mergePlanPath, "--json"], vault),
  );
  assert.equal(registered.coverageCount, 3);
  assert.equal(
    existsSync(join(vault, runDirectory, "context-pack.json")),
    true,
  );

  writeFileSync(
    patchPlanPath,
    JSON.stringify({
      version: "pkwiki.patch-plan/0.1",
      summary: "应用阶段 4 低敏合并计划",
      sourceIds: [source.sourceId],
      operations: [
        {
          type: "append_to_section",
          path: "wiki/projects/pkwiki.md",
          heading: "知识合并",
          content: [
            `- 五类 MVP 页面已确定。 ^[${source.sourceId}]`,
            `- 默认执行本地优先和最小上下文原则。 ^[${source.sourceId}]`,
            `- 待确认：如何稳定判断值得长期沉淀的信息。 ^[${source.sourceId}]`,
          ].join("\n"),
        },
      ],
    }),
  );
  const dryRun = JSON.parse(
    run(["apply-patch", patchPlanPath, "--dry-run", "--json"], vault),
  );
  assert.deepEqual(dryRun.changedFiles, ["wiki/projects/pkwiki.md"]);
  const applied = JSON.parse(
    run(["apply-patch", patchPlanPath, "--json"], vault),
  );
  assert.equal(applied.validation.errors.length, 0);

  const finalized = JSON.parse(
    run(["finalize-merge", runId, "--json"], vault),
  );
  assert.equal(finalized.sourceStatuses[source.sourceId], "partially_merged");
  assert.equal(finalized.mergedCount, 2);
  assert.equal(finalized.needsConfirmationCount, 1);

  const persistedCoverage = JSON.parse(
    readFileSync(join(vault, runDirectory, "coverage.json"), "utf8"),
  );
  assert.deepEqual(
    persistedCoverage.entries.map((entry) => [entry.itemId, entry.decision]),
    [
      ["decision:d1", "merged"],
      ["fact:f1", "merged"],
      ["question:q1", "needs_confirmation"],
    ],
  );
  const manifest = JSON.parse(
    readFileSync(join(vault, ".pkwiki/source_manifest.json"), "utf8"),
  );
  assert.equal(manifest[source.sourceId].processingStatus, "partially_merged");

  const validation = JSON.parse(run(["validate", "--json"], vault));
  assert.equal(validation.errors.length, 0);
  assert.deepEqual(
    validation.warnings.map((warning) => warning.code),
    ["CONTEXT_PAGE_CHECKSUM_STALE"],
  );
  const diff = JSON.parse(run(["diff", "--json"], vault));
  const changedPaths = diff.files.map((file) => file.path);
  assert.equal(changedPaths.some((path) => path.startsWith("raw/inbox/")), true);
  assert.equal(changedPaths.includes("wiki/projects/pkwiki.md"), true);
  assert.equal(changedPaths.includes(`${runDirectory}/context-pack.json`), true);
  assert.equal(changedPaths.includes(`${runDirectory}/coverage.json`), true);
});

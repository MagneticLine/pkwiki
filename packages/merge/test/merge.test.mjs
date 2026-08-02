import assert from "node:assert/strict";
import {
  cpSync,
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
import {
  chunkSource,
  ingestSource,
  readSourceManifest,
  registerExtraction,
} from "../../core/dist/index.js";
import {
  finalizeMerge,
  parseMergePlan,
  registerMergePlan,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const templateRoot = join(repoRoot, "templates/default-vault");

function createPreparedVault(itemKinds = ["fact", "decision"]) {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-merge-"));
  cpSync(templateRoot, root, { recursive: true });
  const input = join(root, "source.md");
  writeFileSync(input, "项目事实。\n项目决策。\n");
  const source = ingestSource(root, input, {
    type: "document",
    domain: "project",
    now: new Date("2026-07-28T10:00:00+08:00"),
  });
  const chunks = chunkSource(root, source.sourceId, { maxChars: 500 });
  const artifactPath = join(root, "artifact.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:10:00+08:00",
      summary: "项目摘要。",
      items: itemKinds.map((kind, index) => ({
        itemId: `${kind}:${kind === "decision" ? "d" : "f"}${index + 1}`,
        kind,
        content: `${kind} content`,
        confidence: "high",
        evidence: [{ chunkId: chunks.chunks[0].chunkId }],
      })),
    }),
  );
  registerExtraction(root, artifactPath);
  return { root, source, items: itemKinds };
}

function writeWikiPage(root, sourceId, includeSource = true) {
  const pagePath = "wiki/projects/pkwiki.md";
  mkdirSync(join(root, "wiki/projects"), { recursive: true });
  writeFileSync(
    join(root, pagePath),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: projects/pkwiki",
      "type: Project",
      "title: pkwiki",
      "description: pkwiki project.",
      "domain: project",
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: high",
      "privacy: private",
      `sources: [${includeSource ? sourceId : "src:other"}]`,
      "tags: [pkwiki]",
      "---",
      "",
      "# pkwiki",
      "",
      "Merged content.",
    ].join("\n"),
  );
  return pagePath;
}

function buildPlan(sourceId, coverage, runId = "run:2026-07-28-merge-test") {
  return {
    version: "pkwiki.merge-plan/0.1",
    runId,
    createdAt: "2026-07-28T11:00:00+08:00",
    sourceIds: [sourceId],
    summary: "Merge test",
    candidateTargets: [
      {
        path: "wiki/projects/pkwiki.md",
        reason: "项目长期页",
        intent: "update",
        confidence: "high",
      },
    ],
    coverage,
    unresolvedQuestions: [],
    privacyNotes: [],
  };
}

test("parseMergePlan 拒绝不安全 target", () => {
  assert.throws(
    () =>
      parseMergePlan({
        version: "pkwiki.merge-plan/0.1",
        runId: "run:test",
        createdAt: "2026-07-28T10:00:00+08:00",
        sourceIds: ["src:test"],
        summary: "test",
        candidateTargets: [
          {
            path: "../outside.md",
            reason: "unsafe",
            intent: "update",
            confidence: "high",
          },
        ],
        coverage: [],
        unresolvedQuestions: [],
        privacyNotes: [],
      }),
    { code: "MERGE_TARGET_INVALID" },
  );
});

test("registerMergePlan 校验 coverage 完整性", () => {
  const { root, source } = createPreparedVault();
  const planPath = join(root, "plan.json");
  writeFileSync(
    planPath,
    JSON.stringify(
      buildPlan(source.sourceId, [
        {
          sourceId: source.sourceId,
          itemId: "fact:f1",
          decision: "discarded",
          reason: "测试舍弃",
        },
      ]),
    ),
  );
  assert.throws(() => registerMergePlan(root, planPath), {
    code: "MERGE_COVERAGE_INCOMPLETE",
  });
});

test("registerMergePlan 保留前置 Context Pack", () => {
  const { root, source } = createPreparedVault(["fact"]);
  const runId = "run:context-first";
  const runDirectory = join(root, ".pkwiki/runs/run-context-first");
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(
    join(runDirectory, "context-pack.json"),
    JSON.stringify({ version: "pkwiki.context-pack/0.1", runId }),
  );
  const planPath = join(root, "context-first-plan.json");
  writeFileSync(
    planPath,
    JSON.stringify(
      buildPlan(
        source.sourceId,
        [
          {
            sourceId: source.sourceId,
            itemId: "fact:f1",
            decision: "discarded",
            reason: "测试取舍",
          },
        ],
        runId,
      ),
    ),
  );

  registerMergePlan(root, planPath);
  assert.equal(existsSync(join(runDirectory, "context-pack.json")), true);
  assert.equal(existsSync(join(runDirectory, "merge-plan.json")), true);
  assert.equal(existsSync(join(runDirectory, "run.json")), true);
});

test("Harness 模式保留外层 Run Record", () => {
  const { root, source } = createPreparedVault(["fact"]);
  const runId = "run:agent-managed";
  const runDirectory = join(root, ".pkwiki/runs/run-agent-managed");
  mkdirSync(runDirectory, { recursive: true });
  const agentRun = {
    version: "pkwiki.agent-run/0.1",
    runId,
    workflow: "plan-ingest",
    status: "generating",
  };
  writeFileSync(join(runDirectory, "run.json"), JSON.stringify(agentRun));
  writeFileSync(join(runDirectory, "context-pack.json"), "{}\n");
  const planPath = join(root, "agent-managed-plan.json");
  writeFileSync(
    planPath,
    JSON.stringify(
      buildPlan(
        source.sourceId,
        [
          {
            sourceId: source.sourceId,
            itemId: "fact:f1",
            decision: "discarded",
            reason: "测试取舍",
          },
        ],
        runId,
      ),
    ),
  );

  registerMergePlan(root, planPath, { manageRunRecord: false });
  assert.deepEqual(
    JSON.parse(readFileSync(join(runDirectory, "run.json"), "utf8")),
    agentRun,
  );
  assert.equal(existsSync(join(runDirectory, "merge-plan.json")), true);
});

test("registerMergePlan 拒绝重复和未知 coverage", () => {
  const { root, source } = createPreparedVault(["fact"]);
  const duplicatePath = join(root, "duplicate.json");
  const entry = {
    sourceId: source.sourceId,
    itemId: "fact:f1",
    decision: "discarded",
    reason: "test",
  };
  writeFileSync(
    duplicatePath,
    JSON.stringify(buildPlan(source.sourceId, [entry, entry], "run:duplicate")),
  );
  assert.throws(() => registerMergePlan(root, duplicatePath), {
    code: "MERGE_COVERAGE_DUPLICATE",
  });

  const unknownPath = join(root, "unknown.json");
  writeFileSync(
    unknownPath,
    JSON.stringify(
      buildPlan(
        source.sourceId,
        [
          {
            ...entry,
            itemId: "fact:unknown",
          },
        ],
        "run:unknown",
      ),
    ),
  );
  assert.throws(() => registerMergePlan(root, unknownPath), {
    code: "MERGE_COVERAGE_UNKNOWN_ITEM",
  });
});

test("finalizeMerge 写入 coverage、Run 和 merged status", () => {
  const { root, source } = createPreparedVault();
  const pagePath = writeWikiPage(root, source.sourceId);
  const planPath = join(root, "plan.json");
  writeFileSync(
    planPath,
    JSON.stringify(
      buildPlan(source.sourceId, [
        {
          sourceId: source.sourceId,
          itemId: "fact:f1",
          decision: "merged",
          target: pagePath,
          reason: "长期事实",
        },
        {
          sourceId: source.sourceId,
          itemId: "decision:d2",
          decision: "discarded",
          reason: "测试重复信息",
        },
      ]),
    ),
  );
  const registered = registerMergePlan(root, planPath);
  const result = finalizeMerge(
    root,
    registered.runId,
    new Date("2026-07-28T12:00:00+08:00"),
  );

  assert.equal(result.sourceStatuses[source.sourceId], "merged");
  assert.equal(existsSync(join(root, result.coveragePath)), true);
  const manifest = readSourceManifest(root);
  assert.equal(manifest[source.sourceId].processingStatus, "merged");
  const extracted = readFileSync(
    join(root, manifest[source.sourceId].extractedPath),
    "utf8",
  );
  assert.match(extracted, /processing_status: merged/);
  assert.match(extracted, /fact:f1/);
  assert.match(extracted, /decision:d2/);
  const run = JSON.parse(
    readFileSync(join(root, registered.runDirectory, "run.json"), "utf8"),
  );
  assert.equal(run.status, "completed");
});

test("finalizeMerge 对 deferred 推进 partially_merged", () => {
  const { root, source } = createPreparedVault(["fact"]);
  const planPath = join(root, "plan.json");
  writeFileSync(
    planPath,
    JSON.stringify(
      buildPlan(source.sourceId, [
        {
          sourceId: source.sourceId,
          itemId: "fact:f1",
          decision: "deferred",
          reason: "等待更多上下文",
        },
      ], "run:partial"),
    ),
  );
  const registered = registerMergePlan(root, planPath);
  const result = finalizeMerge(root, registered.runId);
  assert.equal(result.sourceStatuses[source.sourceId], "partially_merged");
});

test("finalizeMerge 拒绝缺失 target 和 Source 引用", () => {
  const first = createPreparedVault(["fact"]);
  const firstPlan = join(first.root, "plan.json");
  writeFileSync(
    firstPlan,
    JSON.stringify(
      buildPlan(first.source.sourceId, [
        {
          sourceId: first.source.sourceId,
          itemId: "fact:f1",
          decision: "merged",
          target: "wiki/projects/pkwiki.md",
          reason: "test",
        },
      ], "run:missing-target"),
    ),
  );
  registerMergePlan(first.root, firstPlan);
  assert.throws(() => finalizeMerge(first.root, "run:missing-target"), {
    code: "MERGE_TARGET_MISSING",
  });

  const second = createPreparedVault(["fact"]);
  writeWikiPage(second.root, second.source.sourceId, false);
  const secondPlan = join(second.root, "plan.json");
  writeFileSync(
    secondPlan,
    JSON.stringify(
      buildPlan(second.source.sourceId, [
        {
          sourceId: second.source.sourceId,
          itemId: "fact:f1",
          decision: "merged",
          target: "wiki/projects/pkwiki.md",
          reason: "test",
        },
      ], "run:missing-source"),
    ),
  );
  registerMergePlan(second.root, secondPlan);
  assert.throws(() => finalizeMerge(second.root, "run:missing-source"), {
    code: "MERGE_TARGET_SOURCE_MISSING",
  });
});

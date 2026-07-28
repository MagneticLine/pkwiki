import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
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
  registerExtraction,
} from "../../core/dist/index.js";
import { validateVault } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const templateRoot = join(repoRoot, "templates/default-vault");

function copyTemplate() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-validator-"));
  cpSync(templateRoot, root, { recursive: true });
  return root;
}

function checksum(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

test("默认模板是合法 Vault", () => {
  const root = copyTemplate();
  const result = validateVault(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("缺少必需文件时报 error", () => {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-missing-"));
  mkdirSync(join(root, ".pkwiki"), { recursive: true });
  writeFileSync(
    join(root, ".pkwiki/config.json"),
    JSON.stringify({
      profile: "pkwiki/0.1",
      okfVersion: "0.1",
      wikiRoot: "wiki",
      rawRoot: "raw",
      extractedRoot: "extracted",
      outputsRoot: "outputs",
    }),
  );
  const result = validateVault(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "MISSING_REQUIRED_FILE"));
});

test("断开的 Markdown link 报 warning", () => {
  const root = copyTemplate();
  mkdirSync(join(root, "wiki/concepts"), { recursive: true });
  writeFileSync(
    join(root, "wiki/concepts/example.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: concepts/example",
      "type: Concept",
      "title: Example",
      "description: Example concept.",
      "domain: concepts",
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      "sources: [src:example]",
      "tags: [example]",
      "---",
      "",
      "See [Missing](missing.md).",
    ].join("\n"),
  );
  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((issue) => issue.code === "BROKEN_MARKDOWN_LINK"));
});

test("source manifest 指向缺失文件时报 warning", () => {
  const root = copyTemplate();
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify(
      {
        "src:2026-07-01-missing": {
          sourceId: "src:2026-07-01-missing",
          rawPath: "raw/inbox/missing.md",
          extractedPath: "extracted/sources/src-2026-07-01-missing.md",
          type: "document",
          domain: "learning",
          checksum: "sha256:test",
          status: "registered",
        },
      },
      null,
      2,
    ),
  );

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((issue) => issue.code === "RAW_SOURCE_MISSING"));
  assert.ok(result.warnings.some((issue) => issue.code === "EXTRACTED_SOURCE_MISSING"));
});

test("source manifest 缺少必需字段时报 error", () => {
  const root = copyTemplate();
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify(
      {
        "src:2026-07-01-invalid": {
          sourceId: "src:2026-07-01-invalid",
          rawPath: "raw/inbox/invalid.md",
          type: "document",
          checksum: "sha256:test",
          status: "registered",
        },
      },
      null,
      2,
    ),
  );

  const result = validateVault(root);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) =>
        issue.code === "MISSING_SOURCE_MANIFEST_FIELD" &&
        issue.message.includes("domain"),
    ),
  );
});

test("source manifest 支持 merged 与 deleted 独立表达", () => {
  const root = copyTemplate();
  mkdirSync(join(root, "extracted/sources"), { recursive: true });
  writeFileSync(
    join(root, "extracted/sources/src-2026-07-28-deleted.md"),
    "# Extracted Source\n",
  );
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:2026-07-28-deleted": {
        sourceId: "src:2026-07-28-deleted",
        rawPath: "raw/inbox/deleted.md",
        extractedPath: "extracted/sources/src-2026-07-28-deleted.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:test",
        processingStatus: "merged",
        lifecycleStatus: "deleted",
      },
    }),
  );

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.equal(
    result.warnings.some((issue) => issue.code === "RAW_SOURCE_MISSING"),
    false,
  );
});

test("deleted Source 的 Raw 文件仍存在时报 warning", () => {
  const root = copyTemplate();
  const content = "still exists";
  writeFileSync(join(root, "raw/inbox/deleted.md"), content);
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:2026-07-28-deleted": {
        sourceId: "src:2026-07-28-deleted",
        rawPath: "raw/inbox/deleted.md",
        type: "document",
        domain: "personal",
        checksum: checksum(content),
        processingStatus: "merged",
        lifecycleStatus: "deleted",
      },
    }),
  );

  const result = validateVault(root);
  assert.ok(
    result.warnings.some((issue) => issue.code === "DELETED_SOURCE_FILE_EXISTS"),
  );
});

test("source manifest 校验双状态枚举、完整性和冲突", () => {
  const root = copyTemplate();
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:invalid-processing": {
        sourceId: "src:invalid-processing",
        rawPath: "raw/inbox/a.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:test",
        processingStatus: "done",
        lifecycleStatus: "active",
      },
      "src:invalid-lifecycle": {
        sourceId: "src:invalid-lifecycle",
        rawPath: "raw/inbox/b.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:test",
        processingStatus: "registered",
        lifecycleStatus: "missing",
      },
      "src:incomplete": {
        sourceId: "src:incomplete",
        rawPath: "raw/inbox/c.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:test",
        processingStatus: "registered",
      },
      "src:conflict": {
        sourceId: "src:conflict",
        rawPath: "raw/inbox/d.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:test",
        processingStatus: "merged",
        lifecycleStatus: "active",
        status: "registered",
      },
    }),
  );

  const result = validateVault(root);
  const codes = result.errors.map((issue) => issue.code);
  assert.ok(codes.includes("INVALID_SOURCE_PROCESSING_STATUS"));
  assert.ok(codes.includes("INVALID_SOURCE_LIFECYCLE_STATUS"));
  assert.ok(codes.includes("INCOMPLETE_SOURCE_STATUS"));
  assert.ok(codes.includes("CONFLICTING_SOURCE_STATUS"));
});

test("Raw Source checksum 和 size 不一致时报 warning", () => {
  const root = copyTemplate();
  const content = "changed raw content";
  writeFileSync(join(root, "raw/inbox/check.md"), content);
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:2026-07-28-check": {
        sourceId: "src:2026-07-28-check",
        rawPath: "raw/inbox/check.md",
        type: "document",
        domain: "personal",
        checksum: "sha256:old",
        sizeBytes: 1,
        processingStatus: "registered",
        lifecycleStatus: "active",
      },
    }),
  );

  const result = validateVault(root);
  assert.ok(
    result.warnings.some(
      (issue) => issue.code === "RAW_SOURCE_CHECKSUM_MISMATCH",
    ),
  );
  assert.ok(
    result.warnings.some((issue) => issue.code === "RAW_SOURCE_SIZE_MISMATCH"),
  );
});

test("legacy source status 保持兼容", () => {
  const root = copyTemplate();
  const content = "legacy raw";
  writeFileSync(join(root, "raw/inbox/legacy.md"), content);
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:2026-07-28-legacy": {
        sourceId: "src:2026-07-28-legacy",
        rawPath: "raw/inbox/legacy.md",
        type: "document",
        domain: "personal",
        checksum: checksum(content),
        status: "registered",
      },
    }),
  );

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
});

test("合法 Chunk Manifest 和 Extraction Artifact 通过校验", () => {
  const root = copyTemplate();
  const input = join(root, "input.md");
  const artifactPath = join(root, "artifact.json");
  writeFileSync(input, "事实证据位于这个文本中。\n");
  const source = ingestSource(root, input, {
    type: "document",
    domain: "test",
  });
  const chunkResult = chunkSource(root, source.sourceId, { maxChars: 500 });
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:00:00+08:00",
      summary: "测试摘要。",
      items: [
        {
          itemId: "fact:f1",
          kind: "fact",
          content: "存在一条测试事实。",
          confidence: "high",
          evidence: [
            {
              chunkId: chunkResult.chunks[0].chunkId,
              quote: "事实证据位于这个文本中。",
            },
          ],
        },
      ],
    }),
  );
  registerExtraction(root, artifactPath);

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("chunk 文件被改写时报 checksum warning", () => {
  const root = copyTemplate();
  const input = join(root, "input.md");
  writeFileSync(input, "chunk content");
  const source = ingestSource(root, input, {
    type: "document",
    domain: "test",
  });
  const chunks = chunkSource(root, source.sourceId, { maxChars: 500 });
  writeFileSync(join(root, chunks.chunks[0].path), "changed chunk");

  const result = validateVault(root);
  assert.ok(
    result.warnings.some((issue) => issue.code === "CHUNK_CHECKSUM_MISMATCH"),
  );
});

test("Source checksum 变化时 chunk 报 stale warning", () => {
  const root = copyTemplate();
  const input = join(root, "input.md");
  writeFileSync(input, "source content");
  const source = ingestSource(root, input, {
    type: "document",
    domain: "test",
  });
  chunkSource(root, source.sourceId, { maxChars: 500 });
  const manifestPath = join(root, ".pkwiki/source_manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest[source.sourceId].checksum = "sha256:new";
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = validateVault(root);
  assert.ok(
    result.warnings.some(
      (issue) => issue.code === "CHUNK_SOURCE_CHECKSUM_STALE",
    ),
  );
});

test("非法 Extraction Artifact 报 error", () => {
  const root = copyTemplate();
  mkdirSync(join(root, "extracted/data"), { recursive: true });
  writeFileSync(
    join(root, "extracted/data/invalid.json"),
    JSON.stringify({ version: "invalid" }),
  );

  const result = validateVault(root);
  assert.ok(
    result.errors.some((issue) => issue.code === "INVALID_EXTRACTION_ARTIFACT"),
  );
});

test("extracted Source 缺少 Artifact 报 warning", () => {
  const root = copyTemplate();
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    JSON.stringify({
      "src:2026-07-28-missing-artifact": {
        sourceId: "src:2026-07-28-missing-artifact",
        rawPath: "raw/inbox/missing.md",
        type: "document",
        domain: "test",
        checksum: "sha256:test",
        processingStatus: "extracted",
        lifecycleStatus: "deleted",
      },
    }),
  );

  const result = validateVault(root);
  assert.ok(
    result.warnings.some(
      (issue) => issue.code === "EXTRACTION_ARTIFACT_MISSING",
    ),
  );
});

test("completed Run 缺少 coverage 报 error", () => {
  const root = copyTemplate();
  const runDirectory = join(root, ".pkwiki/runs/run-missing-coverage");
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(
    join(runDirectory, "run.json"),
    JSON.stringify({
      version: "pkwiki.run/0.1",
      runId: "run:missing-coverage",
      workflow: "merge",
      status: "completed",
      createdAt: "2026-07-28T10:00:00+08:00",
      updatedAt: "2026-07-28T11:00:00+08:00",
    }),
  );
  writeFileSync(
    join(runDirectory, "merge-plan.json"),
    JSON.stringify({
      version: "pkwiki.merge-plan/0.1",
      runId: "run:missing-coverage",
      createdAt: "2026-07-28T10:00:00+08:00",
      sourceIds: ["src:test"],
      summary: "test",
      candidateTargets: [],
      coverage: [],
      unresolvedQuestions: [],
      privacyNotes: [],
    }),
  );

  const result = validateVault(root);
  assert.ok(
    result.errors.some((issue) => issue.code === "RUN_COVERAGE_MISSING"),
  );
});

test("Run Record 与 MergePlan runId 不一致时报 error", () => {
  const root = copyTemplate();
  const runDirectory = join(root, ".pkwiki/runs/run-mismatch");
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(
    join(runDirectory, "run.json"),
    JSON.stringify({
      version: "pkwiki.run/0.1",
      runId: "run:mismatch-a",
      workflow: "merge",
      status: "awaiting_apply",
      createdAt: "2026-07-28T10:00:00+08:00",
      updatedAt: "2026-07-28T10:00:00+08:00",
    }),
  );
  writeFileSync(
    join(runDirectory, "merge-plan.json"),
    JSON.stringify({
      version: "pkwiki.merge-plan/0.1",
      runId: "run:mismatch-b",
      createdAt: "2026-07-28T10:00:00+08:00",
      sourceIds: ["src:test"],
      summary: "test",
      candidateTargets: [],
      coverage: [],
      unresolvedQuestions: [],
      privacyNotes: [],
    }),
  );

  const result = validateVault(root);
  assert.ok(result.errors.some((issue) => issue.code === "RUN_ID_MISMATCH"));
});

test("Wiki Page 非空但索引缺失时报 warning", () => {
  const root = copyTemplate();
  mkdirSync(join(root, "wiki/career"), { recursive: true });
  writeFileSync(
    join(root, "wiki/career/index-warning.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: career/index-warning",
      "type: Project",
      "title: Index Warning",
      "description: Index warning page.",
      "domain: career",
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      "sources: [src:index-warning]",
      "tags: [career]",
      "---",
      "",
      "# Index Warning",
    ].join("\n"),
  );

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.warnings.some((issue) => issue.code === "PAGE_MANIFEST_MISSING_PAGE"),
  );
  assert.ok(result.warnings.some((issue) => issue.code === "SEARCH_INDEX_MISSING"));
});

test("page manifest checksum 过期时报 warning", () => {
  const root = copyTemplate();
  mkdirSync(join(root, "wiki/career"), { recursive: true });
  writeFileSync(
    join(root, "wiki/career/stale.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: career/stale",
      "type: Project",
      "title: Stale",
      "description: Stale page.",
      "domain: career",
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      "sources: [src:stale]",
      "tags: [career]",
      "---",
      "",
      "# Stale",
    ].join("\n"),
  );
  writeFileSync(
    join(root, ".pkwiki/page_manifest.json"),
    JSON.stringify(
      {
        "career/stale": {
          id: "career/stale",
          path: "wiki/career/stale.md",
          title: "Stale",
          type: "Project",
          domain: "career",
          checksum: "sha256:stale",
        },
      },
      null,
      2,
    ),
  );

  const result = validateVault(root);
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.warnings.some((issue) => issue.code === "PAGE_MANIFEST_STALE_CHECKSUM"),
  );
});

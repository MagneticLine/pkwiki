import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../dist/index.js");

function run(args, cwd = process.cwd()) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    cwd,
  });
}

function git(args, cwd) {
  return execFileSync("git", args, {
    encoding: "utf8",
    cwd,
  });
}

function configureGit(cwd) {
  git(["config", "user.name", "pkwiki-test"], cwd);
  git(["config", "user.email", "pkwiki-test@example.com"], cwd);
}

test("init/status/validate 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-"));
  const vault = join(parent, "vault");

  const init = JSON.parse(run(["init", vault, "--json"]));
  assert.equal(init.ok, true);
  assert.equal(init.path, vault);

  const status = JSON.parse(run(["status", vault, "--json"]));
  assert.equal(status.ok, true);
  assert.equal(status.profile, "pkwiki/0.1");
  assert.equal(status.counts.raw, 0);

  const validate = JSON.parse(run(["validate", vault, "--json"]));
  assert.equal(validate.ok, true);
  assert.deepEqual(validate.errors, []);
});

test("ingest 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-ingest-"));
  const vault = join(parent, "vault");
  const source = join(parent, "source.md");
  run(["init", vault, "--json"]);
  writeFileSync(source, "hello");

  const result = JSON.parse(
    run(["ingest", source, "--type", "chat", "--domain", "personal", "--json"], vault),
  );

  assert.equal(result.ok, true);
  assert.equal(result.sourceId.startsWith("src:"), true);
  assert.equal(result.rawPath.startsWith("raw/inbox/"), true);
  assert.equal(result.extractedPath.startsWith("extracted/sources/"), true);
  assert.equal(result.originalName, "source.md");
  assert.equal(result.sizeBytes, 5);
  assert.equal(result.processingStatus, "registered");
  assert.equal(result.lifecycleStatus, "active");
  assert.equal(result.privacy, "private");
  assert.equal(result.language, "zh-CN");

  const validate = JSON.parse(run(["validate", vault, "--json"]));
  assert.equal(validate.ok, true);
});

test("布尔 flag 不消费后续位置参数", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-flags-"));
  const vault = join(parent, "vault");
  const source = join(parent, "source.md");
  run(["--json", "init", vault]);
  writeFileSync(source, "hello");

  const result = JSON.parse(
    run(["ingest", "--json", source, "--type=chat", "--domain=personal"], vault),
  );

  assert.equal(result.ok, true);
  assert.equal(result.type, "chat");
  assert.equal(result.domain, "personal");
});

test("ingest 支持 privacy 和 language 参数", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-ingest-options-"));
  const vault = join(parent, "vault");
  const source = join(parent, "source.md");
  run(["init", vault, "--json"]);
  writeFileSync(source, "hello");

  const result = JSON.parse(
    run(
      [
        "ingest",
        source,
        "--type",
        "document",
        "--domain",
        "career",
        "--privacy",
        "restricted",
        "--language=en-US",
        "--json",
      ],
      vault,
    ),
  );

  assert.equal(result.privacy, "restricted");
  assert.equal(result.language, "en-US");
});

test("ingest 拒绝空 privacy 和 language 参数", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-ingest-empty-"));
  const vault = join(parent, "vault");
  const source = join(parent, "source.md");
  run(["init", vault, "--json"]);
  writeFileSync(source, "hello");

  assert.throws(
    () =>
      run(
        [
          "ingest",
          source,
          "--type",
          "document",
          "--domain",
          "career",
          "--privacy=",
          "--json",
        ],
        vault,
      ),
    { status: 2 },
  );
  assert.throws(
    () =>
      run(
        [
          "ingest",
          source,
          "--type",
          "document",
          "--domain",
          "career",
          "--language",
          "--json",
        ],
        vault,
      ),
    { status: 2 },
  );
});

test("chunk 和 register-extraction 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-extraction-"));
  const vault = join(parent, "vault");
  const sourcePath = join(parent, "source.md");
  const artifactPath = join(parent, "artifact.json");
  run(["init", vault, "--json"]);
  writeFileSync(
    sourcePath,
    `${"阶段四需要可靠分块。".repeat(60)}\n\n第二段提供额外证据。`,
  );
  const source = JSON.parse(
    run(
      [
        "ingest",
        sourcePath,
        "--type",
        "document",
        "--domain",
        "project",
        "--json",
      ],
      vault,
    ),
  );
  const chunks = JSON.parse(
    run(["chunk", source.sourceId, "--max-chars", "500", "--json"], vault),
  );
  assert.equal(chunks.ok, true);
  assert.equal(chunks.chunkCount > 1, true);

  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:00:00+08:00",
      summary: "阶段四分块测试。",
      items: [
        {
          itemId: "fact:f1",
          kind: "fact",
          content: "阶段四需要可靠分块。",
          confidence: "high",
          evidence: [
            {
              chunkId: chunks.chunks[0].chunkId,
              quote: "阶段四需要可靠分块。",
            },
          ],
        },
      ],
    }),
  );

  const result = JSON.parse(
    run(["register-extraction", artifactPath, "--json"], vault),
  );
  assert.equal(result.ok, true);
  assert.equal(result.processingStatus, "extracted");
  assert.equal(result.itemCount, 1);

  const validate = JSON.parse(run(["validate", "--json"], vault));
  assert.equal(validate.errors.length, 0);
});

test("chunk 拒绝非法 max-chars", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-chunk-invalid-"));
  const vault = join(parent, "vault");
  run(["init", vault, "--json"]);
  assert.throws(() => run(["chunk", "src:missing", "--max-chars", "20"], vault), {
    status: 2,
  });
});

test("register-merge-plan 和 finalize-merge 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-merge-"));
  const vault = join(parent, "vault");
  const sourcePath = join(parent, "source.md");
  const artifactPath = join(parent, "artifact.json");
  const planPath = join(parent, "merge-plan.json");
  run(["init", vault, "--json"]);
  writeFileSync(sourcePath, "pkwiki 阶段四需要 MergePlan。\n");
  const source = JSON.parse(
    run(
      [
        "ingest",
        sourcePath,
        "--type",
        "document",
        "--domain",
        "project",
        "--json",
      ],
      vault,
    ),
  );
  const chunks = JSON.parse(run(["chunk", source.sourceId, "--json"], vault));
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T14:00:00+08:00",
      summary: "Merge CLI test",
      items: [
        {
          itemId: "fact:f1",
          kind: "fact",
          content: "阶段四需要 MergePlan。",
          confidence: "high",
          evidence: [{ chunkId: chunks.chunks[0].chunkId }],
        },
      ],
    }),
  );
  run(["register-extraction", artifactPath, "--json"], vault);

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
      "description: pkwiki project.",
      "domain: project",
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: high",
      "privacy: private",
      `sources: [${source.sourceId}]`,
      "tags: [pkwiki]",
      "---",
      "",
      "# pkwiki",
    ].join("\n"),
  );
  writeFileSync(
    planPath,
    JSON.stringify({
      version: "pkwiki.merge-plan/0.1",
      runId: "run:2026-07-28-cli-merge",
      createdAt: "2026-07-28T14:10:00+08:00",
      sourceIds: [source.sourceId],
      summary: "CLI merge test",
      candidateTargets: [
        {
          path: "wiki/projects/pkwiki.md",
          reason: "项目长期页",
          intent: "update",
          confidence: "high",
        },
      ],
      coverage: [
        {
          sourceId: source.sourceId,
          itemId: "fact:f1",
          decision: "merged",
          target: "wiki/projects/pkwiki.md",
          reason: "长期事实",
        },
      ],
      unresolvedQuestions: [],
      privacyNotes: [],
    }),
  );

  const registered = JSON.parse(
    run(["register-merge-plan", planPath, "--json"], vault),
  );
  assert.equal(registered.status, "awaiting_apply");
  const finalized = JSON.parse(
    run(["finalize-merge", registered.runId, "--json"], vault),
  );
  assert.equal(finalized.sourceStatuses[source.sourceId], "merged");
  assert.equal(finalized.mergedCount, 1);
  const validate = JSON.parse(run(["validate", "--json"], vault));
  assert.equal(validate.errors.length, 0);
});

test("index 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-index-"));
  const vault = join(parent, "vault");
  run(["init", vault, "--json"]);
  const pageDirectory = join(vault, "wiki/career");
  mkdirSync(pageDirectory, { recursive: true });
  writeFileSync(
    join(pageDirectory, "internship.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: career/internship",
      "type: Project",
      "title: Internship",
      "description: Internship page.",
      "domain: career",
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      "sources: [src:internship]",
      "tags: [career]",
      "---",
      "",
      "# Internship",
    ].join("\n"),
  );

  const result = JSON.parse(run(["index", "--json"], vault));

  assert.equal(result.ok, true);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pageManifestPath, ".pkwiki/page_manifest.json");
  assert.equal(result.indexPath, "outputs/index.json");
});

test("list/read/search/build-context 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-search-"));
  const vault = join(parent, "vault");
  const requestPath = join(parent, "context-request.json");
  run(["init", vault, "--json"]);
  const pageDirectory = join(vault, "wiki/knowledge");
  mkdirSync(pageDirectory, { recursive: true });
  writeFileSync(
    join(pageDirectory, "alpha.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: knowledge/alpha",
      "type: Concept",
      "title: Context Alpha",
      "description: Alpha context page.",
      "domain: knowledge",
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: high",
      "privacy: private",
      "sources: [src:fixture]",
      "tags: [context]",
      "---",
      "",
      "# Context Alpha",
      "",
      "See [Beta](beta.md).",
    ].join("\n"),
  );
  writeFileSync(
    join(pageDirectory, "beta.md"),
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: knowledge/beta",
      "type: Concept",
      "title: Beta",
      "description: Linked page.",
      "domain: knowledge",
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: medium",
      "privacy: private",
      "sources: [src:fixture]",
      "tags: [linked]",
      "---",
      "",
      "# Beta",
      "",
      "Linked detail.",
    ].join("\n"),
  );

  const listed = JSON.parse(run(["list-pages", "--json"], vault));
  assert.deepEqual(
    listed.pages.map((page) => page.id),
    ["knowledge/alpha", "knowledge/beta"],
  );
  const read = JSON.parse(
    run(["read-page", "wiki/knowledge/alpha.md", "--json"], vault),
  );
  assert.equal(read.id, "knowledge/alpha");
  assert.match(read.content, /See \[Beta\]/);
  const searched = JSON.parse(
    run(["search", "Context Alpha", "--limit", "1", "--json"], vault),
  );
  assert.equal(searched.results.length, 1);
  assert.equal(searched.results[0].id, "knowledge/alpha");

  writeFileSync(
    requestPath,
    JSON.stringify({
      version: "pkwiki.context-request/0.1",
      runId: "run:2026-07-28-cli-context",
      workflow: "query",
      query: "Context Alpha",
      sourceIds: [],
      maxPages: 2,
      maxChars: 2000,
      linkDepth: 1,
    }),
  );
  const context = JSON.parse(
    run(["build-context", requestPath, "--json"], vault),
  );
  assert.equal(context.contextPack.budget.usedPages, 2);
  assert.equal(context.contextPack.pages[1].selectionReason, "linked_from:knowledge/alpha");
  const validate = JSON.parse(run(["validate", "--json"], vault));
  assert.equal(validate.errors.length, 0);
});

test("apply-patch 支持 dry-run 和 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-patch-"));
  const vault = join(parent, "vault");
  run(["init", vault, "--json"]);
  const pageDirectory = join(vault, "wiki/career");
  mkdirSync(pageDirectory, { recursive: true });
  const pagePath = join(pageDirectory, "internship.md");
  writeFileSync(
    pagePath,
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      "id: career/internship",
      "type: Project",
      "title: Internship",
      "description: Internship page.",
      "domain: career",
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      "sources: [src:internship]",
      "tags: [career]",
      "---",
      "",
      "# Internship",
      "",
      "Old text.",
    ].join("\n"),
  );
  const planPath = join(parent, "plan.json");
  writeFileSync(
    planPath,
    JSON.stringify({
      version: "pkwiki.patch-plan/0.1",
      summary: "替换低敏测试文本",
      operations: [
        {
          type: "replace_text",
          path: "wiki/career/internship.md",
          find: "Old text.",
          replace: "New text.",
        },
      ],
    }),
  );

  const dryRun = JSON.parse(run(["apply-patch", planPath, "--dry-run", "--json"], vault));
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.changedFiles[0], "wiki/career/internship.md");

  const result = JSON.parse(run(["apply-patch", planPath, "--json"], vault));
  assert.equal(result.ok, true);
  assert.equal(result.validation.errors.length, 0);
});

test("diff 支持 clean、dirty、JSON 和 name-only 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-diff-"));
  const vault = join(parent, "vault");
  run(["init", vault, "--json", "--git"]);
  configureGit(vault);
  git(["add", "."], vault);
  git(["commit", "-m", "test: 初始化测试 vault"], vault);

  const clean = JSON.parse(run(["diff", "--json"], vault));
  assert.equal(clean.ok, true);
  assert.equal(clean.clean, true);
  assert.deepEqual(clean.files, []);

  mkdirSync(join(vault, "wiki/career"), { recursive: true });
  writeFileSync(join(vault, "wiki/career/diff-test.md"), "# Diff Test\n");
  writeFileSync(join(vault, "raw/inbox/diff-source.md"), "raw source\n");

  const dirty = JSON.parse(run(["diff", "--json"], vault));
  assert.equal(dirty.ok, true);
  assert.equal(dirty.clean, false);
  assert.deepEqual(
    dirty.files.map((file) => ({
      path: file.path,
      status: file.status,
      area: file.area,
    })),
    [
      {
        path: "raw/inbox/diff-source.md",
        status: "untracked",
        area: "raw",
      },
      {
        path: "wiki/career/diff-test.md",
        status: "untracked",
        area: "wiki",
      },
    ],
  );

  const nameOnly = run(["diff", "--name-only"], vault)
    .split(/\r?\n/)
    .filter(Boolean);
  assert.deepEqual(nameOnly, [
    "raw/inbox/diff-source.md",
    "wiki/career/diff-test.md",
  ]);

  const filtered = JSON.parse(run(["diff", "wiki", "--json"], vault));
  assert.deepEqual(filtered.files.map((file) => file.path), [
    "wiki/career/diff-test.md",
  ]);
});

test("diff 支持 modified、deleted 和 unsafe path 错误", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-diff-modified-"));
  const vault = join(parent, "vault");
  run(["init", vault, "--json", "--git"]);
  configureGit(vault);
  writeFileSync(join(vault, "wiki/diff-test.md"), "# Diff Test\n");
  git(["add", "."], vault);
  git(["commit", "-m", "test: 初始化测试 vault"], vault);

  writeFileSync(join(vault, "wiki/diff-test.md"), "# Diff Test\n\nChanged.\n");
  rmSync(join(vault, "system/LOG.md"));

  const result = JSON.parse(run(["diff", "--json"], vault));
  assert.equal(result.clean, false);
  assert.equal(
    result.files.find((file) => file.path === "wiki/diff-test.md").status,
    "modified",
  );
  assert.equal(
    result.files.find((file) => file.path === "system/LOG.md").status,
    "deleted",
  );
  assert.equal(result.stat.insertions > 0, true);

  assert.throws(() => run(["diff", "../outside", "--json"], vault), {
    status: 2,
  });
});

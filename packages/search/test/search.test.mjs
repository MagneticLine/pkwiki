import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CONTEXT_REQUEST_VERSION,
  SearchError,
  buildContextPack,
  listPages,
  parseContextRequest,
  readWikiPage,
  searchPages,
} from "../dist/index.js";

function createVault() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-search-"));
  for (const directory of [
    ".pkwiki",
    "wiki/knowledge",
    "raw",
    "extracted/data",
    "outputs",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  writeFileSync(
    join(root, ".pkwiki/config.json"),
    `${JSON.stringify(
      {
        profile: "pkwiki/0.1",
        okfVersion: "0.1",
        wikiRoot: "wiki",
        rawRoot: "raw",
        extractedRoot: "extracted",
        outputsRoot: "outputs",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(root, ".pkwiki/source_manifest.json"), "{}\n");
  return root;
}

function writePage(root, fileName, input) {
  const path = join(root, "wiki/knowledge", fileName);
  writeFileSync(
    path,
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      `id: ${input.id}`,
      `type: ${input.type ?? "Concept"}`,
      `title: ${input.title}`,
      `description: ${input.description ?? `${input.title} description`}`,
      `domain: ${input.domain ?? "knowledge"}`,
      "status: active",
      "created: 2026-07-28",
      "updated: 2026-07-28",
      "confidence: medium",
      "privacy: private",
      `sources: [${(input.sources ?? ["src:fixture"]).join(", ")}]`,
      `tags: [${(input.tags ?? ["fixture"]).join(", ")}]`,
      "---",
      "",
      `# ${input.title}`,
      "",
      input.body ?? "Fixture body.",
    ].join("\n"),
  );
  return path;
}

test("list/read/search 输出稳定并覆盖 title、tag、source 和正文", () => {
  const root = createVault();
  writePage(root, "title.md", {
    id: "knowledge/title",
    title: "MergePlan",
    body: "Coverage workflow.",
  });
  writePage(root, "tag.md", {
    id: "knowledge/tag-match",
    title: "Agent Notes",
    tags: ["mergeplan"],
    body: "Tag-only page.",
  });
  writePage(root, "source.md", {
    id: "knowledge/source-match",
    title: "Source Notes",
    sources: ["src:mergeplan"],
    body: "Source-only page.",
  });
  writePage(root, "body.md", {
    id: "knowledge/body-match",
    title: "Body Notes",
    body: "This body explains mergeplan behavior.",
  });

  const listed = listPages(root);
  assert.deepEqual(
    listed.pages.map((page) => page.id),
    [
      "knowledge/body-match",
      "knowledge/source-match",
      "knowledge/tag-match",
      "knowledge/title",
    ],
  );
  const read = readWikiPage(root, "wiki/knowledge/title.md");
  assert.equal(read.id, "knowledge/title");
  assert.match(read.content, /# MergePlan/);
  assert.deepEqual(read.headings, ["MergePlan"]);

  const searched = searchPages(root, "MergePlan", { limit: 10 });
  assert.deepEqual(
    searched.results.map((entry) => entry.id),
    [
      "knowledge/title",
      "knowledge/tag-match",
      "knowledge/source-match",
      "knowledge/body-match",
    ],
  );
  assert.equal(searched.results[0].matchedFields.includes("title"), true);
  assert.equal(searched.results[0].matchedFields.includes("headings"), true);
  assert.deepEqual(searched.results[1].matchedFields, ["tags"]);
  assert.deepEqual(searched.results[2].matchedFields, ["sources"]);
  assert.deepEqual(searched.results[3].matchedFields, ["body"]);
  assert.match(searched.results[3].excerpt, /mergeplan behavior/i);
});

test("read-page 和 search 拒绝不安全路径及非法 limit", () => {
  const root = createVault();
  writePage(root, "safe.md", {
    id: "knowledge/safe",
    title: "Safe",
  });
  for (const path of ["../secret.md", "wiki/../secret.md", "raw/a.md", "wiki/a.txt"]) {
    assert.throws(
      () => readWikiPage(root, path),
      (error) => error instanceof SearchError && error.code === "UNSAFE_READ_PATH",
    );
  }
  assert.throws(
    () => readWikiPage(root, "wiki/knowledge/missing.md"),
    (error) => error instanceof SearchError && error.code === "PAGE_NOT_FOUND",
  );
  assert.throws(
    () => searchPages(root, "Safe", { limit: 0 }),
    (error) => error instanceof SearchError && error.code === "INVALID_SEARCH_LIMIT",
  );
});

test("Context Pack 包含 extraction，并遵守链接深度和字符预算", () => {
  const root = createVault();
  const sourceId = "src:2026-07-28-context";
  const sourceChecksum = "sha256:fixture";
  writeFileSync(
    join(root, ".pkwiki/source_manifest.json"),
    `${JSON.stringify(
      {
        [sourceId]: {
          sourceId,
          originalPath: "/tmp/context.md",
          originalName: "context.md",
          rawPath: "raw/context.md",
          extractedPath: "extracted/context.md",
          type: "note",
          domain: "knowledge",
          checksum: sourceChecksum,
          sizeBytes: 128,
          created: "2026-07-28",
          ingestedAt: "2026-07-28T10:00:00+08:00",
          processingStatus: "extracted",
          lifecycleStatus: "active",
          privacy: "private",
          language: "zh-CN",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "extracted/data/src-2026-07-28-context.json"),
    `${JSON.stringify(
      {
        version: "pkwiki.extraction/0.1",
        sourceId,
        sourceChecksum,
        createdAt: "2026-07-28T10:05:00+08:00",
        summary: "只包含结构化提取摘要，不包含 Raw Source 全文。",
        items: [
          {
            itemId: "fact:f1",
            kind: "fact",
            content: "Alpha 页面应链接到 Beta 页面。",
            confidence: "high",
            evidence: [{ chunkId: `${sourceId}#0001`, quote: "Alpha links Beta" }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writePage(root, "alpha.md", {
    id: "knowledge/alpha",
    title: "Alpha",
    sources: [sourceId],
    body: `[Beta](beta.md)\n\n${"A".repeat(420)}`,
  });
  writePage(root, "beta.md", {
    id: "knowledge/beta",
    title: "Beta",
    sources: [sourceId],
    body: `[Gamma](gamma.md)\n\n${"B".repeat(700)}`,
  });
  writePage(root, "gamma.md", {
    id: "knowledge/gamma",
    title: "Gamma",
    sources: [sourceId],
    body: "Gamma detail.",
  });

  const request = {
    version: CONTEXT_REQUEST_VERSION,
    runId: "run:2026-07-28-context",
    workflow: "query",
    query: "Alpha",
    sourceIds: [sourceId],
    maxPages: 3,
    maxChars: 1000,
    linkDepth: 2,
  };
  const result = buildContextPack(root, request, {
    now: new Date("2026-07-28T16:00:00+08:00"),
  });

  assert.equal(result.contextPack.sources[0].extraction.summary.includes("Raw Source 全文"), true);
  assert.deepEqual(result.contextPack.sources[0].extraction.items[0].evidenceChunkIds, [
    `${sourceId}#0001`,
  ]);
  assert.deepEqual(
    result.contextPack.pages.map((page) => [page.id, page.linkDepth]),
    [
      ["knowledge/alpha", 0],
      ["knowledge/beta", 1],
    ],
  );
  assert.equal(result.contextPack.pages[1].truncated, true);
  assert.equal(result.contextPack.budget.usedChars, 1000);
  assert.deepEqual(
    result.contextPack.omitted.map((page) => [page.id, page.reason]),
    [["knowledge/gamma", "max_chars"]],
  );
  assert.equal(
    existsSync(join(root, ".pkwiki/runs/run-2026-07-28-context/context-pack.json")),
    true,
  );
  const persisted = JSON.parse(
    readFileSync(
      join(root, ".pkwiki/runs/run-2026-07-28-context/context-pack.json"),
      "utf8",
    ),
  );
  assert.equal(persisted.budget.usedChars, 1000);
});

test("Context Request 应用默认预算并拒绝越界值", () => {
  const parsed = parseContextRequest({
    version: CONTEXT_REQUEST_VERSION,
    runId: "run:defaults",
    workflow: "query",
    query: "defaults",
    sourceIds: [],
  });
  assert.deepEqual(
    [parsed.maxPages, parsed.maxChars, parsed.linkDepth],
    [5, 20000, 1],
  );
  assert.throws(
    () => parseContextRequest({ ...parsed, maxChars: 999 }),
    (error) => error instanceof SearchError && error.code === "CONTEXT_BUDGET_INVALID",
  );
});

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateVault } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const templateRoot = join(repoRoot, "templates/default-vault");

function copyTemplate() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-validator-"));
  cpSync(templateRoot, root, { recursive: true });
  return root;
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

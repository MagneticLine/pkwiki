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
import { generateIndex } from "../dist/index.js";

function createVault() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-indexer-"));
  mkdirSync(join(root, ".pkwiki"), { recursive: true });
  mkdirSync(join(root, "wiki/career"), { recursive: true });
  mkdirSync(join(root, "outputs"), { recursive: true });
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
  return root;
}

function writeWikiPage(root, path, input) {
  const absolutePath = join(root, "wiki", path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(
    absolutePath,
    [
      "---",
      'okf_version: "0.1"',
      "profile: pkwiki/0.1",
      `id: ${input.id}`,
      `type: ${input.type}`,
      `title: ${input.title}`,
      `description: ${input.description}`,
      `domain: ${input.domain}`,
      "status: active",
      "created: 2026-07-01",
      "updated: 2026-07-01",
      "confidence: medium",
      "privacy: private",
      `sources: [${input.source}]`,
      `tags: [${input.domain}]`,
      "---",
      "",
      `# ${input.title}`,
      "",
      input.body,
    ].join("\n"),
  );
}

test("generateIndex 生成 page manifest 和 search index", () => {
  const root = createVault();
  writeWikiPage(root, "career/resume.md", {
    id: "career/resume",
    type: "Profile",
    title: "Resume",
    description: "Resume page.",
    domain: "career",
    source: "src:resume",
    body: "## Experience\n",
  });
  writeWikiPage(root, "career/internship.md", {
    id: "career/internship",
    type: "Project",
    title: "Internship",
    description: "Internship page.",
    domain: "career",
    source: "src:internship",
    body: "See [Resume](resume.md).\n\n## Review\n",
  });

  const result = generateIndex(root, {
    now: new Date("2026-07-01T10:00:00+08:00"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.pageCount, 2);
  assert.equal(result.linkCount, 1);
  assert.equal(result.sourceReferenceCount, 2);
  assert.equal(existsSync(join(root, ".pkwiki/page_manifest.json")), true);
  assert.equal(existsSync(join(root, "outputs/index.json")), true);
  assert.equal(
    result.pageManifest["career/internship"].path,
    "wiki/career/internship.md",
  );
  assert.deepEqual(result.index.byType.Project, ["career/internship"]);
  assert.deepEqual(result.index.byDomain.career, [
    "career/internship",
    "career/resume",
  ]);
  assert.deepEqual(result.index.bySource["src:internship"], ["career/internship"]);
  assert.deepEqual(result.index.backlinks["wiki/career/resume.md"], [
    "career/internship",
  ]);

  const persisted = JSON.parse(readFileSync(join(root, "outputs/index.json"), "utf8"));
  assert.equal(persisted.pages.length, 2);
});

test("generateIndex 遇到重复 page id 时报错", () => {
  const root = createVault();
  writeWikiPage(root, "career/a.md", {
    id: "career/duplicate",
    type: "Project",
    title: "A",
    description: "A page.",
    domain: "career",
    source: "src:a",
    body: "",
  });
  writeWikiPage(root, "career/b.md", {
    id: "career/duplicate",
    type: "Project",
    title: "B",
    description: "B page.",
    domain: "career",
    source: "src:b",
    body: "",
  });

  assert.throws(() => generateIndex(root), /Wiki Page id 重复/);
});

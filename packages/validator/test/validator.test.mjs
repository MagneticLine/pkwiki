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


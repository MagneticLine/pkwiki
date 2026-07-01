import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

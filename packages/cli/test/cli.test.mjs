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

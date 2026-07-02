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
import { computeSha256 } from "@pkwiki/core";
import {
  PATCH_PLAN_VERSION,
  PatchPlanError,
  applyPatchPlan,
  parsePatchPlan,
} from "../dist/index.js";

function createVault() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-patch-"));
  mkdirSync(join(root, ".pkwiki"), { recursive: true });
  mkdirSync(join(root, "wiki/career"), { recursive: true });
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

function wikiPage(input = {}) {
  return [
    "---",
    'okf_version: "0.1"',
    "profile: pkwiki/0.1",
    `id: ${input.id ?? "career/internship"}`,
    "type: Project",
    `title: ${input.title ?? "Internship"}`,
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
    `# ${input.title ?? "Internship"}`,
    "",
    "Old text.",
    "",
    "## Review",
    "",
    "Existing item.",
    "",
    "## Next",
    "",
  ].join("\n");
}

function writePlan(root, plan) {
  const path = join(root, "plan.json");
  writeFileSync(path, JSON.stringify(plan, null, 2));
  return path;
}

function planWithOperations(operations) {
  return {
    version: PATCH_PLAN_VERSION,
    summary: "测试 PatchPlan",
    operations,
  };
}

test("parsePatchPlan 拒绝不支持的版本", () => {
  assert.throws(
    () =>
      parsePatchPlan({
        version: "unknown",
        summary: "bad",
        operations: [],
      }),
    (error) =>
      error instanceof PatchPlanError &&
      error.code === "UNSUPPORTED_PATCH_VERSION",
  );
});

test("applyPatchPlan 拒绝不安全路径", () => {
  const root = createVault();
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "replace_text",
        path: "raw/inbox/source.md",
        find: "a",
        replace: "b",
      },
    ]),
  );

  assert.throws(
    () => applyPatchPlan(root, planPath),
    (error) =>
      error instanceof PatchPlanError && error.code === "UNSAFE_PATCH_PATH",
  );
});

test("create_markdown_page 支持 dry-run 且不写文件", () => {
  const root = createVault();
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "create_markdown_page",
        path: "wiki/career/new-page.md",
        content: wikiPage({
          id: "career/new-page",
          title: "New Page",
        }),
      },
    ]),
  );

  const result = applyPatchPlan(root, planPath, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.changedFiles, ["wiki/career/new-page.md"]);
  assert.equal(existsSync(join(root, "wiki/career/new-page.md")), false);
});

test("create_markdown_page 能创建新页面", () => {
  const root = createVault();
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "create_markdown_page",
        path: "wiki/career/new-page.md",
        content: wikiPage({
          id: "career/new-page",
          title: "New Page",
        }),
      },
    ]),
  );

  applyPatchPlan(root, planPath);

  assert.equal(existsSync(join(root, "wiki/career/new-page.md")), true);
});

test("replace_text 只允许唯一命中", () => {
  const root = createVault();
  const pagePath = join(root, "wiki/career/internship.md");
  writeFileSync(pagePath, wikiPage());
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "replace_text",
        path: "wiki/career/internship.md",
        find: "Old text.",
        replace: "New text.",
        expectedChecksum: computeSha256(pagePath),
      },
    ]),
  );

  applyPatchPlan(root, planPath);

  const text = readFileSync(pagePath, "utf8");
  assert.equal(text.includes("New text."), true);
});

test("expectedChecksum 不匹配时拒绝应用", () => {
  const root = createVault();
  const pagePath = join(root, "wiki/career/internship.md");
  writeFileSync(pagePath, wikiPage());
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "replace_text",
        path: "wiki/career/internship.md",
        find: "Old text.",
        replace: "New text.",
        expectedChecksum: "sha256:bad",
      },
    ]),
  );

  assert.throws(
    () => applyPatchPlan(root, planPath),
    (error) =>
      error instanceof PatchPlanError && error.code === "CHECKSUM_MISMATCH",
  );
});

test("append_to_section 追加到指定 section", () => {
  const root = createVault();
  const pagePath = join(root, "wiki/career/internship.md");
  writeFileSync(pagePath, wikiPage());
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "append_to_section",
        path: "wiki/career/internship.md",
        heading: "Review",
        content: "- Added item.",
      },
    ]),
  );

  applyPatchPlan(root, planPath);

  const text = readFileSync(pagePath, "utf8");
  assert.match(text, /## Review[\s\S]*Added item\.[\s\S]*## Next/);
});

test("replace_section 替换 section body 并保留 heading", () => {
  const root = createVault();
  const pagePath = join(root, "wiki/career/internship.md");
  writeFileSync(pagePath, wikiPage());
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "replace_section",
        path: "wiki/career/internship.md",
        heading: "Review",
        content: "Replacement body.",
      },
    ]),
  );

  applyPatchPlan(root, planPath);

  const text = readFileSync(pagePath, "utf8");
  assert.match(text, /## Review\s+Replacement body\.\s+## Next/);
  assert.equal(text.includes("Existing item."), false);
});

test("operation 失败时不写入任何文件", () => {
  const root = createVault();
  const pagePath = join(root, "wiki/career/internship.md");
  writeFileSync(pagePath, wikiPage());
  const before = readFileSync(pagePath, "utf8");
  const planPath = writePlan(
    root,
    planWithOperations([
      {
        type: "replace_text",
        path: "wiki/career/internship.md",
        find: "Old text.",
        replace: "New text.",
      },
      {
        type: "replace_text",
        path: "wiki/career/internship.md",
        find: "Missing text.",
        replace: "Should fail.",
      },
    ]),
  );

  assert.throws(() => applyPatchPlan(root, planPath));
  assert.equal(readFileSync(pagePath, "utf8"), before);
});

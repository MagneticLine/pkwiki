import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  getVaultArea,
  mergeNumstat,
  normalizeDiffPath,
  parseNumstat,
  parsePorcelainStatus,
  parseStatusCode,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

test("解析 Git porcelain 状态", () => {
  const files = parsePorcelainStatus(
    [
      " M wiki/profile/basic.md",
      "A  raw/inbox/source.md",
      " D wiki/old.md",
      "?? extracted/sources/new.md",
      "R  wiki/old-name.md -> wiki/new-name.md",
    ].join("\n"),
  );

  assert.deepEqual(
    files.map((file) => ({
      path: file.path,
      previousPath: file.previousPath,
      status: file.status,
      area: file.area,
    })),
    [
      {
        path: "wiki/profile/basic.md",
        previousPath: undefined,
        status: "modified",
        area: "wiki",
      },
      {
        path: "raw/inbox/source.md",
        previousPath: undefined,
        status: "added",
        area: "raw",
      },
      {
        path: "wiki/old.md",
        previousPath: undefined,
        status: "deleted",
        area: "wiki",
      },
      {
        path: "extracted/sources/new.md",
        previousPath: undefined,
        status: "untracked",
        area: "extracted",
      },
      {
        path: "wiki/new-name.md",
        previousPath: "wiki/old-name.md",
        status: "renamed",
        area: "wiki",
      },
    ],
  );
});

test("解析 Git 状态码", () => {
  assert.equal(parseStatusCode("??"), "untracked");
  assert.equal(parseStatusCode(" M"), "modified");
  assert.equal(parseStatusCode("A "), "added");
  assert.equal(parseStatusCode(" D"), "deleted");
  assert.equal(parseStatusCode("R "), "renamed");
  assert.equal(parseStatusCode("C "), "copied");
  assert.equal(parseStatusCode("!!"), "unknown");
});

test("解析并合并 numstat", () => {
  const unstaged = parseNumstat("5\t3\twiki/profile/basic.md\n-\t-\tassets/file.bin\n");
  const staged = parseNumstat("2\t1\twiki/profile/basic.md\n1\t0\twiki/new.md\n");
  const merged = mergeNumstat(unstaged, staged);

  assert.deepEqual(merged.get("wiki/profile/basic.md"), {
    insertions: 7,
    deletions: 4,
  });
  assert.deepEqual(merged.get("assets/file.bin"), {
    insertions: null,
    deletions: null,
  });
  assert.deepEqual(merged.get("wiki/new.md"), {
    insertions: 1,
    deletions: 0,
  });
});

test("按 Vault 区域分类", () => {
  assert.equal(getVaultArea("wiki/profile.md"), "wiki");
  assert.equal(getVaultArea("raw/inbox/source.md"), "raw");
  assert.equal(getVaultArea("extracted/sources/source.md"), "extracted");
  assert.equal(getVaultArea(".pkwiki/page_manifest.json"), "manifest");
  assert.equal(getVaultArea("outputs/index.json"), "outputs");
  assert.equal(getVaultArea("assets/photo.png"), "assets");
  assert.equal(getVaultArea("system/INDEX.md"), "system");
  assert.equal(getVaultArea("README.md"), "other");
});

test("diff 路径必须限制在 Vault root 内", () => {
  assert.equal(normalizeDiffPath(packageRoot, "wiki/profile.md"), "wiki/profile.md");
  assert.throws(() => normalizeDiffPath(packageRoot, "/tmp/file.md"), {
    name: "GitDiffError",
    code: "UNSAFE_DIFF_PATH",
  });
  assert.throws(() => normalizeDiffPath(packageRoot, "../file.md"), {
    name: "GitDiffError",
    code: "UNSAFE_DIFF_PATH",
  });
  assert.throws(() => normalizeDiffPath(packageRoot, "wiki//profile.md"), {
    name: "GitDiffError",
    code: "UNSAFE_DIFF_PATH",
  });
});

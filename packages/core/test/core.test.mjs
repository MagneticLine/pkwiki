import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  findVaultRoot,
  readVaultConfig,
  countFiles,
} from "../dist/index.js";

function createVault() {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-core-"));
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
  return root;
}

test("findVaultRoot 从子目录向上找到 Vault root", () => {
  const root = createVault();
  const nested = join(root, "wiki/concepts");
  mkdirSync(nested, { recursive: true });
  assert.equal(findVaultRoot(nested), root);
});

test("readVaultConfig 读取 pkwiki 配置", () => {
  const root = createVault();
  const config = readVaultConfig(root);
  assert.equal(config.profile, "pkwiki/0.1");
  assert.equal(config.okfVersion, "0.1");
});

test("countFiles 忽略占位和系统噪音文件", () => {
  const root = mkdtempSync(join(tmpdir(), "pkwiki-count-"));
  writeFileSync(join(root, ".gitkeep"), "");
  writeFileSync(join(root, ".DS_Store"), "");
  writeFileSync(join(root, "real.md"), "");
  assert.equal(countFiles(root), 1);
});


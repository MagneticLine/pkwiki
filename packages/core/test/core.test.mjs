import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  findVaultRoot,
  readVaultConfig,
  countFiles,
  computeSha256,
  createSlug,
  ingestSource,
  readSourceManifest,
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

test("createSlug 生成稳定 slug", () => {
  assert.equal(createSlug("Gemini Chat 记录.md"), "gemini-chat-记录-md");
});

test("ingestSource 复制 raw、生成 extracted 并更新 manifest", () => {
  const root = createVault();
  const input = join(root, "input.md");
  writeFileSync(input, "hello");

  const result = ingestSource(root, input, {
    type: "chat",
    domain: "personal",
    now: new Date("2026-07-01T10:00:00+08:00"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.reused, false);
  assert.equal(result.sourceId, "src:2026-07-01-input");
  assert.equal(result.checksum, computeSha256(input));
  assert.equal(existsSync(join(root, result.rawPath)), true);
  assert.equal(existsSync(join(root, result.extractedPath)), true);

  const manifest = readSourceManifest(root);
  assert.equal(manifest[result.sourceId].sourceId, result.sourceId);
});

test("ingestSource 对相同 checksum 复用已有 source", () => {
  const root = createVault();
  const input = join(root, "input.md");
  writeFileSync(input, "same content");

  const first = ingestSource(root, input, {
    type: "chat",
    domain: "personal",
    now: new Date("2026-07-01T10:00:00+08:00"),
  });
  const second = ingestSource(root, input, {
    type: "chat",
    domain: "personal",
    now: new Date("2026-07-01T11:00:00+08:00"),
  });

  assert.equal(second.reused, true);
  assert.equal(second.sourceId, first.sourceId);
});

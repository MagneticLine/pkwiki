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
  findVaultRoot,
  readVaultConfig,
  countFiles,
  computeSha256,
  chunkSource,
  createSlug,
  ingestSource,
  normalizeSourceStatus,
  parseExtractionArtifact,
  readChunkManifest,
  readSourceManifest,
  registerExtraction,
  splitTextIntoChunks,
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
  assert.equal(result.originalName, "input.md");
  assert.equal(result.sizeBytes, 5);
  assert.equal(result.ingestedAt, result.created);
  assert.equal(typeof result.mtime, "string");
  assert.equal(result.processingStatus, "registered");
  assert.equal(result.lifecycleStatus, "active");
  assert.equal(result.privacy, "private");
  assert.equal(result.language, "zh-CN");
  assert.equal(result.status, undefined);
  assert.equal(existsSync(join(root, result.rawPath)), true);
  assert.equal(existsSync(join(root, result.extractedPath)), true);

  const extracted = readFileSync(join(root, result.extractedPath), "utf8");
  assert.match(extracted, /raw_path: "raw\/inbox\/2026-07-01-input\.md"/);
  assert.match(extracted, /processing_status: registered/);
  assert.match(extracted, /lifecycle_status: active/);
  for (const heading of [
    "Source",
    "Normalized Content",
    "Summary",
    "Facts",
    "Events",
    "Entities",
    "Decisions",
    "Questions",
    "Uncertainty",
    "Candidate Wiki Targets",
    "Merge Coverage",
    "Deferred",
    "Discarded",
    "User Confirmation Needed",
  ]) {
    assert.match(extracted, new RegExp(`## ${heading}`));
  }

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

test("ingestSource 支持 privacy 和 language 参数", () => {
  const root = createVault();
  const input = join(root, "input.md");
  writeFileSync(input, "private content");

  const result = ingestSource(root, input, {
    type: "document",
    domain: "career",
    privacy: "restricted",
    language: "en-US",
    now: new Date("2026-07-28T10:00:00+08:00"),
  });

  assert.equal(result.privacy, "restricted");
  assert.equal(result.language, "en-US");
});

test("normalizeSourceStatus 兼容 legacy 并支持双状态", () => {
  assert.deepEqual(
    normalizeSourceStatus({ status: "registered" }),
    {
      processingStatus: "registered",
      lifecycleStatus: "active",
      legacy: true,
    },
  );
  assert.deepEqual(
    normalizeSourceStatus({
      processingStatus: "merged",
      lifecycleStatus: "deleted",
    }),
    {
      processingStatus: "merged",
      lifecycleStatus: "deleted",
      legacy: false,
    },
  );
});

test("normalizeSourceStatus 拒绝不完整和冲突状态", () => {
  assert.throws(
    () => normalizeSourceStatus({ processingStatus: "registered" }),
    /必须同时存在/,
  );
  assert.throws(
    () =>
      normalizeSourceStatus({
        processingStatus: "merged",
        lifecycleStatus: "deleted",
        status: "registered",
      }),
    /语义冲突/,
  );
});

test("splitTextIntoChunks 保留完整文本并优先按段落边界切分", () => {
  const text = "第一段。\n\n第二段比较长。\n继续第二段。\n\n第三段。";
  const chunks = splitTextIntoChunks(text, 16);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
  assert.equal(chunks.every((chunk) => chunk.text.length <= 16), true);
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks.at(-1).endLine >= 5, true);
});

test("chunkSource 生成稳定 chunk manifest 并支持重跑", () => {
  const root = createVault();
  const input = join(root, "long.md");
  writeFileSync(
    input,
    `${"第一段内容。".repeat(80)}\n\n${"第二段内容。".repeat(80)}`,
  );
  const source = ingestSource(root, input, {
    type: "document",
    domain: "learning",
    now: new Date("2026-07-28T10:00:00+08:00"),
  });

  const first = chunkSource(root, source.sourceId, {
    maxChars: 500,
    now: new Date("2026-07-28T10:05:00+08:00"),
  });
  const second = chunkSource(root, source.sourceId, {
    maxChars: 500,
    now: new Date("2026-07-28T10:06:00+08:00"),
  });

  assert.equal(first.chunkCount > 1, true);
  assert.deepEqual(
    second.chunks.map((chunk) => chunk.chunkId),
    first.chunks.map((chunk) => chunk.chunkId),
  );
  assert.deepEqual(
    second.chunks.map((chunk) => chunk.checksum),
    first.chunks.map((chunk) => chunk.checksum),
  );
  const manifest = readChunkManifest(root);
  assert.equal(Object.keys(manifest).length, first.chunkCount);
  for (const chunk of first.chunks) {
    assert.equal(existsSync(join(root, chunk.path)), true);
    assert.equal(chunk.charCount <= 500, true);
  }
});

test("registerExtraction 登记 artifact、生成视图并推进状态", () => {
  const root = createVault();
  const input = join(root, "source.md");
  writeFileSync(input, "我决定在阶段四先建立确定性协议。\n");
  const source = ingestSource(root, input, {
    type: "chat",
    domain: "project",
    now: new Date("2026-07-28T10:00:00+08:00"),
  });
  const chunks = chunkSource(root, source.sourceId, { maxChars: 500 });
  const artifactPath = join(root, "artifact.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:10:00+08:00",
      summary: "阶段四开发决策。",
      items: [
        {
          itemId: "decision:d1",
          kind: "decision",
          content: "阶段四先建立确定性协议。",
          confidence: "high",
          evidence: [
            {
              chunkId: chunks.chunks[0].chunkId,
              quote: "我决定在阶段四先建立确定性协议。",
            },
          ],
        },
      ],
    }),
  );

  const result = registerExtraction(root, artifactPath);
  assert.equal(result.processingStatus, "extracted");
  assert.equal(result.itemCount, 1);
  assert.equal(existsSync(join(root, result.artifactPath)), true);
  const view = readFileSync(join(root, result.extractedPath), "utf8");
  assert.match(view, /processing_status: extracted/);
  assert.match(view, /decision:d1/);

  const manifest = readSourceManifest(root);
  assert.equal(manifest[source.sourceId].processingStatus, "extracted");
  assert.equal(manifest[source.sourceId].status, undefined);
});

test("Extraction Artifact 拒绝重复 Item ID 和无效 evidence", () => {
  assert.throws(
    () =>
      parseExtractionArtifact({
        version: "pkwiki.extraction/0.1",
        sourceId: "src:test",
        sourceChecksum: "sha256:test",
        createdAt: "2026-07-28T10:00:00+08:00",
        summary: "summary",
        items: [
          {
            itemId: "fact:f1",
            kind: "fact",
            content: "one",
            confidence: "high",
            evidence: [{ chunkId: "chunk:test:0001" }],
          },
          {
            itemId: "fact:f1",
            kind: "fact",
            content: "two",
            confidence: "high",
            evidence: [{ chunkId: "chunk:test:0001" }],
          },
        ],
      }),
    /itemId 重复/,
  );

  const root = createVault();
  const input = join(root, "source.md");
  writeFileSync(input, "source");
  const source = ingestSource(root, input, {
    type: "document",
    domain: "test",
  });
  chunkSource(root, source.sourceId, { maxChars: 500 });
  const artifactPath = join(root, "invalid-artifact.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      version: "pkwiki.extraction/0.1",
      sourceId: source.sourceId,
      sourceChecksum: source.checksum,
      createdAt: "2026-07-28T10:00:00+08:00",
      summary: "summary",
      items: [
        {
          itemId: "fact:f1",
          kind: "fact",
          content: "fact",
          confidence: "medium",
          evidence: [{ chunkId: "chunk:missing:0001" }],
        },
      ],
    }),
  );
  assert.throws(() => registerExtraction(root, artifactPath), {
    code: "EXTRACTION_EVIDENCE_INVALID",
  });
});

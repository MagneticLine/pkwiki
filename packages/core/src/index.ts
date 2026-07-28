import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, parse, resolve } from "node:path";

export const PKWIKI_PROFILE = "pkwiki/0.1";
export const OKF_VERSION = "0.1";

export const CONFIG_RELATIVE_PATH = ".pkwiki/config.json";

export const REQUIRED_DIRECTORIES = [
  "raw",
  "extracted",
  "wiki",
  "outputs",
  "assets",
  "system",
  ".pkwiki",
] as const;

export const REQUIRED_FILES = [
  "AGENTS.md",
  "SCHEMA.md",
  "system/INDEX.md",
  "system/LOG.md",
  "system/PAGE_TYPES.md",
  "system/INGEST_RULES.md",
  "system/LINT_RULES.md",
  "system/PRIVACY_RULES.md",
  ".pkwiki/config.json",
  ".pkwiki/source_manifest.json",
  ".pkwiki/chunk_manifest.json",
  ".pkwiki/page_manifest.json",
] as const;

export type VaultConfig = {
  profile: string;
  okfVersion: string;
  wikiRoot: string;
  rawRoot: string;
  extractedRoot: string;
  outputsRoot: string;
};

export type Vault = {
  root: string;
  config: VaultConfig;
};

export const SOURCE_PROCESSING_STATUSES = [
  "registered",
  "extracted",
  "partially_merged",
  "merged",
] as const;

export const SOURCE_LIFECYCLE_STATUSES = [
  "active",
  "archived",
  "deleted",
] as const;

export type SourceProcessingStatus =
  (typeof SOURCE_PROCESSING_STATUSES)[number];
export type SourceLifecycleStatus =
  (typeof SOURCE_LIFECYCLE_STATUSES)[number];
export type LegacySourceStatus = "registered";

export type SourceManifestEntry = {
  sourceId: string;
  originalPath: string;
  originalName?: string;
  rawPath: string;
  extractedPath: string;
  type: string;
  domain: string;
  checksum: string;
  sizeBytes?: number;
  created: string;
  ingestedAt?: string;
  mtime?: string;
  processingStatus?: SourceProcessingStatus;
  lifecycleStatus?: SourceLifecycleStatus;
  status?: LegacySourceStatus;
  privacy?: string;
  language?: string;
};

export type NormalizedSourceStatus = {
  processingStatus: SourceProcessingStatus;
  lifecycleStatus: SourceLifecycleStatus;
  legacy: boolean;
};

export type SourceManifest = Record<string, SourceManifestEntry>;

export type ChunkManifestEntry = {
  chunkId: string;
  sourceId: string;
  index: number;
  path: string;
  startLine: number;
  endLine: number;
  charCount: number;
  checksum: string;
  sourceChecksum: string;
  createdAt: string;
};

export type ChunkManifest = Record<string, ChunkManifestEntry>;

export const EXTRACTION_ITEM_KINDS = [
  "fact",
  "event",
  "entity",
  "decision",
  "question",
  "uncertainty",
] as const;

export const EXTRACTION_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export type ExtractionItemKind = (typeof EXTRACTION_ITEM_KINDS)[number];
export type ExtractionConfidence =
  (typeof EXTRACTION_CONFIDENCE_LEVELS)[number];

export type ExtractionEvidence = {
  chunkId: string;
  quote?: string;
};

export type ExtractionItem = {
  itemId: string;
  kind: ExtractionItemKind;
  content: string;
  confidence: ExtractionConfidence;
  evidence: ExtractionEvidence[];
};

export type ExtractionArtifact = {
  version: "pkwiki.extraction/0.1";
  sourceId: string;
  sourceChecksum: string;
  createdAt: string;
  normalizedContent?: string;
  summary: string;
  items: ExtractionItem[];
};

export type IngestSourceOptions = {
  type: string;
  domain: string;
  title?: string;
  privacy?: string;
  language?: string;
  now?: Date;
};

export type IngestSourceResult = SourceManifestEntry & {
  ok: true;
  reused: boolean;
};

export type ChunkSourceOptions = {
  maxChars?: number;
  now?: Date;
};

export type ChunkSourceResult = {
  ok: true;
  sourceId: string;
  sourceChecksum: string;
  maxChars: number;
  chunkCount: number;
  chunks: ChunkManifestEntry[];
};

export type RegisterExtractionResult = {
  ok: true;
  sourceId: string;
  artifactPath: string;
  extractedPath: string;
  itemCount: number;
  processingStatus: SourceProcessingStatus;
  lifecycleStatus: SourceLifecycleStatus;
};

export class VaultNotFoundError extends Error {
  constructor(startPath: string) {
    super(`未找到 pkwiki Vault：${startPath}`);
    this.name = "VaultNotFoundError";
  }
}

export class InvalidVaultConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVaultConfigError";
  }
}

export class InvalidSourceManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSourceManifestError";
  }
}

export class SourceContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "SourceContractError";
  }
}

export function resolveStartPath(path?: string): string {
  return resolve(path ?? process.cwd());
}

export function findVaultRoot(startPath = process.cwd()): string | null {
  let current = resolveStartPath(startPath);
  if (existsSync(current) && !statSync(current).isDirectory()) {
    current = dirname(current);
  }

  while (true) {
    const configPath = join(current, CONFIG_RELATIVE_PATH);
    if (existsSync(configPath)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function readVaultConfig(vaultRoot: string): VaultConfig {
  const configPath = join(vaultRoot, CONFIG_RELATIVE_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new InvalidVaultConfigError(
      `无法读取或解析 ${CONFIG_RELATIVE_PATH}: ${String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new InvalidVaultConfigError(`${CONFIG_RELATIVE_PATH} 必须是 JSON 对象`);
  }

  const config = parsed as Partial<VaultConfig>;
  const requiredKeys: Array<keyof VaultConfig> = [
    "profile",
    "okfVersion",
    "wikiRoot",
    "rawRoot",
    "extractedRoot",
    "outputsRoot",
  ];
  for (const key of requiredKeys) {
    if (typeof config[key] !== "string" || config[key] === "") {
      throw new InvalidVaultConfigError(`${CONFIG_RELATIVE_PATH} 缺少字段 ${key}`);
    }
  }

  if (config.profile !== PKWIKI_PROFILE) {
    throw new InvalidVaultConfigError(
      `profile 应为 ${PKWIKI_PROFILE}，实际为 ${config.profile}`,
    );
  }
  if (config.okfVersion !== OKF_VERSION) {
    throw new InvalidVaultConfigError(
      `okfVersion 应为 ${OKF_VERSION}，实际为 ${config.okfVersion}`,
    );
  }

  return config as VaultConfig;
}

export function loadVault(startPath = process.cwd()): Vault {
  const root = findVaultRoot(startPath);
  if (!root) {
    throw new VaultNotFoundError(startPath);
  }
  return {
    root,
    config: readVaultConfig(root),
  };
}

export function resolveVaultPath(vaultRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    return relativePath;
  }
  return join(vaultRoot, relativePath);
}

export function countFiles(root: string): number {
  if (!existsSync(root)) {
    return 0;
  }
  const stat = statSync(root);
  if (!stat.isDirectory()) {
    return 0;
  }

  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === ".gitkeep" ||
      entry.name === ".DS_Store"
    ) {
      continue;
    }
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

export function fileExists(vaultRoot: string, relativePath: string): boolean {
  return existsSync(join(vaultRoot, relativePath));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ingestSource(
  vaultStartPath: string,
  inputPath: string,
  options: IngestSourceOptions,
): IngestSourceResult {
  if (!options.type) {
    throw new Error("ingest 需要 --type");
  }
  if (!options.domain) {
    throw new Error("ingest 需要 --domain");
  }
  if (options.privacy !== undefined && options.privacy.trim() === "") {
    throw new Error("ingest 的 --privacy 不能为空");
  }
  if (options.language !== undefined && options.language.trim() === "") {
    throw new Error("ingest 的 --language 不能为空");
  }

  const vault = loadVault(vaultStartPath);
  const absoluteInputPath = resolve(inputPath);
  if (!existsSync(absoluteInputPath)) {
    throw new Error(`输入文件不存在或不是普通文件：${absoluteInputPath}`);
  }
  const inputStat = statSync(absoluteInputPath);
  if (!inputStat.isFile()) {
    throw new Error(`输入文件不存在或不是普通文件：${absoluteInputPath}`);
  }

  const manifest = readSourceManifest(vault.root);
  const checksum = computeSha256(absoluteInputPath);
  const existing = Object.values(manifest).find((entry) => entry.checksum === checksum);
  if (existing) {
    return {
      ok: true,
      reused: true,
      ...existing,
    };
  }

  const now = options.now ?? new Date();
  const date = formatLocalDate(now);
  const created = formatLocalDateTime(now);
  const privacy = options.privacy?.trim() || "private";
  const language = options.language?.trim() || "zh-CN";
  const slug = createSlug(options.title || parse(absoluteInputPath).name);
  const sourceId = createUniqueSourceId(manifest, date, slug);
  const rawPath = createUniqueRawPath(
    vault.root,
    join("raw", "inbox"),
    `${date}-${slug}${extname(absoluteInputPath)}`,
  );
  const extractedPath = join(
    "extracted",
    "sources",
    `${sourceIdToFileName(sourceId)}.md`,
  );

  mkdirSync(join(vault.root, dirname(rawPath)), { recursive: true });
  mkdirSync(join(vault.root, dirname(extractedPath)), { recursive: true });
  copyFileSync(absoluteInputPath, join(vault.root, rawPath));
  writeFileSync(
    join(vault.root, extractedPath),
    buildExtractedSourceTemplate({
      sourceId,
      rawPath,
      type: options.type,
      domain: options.domain,
      created,
      checksum,
      privacy,
      language,
    }),
    "utf8",
  );

  const entry: SourceManifestEntry = {
    sourceId,
    originalPath: absoluteInputPath,
    originalName: parse(absoluteInputPath).base,
    rawPath,
    extractedPath,
    type: options.type,
    domain: options.domain,
    checksum,
    sizeBytes: inputStat.size,
    created,
    ingestedAt: created,
    mtime: inputStat.mtime.toISOString(),
    processingStatus: "registered",
    lifecycleStatus: "active",
    privacy,
    language,
  };

  manifest[sourceId] = entry;
  writeSourceManifest(vault.root, manifest);

  return {
    ok: true,
    reused: false,
    ...entry,
  };
}

export function readSourceManifest(vaultRoot: string): SourceManifest {
  const manifestPath = join(vaultRoot, ".pkwiki/source_manifest.json");
  if (!existsSync(manifestPath)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new InvalidSourceManifestError(
      `无法读取或解析 .pkwiki/source_manifest.json: ${String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new InvalidSourceManifestError(".pkwiki/source_manifest.json 必须是 JSON 对象");
  }

  return parsed as SourceManifest;
}

export function writeSourceManifest(
  vaultRoot: string,
  manifest: SourceManifest,
): void {
  const manifestPath = join(vaultRoot, ".pkwiki/source_manifest.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function readChunkManifest(vaultRoot: string): ChunkManifest {
  const manifestPath = join(vaultRoot, ".pkwiki/chunk_manifest.json");
  if (!existsSync(manifestPath)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new SourceContractError(
      "INVALID_CHUNK_MANIFEST",
      `无法读取或解析 .pkwiki/chunk_manifest.json: ${String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new SourceContractError(
      "INVALID_CHUNK_MANIFEST",
      ".pkwiki/chunk_manifest.json 必须是 JSON 对象",
    );
  }

  return parsed as ChunkManifest;
}

export function writeChunkManifest(
  vaultRoot: string,
  manifest: ChunkManifest,
): void {
  const manifestPath = join(vaultRoot, ".pkwiki/chunk_manifest.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function chunkSource(
  vaultStartPath: string,
  sourceId: string,
  options: ChunkSourceOptions = {},
): ChunkSourceResult {
  const maxChars = options.maxChars ?? 4000;
  if (!Number.isInteger(maxChars) || maxChars < 500 || maxChars > 20_000) {
    throw new SourceContractError(
      "INVALID_MAX_CHARS",
      "--max-chars 必须是 500 到 20000 之间的整数",
      2,
    );
  }

  const vault = loadVault(vaultStartPath);
  const sourceManifest = readSourceManifest(vault.root);
  const source = sourceManifest[sourceId];
  if (!source) {
    throw new SourceContractError(
      "SOURCE_NOT_FOUND",
      `Source 未登记：${sourceId}`,
    );
  }

  const status = normalizeSourceStatus(source);
  if (status.lifecycleStatus !== "active") {
    throw new SourceContractError(
      "SOURCE_NOT_ACTIVE",
      `Source lifecycle 不是 active：${sourceId}`,
    );
  }

  const rawPath = join(vault.root, source.rawPath);
  if (!existsSync(rawPath) || !statSync(rawPath).isFile()) {
    throw new SourceContractError(
      "RAW_SOURCE_MISSING",
      `Raw Source 不存在：${source.rawPath}`,
    );
  }
  if (!isSupportedTextSource(source.rawPath)) {
    throw new SourceContractError(
      "UNSUPPORTED_SOURCE_TYPE",
      `0007 只支持 Markdown 和纯文本 Source：${source.rawPath}`,
    );
  }

  const actualChecksum = computeSha256(rawPath);
  if (actualChecksum !== source.checksum) {
    throw new SourceContractError(
      "SOURCE_CHECKSUM_MISMATCH",
      `Raw Source checksum 与 manifest 不一致：${source.rawPath}`,
    );
  }

  const text = readFileSync(rawPath, "utf8").replace(/\r\n?/g, "\n");
  if (text.length === 0) {
    throw new SourceContractError("EMPTY_SOURCE", `Raw Source 为空：${source.rawPath}`);
  }

  const now = formatLocalDateTime(options.now ?? new Date());
  const chunks = splitTextIntoChunks(text, maxChars).map((chunk, chunkIndex) => {
    const index = chunkIndex + 1;
    const chunkId = createChunkId(sourceId, index);
    const relativePath = join(
      "extracted",
      "chunks",
      sourceIdToFileName(sourceId),
      `${String(index).padStart(4, "0")}.md`,
    );
    return {
      entry: {
        chunkId,
        sourceId,
        index,
        path: relativePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        charCount: chunk.text.length,
        checksum: computeSha256Text(chunk.text),
        sourceChecksum: source.checksum,
        createdAt: now,
      } satisfies ChunkManifestEntry,
      text: chunk.text,
    };
  });

  replaceSourceChunks(vault.root, sourceId, chunks);

  return {
    ok: true,
    sourceId,
    sourceChecksum: source.checksum,
    maxChars,
    chunkCount: chunks.length,
    chunks: chunks.map((chunk) => chunk.entry),
  };
}

export function parseExtractionArtifact(value: unknown): ExtractionArtifact {
  if (!isRecord(value)) {
    throw invalidExtraction("Extraction Artifact 必须是 JSON 对象");
  }
  if (value.version !== "pkwiki.extraction/0.1") {
    throw invalidExtraction("Extraction Artifact version 必须是 pkwiki.extraction/0.1");
  }
  const sourceId = requireNonEmptyString(value.sourceId, "sourceId");
  const sourceChecksum = requireNonEmptyString(
    value.sourceChecksum,
    "sourceChecksum",
  );
  const createdAt = requireNonEmptyString(value.createdAt, "createdAt");
  const summary = requireNonEmptyString(value.summary, "summary");
  const normalizedContent =
    value.normalizedContent === undefined
      ? undefined
      : requireNonEmptyString(value.normalizedContent, "normalizedContent");

  if (!Array.isArray(value.items)) {
    throw invalidExtraction("Extraction Artifact items 必须是数组");
  }

  const itemIds = new Set<string>();
  const items = value.items.map((rawItem, itemIndex) => {
    if (!isRecord(rawItem)) {
      throw invalidExtraction(`items[${itemIndex}] 必须是对象`);
    }
    const kind = rawItem.kind;
    if (!EXTRACTION_ITEM_KINDS.includes(kind as ExtractionItemKind)) {
      throw invalidExtraction(`items[${itemIndex}] kind 非法：${String(kind)}`);
    }
    const itemId = requireNonEmptyString(rawItem.itemId, `items[${itemIndex}].itemId`);
    if (!itemId.startsWith(`${kind}:`)) {
      throw invalidExtraction(`itemId 必须以 ${kind}: 开头：${itemId}`);
    }
    if (itemIds.has(itemId)) {
      throw invalidExtraction(`itemId 重复：${itemId}`);
    }
    itemIds.add(itemId);

    const confidence = rawItem.confidence;
    if (
      !EXTRACTION_CONFIDENCE_LEVELS.includes(
        confidence as ExtractionConfidence,
      )
    ) {
      throw invalidExtraction(
        `items[${itemIndex}] confidence 非法：${String(confidence)}`,
      );
    }
    if (!Array.isArray(rawItem.evidence) || rawItem.evidence.length === 0) {
      throw invalidExtraction(`items[${itemIndex}] evidence 不能为空`);
    }
    const evidence = rawItem.evidence.map((rawEvidence, evidenceIndex) => {
      if (!isRecord(rawEvidence)) {
        throw invalidExtraction(
          `items[${itemIndex}].evidence[${evidenceIndex}] 必须是对象`,
        );
      }
      const chunkId = requireNonEmptyString(
        rawEvidence.chunkId,
        `items[${itemIndex}].evidence[${evidenceIndex}].chunkId`,
      );
      let quote: string | undefined;
      if (rawEvidence.quote !== undefined) {
        quote = requireNonEmptyString(
          rawEvidence.quote,
          `items[${itemIndex}].evidence[${evidenceIndex}].quote`,
        );
        if (quote.length > 500) {
          throw invalidExtraction("evidence quote 不能超过 500 字符");
        }
      }
      return { chunkId, ...(quote ? { quote } : {}) };
    });

    return {
      itemId,
      kind: kind as ExtractionItemKind,
      content: requireNonEmptyString(
        rawItem.content,
        `items[${itemIndex}].content`,
      ),
      confidence: confidence as ExtractionConfidence,
      evidence,
    } satisfies ExtractionItem;
  });

  return {
    version: "pkwiki.extraction/0.1",
    sourceId,
    sourceChecksum,
    createdAt,
    ...(normalizedContent ? { normalizedContent } : {}),
    summary,
    items,
  };
}

export function readExtractionArtifact(path: string): ExtractionArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw invalidExtraction(`无法读取或解析 Extraction Artifact: ${String(error)}`);
  }
  return parseExtractionArtifact(parsed);
}

export function registerExtraction(
  vaultStartPath: string,
  artifactInputPath: string,
): RegisterExtractionResult {
  const vault = loadVault(vaultStartPath);
  const artifact = readExtractionArtifact(resolve(artifactInputPath));
  const sourceManifest = readSourceManifest(vault.root);
  const source = sourceManifest[artifact.sourceId];
  if (!source) {
    throw new SourceContractError(
      "SOURCE_NOT_FOUND",
      `Source 未登记：${artifact.sourceId}`,
    );
  }
  const status = normalizeSourceStatus(source);
  if (status.lifecycleStatus !== "active") {
    throw new SourceContractError(
      "SOURCE_NOT_ACTIVE",
      `Source lifecycle 不是 active：${artifact.sourceId}`,
    );
  }
  if (artifact.sourceChecksum !== source.checksum) {
    throw new SourceContractError(
      "EXTRACTION_SOURCE_MISMATCH",
      `Extraction sourceChecksum 与 Source Manifest 不一致：${artifact.sourceId}`,
    );
  }

  const chunkManifest = readChunkManifest(vault.root);
  validateExtractionEvidence(vault.root, artifact, chunkManifest);

  const sourceFileName = sourceIdToFileName(artifact.sourceId);
  const artifactPath = join("extracted", "data", `${sourceFileName}.json`);
  const extractedPath = source.extractedPath;
  const updatedSource: SourceManifestEntry = {
    ...source,
    processingStatus: "extracted",
    lifecycleStatus: status.lifecycleStatus,
  };
  delete updatedSource.status;

  const artifactAbsolutePath = join(vault.root, artifactPath);
  const extractedAbsolutePath = join(vault.root, extractedPath);
  mkdirSync(dirname(artifactAbsolutePath), { recursive: true });
  mkdirSync(dirname(extractedAbsolutePath), { recursive: true });
  writeFileSync(
    artifactAbsolutePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    extractedAbsolutePath,
    renderExtractedSource(updatedSource, artifact, chunkManifest),
    "utf8",
  );
  sourceManifest[artifact.sourceId] = updatedSource;
  writeSourceManifest(vault.root, sourceManifest);

  return {
    ok: true,
    sourceId: artifact.sourceId,
    artifactPath,
    extractedPath,
    itemCount: artifact.items.length,
    processingStatus: "extracted",
    lifecycleStatus: status.lifecycleStatus,
  };
}

export function computeSha256(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return `sha256:${hash.digest("hex")}`;
}

export function normalizeSourceStatus(
  entry: SourceManifestEntry,
): NormalizedSourceStatus {
  const hasProcessingStatus = entry.processingStatus !== undefined;
  const hasLifecycleStatus = entry.lifecycleStatus !== undefined;

  if (hasProcessingStatus !== hasLifecycleStatus) {
    throw new InvalidSourceManifestError(
      "source manifest 的 processingStatus 和 lifecycleStatus 必须同时存在",
    );
  }

  if (hasProcessingStatus && hasLifecycleStatus) {
    if (!isSourceProcessingStatus(entry.processingStatus)) {
      throw new InvalidSourceManifestError(
        `非法 processingStatus：${String(entry.processingStatus)}`,
      );
    }
    if (!isSourceLifecycleStatus(entry.lifecycleStatus)) {
      throw new InvalidSourceManifestError(
        `非法 lifecycleStatus：${String(entry.lifecycleStatus)}`,
      );
    }
    if (entry.status !== undefined && entry.status !== "registered") {
      throw new InvalidSourceManifestError(
        `非法 legacy status：${String(entry.status)}`,
      );
    }
    if (entry.status === "registered" && entry.processingStatus !== "registered") {
      throw new InvalidSourceManifestError(
        "source manifest 的新旧状态字段语义冲突",
      );
    }
    return {
      processingStatus: entry.processingStatus,
      lifecycleStatus: entry.lifecycleStatus,
      legacy: false,
    };
  }

  if (entry.status === "registered") {
    return {
      processingStatus: "registered",
      lifecycleStatus: "active",
      legacy: true,
    };
  }

  throw new InvalidSourceManifestError("source manifest 缺少合法 Source 状态");
}

export function isSourceProcessingStatus(
  value: unknown,
): value is SourceProcessingStatus {
  return SOURCE_PROCESSING_STATUSES.includes(value as SourceProcessingStatus);
}

export function isSourceLifecycleStatus(
  value: unknown,
): value is SourceLifecycleStatus {
  return SOURCE_LIFECYCLE_STATUSES.includes(value as SourceLifecycleStatus);
}

export type TextChunk = {
  text: string;
  startLine: number;
  endLine: number;
};

export function splitTextIntoChunks(text: string, maxChars: number): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error("maxChars 必须是正整数");
  }
  if (text.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  const separator = /\n{2,}/g;
  let cursor = 0;
  for (const match of text.matchAll(separator)) {
    const matchIndex = match.index ?? cursor;
    const end = matchIndex + match[0].length;
    blocks.push(text.slice(cursor, end));
    cursor = end;
  }
  if (cursor < text.length) {
    blocks.push(text.slice(cursor));
  }

  const pieces: TextChunk[] = [];
  let currentLine = 1;
  for (const block of blocks) {
    for (let offset = 0; offset < block.length; offset += maxChars) {
      const piece = block.slice(offset, offset + maxChars);
      const startLine = currentLine;
      const endLine = startLine + countNewlines(piece);
      pieces.push({ text: piece, startLine, endLine });
      currentLine = endLine;
    }
  }

  const chunks: TextChunk[] = [];
  let current: TextChunk | null = null;
  for (const piece of pieces) {
    if (current && current.text.length + piece.text.length <= maxChars) {
      current.text += piece.text;
      current.endLine = piece.endLine;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    current = { ...piece };
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function replaceSourceChunks(
  vaultRoot: string,
  sourceId: string,
  chunks: Array<{ entry: ChunkManifestEntry; text: string }>,
): void {
  const targetRelativeDirectory = join(
    "extracted",
    "chunks",
    sourceIdToFileName(sourceId),
  );
  const targetDirectory = join(vaultRoot, targetRelativeDirectory);
  const parentDirectory = dirname(targetDirectory);
  const suffix = `${process.pid}-${Date.now()}`;
  const temporaryDirectory = `${targetDirectory}.tmp-${suffix}`;
  const backupDirectory = `${targetDirectory}.bak-${suffix}`;
  mkdirSync(temporaryDirectory, { recursive: true });

  try {
    for (const chunk of chunks) {
      writeFileSync(
        join(temporaryDirectory, parse(chunk.entry.path).base),
        chunk.text,
        "utf8",
      );
    }

    const manifest = readChunkManifest(vaultRoot);
    const nextManifest = Object.fromEntries(
      Object.entries(manifest).filter(([, entry]) => entry.sourceId !== sourceId),
    ) as ChunkManifest;
    for (const chunk of chunks) {
      nextManifest[chunk.entry.chunkId] = chunk.entry;
    }

    mkdirSync(parentDirectory, { recursive: true });
    const hadExistingDirectory = existsSync(targetDirectory);
    if (hadExistingDirectory) {
      renameSync(targetDirectory, backupDirectory);
    }
    try {
      renameSync(temporaryDirectory, targetDirectory);
      writeChunkManifest(vaultRoot, nextManifest);
      if (hadExistingDirectory) {
        rmSync(backupDirectory, { recursive: true, force: true });
      }
    } catch (error) {
      rmSync(targetDirectory, { recursive: true, force: true });
      if (hadExistingDirectory && existsSync(backupDirectory)) {
        renameSync(backupDirectory, targetDirectory);
      }
      throw error;
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    rmSync(backupDirectory, { recursive: true, force: true });
  }
}

function createChunkId(sourceId: string, index: number): string {
  const sourcePart = sourceId.startsWith("src:") ? sourceId.slice(4) : sourceId;
  return `chunk:${sourcePart}:${String(index).padStart(4, "0")}`;
}

function computeSha256Text(text: string): string {
  const hash = createHash("sha256");
  hash.update(text, "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function countNewlines(text: string): number {
  return text.match(/\n/g)?.length ?? 0;
}

function isSupportedTextSource(path: string): boolean {
  return [".md", ".markdown", ".txt"].includes(extname(path).toLowerCase());
}

function invalidExtraction(message: string): SourceContractError {
  return new SourceContractError("INVALID_EXTRACTION_ARTIFACT", message, 2);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidExtraction(`${field} 必须是非空字符串`);
  }
  return value;
}

function validateExtractionEvidence(
  vaultRoot: string,
  artifact: ExtractionArtifact,
  chunkManifest: ChunkManifest,
): void {
  for (const item of artifact.items) {
    for (const evidence of item.evidence) {
      const chunk = chunkManifest[evidence.chunkId];
      if (
        !chunk ||
        chunk.sourceId !== artifact.sourceId ||
        chunk.sourceChecksum !== artifact.sourceChecksum
      ) {
        throw new SourceContractError(
          "EXTRACTION_EVIDENCE_INVALID",
          `Information Item ${item.itemId} 引用了无效 chunk：${evidence.chunkId}`,
          2,
        );
      }
      const chunkPath = join(vaultRoot, chunk.path);
      if (
        !existsSync(chunkPath) ||
        !statSync(chunkPath).isFile() ||
        computeSha256(chunkPath) !== chunk.checksum
      ) {
        throw new SourceContractError(
          "EXTRACTION_EVIDENCE_INVALID",
          `Evidence chunk 文件缺失或 checksum 过期：${evidence.chunkId}`,
          2,
        );
      }
      if (
        evidence.quote &&
        !readFileSync(chunkPath, "utf8").includes(evidence.quote)
      ) {
        throw new SourceContractError(
          "EXTRACTION_EVIDENCE_INVALID",
          `Evidence quote 不存在于 chunk：${evidence.chunkId}`,
          2,
        );
      }
    }
  }
}

function renderExtractedSource(
  source: SourceManifestEntry,
  artifact: ExtractionArtifact,
  chunkManifest: ChunkManifest,
): string {
  const chunks = Object.values(chunkManifest)
    .filter((entry) => entry.sourceId === source.sourceId)
    .sort((left, right) => left.index - right.index);
  const normalizedContent = artifact.normalizedContent
    ? artifact.normalizedContent
    : chunks
        .map((chunk) => {
          const relativeChunkPath = chunk.path.replace(/^extracted\//, "../");
          return `- [${chunk.chunkId}](${relativeChunkPath})`;
        })
        .join("\n");

  const sectionKinds: Array<[string, ExtractionItemKind]> = [
    ["Facts", "fact"],
    ["Events", "event"],
    ["Entities", "entity"],
    ["Decisions", "decision"],
    ["Questions", "question"],
    ["Uncertainty", "uncertainty"],
  ];
  const lines = [
    "---",
    `source_id: ${yamlScalar(source.sourceId)}`,
    `raw_path: ${yamlScalar(source.rawPath)}`,
    `type: ${yamlScalar(source.type)}`,
    `domain: ${yamlScalar(source.domain)}`,
    `created: ${yamlScalar(source.created)}`,
    "processing_status: extracted",
    `lifecycle_status: ${source.lifecycleStatus ?? "active"}`,
    `privacy: ${yamlScalar(source.privacy ?? "private")}`,
    `language: ${yamlScalar(source.language ?? "zh-CN")}`,
    "---",
    "",
    "# Extracted Source",
    "",
    "## Source",
    "",
    `- Source ID: ${source.sourceId}`,
    `- Raw path: ${source.rawPath}`,
    `- Type: ${source.type}`,
    `- Domain: ${source.domain}`,
    `- Checksum: ${source.checksum}`,
    `- Privacy: ${source.privacy ?? "private"}`,
    `- Language: ${source.language ?? "zh-CN"}`,
    "- Processing status: extracted",
    `- Lifecycle status: ${source.lifecycleStatus ?? "active"}`,
    "",
    "## Normalized Content",
    "",
    normalizedContent,
    "",
    "## Summary",
    "",
    artifact.summary,
    "",
  ];

  for (const [heading, kind] of sectionKinds) {
    lines.push(`## ${heading}`, "");
    for (const item of artifact.items.filter((candidate) => candidate.kind === kind)) {
      lines.push(
        `- **${item.itemId}** (${item.confidence})`,
        `  - Content: ${indentMultiline(item.content, "    ")}`,
      );
      for (const evidence of item.evidence) {
        const quote = evidence.quote ? `: ${evidence.quote}` : "";
        lines.push(`  - Evidence: \`${evidence.chunkId}\`${quote}`);
      }
    }
    lines.push("");
  }

  lines.push(
    "## Candidate Wiki Targets",
    "",
    "## Merge Coverage",
    "",
    "## Deferred",
    "",
    "## Discarded",
    "",
    "## User Confirmation Needed",
    "",
  );
  return lines.join("\n");
}

function indentMultiline(value: string, indent: string): string {
  return value.replace(/\n/g, `\n${indent}`);
}

export function createSlug(input: string): string {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "source";
}

export function sourceIdToFileName(sourceId: string): string {
  return sourceId.replace(/:/g, "-");
}

function createUniqueSourceId(
  manifest: SourceManifest,
  date: string,
  slug: string,
): string {
  const base = `src:${date}-${slug}`;
  if (!manifest[base]) {
    return base;
  }

  let index = 2;
  while (manifest[`${base}-${index}`]) {
    index += 1;
  }
  return `${base}-${index}`;
}

function createUniqueRawPath(
  vaultRoot: string,
  relativeDirectory: string,
  fileName: string,
): string {
  const parsed = parse(fileName);
  let candidate = join(relativeDirectory, fileName);
  let index = 2;

  while (existsSync(join(vaultRoot, candidate))) {
    candidate = join(relativeDirectory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }

  return candidate;
}

function buildExtractedSourceTemplate(input: {
  sourceId: string;
  rawPath: string;
  type: string;
  domain: string;
  created: string;
  checksum: string;
  privacy: string;
  language: string;
}): string {
  return [
    "---",
    `source_id: ${yamlScalar(input.sourceId)}`,
    `raw_path: ${yamlScalar(input.rawPath)}`,
    `type: ${yamlScalar(input.type)}`,
    `domain: ${yamlScalar(input.domain)}`,
    `created: ${yamlScalar(input.created)}`,
    "processing_status: registered",
    "lifecycle_status: active",
    `privacy: ${yamlScalar(input.privacy)}`,
    `language: ${yamlScalar(input.language)}`,
    "---",
    "",
    "# Extracted Source",
    "",
    "## Source",
    "",
    `- Source ID: ${input.sourceId}`,
    `- Raw path: ${input.rawPath}`,
    `- Type: ${input.type}`,
    `- Domain: ${input.domain}`,
    `- Checksum: ${input.checksum}`,
    `- Privacy: ${input.privacy}`,
    `- Language: ${input.language}`,
    "- Processing status: registered",
    "- Lifecycle status: active",
    "",
    "## Normalized Content",
    "",
    "## Summary",
    "",
    "## Facts",
    "",
    "## Events",
    "",
    "## Entities",
    "",
    "## Decisions",
    "",
    "## Questions",
    "",
    "## Uncertainty",
    "",
    "## Candidate Wiki Targets",
    "",
    "## Merge Coverage",
    "",
    "## Deferred",
    "",
    "## Discarded",
    "",
    "## User Confirmation Needed",
    "",
  ].join("\n");
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMinute = String(absOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
}

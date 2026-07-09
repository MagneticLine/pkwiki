import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

export type SourceStatus = "registered";

export type SourceManifestEntry = {
  sourceId: string;
  originalPath: string;
  rawPath: string;
  extractedPath: string;
  type: string;
  domain: string;
  checksum: string;
  created: string;
  status: SourceStatus;
};

export type SourceManifest = Record<string, SourceManifestEntry>;

export type IngestSourceOptions = {
  type: string;
  domain: string;
  title?: string;
  now?: Date;
};

export type IngestSourceResult = SourceManifestEntry & {
  ok: true;
  reused: boolean;
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

  const vault = loadVault(vaultStartPath);
  const absoluteInputPath = resolve(inputPath);
  if (!existsSync(absoluteInputPath) || !statSync(absoluteInputPath).isFile()) {
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
    }),
    "utf8",
  );

  const entry: SourceManifestEntry = {
    sourceId,
    originalPath: absoluteInputPath,
    rawPath,
    extractedPath,
    type: options.type,
    domain: options.domain,
    checksum,
    created,
    status: "registered",
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

export function computeSha256(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return `sha256:${hash.digest("hex")}`;
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
}): string {
  return [
    "---",
    `source_id: ${input.sourceId}`,
    `source_file: ${input.rawPath}`,
    `type: ${input.type}`,
    `domain: ${input.domain}`,
    "status: pending",
    `created: ${input.created}`,
    "---",
    "",
    "# Extracted Source",
    "",
    "## Summary",
    "",
    "## Key Facts",
    "",
    "## Entities",
    "",
    "## Decisions",
    "",
    "## Open Questions",
    "",
    "## Uncertainty",
    "",
    "## Merge Notes",
    "",
  ].join("\n");
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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

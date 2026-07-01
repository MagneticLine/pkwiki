import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import {
  OKF_VERSION,
  PKWIKI_PROFILE,
  REQUIRED_DIRECTORIES,
  REQUIRED_FILES,
  findVaultRoot,
  readVaultConfig,
  readSourceManifest,
} from "@pkwiki/core";

export const REQUIRED_FRONTMATTER_KEYS = [
  "okf_version",
  "profile",
  "id",
  "type",
  "title",
  "description",
  "domain",
  "status",
  "created",
  "updated",
  "confidence",
  "privacy",
  "sources",
  "tags",
] as const;

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
  target?: string;
};

export type ValidationResult = {
  ok: boolean;
  vaultRoot: string | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

type FrontmatterParseResult = {
  frontmatter: Record<string, unknown>;
  body: string;
};

const RESERVED_WIKI_FILES = new Set(["index.md", "log.md"]);
const MARKDOWN_LINK_RE = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function validateVault(startPath = process.cwd()): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const vaultRoot = findVaultRoot(startPath);

  if (!vaultRoot) {
    errors.push({
      severity: "error",
      code: "VAULT_NOT_FOUND",
      message: `未找到 pkwiki Vault：${startPath}`,
    });
    return { ok: false, vaultRoot: null, errors, warnings };
  }

  try {
    readVaultConfig(vaultRoot);
  } catch (error) {
    errors.push({
      severity: "error",
      code: "INVALID_CONFIG",
      message: error instanceof Error ? error.message : String(error),
      path: ".pkwiki/config.json",
    });
  }

  validateRequiredDirectories(vaultRoot, errors);
  validateRequiredFiles(vaultRoot, errors);
  validateSourceManifest(vaultRoot, errors, warnings);
  validateWikiPages(vaultRoot, errors, warnings);

  return {
    ok: errors.length === 0,
    vaultRoot,
    errors,
    warnings,
  };
}

function validateSourceManifest(
  vaultRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  let manifest: Record<string, unknown>;
  try {
    manifest = readSourceManifest(vaultRoot);
  } catch (error) {
    errors.push({
      severity: "error",
      code: "INVALID_SOURCE_MANIFEST",
      message: error instanceof Error ? error.message : String(error),
      path: ".pkwiki/source_manifest.json",
    });
    return;
  }

  for (const [sourceId, rawEntry] of Object.entries(manifest)) {
    if (!isRecord(rawEntry)) {
      errors.push({
        severity: "error",
        code: "INVALID_SOURCE_MANIFEST_ENTRY",
        message: `source manifest 记录必须是对象：${sourceId}`,
        path: ".pkwiki/source_manifest.json",
      });
      continue;
    }

    const requiredFields = [
      "sourceId",
      "rawPath",
      "type",
      "domain",
      "checksum",
      "status",
    ];
    for (const field of requiredFields) {
      if (isMissing(rawEntry[field])) {
        errors.push({
          severity: "error",
          code: "MISSING_SOURCE_MANIFEST_FIELD",
          message: `source manifest 记录缺少字段 ${field}`,
          path: ".pkwiki/source_manifest.json",
        });
      }
    }

    if (rawEntry.sourceId !== sourceId) {
      errors.push({
        severity: "error",
        code: "SOURCE_ID_MISMATCH",
        message: `source manifest key 与 sourceId 不一致：${sourceId}`,
        path: ".pkwiki/source_manifest.json",
      });
    }

    addMissingSourceFileWarning(
      vaultRoot,
      rawEntry.rawPath,
      "RAW_SOURCE_MISSING",
      warnings,
    );
    addMissingSourceFileWarning(
      vaultRoot,
      rawEntry.extractedPath,
      "EXTRACTED_SOURCE_MISSING",
      warnings,
    );
  }
}

function addMissingSourceFileWarning(
  vaultRoot: string,
  pathValue: unknown,
  code: string,
  warnings: ValidationIssue[],
): void {
  if (typeof pathValue !== "string" || pathValue === "") {
    return;
  }

  if (!existsSync(join(vaultRoot, pathValue))) {
    warnings.push({
      severity: "warning",
      code,
      message: `source manifest 指向的文件不存在：${pathValue}`,
      path: ".pkwiki/source_manifest.json",
      target: pathValue,
    });
  }
}

function validateRequiredDirectories(
  vaultRoot: string,
  errors: ValidationIssue[],
): void {
  for (const directory of REQUIRED_DIRECTORIES) {
    const absolutePath = join(vaultRoot, directory);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      errors.push({
        severity: "error",
        code: "MISSING_REQUIRED_DIRECTORY",
        message: `缺少必需目录 ${directory}`,
        path: directory,
      });
    }
  }
}

function validateRequiredFiles(
  vaultRoot: string,
  errors: ValidationIssue[],
): void {
  for (const file of REQUIRED_FILES) {
    const absolutePath = join(vaultRoot, file);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      errors.push({
        severity: "error",
        code: "MISSING_REQUIRED_FILE",
        message: `缺少必需文件 ${file}`,
        path: file,
      });
    }
  }
}

function validateWikiPages(
  vaultRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const wikiRoot = join(vaultRoot, "wiki");
  if (!existsSync(wikiRoot) || !statSync(wikiRoot).isDirectory()) {
    return;
  }

  const pages = listMarkdownFiles(wikiRoot).filter(
    (page) => !RESERVED_WIKI_FILES.has(page.split("/").at(-1) ?? ""),
  );

  for (const page of pages) {
    const absolutePath = join(wikiRoot, page);
    const relativePath = `wiki/${page}`;
    const text = readFileSync(absolutePath, "utf8");
    let parsed: FrontmatterParseResult;
    try {
      parsed = parseFrontmatter(text);
    } catch (error) {
      errors.push({
        severity: "error",
        code: "INVALID_FRONTMATTER",
        message: error instanceof Error ? error.message : String(error),
        path: relativePath,
      });
      continue;
    }

    validateFrontmatterFields(parsed.frontmatter, relativePath, errors);
    validateMarkdownLinks(vaultRoot, absolutePath, parsed.body, warnings);
  }
}

export function parseFrontmatter(text: string): FrontmatterParseResult {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new Error("文件必须以 YAML frontmatter 开头");
  }

  const parsed = YAML.parse(match[1] ?? "");
  if (!isRecord(parsed)) {
    throw new Error("frontmatter 必须是 YAML 对象");
  }

  return {
    frontmatter: parsed,
    body: match[2] ?? "",
  };
}

function validateFrontmatterFields(
  frontmatter: Record<string, unknown>,
  path: string,
  errors: ValidationIssue[],
): void {
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (isMissing(frontmatter[key])) {
      errors.push({
        severity: "error",
        code: "MISSING_FRONTMATTER_FIELD",
        message: `缺少必需 frontmatter 字段 ${key}`,
        path,
      });
    }
  }

  if (frontmatter.okf_version !== OKF_VERSION) {
    errors.push({
      severity: "error",
      code: "INVALID_OKF_VERSION",
      message: `okf_version 应为 ${OKF_VERSION}`,
      path,
    });
  }

  if (frontmatter.profile !== PKWIKI_PROFILE) {
    errors.push({
      severity: "error",
      code: "INVALID_PROFILE",
      message: `profile 应为 ${PKWIKI_PROFILE}`,
      path,
    });
  }

  if (frontmatter.sources !== undefined && !Array.isArray(frontmatter.sources)) {
    errors.push({
      severity: "error",
      code: "INVALID_FIELD_TYPE",
      message: "sources 必须是数组",
      path,
    });
  }

  if (frontmatter.tags !== undefined && !Array.isArray(frontmatter.tags)) {
    errors.push({
      severity: "error",
      code: "INVALID_FIELD_TYPE",
      message: "tags 必须是数组",
      path,
    });
  }
}

function validateMarkdownLinks(
  vaultRoot: string,
  absolutePagePath: string,
  body: string,
  warnings: ValidationIssue[],
): void {
  for (const target of extractMarkdownLinks(body)) {
    const normalizedTarget = stripAnchorAndQuery(target);
    if (!shouldValidateLocalMarkdownLink(normalizedTarget)) {
      continue;
    }

    const resolvedTarget = resolve(dirname(absolutePagePath), normalizedTarget);
    if (!existsSync(resolvedTarget)) {
      warnings.push({
        severity: "warning",
        code: "BROKEN_MARKDOWN_LINK",
        message: "Markdown link 指向不存在的文件",
        path: normalizeRelativePath(vaultRoot, absolutePagePath),
        target,
      });
    }
  }
}

export function extractMarkdownLinks(body: string): string[] {
  const links: string[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    if (match[0].startsWith("!")) {
      continue;
    }
    const target = match[1];
    if (target) {
      links.push(target);
    }
  }
  return links;
}

function listMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const child of listMarkdownFiles(absolutePath)) {
        files.push(`${entry.name}/${child}`);
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entry.name);
    }
  }
  return files;
}

function shouldValidateLocalMarkdownLink(target: string): boolean {
  if (!target.endsWith(".md")) {
    return false;
  }
  if (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#")
  ) {
    return false;
  }
  return !target.startsWith("/");
}

function stripAnchorAndQuery(target: string): string {
  return target.split("#", 1)[0]?.split("?", 1)[0] ?? target;
}

function normalizeRelativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split("\\").join("/");
}

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import {
  OKF_VERSION,
  PKWIKI_PROFILE,
  computeSha256,
  isRecord,
  loadVault,
} from "@pkwiki/core";

export type PageManifestEntry = {
  id: string;
  path: string;
  title: string;
  type: string;
  domain: string;
  status: string;
  privacy: string;
  sources: string[];
  tags: string[];
  checksum: string;
  updated: string;
  indexedAt: string;
};

export type PageManifest = Record<string, PageManifestEntry>;

export type SearchIndexPage = {
  id: string;
  path: string;
  title: string;
  type: string;
  domain: string;
  description: string;
  status: string;
  privacy: string;
  sources: string[];
  tags: string[];
  links: string[];
  headings: string[];
};

export type SearchIndex = {
  generatedAt: string;
  pages: SearchIndexPage[];
  byType: Record<string, string[]>;
  byDomain: Record<string, string[]>;
  bySource: Record<string, string[]>;
  backlinks: Record<string, string[]>;
};

export type GenerateIndexOptions = {
  now?: Date;
};

export type GenerateIndexResult = {
  ok: true;
  vaultRoot: string;
  pageCount: number;
  linkCount: number;
  sourceReferenceCount: number;
  pageManifestPath: string;
  indexPath: string;
  pageManifest: PageManifest;
  index: SearchIndex;
};

type ParsedPage = {
  entry: PageManifestEntry;
  indexPage: SearchIndexPage;
};

type FrontmatterParseResult = {
  frontmatter: Record<string, unknown>;
  body: string;
};

const PAGE_MANIFEST_PATH = ".pkwiki/page_manifest.json";
const SEARCH_INDEX_PATH = "outputs/index.json";
const RESERVED_WIKI_FILES = new Set(["index.md", "log.md"]);
const MARKDOWN_LINK_RE = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const REQUIRED_FRONTMATTER_KEYS = [
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

export function generateIndex(
  startPath = process.cwd(),
  options: GenerateIndexOptions = {},
): GenerateIndexResult {
  const vault = loadVault(startPath);
  const indexedAt = formatLocalDateTime(options.now ?? new Date());
  const wikiRoot = join(vault.root, vault.config.wikiRoot);
  const pages = existsSync(wikiRoot)
    ? listMarkdownFiles(wikiRoot)
        .filter((page) => !RESERVED_WIKI_FILES.has(page.split("/").at(-1) ?? ""))
        .sort()
    : [];

  const manifest: PageManifest = {};
  const indexPages: SearchIndexPage[] = [];
  const seenIds = new Set<string>();

  for (const page of pages) {
    const parsed = parseWikiPage(vault.root, vault.config.wikiRoot, page, indexedAt);
    if (seenIds.has(parsed.entry.id)) {
      throw new Error(`Wiki Page id 重复：${parsed.entry.id}`);
    }
    seenIds.add(parsed.entry.id);
    manifest[parsed.entry.id] = parsed.entry;
    indexPages.push(parsed.indexPage);
  }

  const index = buildSearchIndex(indexedAt, indexPages);
  writeJson(join(vault.root, PAGE_MANIFEST_PATH), manifest);
  writeJson(join(vault.root, SEARCH_INDEX_PATH), index);

  return {
    ok: true,
    vaultRoot: vault.root,
    pageCount: indexPages.length,
    linkCount: indexPages.reduce((total, page) => total + page.links.length, 0),
    sourceReferenceCount: indexPages.reduce(
      (total, page) => total + page.sources.length,
      0,
    ),
    pageManifestPath: PAGE_MANIFEST_PATH,
    indexPath: SEARCH_INDEX_PATH,
    pageManifest: manifest,
    index,
  };
}

export function readPageManifest(vaultRoot: string): PageManifest {
  const manifestPath = join(vaultRoot, PAGE_MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    return {};
  }
  const parsed = readJsonObject(manifestPath, `${PAGE_MANIFEST_PATH} 必须是 JSON 对象`);
  return parsed as PageManifest;
}

export function readSearchIndex(vaultRoot: string): SearchIndex | null {
  const indexPath = join(vaultRoot, SEARCH_INDEX_PATH);
  if (!existsSync(indexPath)) {
    return null;
  }
  const parsed = readJsonObject(indexPath, `${SEARCH_INDEX_PATH} 必须是 JSON 对象`);
  return parsed as SearchIndex;
}

export function listWikiPagePaths(vaultRoot: string, wikiRoot = "wiki"): string[] {
  const absoluteWikiRoot = join(vaultRoot, wikiRoot);
  if (!existsSync(absoluteWikiRoot) || !statSync(absoluteWikiRoot).isDirectory()) {
    return [];
  }
  return listMarkdownFiles(absoluteWikiRoot)
    .filter((page) => !RESERVED_WIKI_FILES.has(page.split("/").at(-1) ?? ""))
    .map((page) => `${wikiRoot}/${page}`)
    .sort();
}

export function extractMarkdownLinks(
  vaultRoot: string,
  absolutePagePath: string,
  body: string,
): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    if (match[0].startsWith("!")) {
      continue;
    }
    const target = match[1];
    if (!target) {
      continue;
    }
    const normalized = normalizeMarkdownLink(vaultRoot, absolutePagePath, target);
    if (normalized) {
      links.add(normalized);
    }
  }
  return [...links].sort();
}

export function extractHeadings(body: string): string[] {
  const headings = new Set<string>();
  for (const match of body.matchAll(HEADING_RE)) {
    const text = match[2]?.trim();
    if (text) {
      headings.add(text);
    }
  }
  return [...headings];
}

function parseWikiPage(
  vaultRoot: string,
  wikiRoot: string,
  page: string,
  indexedAt: string,
): ParsedPage {
  const absolutePath = join(vaultRoot, wikiRoot, page);
  const path = normalizeRelativePath(vaultRoot, absolutePath);
  const text = readFileSync(absolutePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(text);
  validateFrontmatter(frontmatter, path);

  const id = readStringField(frontmatter, "id", path);
  const sources = readStringArrayField(frontmatter, "sources", path);
  const tags = readStringArrayField(frontmatter, "tags", path);
  const links = extractMarkdownLinks(vaultRoot, absolutePath, body);
  const headings = extractHeadings(body);

  const entry: PageManifestEntry = {
    id,
    path,
    title: readStringField(frontmatter, "title", path),
    type: readStringField(frontmatter, "type", path),
    domain: readStringField(frontmatter, "domain", path),
    status: readStringField(frontmatter, "status", path),
    privacy: readStringField(frontmatter, "privacy", path),
    sources,
    tags,
    checksum: computeSha256(absolutePath),
    updated: readStringField(frontmatter, "updated", path),
    indexedAt,
  };

  return {
    entry,
    indexPage: {
      id,
      path,
      title: entry.title,
      type: entry.type,
      domain: entry.domain,
      description: readStringField(frontmatter, "description", path),
      status: entry.status,
      privacy: entry.privacy,
      sources,
      tags,
      links,
      headings,
    },
  };
}

function buildSearchIndex(generatedAt: string, pages: SearchIndexPage[]): SearchIndex {
  const sortedPages = [...pages].sort((a, b) => a.id.localeCompare(b.id));
  return {
    generatedAt,
    pages: sortedPages,
    byType: buildGroupIndex(sortedPages, (page) => [page.type]),
    byDomain: buildGroupIndex(sortedPages, (page) => [page.domain]),
    bySource: buildGroupIndex(sortedPages, (page) => page.sources),
    backlinks: buildBacklinks(sortedPages),
  };
}

function buildGroupIndex(
  pages: SearchIndexPage[],
  getKeys: (page: SearchIndexPage) => string[],
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const page of pages) {
    for (const key of getKeys(page)) {
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(page.id);
    }
  }
  return sortRecordValues(groups);
}

function buildBacklinks(pages: SearchIndexPage[]): Record<string, string[]> {
  const backlinks: Record<string, string[]> = {};
  for (const page of pages) {
    for (const link of page.links) {
      if (!backlinks[link]) {
        backlinks[link] = [];
      }
      backlinks[link].push(page.id);
    }
  }
  return sortRecordValues(backlinks);
}

function parseFrontmatter(text: string): FrontmatterParseResult {
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

function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  path: string,
): void {
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (isMissing(frontmatter[key])) {
      throw new Error(`${path} 缺少必需 frontmatter 字段 ${key}`);
    }
  }
  if (frontmatter.okf_version !== OKF_VERSION) {
    throw new Error(`${path} okf_version 应为 ${OKF_VERSION}`);
  }
  if (frontmatter.profile !== PKWIKI_PROFILE) {
    throw new Error(`${path} profile 应为 ${PKWIKI_PROFILE}`);
  }
  readStringArrayField(frontmatter, "sources", path);
  readStringArrayField(frontmatter, "tags", path);
}

function readStringField(
  frontmatter: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = frontmatter[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${path} frontmatter 字段 ${field} 必须是非空字符串`);
  }
  return value;
}

function readStringArrayField(
  frontmatter: Record<string, unknown>,
  field: string,
  path: string,
): string[] {
  const value = frontmatter[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} frontmatter 字段 ${field} 必须是字符串数组`);
  }
  return [...value].sort();
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

function normalizeMarkdownLink(
  vaultRoot: string,
  absolutePagePath: string,
  target: string,
): string | null {
  const strippedTarget = stripAnchorAndQuery(target);
  if (
    strippedTarget === "" ||
    strippedTarget.startsWith("#") ||
    strippedTarget.startsWith("http://") ||
    strippedTarget.startsWith("https://") ||
    strippedTarget.startsWith("mailto:")
  ) {
    return null;
  }
  if (!strippedTarget.endsWith(".md")) {
    return strippedTarget;
  }

  const resolvedTarget = strippedTarget.startsWith("/")
    ? join(vaultRoot, strippedTarget.slice(1))
    : resolve(dirname(absolutePagePath), strippedTarget);
  return normalizeRelativePath(vaultRoot, resolvedTarget);
}

function readJsonObject(path: string, invalidMessage: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`无法读取或解析 ${path}: ${String(error)}`, {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new Error(invalidMessage);
  }
  return parsed;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sortRecordValues(record: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, [...values].sort()]),
  );
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

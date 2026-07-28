import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  EXTRACTION_CONFIDENCE_LEVELS,
  EXTRACTION_ITEM_KINDS,
  SOURCE_LIFECYCLE_STATUSES,
  SOURCE_PROCESSING_STATUSES,
  isRecord,
  loadVault,
  normalizeSourceStatus,
  readExtractionArtifact,
  readSourceManifest,
  sourceIdToFileName,
  type ExtractionConfidence,
  type ExtractionItemKind,
  type SourceLifecycleStatus,
  type SourceProcessingStatus,
} from "@pkwiki/core";
import {
  generateIndex,
  type PageManifestEntry,
  type SearchIndexPage,
} from "@pkwiki/indexer";
import { getRunDirectory } from "@pkwiki/merge";

export const CONTEXT_REQUEST_VERSION = "pkwiki.context-request/0.1";
export const CONTEXT_PACK_VERSION = "pkwiki.context-pack/0.1";

export type SearchErrorCode =
  | "INVALID_SEARCH_QUERY"
  | "INVALID_SEARCH_LIMIT"
  | "UNSAFE_READ_PATH"
  | "PAGE_NOT_FOUND"
  | "INVALID_CONTEXT_REQUEST"
  | "CONTEXT_SOURCE_NOT_FOUND"
  | "CONTEXT_BUDGET_INVALID";

export class SearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message: string,
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export type PageMetadata = {
  title: string;
  type: string;
  domain: string;
  description: string;
  status: string;
  privacy: string;
  sources: string[];
  tags: string[];
  updated: string;
};

export type PageSummary = {
  id: string;
  path: string;
  checksum: string;
  metadata: PageMetadata;
  headings: string[];
  links: string[];
};

export type ListPagesResult = {
  ok: true;
  vaultRoot: string;
  pages: PageSummary[];
};

export type ReadPageResult = PageSummary & {
  ok: true;
  vaultRoot: string;
  content: string;
};

export type SearchResultEntry = {
  id: string;
  path: string;
  title: string;
  description: string;
  type: string;
  domain: string;
  score: number;
  matchedFields: string[];
  excerpt: string;
};

export type SearchPagesResult = {
  ok: true;
  vaultRoot: string;
  query: string;
  limit: number;
  total: number;
  results: SearchResultEntry[];
};

export type ContextWorkflow = "merge" | "query";

export type ContextRequest = {
  version: typeof CONTEXT_REQUEST_VERSION;
  runId: string;
  workflow: ContextWorkflow;
  query: string;
  sourceIds: string[];
  maxPages: number;
  maxChars: number;
  linkDepth: number;
};

export type ContextSourceItem = {
  itemId: string;
  kind: ExtractionItemKind;
  content: string;
  confidence: ExtractionConfidence;
  evidenceChunkIds: string[];
};

export type ContextSource = {
  sourceId: string;
  metadata: {
    originalName?: string;
    rawPath: string;
    type: string;
    domain: string;
    checksum: string;
    sizeBytes?: number;
    ingestedAt?: string;
    mtime?: string;
    processingStatus: SourceProcessingStatus;
    lifecycleStatus: SourceLifecycleStatus;
    privacy?: string;
    language?: string;
  };
  extraction?: {
    sourceChecksum: string;
    createdAt: string;
    summary: string;
    items: ContextSourceItem[];
  };
};

export type ContextPage = PageSummary & {
  selectionReason: string;
  score: number;
  linkDepth: number;
  content: string;
  truncated: boolean;
  originalChars: number;
  includedChars: number;
};

export type ContextOmittedPage = {
  id: string;
  path: string;
  selectionReason: string;
  score: number;
  linkDepth: number;
  reason: "max_pages" | "max_chars";
};

export type ContextPack = {
  version: typeof CONTEXT_PACK_VERSION;
  runId: string;
  workflow: ContextWorkflow;
  query: string;
  createdAt: string;
  budget: {
    maxPages: number;
    maxChars: number;
    usedPages: number;
    usedChars: number;
    sourceChars: number;
  };
  sources: ContextSource[];
  pages: ContextPage[];
  omitted: ContextOmittedPage[];
};

export type BuildContextOptions = {
  now?: Date;
};

export type BuildContextResult = {
  ok: true;
  vaultRoot: string;
  contextPackPath: string;
  contextPack: ContextPack;
};

type PageDocument = PageSummary & {
  content: string;
  body: string;
};

type PageCatalog = {
  vaultRoot: string;
  pages: PageDocument[];
  byId: Map<string, PageDocument>;
  byPath: Map<string, PageDocument>;
};

type RankedPage = {
  page: PageDocument;
  score: number;
  matchedFields: string[];
  excerpt: string;
};

type ContextCandidate = {
  page: PageDocument;
  selectionReason: string;
  score: number;
  linkDepth: number;
};

const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_CHARS = 20_000;
const DEFAULT_LINK_DEPTH = 1;
const SEARCH_FIELD_ORDER = [
  "title",
  "id",
  "path",
  "tags",
  "domain",
  "type",
  "sources",
  "headings",
  "description",
  "body",
] as const;

export function listPages(startPath = process.cwd()): ListPagesResult {
  const catalog = buildPageCatalog(startPath);
  return {
    ok: true,
    vaultRoot: catalog.vaultRoot,
    pages: catalog.pages.map(toPageSummary),
  };
}

export function readWikiPage(
  startPath: string,
  wikiPath: string,
): ReadPageResult {
  const vault = loadVault(startPath);
  assertSafeWikiPath(vault.root, vault.config.wikiRoot, wikiPath);
  const catalog = buildPageCatalog(vault.root);
  const page = catalog.byPath.get(normalizePath(wikiPath));
  if (!page) {
    throw new SearchError("PAGE_NOT_FOUND", `Wiki Page 不存在：${wikiPath}`);
  }
  return {
    ok: true,
    vaultRoot: catalog.vaultRoot,
    ...toPageSummary(page),
    content: page.content,
  };
}

export function searchPages(
  startPath: string,
  query: string,
  options: { limit?: number } = {},
): SearchPagesResult {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") {
    throw new SearchError(
      "INVALID_SEARCH_QUERY",
      "搜索 query 不能为空",
      2,
    );
  }
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SearchError(
      "INVALID_SEARCH_LIMIT",
      "--limit 必须是 1 到 100 之间的整数",
      2,
    );
  }

  const catalog = buildPageCatalog(startPath);
  const ranked = rankPages(catalog.pages, normalizedQuery);
  return {
    ok: true,
    vaultRoot: catalog.vaultRoot,
    query,
    limit,
    total: ranked.length,
    results: ranked.slice(0, limit).map(toSearchResult),
  };
}

export function parseContextRequest(value: unknown): ContextRequest {
  if (!isRecord(value)) {
    throw invalidContext("Context Request 必须是 JSON 对象");
  }
  if (value.version !== CONTEXT_REQUEST_VERSION) {
    throw invalidContext(`Context Request version 必须是 ${CONTEXT_REQUEST_VERSION}`);
  }
  const runId = requiredString(value.runId, "runId");
  if (!/^run:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(runId)) {
    throw invalidContext("runId 必须以 run: 开头，且不能包含路径字符");
  }
  if (value.workflow !== "merge" && value.workflow !== "query") {
    throw invalidContext("workflow 必须是 merge 或 query");
  }
  const sourceIds = parseUniqueStringArray(value.sourceIds, "sourceIds");
  const query = requiredString(value.query, "query");
  const maxPages = parseBudgetInteger(
    value.maxPages,
    "maxPages",
    DEFAULT_MAX_PAGES,
    1,
    20,
  );
  const maxChars = parseBudgetInteger(
    value.maxChars,
    "maxChars",
    DEFAULT_MAX_CHARS,
    1_000,
    100_000,
  );
  const linkDepth = parseBudgetInteger(
    value.linkDepth,
    "linkDepth",
    DEFAULT_LINK_DEPTH,
    0,
    2,
  );

  return {
    version: CONTEXT_REQUEST_VERSION,
    runId,
    workflow: value.workflow,
    query,
    sourceIds,
    maxPages,
    maxChars,
    linkDepth,
  };
}

export function readContextRequest(path: string): ContextRequest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw invalidContext(`无法读取或解析 Context Request：${String(error)}`);
  }
  return parseContextRequest(value);
}

export function buildContextPack(
  startPath: string,
  requestInput: string | ContextRequest,
  options: BuildContextOptions = {},
): BuildContextResult {
  const request =
    typeof requestInput === "string"
      ? readContextRequest(requestInput)
      : parseContextRequest(requestInput);
  const catalog = buildPageCatalog(startPath);
  const sources = buildSourceContext(catalog.vaultRoot, request.sourceIds);
  const ranked = rankPages(catalog.pages, normalizeSearchText(request.query));
  const candidates: ContextCandidate[] = ranked.map((entry) => ({
    page: entry.page,
    selectionReason: `search:${entry.matchedFields.join(",")}`,
    score: entry.score,
    linkDepth: 0,
  }));
  const candidateIds = new Set(candidates.map((candidate) => candidate.page.id));
  const pages: ContextPage[] = [];
  const omitted: ContextOmittedPage[] = [];
  let usedChars = 0;

  while (candidates.length > 0) {
    candidates.sort(compareCandidates);
    const candidate = candidates.shift();
    if (!candidate) {
      break;
    }
    if (pages.length >= request.maxPages) {
      omitted.push(toOmitted(candidate, "max_pages"));
      for (const remaining of candidates.sort(compareCandidates)) {
        omitted.push(toOmitted(remaining, "max_pages"));
      }
      break;
    }

    const remainingChars = request.maxChars - usedChars;
    if (remainingChars <= 0) {
      omitted.push(toOmitted(candidate, "max_chars"));
      for (const remaining of candidates.sort(compareCandidates)) {
        omitted.push(toOmitted(remaining, "max_chars"));
      }
      break;
    }

    const includedContent = candidate.page.content.slice(0, remainingChars);
    const includedChars = includedContent.length;
    const originalChars = candidate.page.content.length;
    pages.push({
      ...toPageSummary(candidate.page),
      selectionReason: candidate.selectionReason,
      score: candidate.score,
      linkDepth: candidate.linkDepth,
      content: includedContent,
      truncated: includedChars < originalChars,
      originalChars,
      includedChars,
    });
    usedChars += includedChars;

    if (candidate.linkDepth < request.linkDepth) {
      for (const link of candidate.page.links) {
        const linkedPage = catalog.byPath.get(link);
        if (!linkedPage || candidateIds.has(linkedPage.id)) {
          continue;
        }
        candidateIds.add(linkedPage.id);
        candidates.push({
          page: linkedPage,
          selectionReason: `linked_from:${candidate.page.id}`,
          score: Math.max(1, Math.floor(candidate.score * 0.25)),
          linkDepth: candidate.linkDepth + 1,
        });
      }
    }
  }

  const contextPack: ContextPack = {
    version: CONTEXT_PACK_VERSION,
    runId: request.runId,
    workflow: request.workflow,
    query: request.query,
    createdAt: formatLocalDateTime(options.now ?? new Date()),
    budget: {
      maxPages: request.maxPages,
      maxChars: request.maxChars,
      usedPages: pages.length,
      usedChars,
      sourceChars: JSON.stringify(sources).length,
    },
    sources,
    pages,
    omitted,
  };
  parseContextPack(contextPack);

  const runDirectory = getRunDirectory(request.runId);
  const contextPackPath = join(runDirectory, "context-pack.json");
  writeJsonAtomic(join(catalog.vaultRoot, contextPackPath), contextPack);
  return {
    ok: true,
    vaultRoot: catalog.vaultRoot,
    contextPackPath,
    contextPack,
  };
}

export function parseContextPack(value: unknown): ContextPack {
  if (!isRecord(value) || value.version !== CONTEXT_PACK_VERSION) {
    throw invalidContext(`Context Pack version 必须是 ${CONTEXT_PACK_VERSION}`);
  }
  const request = parseContextRequest({
    version: CONTEXT_REQUEST_VERSION,
    runId: value.runId,
    workflow: value.workflow,
    query: value.query,
    sourceIds: Array.isArray(value.sources)
      ? value.sources.map((source) =>
          isRecord(source) ? source.sourceId : undefined,
        )
      : value.sources,
    maxPages: isRecord(value.budget) ? value.budget.maxPages : undefined,
    maxChars: isRecord(value.budget) ? value.budget.maxChars : undefined,
    linkDepth: 0,
  });
  if (!isRecord(value.budget)) {
    throw invalidContext("Context Pack budget 必须是对象");
  }
  const usedPages = parseNonNegativeInteger(value.budget.usedPages, "budget.usedPages");
  const usedChars = parseNonNegativeInteger(value.budget.usedChars, "budget.usedChars");
  const sourceChars = parseNonNegativeInteger(
    value.budget.sourceChars,
    "budget.sourceChars",
  );
  if (!Array.isArray(value.sources)) {
    throw invalidContext("Context Pack sources 必须是数组");
  }
  if (!Array.isArray(value.pages)) {
    throw invalidContext("Context Pack pages 必须是数组");
  }
  if (!Array.isArray(value.omitted)) {
    throw invalidContext("Context Pack omitted 必须是数组");
  }
  const sources = value.sources.map(parseContextSource);
  const pages = value.pages.map(parseContextPage);
  const omitted = value.omitted.map(parseOmittedPage);
  assertUniqueContextPages(pages, omitted);
  if (usedPages !== pages.length || usedPages > request.maxPages) {
    throw invalidContext("Context Pack usedPages 与 pages 或 maxPages 不一致");
  }
  if (
    usedChars !== pages.reduce((total, page) => total + page.includedChars, 0) ||
    usedChars > request.maxChars
  ) {
    throw invalidContext("Context Pack usedChars 与 pages 或 maxChars 不一致");
  }

  return {
    version: CONTEXT_PACK_VERSION,
    runId: request.runId,
    workflow: request.workflow,
    query: request.query,
    createdAt: requiredString(value.createdAt, "createdAt"),
    budget: {
      maxPages: request.maxPages,
      maxChars: request.maxChars,
      usedPages,
      usedChars,
      sourceChars,
    },
    sources,
    pages,
    omitted,
  };
}

function buildPageCatalog(startPath: string): PageCatalog {
  const generated = generateIndex(startPath);
  const indexById = new Map(generated.index.pages.map((page) => [page.id, page]));
  const pages = Object.values(generated.pageManifest)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => {
      const indexPage = indexById.get(entry.id);
      if (!indexPage) {
        throw new Error(`Search Index 缺少页面：${entry.id}`);
      }
      const absolutePath = join(generated.vaultRoot, entry.path);
      const content = readFileSync(absolutePath, "utf8");
      return {
        ...toPageSummaryFromParts(entry, indexPage),
        content,
        body: stripFrontmatter(content),
      } satisfies PageDocument;
    });
  return {
    vaultRoot: generated.vaultRoot,
    pages,
    byId: new Map(pages.map((page) => [page.id, page])),
    byPath: new Map(pages.map((page) => [page.path, page])),
  };
}

function rankPages(pages: PageDocument[], normalizedQuery: string): RankedPage[] {
  const tokens = tokenize(normalizedQuery);
  return pages
    .map((page) => scorePage(page, normalizedQuery, tokens))
    .filter((entry): entry is RankedPage => entry !== null)
    .sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id));
}

function scorePage(
  page: PageDocument,
  query: string,
  tokens: string[],
): RankedPage | null {
  let score = 0;
  const matched = new Set<string>();
  const title = normalizeSearchText(page.metadata.title);
  if (title === query) {
    score += 100;
    matched.add("title");
  } else if (containsQueryOrToken(title, query, tokens)) {
    score += 40 + tokenBonus(title, tokens);
    matched.add("title");
  }

  const id = normalizeSearchText(page.id);
  const path = normalizeSearchText(page.path);
  const idMatched = containsQueryOrToken(id, query, tokens);
  const pathMatched = containsQueryOrToken(path, query, tokens);
  if (idMatched || pathMatched) {
    score += 30 + Math.max(tokenBonus(id, tokens), tokenBonus(path, tokens));
    if (idMatched) matched.add("id");
    if (pathMatched) matched.add("path");
  }

  const tags = page.metadata.tags.map(normalizeSearchText);
  const matchedTagTokens = tokens.filter((token) => tags.includes(token));
  if (tags.includes(query) || matchedTagTokens.length > 0) {
    score += 25 + Math.max(0, matchedTagTokens.length - 1);
    matched.add("tags");
  }

  const domain = normalizeSearchText(page.metadata.domain);
  const type = normalizeSearchText(page.metadata.type);
  const domainMatched = exactQueryOrToken(domain, query, tokens);
  const typeMatched = exactQueryOrToken(type, query, tokens);
  if (domainMatched || typeMatched) {
    score += 20;
    if (domainMatched) matched.add("domain");
    if (typeMatched) matched.add("type");
  }

  const sourcesText = page.metadata.sources.map(normalizeSearchText).join(" ");
  if (containsQueryOrToken(sourcesText, query, tokens)) {
    score += 20 + tokenBonus(sourcesText, tokens);
    matched.add("sources");
  }

  const headingsText = page.headings.map(normalizeSearchText).join(" ");
  if (containsQueryOrToken(headingsText, query, tokens)) {
    score += 15 + tokenBonus(headingsText, tokens);
    matched.add("headings");
  }

  const description = normalizeSearchText(page.metadata.description);
  if (containsQueryOrToken(description, query, tokens)) {
    score += 10 + tokenBonus(description, tokens);
    matched.add("description");
  }

  const body = normalizeSearchText(page.body);
  if (containsQueryOrToken(body, query, tokens)) {
    score += 5 + tokenBonus(body, tokens);
    matched.add("body");
  }

  if (score === 0) {
    return null;
  }
  return {
    page,
    score,
    matchedFields: SEARCH_FIELD_ORDER.filter((field) => matched.has(field)),
    excerpt: buildExcerpt(page, query, tokens),
  };
}

function buildSourceContext(vaultRoot: string, sourceIds: string[]): ContextSource[] {
  const manifest = readSourceManifest(vaultRoot);
  return sourceIds.map((sourceId) => {
    const source = manifest[sourceId];
    if (!source) {
      throw new SearchError(
        "CONTEXT_SOURCE_NOT_FOUND",
        `Context Source 未登记：${sourceId}`,
      );
    }
    const status = normalizeSourceStatus(source);
    const artifactPath = join(
      vaultRoot,
      "extracted/data",
      `${sourceIdToFileName(sourceId)}.json`,
    );
    let extraction: ContextSource["extraction"];
    if (existsSync(artifactPath)) {
      const artifact = readExtractionArtifact(artifactPath);
      if (artifact.sourceId !== sourceId || artifact.sourceChecksum !== source.checksum) {
        throw invalidContext(`Source Extraction 已过期或引用不一致：${sourceId}`);
      }
      extraction = {
        sourceChecksum: artifact.sourceChecksum,
        createdAt: artifact.createdAt,
        summary: artifact.summary,
        items: artifact.items.map((item) => ({
          itemId: item.itemId,
          kind: item.kind,
          content: item.content,
          confidence: item.confidence,
          evidenceChunkIds: [...new Set(item.evidence.map((entry) => entry.chunkId))].sort(),
        })),
      };
    }
    return {
      sourceId,
      metadata: {
        ...(source.originalName ? { originalName: source.originalName } : {}),
        rawPath: source.rawPath,
        type: source.type,
        domain: source.domain,
        checksum: source.checksum,
        ...(source.sizeBytes === undefined ? {} : { sizeBytes: source.sizeBytes }),
        ...(source.ingestedAt ? { ingestedAt: source.ingestedAt } : {}),
        ...(source.mtime ? { mtime: source.mtime } : {}),
        processingStatus: status.processingStatus,
        lifecycleStatus: status.lifecycleStatus,
        ...(source.privacy ? { privacy: source.privacy } : {}),
        ...(source.language ? { language: source.language } : {}),
      },
      ...(extraction ? { extraction } : {}),
    };
  });
}

function parseContextSource(value: unknown, index: number): ContextSource {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    throw invalidContext(`sources[${index}] 必须包含 metadata 对象`);
  }
  const metadata = value.metadata;
  const processingStatus = requiredString(
    metadata.processingStatus,
    `sources[${index}].metadata.processingStatus`,
  ) as SourceProcessingStatus;
  const lifecycleStatus = requiredString(
    metadata.lifecycleStatus,
    `sources[${index}].metadata.lifecycleStatus`,
  ) as SourceLifecycleStatus;
  if (!SOURCE_PROCESSING_STATUSES.includes(processingStatus)) {
    throw invalidContext(`sources[${index}].metadata.processingStatus 非法`);
  }
  if (!SOURCE_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    throw invalidContext(`sources[${index}].metadata.lifecycleStatus 非法`);
  }
  const source: ContextSource = {
    sourceId: requiredString(value.sourceId, `sources[${index}].sourceId`),
    metadata: {
      ...(optionalString(metadata.originalName, `sources[${index}].metadata.originalName`)),
      rawPath: requiredString(metadata.rawPath, `sources[${index}].metadata.rawPath`),
      type: requiredString(metadata.type, `sources[${index}].metadata.type`),
      domain: requiredString(metadata.domain, `sources[${index}].metadata.domain`),
      checksum: requiredString(metadata.checksum, `sources[${index}].metadata.checksum`),
      ...(optionalNumber(metadata.sizeBytes, `sources[${index}].metadata.sizeBytes`)),
      ...(optionalString(metadata.ingestedAt, `sources[${index}].metadata.ingestedAt`)),
      ...(optionalString(metadata.mtime, `sources[${index}].metadata.mtime`)),
      processingStatus,
      lifecycleStatus,
      ...(optionalString(metadata.privacy, `sources[${index}].metadata.privacy`)),
      ...(optionalString(metadata.language, `sources[${index}].metadata.language`)),
    },
  };
  if (value.extraction !== undefined) {
    if (!isRecord(value.extraction) || !Array.isArray(value.extraction.items)) {
      throw invalidContext(`sources[${index}].extraction 必须是有效对象`);
    }
    source.extraction = {
      sourceChecksum: requiredString(
        value.extraction.sourceChecksum,
        `sources[${index}].extraction.sourceChecksum`,
      ),
      createdAt: requiredString(
        value.extraction.createdAt,
        `sources[${index}].extraction.createdAt`,
      ),
      summary: requiredString(
        value.extraction.summary,
        `sources[${index}].extraction.summary`,
      ),
      items: value.extraction.items.map((item, itemIndex) =>
        parseContextSourceItem(item, index, itemIndex),
      ),
    };
    if (source.extraction.sourceChecksum !== source.metadata.checksum) {
      throw invalidContext(`sources[${index}] extraction checksum 与 metadata 不一致`);
    }
    if (
      new Set(source.extraction.items.map((item) => item.itemId)).size !==
      source.extraction.items.length
    ) {
      throw invalidContext(`sources[${index}] extraction itemId 不能重复`);
    }
  }
  return source;
}

function parseContextSourceItem(
  value: unknown,
  sourceIndex: number,
  itemIndex: number,
): ContextSourceItem {
  if (!isRecord(value) || !Array.isArray(value.evidenceChunkIds)) {
    throw invalidContext(`sources[${sourceIndex}].items[${itemIndex}] 非法`);
  }
  const kind = requiredString(value.kind, "kind") as ExtractionItemKind;
  const confidence = requiredString(
    value.confidence,
    "confidence",
  ) as ExtractionConfidence;
  if (!EXTRACTION_ITEM_KINDS.includes(kind)) {
    throw invalidContext(`sources[${sourceIndex}].items[${itemIndex}].kind 非法`);
  }
  if (!EXTRACTION_CONFIDENCE_LEVELS.includes(confidence)) {
    throw invalidContext(
      `sources[${sourceIndex}].items[${itemIndex}].confidence 非法`,
    );
  }
  return {
    itemId: requiredString(value.itemId, "itemId"),
    kind,
    content: requiredString(value.content, "content"),
    confidence,
    evidenceChunkIds: value.evidenceChunkIds.map((entry, index) =>
      requiredString(entry, `evidenceChunkIds[${index}]`),
    ),
  };
}

function parseContextPage(value: unknown, index: number): ContextPage {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    throw invalidContext(`pages[${index}] 必须包含 metadata 对象`);
  }
  const summary = parsePageSummary(value, index);
  const originalChars = parseNonNegativeInteger(
    value.originalChars,
    `pages[${index}].originalChars`,
  );
  const includedChars = parseNonNegativeInteger(
    value.includedChars,
    `pages[${index}].includedChars`,
  );
  const content = typeof value.content === "string" ? value.content : null;
  if (content === null || content.length !== includedChars || includedChars > originalChars) {
    throw invalidContext(`pages[${index}] content 字符数不一致`);
  }
  if (typeof value.truncated !== "boolean" || value.truncated !== (includedChars < originalChars)) {
    throw invalidContext(`pages[${index}] truncated 与字符数不一致`);
  }
  const linkDepth = parseNonNegativeInteger(value.linkDepth, `pages[${index}].linkDepth`);
  if (linkDepth > 2) {
    throw invalidContext(`pages[${index}].linkDepth 不能超过 2`);
  }
  return {
    ...summary,
    selectionReason: requiredString(
      value.selectionReason,
      `pages[${index}].selectionReason`,
    ),
    score: parseNonNegativeNumber(value.score, `pages[${index}].score`),
    linkDepth,
    content,
    truncated: value.truncated,
    originalChars,
    includedChars,
  };
}

function parsePageSummary(value: Record<string, unknown>, index: number): PageSummary {
  const metadata = value.metadata;
  if (!isRecord(metadata) || !Array.isArray(metadata.sources) || !Array.isArray(metadata.tags)) {
    throw invalidContext(`pages[${index}].metadata 非法`);
  }
  if (!Array.isArray(value.headings) || !Array.isArray(value.links)) {
    throw invalidContext(`pages[${index}] headings 或 links 非法`);
  }
  return {
    id: requiredString(value.id, `pages[${index}].id`),
    path: requiredString(value.path, `pages[${index}].path`),
    checksum: requiredString(value.checksum, `pages[${index}].checksum`),
    metadata: {
      title: requiredString(metadata.title, "metadata.title"),
      type: requiredString(metadata.type, "metadata.type"),
      domain: requiredString(metadata.domain, "metadata.domain"),
      description: requiredString(metadata.description, "metadata.description"),
      status: requiredString(metadata.status, "metadata.status"),
      privacy: requiredString(metadata.privacy, "metadata.privacy"),
      sources: metadata.sources.map((entry, itemIndex) =>
        requiredString(entry, `metadata.sources[${itemIndex}]`),
      ),
      tags: metadata.tags.map((entry, itemIndex) =>
        requiredString(entry, `metadata.tags[${itemIndex}]`),
      ),
      updated: requiredString(metadata.updated, "metadata.updated"),
    },
    headings: value.headings.map((entry, itemIndex) =>
      requiredString(entry, `headings[${itemIndex}]`),
    ),
    links: value.links.map((entry, itemIndex) =>
      requiredString(entry, `links[${itemIndex}]`),
    ),
  };
}

function parseOmittedPage(value: unknown, index: number): ContextOmittedPage {
  if (!isRecord(value) || (value.reason !== "max_pages" && value.reason !== "max_chars")) {
    throw invalidContext(`omitted[${index}] 非法`);
  }
  return {
    id: requiredString(value.id, `omitted[${index}].id`),
    path: requiredString(value.path, `omitted[${index}].path`),
    selectionReason: requiredString(
      value.selectionReason,
      `omitted[${index}].selectionReason`,
    ),
    score: parseNonNegativeNumber(value.score, `omitted[${index}].score`),
    linkDepth: parseLinkDepth(value.linkDepth, `omitted[${index}].linkDepth`),
    reason: value.reason,
  };
}

function toPageSummary(page: PageDocument): PageSummary {
  return {
    id: page.id,
    path: page.path,
    checksum: page.checksum,
    metadata: page.metadata,
    headings: page.headings,
    links: page.links,
  };
}

function toPageSummaryFromParts(
  entry: PageManifestEntry,
  indexPage: SearchIndexPage,
): PageSummary {
  return {
    id: entry.id,
    path: entry.path,
    checksum: entry.checksum,
    metadata: {
      title: indexPage.title,
      type: indexPage.type,
      domain: indexPage.domain,
      description: indexPage.description,
      status: indexPage.status,
      privacy: indexPage.privacy,
      sources: [...indexPage.sources],
      tags: [...indexPage.tags],
      updated: entry.updated,
    },
    headings: [...indexPage.headings],
    links: [...indexPage.links],
  };
}

function toSearchResult(entry: RankedPage): SearchResultEntry {
  return {
    id: entry.page.id,
    path: entry.page.path,
    title: entry.page.metadata.title,
    description: entry.page.metadata.description,
    type: entry.page.metadata.type,
    domain: entry.page.metadata.domain,
    score: entry.score,
    matchedFields: entry.matchedFields,
    excerpt: entry.excerpt,
  };
}

function toOmitted(
  candidate: ContextCandidate,
  reason: ContextOmittedPage["reason"],
): ContextOmittedPage {
  return {
    id: candidate.page.id,
    path: candidate.page.path,
    selectionReason: candidate.selectionReason,
    score: candidate.score,
    linkDepth: candidate.linkDepth,
    reason,
  };
}

function compareCandidates(a: ContextCandidate, b: ContextCandidate): number {
  return (
    b.score - a.score ||
    a.linkDepth - b.linkDepth ||
    a.page.id.localeCompare(b.page.id)
  );
}

function assertUniqueContextPages(
  pages: ContextPage[],
  omitted: ContextOmittedPage[],
): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const page of [...pages, ...omitted]) {
    if (ids.has(page.id) || paths.has(page.path)) {
      throw invalidContext(`Context Pack Page 重复：${page.id}`);
    }
    ids.add(page.id);
    paths.add(page.path);
  }
}

function buildExcerpt(page: PageDocument, query: string, tokens: string[]): string {
  const text = page.body.replace(/\s+/g, " ").trim();
  if (text === "") {
    return page.metadata.description;
  }
  const lower = text.toLowerCase();
  const candidates = [query, ...tokens].filter(Boolean);
  const positions = candidates
    .map((candidate) => lower.indexOf(candidate.toLowerCase()))
    .filter((index) => index >= 0);
  const matchIndex = positions.length > 0 ? Math.min(...positions) : 0;
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(text.length, start + 200);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function containsQueryOrToken(text: string, query: string, tokens: string[]): boolean {
  return text.includes(query) || tokens.some((token) => text.includes(token));
}

function exactQueryOrToken(text: string, query: string, tokens: string[]): boolean {
  return text === query || tokens.includes(text);
}

function tokenBonus(text: string, tokens: string[]): number {
  return Math.max(0, tokens.filter((token) => text.includes(token)).length - 1);
}

function tokenize(query: string): string[] {
  return [
    ...new Set(
      query
        .split(/[^\p{Letter}\p{Number}._:-]+/u)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  return match?.[1] ?? content;
}

function assertSafeWikiPath(
  vaultRoot: string,
  wikiRoot: string,
  wikiPath: string,
): void {
  const normalized = normalizePath(wikiPath);
  const absoluteWikiRoot = resolve(vaultRoot, wikiRoot);
  const absolutePath = resolve(vaultRoot, normalized);
  const relativePath = relative(absoluteWikiRoot, absolutePath);
  if (
    wikiPath === "" ||
    isAbsolute(wikiPath) ||
    wikiPath.includes("\\") ||
    wikiPath.includes("\0") ||
    !normalized.startsWith(`${normalizePath(wikiRoot)}/`) ||
    !normalized.endsWith(".md") ||
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new SearchError(
      "UNSAFE_READ_PATH",
      `read-page 只允许读取 ${wikiRoot}/**/*.md：${wikiPath}`,
      2,
    );
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new SearchError("PAGE_NOT_FOUND", `Wiki Page 不存在：${wikiPath}`);
  }
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function parseUniqueStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw invalidContext(`${field} 必须是字符串数组`);
  }
  const values = value.map((entry, index) => requiredString(entry, `${field}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw invalidContext(`${field} 不能重复`);
  }
  return values;
}

function parseBudgetInteger(
  value: unknown,
  field: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const result = value === undefined ? defaultValue : value;
  if (!Number.isInteger(result) || (result as number) < minimum || (result as number) > maximum) {
    throw new SearchError(
      "CONTEXT_BUDGET_INVALID",
      `${field} 必须是 ${minimum} 到 ${maximum} 之间的整数`,
      2,
    );
  }
  return result as number;
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidContext(`${field} 必须是非负整数`);
  }
  return value as number;
}

function parseLinkDepth(value: unknown, field: string): number {
  const result = parseNonNegativeInteger(value, field);
  if (result > 2) {
    throw invalidContext(`${field} 不能超过 2`);
  }
  return result;
}

function parseNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidContext(`${field} 必须是非负数字`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidContext(`${field} 必须是非空字符串`);
  }
  return value;
}

function optionalString(value: unknown, field: string): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  return { [field.split(".").at(-1) ?? field]: requiredString(value, field) };
}

function optionalNumber(value: unknown, field: string): Record<string, number> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidContext(`${field} 必须是非负整数`);
  }
  return { [field.split(".").at(-1) ?? field]: value };
}

function invalidContext(message: string): SearchError {
  return new SearchError("INVALID_CONTEXT_REQUEST", message, 2);
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true });
    }
  }
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
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMinute = String(absoluteOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import {
  OKF_VERSION,
  PKWIKI_PROFILE,
  REQUIRED_DIRECTORIES,
  REQUIRED_FILES,
  computeSha256,
  findVaultRoot,
  isSourceLifecycleStatus,
  isSourceProcessingStatus,
  readChunkManifest,
  readExtractionArtifact,
  readVaultConfig,
  readSourceManifest,
  sourceIdToFileName,
  type SourceLifecycleStatus,
  type SourceProcessingStatus,
} from "@pkwiki/core";
import {
  getRunDirectory,
  parseCoverageArtifact,
  parseMergePlan,
  parseRunRecord,
} from "@pkwiki/merge";
import { parseContextPack, type ContextPack } from "@pkwiki/search";
import {
  listWikiPagePaths,
  readPageManifest,
  readSearchIndex,
} from "@pkwiki/indexer";

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
  validateChunkManifest(vaultRoot, errors, warnings);
  validateExtractionArtifacts(vaultRoot, errors, warnings);
  validateRunArtifacts(vaultRoot, errors, warnings);
  validateWikiPages(vaultRoot, errors, warnings);
  validatePageManifestAndIndex(vaultRoot, warnings);

  return {
    ok: errors.length === 0,
    vaultRoot,
    errors,
    warnings,
  };
}

function validatePageManifestAndIndex(
  vaultRoot: string,
  warnings: ValidationIssue[],
): void {
  const wikiPages = listWikiPagePaths(vaultRoot);
  let manifest: Record<string, unknown>;
  try {
    manifest = readPageManifest(vaultRoot);
  } catch (error) {
    warnings.push({
      severity: "warning",
      code: "INVALID_PAGE_MANIFEST",
      message: error instanceof Error ? error.message : String(error),
      path: ".pkwiki/page_manifest.json",
    });
    manifest = {};
  }

  const manifestPaths = new Set<string>();
  for (const [pageId, rawEntry] of Object.entries(manifest)) {
    if (!isRecord(rawEntry)) {
      warnings.push({
        severity: "warning",
        code: "INVALID_PAGE_MANIFEST_ENTRY",
        message: `page manifest 记录必须是对象：${pageId}`,
        path: ".pkwiki/page_manifest.json",
      });
      continue;
    }

    validatePageManifestFields(pageId, rawEntry, warnings);
    if (typeof rawEntry.path !== "string" || rawEntry.path === "") {
      continue;
    }

    manifestPaths.add(rawEntry.path);
    const absolutePath = join(vaultRoot, rawEntry.path);
    if (!existsSync(absolutePath)) {
      warnings.push({
        severity: "warning",
        code: "PAGE_MANIFEST_STALE_PAGE",
        message: `page manifest 指向不存在的页面：${rawEntry.path}`,
        path: ".pkwiki/page_manifest.json",
        target: rawEntry.path,
      });
      continue;
    }

    if (
      typeof rawEntry.checksum === "string" &&
      rawEntry.checksum !== computeSha256(absolutePath)
    ) {
      warnings.push({
        severity: "warning",
        code: "PAGE_MANIFEST_STALE_CHECKSUM",
        message: `page manifest checksum 已过期：${rawEntry.path}`,
        path: ".pkwiki/page_manifest.json",
        target: rawEntry.path,
      });
    }
  }

  for (const pagePath of wikiPages) {
    if (!manifestPaths.has(pagePath)) {
      warnings.push({
        severity: "warning",
        code: "PAGE_MANIFEST_MISSING_PAGE",
        message: `page manifest 缺少已存在页面：${pagePath}`,
        path: ".pkwiki/page_manifest.json",
        target: pagePath,
      });
    }
  }

  try {
    const index = readSearchIndex(vaultRoot);
    if (wikiPages.length > 0 && !index) {
      warnings.push({
        severity: "warning",
        code: "SEARCH_INDEX_MISSING",
        message: "Wiki Page 非空但 outputs/index.json 不存在",
        path: "outputs/index.json",
      });
    }
  } catch (error) {
    warnings.push({
      severity: "warning",
      code: "INVALID_SEARCH_INDEX",
      message: error instanceof Error ? error.message : String(error),
      path: "outputs/index.json",
    });
  }
}

function validatePageManifestFields(
  pageId: string,
  rawEntry: Record<string, unknown>,
  warnings: ValidationIssue[],
): void {
  const requiredFields = ["id", "path", "title", "type", "domain", "checksum"];
  for (const field of requiredFields) {
    if (isMissing(rawEntry[field])) {
      warnings.push({
        severity: "warning",
        code: "MISSING_PAGE_MANIFEST_FIELD",
        message: `page manifest 记录缺少字段 ${field}`,
        path: ".pkwiki/page_manifest.json",
      });
    }
  }

  if (rawEntry.id !== pageId) {
    warnings.push({
      severity: "warning",
      code: "PAGE_ID_MISMATCH",
      message: `page manifest key 与 id 不一致：${pageId}`,
      path: ".pkwiki/page_manifest.json",
    });
  }
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

    const requiredFields = ["sourceId", "rawPath", "type", "domain", "checksum"];
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

    const sourceStatus = validateSourceStatus(rawEntry, errors);
    validateOptionalSourceMetadata(rawEntry, errors);
    validateRawSource(
      vaultRoot,
      rawEntry,
      sourceStatus?.lifecycleStatus ?? null,
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

function validateSourceStatus(
  rawEntry: Record<string, unknown>,
  errors: ValidationIssue[],
): {
  processingStatus: SourceProcessingStatus;
  lifecycleStatus: SourceLifecycleStatus;
} | null {
  const hasProcessingStatus = rawEntry.processingStatus !== undefined;
  const hasLifecycleStatus = rawEntry.lifecycleStatus !== undefined;

  if (hasProcessingStatus !== hasLifecycleStatus) {
    errors.push({
      severity: "error",
      code: "INCOMPLETE_SOURCE_STATUS",
      message: "processingStatus 和 lifecycleStatus 必须同时存在",
      path: ".pkwiki/source_manifest.json",
    });
    return null;
  }

  if (hasProcessingStatus && hasLifecycleStatus) {
    const processingStatus = rawEntry.processingStatus;
    const lifecycleStatus = rawEntry.lifecycleStatus;

    if (!isSourceProcessingStatus(processingStatus)) {
      errors.push({
        severity: "error",
        code: "INVALID_SOURCE_PROCESSING_STATUS",
        message: `非法 processingStatus：${String(processingStatus)}`,
        path: ".pkwiki/source_manifest.json",
      });
    }
    if (!isSourceLifecycleStatus(lifecycleStatus)) {
      errors.push({
        severity: "error",
        code: "INVALID_SOURCE_LIFECYCLE_STATUS",
        message: `非法 lifecycleStatus：${String(lifecycleStatus)}`,
        path: ".pkwiki/source_manifest.json",
      });
    }

    if (rawEntry.status !== undefined) {
      if (rawEntry.status !== "registered") {
        errors.push({
          severity: "error",
          code: "INVALID_LEGACY_SOURCE_STATUS",
          message: `非法 legacy status：${String(rawEntry.status)}`,
          path: ".pkwiki/source_manifest.json",
        });
      } else if (
        isSourceProcessingStatus(processingStatus) &&
        processingStatus !== "registered"
      ) {
        errors.push({
          severity: "error",
          code: "CONFLICTING_SOURCE_STATUS",
          message: "新旧 Source 状态字段语义冲突",
          path: ".pkwiki/source_manifest.json",
        });
      }
    }

    return isSourceProcessingStatus(processingStatus) &&
      isSourceLifecycleStatus(lifecycleStatus)
      ? { processingStatus, lifecycleStatus }
      : null;
  }

  if (rawEntry.status === undefined) {
    errors.push({
      severity: "error",
      code: "MISSING_SOURCE_STATUS",
      message: "source manifest 记录缺少合法 Source 状态",
      path: ".pkwiki/source_manifest.json",
    });
    return null;
  }

  if (rawEntry.status !== "registered") {
    errors.push({
      severity: "error",
      code: "INVALID_LEGACY_SOURCE_STATUS",
      message: `非法 legacy status：${String(rawEntry.status)}`,
      path: ".pkwiki/source_manifest.json",
    });
    return null;
  }

  return { processingStatus: "registered", lifecycleStatus: "active" };
}

function validateOptionalSourceMetadata(
  rawEntry: Record<string, unknown>,
  errors: ValidationIssue[],
): void {
  const optionalStrings = [
    "originalName",
    "ingestedAt",
    "mtime",
    "privacy",
    "language",
  ];
  for (const field of optionalStrings) {
    if (
      rawEntry[field] !== undefined &&
      (typeof rawEntry[field] !== "string" || rawEntry[field] === "")
    ) {
      errors.push({
        severity: "error",
        code: "INVALID_SOURCE_MANIFEST_FIELD_TYPE",
        message: `source manifest 字段 ${field} 必须是非空字符串`,
        path: ".pkwiki/source_manifest.json",
      });
    }
  }

  if (
    rawEntry.sizeBytes !== undefined &&
    (typeof rawEntry.sizeBytes !== "number" ||
      !Number.isInteger(rawEntry.sizeBytes) ||
      rawEntry.sizeBytes < 0)
  ) {
    errors.push({
      severity: "error",
      code: "INVALID_SOURCE_MANIFEST_FIELD_TYPE",
      message: "source manifest 字段 sizeBytes 必须是非负整数",
      path: ".pkwiki/source_manifest.json",
    });
  }
}

function validateRawSource(
  vaultRoot: string,
  rawEntry: Record<string, unknown>,
  lifecycleStatus: SourceLifecycleStatus | null,
  warnings: ValidationIssue[],
): void {
  if (typeof rawEntry.rawPath !== "string" || rawEntry.rawPath === "") {
    return;
  }

  const absolutePath = join(vaultRoot, rawEntry.rawPath);
  const pathExists = existsSync(absolutePath);
  const fileExists = pathExists && statSync(absolutePath).isFile();

  if (lifecycleStatus === "deleted") {
    if (pathExists) {
      warnings.push({
        severity: "warning",
        code: "DELETED_SOURCE_FILE_EXISTS",
        message: `Source 已标记 deleted，但 Raw 文件仍存在：${rawEntry.rawPath}`,
        path: ".pkwiki/source_manifest.json",
        target: rawEntry.rawPath,
      });
    }
    return;
  }

  if (!fileExists) {
    warnings.push({
      severity: "warning",
      code: "RAW_SOURCE_MISSING",
      message: `source manifest 指向的文件不存在：${rawEntry.rawPath}`,
      path: ".pkwiki/source_manifest.json",
      target: rawEntry.rawPath,
    });
    return;
  }

  if (
    typeof rawEntry.checksum === "string" &&
    rawEntry.checksum !== computeSha256(absolutePath)
  ) {
    warnings.push({
      severity: "warning",
      code: "RAW_SOURCE_CHECKSUM_MISMATCH",
      message: `Raw Source checksum 与 manifest 不一致：${rawEntry.rawPath}`,
      path: ".pkwiki/source_manifest.json",
      target: rawEntry.rawPath,
    });
  }

  if (
    typeof rawEntry.sizeBytes === "number" &&
    rawEntry.sizeBytes !== statSync(absolutePath).size
  ) {
    warnings.push({
      severity: "warning",
      code: "RAW_SOURCE_SIZE_MISMATCH",
      message: `Raw Source size 与 manifest 不一致：${rawEntry.rawPath}`,
      path: ".pkwiki/source_manifest.json",
      target: rawEntry.rawPath,
    });
  }
}

function validateChunkManifest(
  vaultRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  let chunkManifest: Record<string, unknown>;
  let sourceManifest: Record<string, unknown>;
  try {
    chunkManifest = readChunkManifest(vaultRoot);
    sourceManifest = readSourceManifest(vaultRoot);
  } catch (error) {
    errors.push({
      severity: "error",
      code: "INVALID_CHUNK_MANIFEST",
      message: error instanceof Error ? error.message : String(error),
      path: ".pkwiki/chunk_manifest.json",
    });
    return;
  }

  const requiredFields = [
    "chunkId",
    "sourceId",
    "index",
    "path",
    "startLine",
    "endLine",
    "charCount",
    "checksum",
    "sourceChecksum",
    "createdAt",
  ];

  for (const [chunkId, rawEntry] of Object.entries(chunkManifest)) {
    if (!isRecord(rawEntry)) {
      errors.push({
        severity: "error",
        code: "INVALID_CHUNK_MANIFEST_ENTRY",
        message: `chunk manifest 记录必须是对象：${chunkId}`,
        path: ".pkwiki/chunk_manifest.json",
      });
      continue;
    }
    for (const field of requiredFields) {
      if (isMissing(rawEntry[field])) {
        errors.push({
          severity: "error",
          code: "MISSING_CHUNK_MANIFEST_FIELD",
          message: `chunk manifest 记录缺少字段 ${field}`,
          path: ".pkwiki/chunk_manifest.json",
        });
      }
    }
    if (rawEntry.chunkId !== chunkId) {
      errors.push({
        severity: "error",
        code: "CHUNK_ID_MISMATCH",
        message: `chunk manifest key 与 chunkId 不一致：${chunkId}`,
        path: ".pkwiki/chunk_manifest.json",
      });
    }

    const source =
      typeof rawEntry.sourceId === "string"
        ? sourceManifest[rawEntry.sourceId]
        : undefined;
    if (!isRecord(source)) {
      errors.push({
        severity: "error",
        code: "CHUNK_SOURCE_NOT_FOUND",
        message: `chunk 引用未登记 Source：${String(rawEntry.sourceId)}`,
        path: ".pkwiki/chunk_manifest.json",
      });
      continue;
    }
    if (rawEntry.sourceChecksum !== source.checksum) {
      warnings.push({
        severity: "warning",
        code: "CHUNK_SOURCE_CHECKSUM_STALE",
        message: `chunk sourceChecksum 已过期：${chunkId}`,
        path: ".pkwiki/chunk_manifest.json",
        target: chunkId,
      });
    }
    if (typeof rawEntry.path !== "string" || rawEntry.path === "") {
      continue;
    }
    const chunkPath = join(vaultRoot, rawEntry.path);
    if (!existsSync(chunkPath) || !statSync(chunkPath).isFile()) {
      warnings.push({
        severity: "warning",
        code: "CHUNK_FILE_MISSING",
        message: `chunk 文件不存在：${rawEntry.path}`,
        path: ".pkwiki/chunk_manifest.json",
        target: rawEntry.path,
      });
      continue;
    }
    if (
      typeof rawEntry.checksum === "string" &&
      rawEntry.checksum !== computeSha256(chunkPath)
    ) {
      warnings.push({
        severity: "warning",
        code: "CHUNK_CHECKSUM_MISMATCH",
        message: `chunk checksum 已过期：${rawEntry.path}`,
        path: ".pkwiki/chunk_manifest.json",
        target: rawEntry.path,
      });
    }
  }
}

function validateExtractionArtifacts(
  vaultRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  let sourceManifest: Record<string, unknown>;
  let chunkManifest: Record<string, unknown>;
  try {
    sourceManifest = readSourceManifest(vaultRoot);
    chunkManifest = readChunkManifest(vaultRoot);
  } catch {
    return;
  }

  const extractionRoot = join(vaultRoot, "extracted/data");
  const artifactSourceIds = new Set<string>();
  if (existsSync(extractionRoot) && statSync(extractionRoot).isDirectory()) {
    for (const file of readdirSync(extractionRoot)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const artifactPath = join(extractionRoot, file);
      try {
        const artifact = readExtractionArtifact(artifactPath);
        artifactSourceIds.add(artifact.sourceId);
        const source = sourceManifest[artifact.sourceId];
        if (!isRecord(source)) {
          errors.push({
            severity: "error",
            code: "EXTRACTION_SOURCE_NOT_FOUND",
            message: `Extraction Artifact 引用未登记 Source：${artifact.sourceId}`,
            path: relative(vaultRoot, artifactPath),
          });
          continue;
        }
        if (artifact.sourceChecksum !== source.checksum) {
          warnings.push({
            severity: "warning",
            code: "EXTRACTION_SOURCE_CHECKSUM_STALE",
            message: `Extraction Artifact sourceChecksum 已过期：${artifact.sourceId}`,
            path: relative(vaultRoot, artifactPath),
          });
        }
        for (const item of artifact.items) {
          for (const evidence of item.evidence) {
            const chunk = chunkManifest[evidence.chunkId];
            if (
              !isRecord(chunk) ||
              chunk.sourceId !== artifact.sourceId ||
              chunk.sourceChecksum !== artifact.sourceChecksum
            ) {
              errors.push({
                severity: "error",
                code: "EXTRACTION_EVIDENCE_INVALID",
                message: `Information Item ${item.itemId} 引用了无效 chunk：${evidence.chunkId}`,
                path: relative(vaultRoot, artifactPath),
                target: evidence.chunkId,
              });
            }
          }
        }
      } catch (error) {
        errors.push({
          severity: "error",
          code: "INVALID_EXTRACTION_ARTIFACT",
          message: error instanceof Error ? error.message : String(error),
          path: relative(vaultRoot, artifactPath),
        });
      }
    }
  }

  for (const [sourceId, rawSource] of Object.entries(sourceManifest)) {
    if (!isRecord(rawSource)) {
      continue;
    }
    const status = getSourceStatusForValidation(rawSource);
    if (
      status &&
      ["extracted", "partially_merged", "merged"].includes(
        status.processingStatus,
      ) &&
      !artifactSourceIds.has(sourceId)
    ) {
      warnings.push({
        severity: "warning",
        code: "EXTRACTION_ARTIFACT_MISSING",
        message: `Source 状态为 ${status.processingStatus}，但 Extraction Artifact 不存在：${sourceId}`,
        path: ".pkwiki/source_manifest.json",
        target: sourceId,
      });
    }
  }
}

function getSourceStatusForValidation(rawEntry: Record<string, unknown>): {
  processingStatus: SourceProcessingStatus;
  lifecycleStatus: SourceLifecycleStatus;
} | null {
  if (
    isSourceProcessingStatus(rawEntry.processingStatus) &&
    isSourceLifecycleStatus(rawEntry.lifecycleStatus)
  ) {
    return {
      processingStatus: rawEntry.processingStatus,
      lifecycleStatus: rawEntry.lifecycleStatus,
    };
  }
  if (rawEntry.status === "registered") {
    return { processingStatus: "registered", lifecycleStatus: "active" };
  }
  return null;
}

function validateRunArtifacts(
  vaultRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const runsRoot = join(vaultRoot, ".pkwiki/runs");
  if (!existsSync(runsRoot) || !statSync(runsRoot).isDirectory()) {
    return;
  }
  let sourceManifest: Record<string, unknown>;
  try {
    sourceManifest = readSourceManifest(vaultRoot);
  } catch {
    return;
  }

  for (const directory of readdirSync(runsRoot)) {
    const runDirectory = join(runsRoot, directory);
    if (!statSync(runDirectory).isDirectory()) {
      continue;
    }
    const runPath = join(runDirectory, "run.json");
    const planPath = join(runDirectory, "merge-plan.json");
    const contextPath = join(runDirectory, "context-pack.json");
    const contextPack = existsSync(contextPath)
      ? validateContextPackArtifact(
          vaultRoot,
          directory,
          contextPath,
          sourceManifest,
          errors,
          warnings,
        )
      : null;
    const hasRun = existsSync(runPath);
    const hasPlan = existsSync(planPath);
    if (!hasRun && !hasPlan && contextPack) {
      continue;
    }
    if (!hasRun || !hasPlan) {
      if (existsSync(contextPath) && !contextPack) {
        continue;
      }
      errors.push({
        severity: "error",
        code: "RUN_ARTIFACT_MISSING",
        message: `Run 缺少 run.json 或 merge-plan.json：${directory}`,
        path: relative(vaultRoot, runDirectory),
      });
      continue;
    }

    try {
      const run = parseRunRecord(JSON.parse(readFileSync(runPath, "utf8")));
      const plan = parseMergePlan(JSON.parse(readFileSync(planPath, "utf8")));
      if (run.runId !== plan.runId) {
        errors.push({
          severity: "error",
          code: "RUN_ID_MISMATCH",
          message: `Run Record 与 MergePlan runId 不一致：${directory}`,
          path: relative(vaultRoot, runDirectory),
        });
      }
      if (contextPack && contextPack.runId !== run.runId) {
        errors.push({
          severity: "error",
          code: "CONTEXT_RUN_ID_MISMATCH",
          message: `Context Pack 与 Run Record runId 不一致：${directory}`,
          path: relative(vaultRoot, contextPath),
        });
      }
      if (contextPack && contextPack.workflow !== "merge") {
        errors.push({
          severity: "error",
          code: "CONTEXT_WORKFLOW_MISMATCH",
          message: `Merge Run 只能关联 merge Context Pack：${directory}`,
          path: relative(vaultRoot, contextPath),
        });
      }
      if (run.status !== "completed") {
        continue;
      }

      const coveragePath = join(runDirectory, "coverage.json");
      if (!existsSync(coveragePath)) {
        errors.push({
          severity: "error",
          code: "RUN_COVERAGE_MISSING",
          message: `completed Run 缺少 coverage.json：${run.runId}`,
          path: relative(vaultRoot, runDirectory),
        });
        continue;
      }
      const coverage = parseCoverageArtifact(
        JSON.parse(readFileSync(coveragePath, "utf8")),
      );
      if (coverage.runId !== run.runId) {
        errors.push({
          severity: "error",
          code: "RUN_COVERAGE_ID_MISMATCH",
          message: `Coverage 与 Run Record runId 不一致：${directory}`,
          path: relative(vaultRoot, coveragePath),
        });
      }
      validateCoverageReferences(
        vaultRoot,
        coverage.entries,
        sourceManifest,
        errors,
        relative(vaultRoot, coveragePath),
      );
      for (const [sourceId, expectedStatus] of Object.entries(
        coverage.sourceStatuses,
      )) {
        const source = sourceManifest[sourceId];
        if (
          isRecord(source) &&
          source.processingStatus !== expectedStatus
        ) {
          warnings.push({
            severity: "warning",
            code: "RUN_SOURCE_STATUS_MISMATCH",
            message: `Coverage 与 Source processingStatus 不一致：${sourceId}`,
            path: relative(vaultRoot, coveragePath),
            target: sourceId,
          });
        }
      }
    } catch (error) {
      errors.push({
        severity: "error",
        code: "INVALID_RUN_ARTIFACT",
        message: error instanceof Error ? error.message : String(error),
        path: relative(vaultRoot, runDirectory),
      });
    }
  }
}

function validateContextPackArtifact(
  vaultRoot: string,
  directory: string,
  contextPath: string,
  sourceManifest: Record<string, unknown>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): ContextPack | null {
  const path = relative(vaultRoot, contextPath);
  try {
    const contextPack = parseContextPack(
      JSON.parse(readFileSync(contextPath, "utf8")),
    );
    if (basename(getRunDirectory(contextPack.runId)) !== directory) {
      errors.push({
        severity: "error",
        code: "CONTEXT_RUN_DIRECTORY_MISMATCH",
        message: `Context Pack runId 与目录不一致：${contextPack.runId}`,
        path,
      });
    }
    for (const source of contextPack.sources) {
      if (!isRecord(sourceManifest[source.sourceId])) {
        errors.push({
          severity: "error",
          code: "CONTEXT_SOURCE_NOT_FOUND",
          message: `Context Pack 引用未登记 Source：${source.sourceId}`,
          path,
          target: source.sourceId,
        });
      }
    }
    const wikiRoot = readVaultConfig(vaultRoot).wikiRoot;
    for (const page of contextPack.pages) {
      if (!isSafeContextPagePath(vaultRoot, wikiRoot, page.path)) {
        errors.push({
          severity: "error",
          code: "CONTEXT_PAGE_PATH_INVALID",
          message: `Context Pack Page 路径非法：${page.path}`,
          path,
          target: page.path,
        });
        continue;
      }
      const absolutePath = join(vaultRoot, page.path);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        errors.push({
          severity: "error",
          code: "CONTEXT_PAGE_NOT_FOUND",
          message: `Context Pack Page 不存在：${page.path}`,
          path,
          target: page.path,
        });
        continue;
      }
      if (computeSha256(absolutePath) !== page.checksum) {
        warnings.push({
          severity: "warning",
          code: "CONTEXT_PAGE_CHECKSUM_STALE",
          message: `Context Pack Page checksum 已过期：${page.path}`,
          path,
          target: page.path,
        });
      }
    }
    return contextPack;
  } catch (error) {
    errors.push({
      severity: "error",
      code: "INVALID_CONTEXT_PACK",
      message: error instanceof Error ? error.message : String(error),
      path,
    });
    return null;
  }
}

function isSafeContextPagePath(
  vaultRoot: string,
  wikiRoot: string,
  path: string,
): boolean {
  if (
    path === "" ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    !path.startsWith(`${wikiRoot}/`) ||
    !path.endsWith(".md")
  ) {
    return false;
  }
  const absoluteWikiRoot = resolve(vaultRoot, wikiRoot);
  const pagePath = resolve(vaultRoot, path);
  const relativePath = relative(absoluteWikiRoot, pagePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

function validateCoverageReferences(
  vaultRoot: string,
  entries: Array<{ sourceId: string; itemId: string }>,
  sourceManifest: Record<string, unknown>,
  errors: ValidationIssue[],
  path: string,
): void {
  const itemCache = new Map<string, Set<string>>();
  for (const entry of entries) {
    const source = sourceManifest[entry.sourceId];
    if (!isRecord(source)) {
      errors.push({
        severity: "error",
        code: "RUN_COVERAGE_SOURCE_NOT_FOUND",
        message: `Coverage 引用未登记 Source：${entry.sourceId}`,
        path,
      });
      continue;
    }
    let items = itemCache.get(entry.sourceId);
    if (!items) {
      const artifactPath = join(
        vaultRoot,
        "extracted/data",
        `${sourceIdToFileName(entry.sourceId)}.json`,
      );
      if (!existsSync(artifactPath)) {
        errors.push({
          severity: "error",
          code: "RUN_COVERAGE_EXTRACTION_MISSING",
          message: `Coverage Source 缺少 Extraction Artifact：${entry.sourceId}`,
          path,
        });
        continue;
      }
      const artifact = readExtractionArtifact(artifactPath);
      items = new Set(artifact.items.map((item) => item.itemId));
      itemCache.set(entry.sourceId, items);
    }
    if (!items.has(entry.itemId)) {
      errors.push({
        severity: "error",
        code: "RUN_COVERAGE_ITEM_NOT_FOUND",
        message: `Coverage 引用未知 Information Item：${entry.sourceId} ${entry.itemId}`,
        path,
      });
    }
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

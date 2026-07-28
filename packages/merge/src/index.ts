import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  EXTRACTION_CONFIDENCE_LEVELS,
  isRecord,
  loadVault,
  normalizeSourceStatus,
  readExtractionArtifact,
  readSourceManifest,
  sourceIdToFileName,
  type ExtractionArtifact,
  type ExtractionConfidence,
  type SourceManifest,
  type SourceProcessingStatus,
} from "@pkwiki/core";
import { generateIndex } from "@pkwiki/indexer";

export const MERGE_PLAN_VERSION = "pkwiki.merge-plan/0.1";
export const COVERAGE_VERSION = "pkwiki.coverage/0.1";
export const RUN_RECORD_VERSION = "pkwiki.run/0.1";

export const MERGE_TARGET_INTENTS = [
  "create",
  "update",
  "split",
  "link",
  "skip",
] as const;
export const MERGE_DECISIONS = [
  "merged",
  "deferred",
  "discarded",
  "needs_confirmation",
] as const;

export type MergeTargetIntent = (typeof MERGE_TARGET_INTENTS)[number];
export type MergeDecision = (typeof MERGE_DECISIONS)[number];

export type CandidateTarget = {
  path: string;
  reason: string;
  intent: MergeTargetIntent;
  confidence: ExtractionConfidence;
};

export type CoverageEntry = {
  sourceId: string;
  itemId: string;
  decision: MergeDecision;
  target?: string;
  reason: string;
};

export type MergePlan = {
  version: typeof MERGE_PLAN_VERSION;
  runId: string;
  createdAt: string;
  sourceIds: string[];
  summary: string;
  candidateTargets: CandidateTarget[];
  coverage: CoverageEntry[];
  unresolvedQuestions: string[];
  privacyNotes: string[];
  patchPlanPath?: string;
};

export type CoverageArtifact = {
  version: typeof COVERAGE_VERSION;
  runId: string;
  finalizedAt: string;
  sourceStatuses: Record<string, SourceProcessingStatus>;
  entries: CoverageEntry[];
};

export type RunRecord = {
  version: typeof RUN_RECORD_VERSION;
  runId: string;
  workflow: "merge";
  status: "awaiting_apply" | "completed";
  createdAt: string;
  updatedAt: string;
};

export type RegisterMergePlanResult = {
  ok: true;
  vaultRoot: string;
  runId: string;
  runDirectory: string;
  sourceCount: number;
  coverageCount: number;
  status: "awaiting_apply";
};

export type FinalizeMergeResult = {
  ok: true;
  vaultRoot: string;
  runId: string;
  coveragePath: string;
  sourceStatuses: Record<string, SourceProcessingStatus>;
  mergedCount: number;
  deferredCount: number;
  discardedCount: number;
  needsConfirmationCount: number;
};

export type MergePlanErrorCode =
  | "INVALID_MERGE_PLAN"
  | "RUN_ALREADY_EXISTS"
  | "RUN_NOT_FOUND"
  | "MERGE_SOURCE_NOT_FOUND"
  | "MERGE_SOURCE_NOT_ACTIVE"
  | "MERGE_EXTRACTION_MISSING"
  | "MERGE_COVERAGE_INCOMPLETE"
  | "MERGE_COVERAGE_DUPLICATE"
  | "MERGE_COVERAGE_UNKNOWN_ITEM"
  | "MERGE_TARGET_INVALID"
  | "MERGE_TARGET_MISSING"
  | "MERGE_TARGET_SOURCE_MISSING"
  | "MERGE_PLAN_STALE";

export class MergePlanError extends Error {
  constructor(
    readonly code: MergePlanErrorCode,
    message: string,
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
    this.name = "MergePlanError";
  }
}

type ValidatedPlan = {
  plan: MergePlan;
  sourceManifest: SourceManifest;
  extractions: Map<string, ExtractionArtifact>;
};

export function parseMergePlan(value: unknown): MergePlan {
  if (!isRecord(value)) {
    throw invalidPlan("MergePlan 必须是 JSON 对象");
  }
  if (value.version !== MERGE_PLAN_VERSION) {
    throw invalidPlan(`MergePlan version 必须是 ${MERGE_PLAN_VERSION}`);
  }
  const runId = requiredString(value.runId, "runId");
  if (!/^run:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(runId)) {
    throw invalidPlan("runId 必须以 run: 开头，且不能包含路径字符");
  }
  const sourceIds = requiredUniqueStringArray(value.sourceIds, "sourceIds", true);
  const candidateTargets = parseCandidateTargets(value.candidateTargets);
  const coverage = parseCoverage(value.coverage);
  const unresolvedQuestions = requiredUniqueStringArray(
    value.unresolvedQuestions,
    "unresolvedQuestions",
    false,
  );
  const privacyNotes = requiredUniqueStringArray(
    value.privacyNotes,
    "privacyNotes",
    false,
  );

  const candidateByPath = new Map(candidateTargets.map((target) => [target.path, target]));
  for (const entry of coverage) {
    if (!sourceIds.includes(entry.sourceId)) {
      throw invalidPlan(`coverage 引用了 sourceIds 之外的 Source：${entry.sourceId}`);
    }
    if (entry.decision === "merged") {
      if (!entry.target) {
        throw invalidPlan(`merged coverage 缺少 target：${entry.itemId}`);
      }
      const candidate = candidateByPath.get(entry.target);
      if (!candidate || candidate.intent === "skip") {
        throw invalidPlan(`merged target 未出现在有效 Candidate Targets：${entry.target}`);
      }
    }
  }

  return {
    version: MERGE_PLAN_VERSION,
    runId,
    createdAt: requiredString(value.createdAt, "createdAt"),
    sourceIds,
    summary: requiredString(value.summary, "summary"),
    candidateTargets,
    coverage,
    unresolvedQuestions,
    privacyNotes,
    ...(value.patchPlanPath === undefined
      ? {}
      : { patchPlanPath: requiredString(value.patchPlanPath, "patchPlanPath") }),
  };
}

export function readMergePlan(path: string): MergePlan {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw invalidPlan(`无法读取或解析 MergePlan：${String(error)}`);
  }
  return parseMergePlan(value);
}

export function parseCoverageArtifact(value: unknown): CoverageArtifact {
  if (!isRecord(value) || value.version !== COVERAGE_VERSION) {
    throw invalidPlan(`Coverage version 必须是 ${COVERAGE_VERSION}`);
  }
  if (!isRecord(value.sourceStatuses)) {
    throw invalidPlan("Coverage sourceStatuses 必须是对象");
  }
  const sourceStatuses: Record<string, SourceProcessingStatus> = {};
  for (const [sourceId, status] of Object.entries(value.sourceStatuses)) {
    if (status !== "merged" && status !== "partially_merged") {
      throw invalidPlan(`Coverage Source status 非法：${sourceId}`);
    }
    sourceStatuses[sourceId] = status;
  }
  return {
    version: COVERAGE_VERSION,
    runId: requiredString(value.runId, "runId"),
    finalizedAt: requiredString(value.finalizedAt, "finalizedAt"),
    sourceStatuses,
    entries: parseCoverage(value.entries),
  };
}

export function parseRunRecord(value: unknown): RunRecord {
  if (!isRecord(value) || value.version !== RUN_RECORD_VERSION) {
    throw invalidPlan(`Run Record version 必须是 ${RUN_RECORD_VERSION}`);
  }
  if (value.workflow !== "merge") {
    throw invalidPlan("Run Record workflow 必须是 merge");
  }
  if (value.status !== "awaiting_apply" && value.status !== "completed") {
    throw invalidPlan(`Run Record status 非法：${String(value.status)}`);
  }
  return {
    version: RUN_RECORD_VERSION,
    runId: requiredString(value.runId, "runId"),
    workflow: "merge",
    status: value.status,
    createdAt: requiredString(value.createdAt, "createdAt"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
  };
}

export function registerMergePlan(
  startPath: string,
  planPath: string,
): RegisterMergePlanResult {
  const vault = loadVault(startPath);
  const plan = readMergePlan(resolve(planPath));
  validatePlanAgainstVault(vault.root, plan);

  const runDirectory = getRunDirectory(plan.runId);
  const absoluteRunDirectory = join(vault.root, runDirectory);
  const contextOnlyRun = isContextOnlyRunDirectory(absoluteRunDirectory);
  if (existsSync(absoluteRunDirectory) && !contextOnlyRun) {
    throw new MergePlanError(
      "RUN_ALREADY_EXISTS",
      `Run 已存在：${plan.runId}`,
    );
  }

  const temporaryDirectory = `${absoluteRunDirectory}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(temporaryDirectory, { recursive: true });
  const backupDirectory = `${absoluteRunDirectory}.backup-${process.pid}-${Date.now()}`;
  try {
    if (contextOnlyRun) {
      copyFileSync(
        join(absoluteRunDirectory, "context-pack.json"),
        join(temporaryDirectory, "context-pack.json"),
      );
    }
    writeJson(join(temporaryDirectory, "merge-plan.json"), plan);
    writeJson(join(temporaryDirectory, "run.json"), {
      version: RUN_RECORD_VERSION,
      runId: plan.runId,
      workflow: "merge",
      status: "awaiting_apply",
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
    } satisfies RunRecord);
    mkdirSync(dirname(absoluteRunDirectory), { recursive: true });
    if (contextOnlyRun) {
      renameSync(absoluteRunDirectory, backupDirectory);
    }
    renameSync(temporaryDirectory, absoluteRunDirectory);
    rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (
      contextOnlyRun &&
      !existsSync(absoluteRunDirectory) &&
      existsSync(backupDirectory)
    ) {
      renameSync(backupDirectory, absoluteRunDirectory);
    }
    throw error;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    rmSync(backupDirectory, { recursive: true, force: true });
  }

  return {
    ok: true,
    vaultRoot: vault.root,
    runId: plan.runId,
    runDirectory,
    sourceCount: plan.sourceIds.length,
    coverageCount: plan.coverage.length,
    status: "awaiting_apply",
  };
}

export function finalizeMerge(
  startPath: string,
  runId: string,
  now = new Date(),
): FinalizeMergeResult {
  const vault = loadVault(startPath);
  const runDirectory = getRunDirectory(runId);
  const absoluteRunDirectory = join(vault.root, runDirectory);
  if (!existsSync(absoluteRunDirectory)) {
    throw new MergePlanError("RUN_NOT_FOUND", `Run 不存在：${runId}`);
  }
  const plan = readMergePlan(join(absoluteRunDirectory, "merge-plan.json"));
  if (plan.runId !== runId) {
    throw new MergePlanError("MERGE_PLAN_STALE", "Run ID 与 MergePlan 不一致");
  }
  const validated = validatePlanAgainstVault(vault.root, plan);
  const indexResult = generateIndex(vault.root, { now });
  const pageByPath = new Map(
    Object.values(indexResult.pageManifest).map((page) => [page.path, page]),
  );
  for (const coverage of plan.coverage) {
    if (coverage.decision !== "merged" || !coverage.target) {
      continue;
    }
    const page = pageByPath.get(coverage.target);
    if (!page) {
      throw new MergePlanError(
        "MERGE_TARGET_MISSING",
        `merged target 页面不存在：${coverage.target}`,
      );
    }
    if (!page.sources.includes(coverage.sourceId)) {
      throw new MergePlanError(
        "MERGE_TARGET_SOURCE_MISSING",
        `target 页面缺少 Source 引用：${coverage.target} -> ${coverage.sourceId}`,
      );
    }
  }

  const finalizedAt = formatLocalDateTime(now);
  const sourceStatuses = buildSourceStatuses(plan);
  const coverageArtifact: CoverageArtifact = {
    version: COVERAGE_VERSION,
    runId,
    finalizedAt,
    sourceStatuses,
    entries: plan.coverage,
  };
  const nextManifest = updateSourceManifest(
    validated.sourceManifest,
    sourceStatuses,
  );
  const pendingFiles = new Map<string, string>();
  pendingFiles.set(
    join(runDirectory, "coverage.json"),
    `${JSON.stringify(coverageArtifact, null, 2)}\n`,
  );
  pendingFiles.set(
    join(runDirectory, "run.json"),
    `${JSON.stringify(
      {
        version: RUN_RECORD_VERSION,
        runId,
        workflow: "merge",
        status: "completed",
        createdAt: plan.createdAt,
        updatedAt: finalizedAt,
      } satisfies RunRecord,
      null,
      2,
    )}\n`,
  );
  pendingFiles.set(
    ".pkwiki/source_manifest.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
  );
  for (const sourceId of plan.sourceIds) {
    const source = nextManifest[sourceId];
    const markdownPath = source.extractedPath;
    const current = readFileSync(join(vault.root, markdownPath), "utf8");
    pendingFiles.set(
      markdownPath,
      renderCoverageSections(current, sourceId, plan.coverage),
    );
  }
  writeFilesAtomically(vault.root, pendingFiles);

  return {
    ok: true,
    vaultRoot: vault.root,
    runId,
    coveragePath: join(runDirectory, "coverage.json"),
    sourceStatuses,
    mergedCount: countDecision(plan, "merged"),
    deferredCount: countDecision(plan, "deferred"),
    discardedCount: countDecision(plan, "discarded"),
    needsConfirmationCount: countDecision(plan, "needs_confirmation"),
  };
}

export function getRunDirectory(runId: string): string {
  if (!/^run:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(runId)) {
    throw invalidPlan("runId 非法");
  }
  return join(".pkwiki", "runs", runId.replace(/:/g, "-"));
}

function isContextOnlyRunDirectory(path: string): boolean {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return false;
  }
  const entries = readdirSync(path, { withFileTypes: true });
  return (
    entries.length === 1 &&
    entries[0]?.isFile() === true &&
    entries[0]?.name === "context-pack.json"
  );
}

function validatePlanAgainstVault(vaultRoot: string, plan: MergePlan): ValidatedPlan {
  const sourceManifest = readSourceManifest(vaultRoot);
  const extractions = new Map<string, ExtractionArtifact>();
  const expectedItems = new Set<string>();

  for (const sourceId of plan.sourceIds) {
    const source = sourceManifest[sourceId];
    if (!source) {
      throw new MergePlanError(
        "MERGE_SOURCE_NOT_FOUND",
        `MergePlan Source 未登记：${sourceId}`,
      );
    }
    const status = normalizeSourceStatus(source);
    if (status.lifecycleStatus !== "active") {
      throw new MergePlanError(
        "MERGE_SOURCE_NOT_ACTIVE",
        `MergePlan Source lifecycle 不是 active：${sourceId}`,
      );
    }
    const artifactPath = join(
      vaultRoot,
      "extracted",
      "data",
      `${sourceIdToFileName(sourceId)}.json`,
    );
    if (!existsSync(artifactPath)) {
      throw new MergePlanError(
        "MERGE_EXTRACTION_MISSING",
        `Extraction Artifact 不存在：${sourceId}`,
      );
    }
    const artifact = readExtractionArtifact(artifactPath);
    if (
      artifact.sourceId !== sourceId ||
      artifact.sourceChecksum !== source.checksum
    ) {
      throw new MergePlanError(
        "MERGE_PLAN_STALE",
        `Extraction Artifact 已过期：${sourceId}`,
      );
    }
    extractions.set(sourceId, artifact);
    for (const item of artifact.items) {
      expectedItems.add(itemKey(sourceId, item.itemId));
    }
  }

  const seenCoverage = new Set<string>();
  for (const entry of plan.coverage) {
    const key = itemKey(entry.sourceId, entry.itemId);
    if (seenCoverage.has(key)) {
      throw new MergePlanError(
        "MERGE_COVERAGE_DUPLICATE",
        `Coverage 重复：${entry.sourceId} ${entry.itemId}`,
      );
    }
    seenCoverage.add(key);
    if (!expectedItems.has(key)) {
      throw new MergePlanError(
        "MERGE_COVERAGE_UNKNOWN_ITEM",
        `Coverage 引用未知 Item：${entry.sourceId} ${entry.itemId}`,
      );
    }
  }
  const missing = [...expectedItems].filter((key) => !seenCoverage.has(key));
  if (missing.length > 0) {
    throw new MergePlanError(
      "MERGE_COVERAGE_INCOMPLETE",
      `Coverage 缺少 Information Item：${missing.join(", ")}`,
    );
  }

  return { plan, sourceManifest, extractions };
}

function parseCandidateTargets(value: unknown): CandidateTarget[] {
  if (!Array.isArray(value)) {
    throw invalidPlan("candidateTargets 必须是数组");
  }
  const paths = new Set<string>();
  return value.map((rawTarget, index) => {
    if (!isRecord(rawTarget)) {
      throw invalidPlan(`candidateTargets[${index}] 必须是对象`);
    }
    const path = requiredString(rawTarget.path, `candidateTargets[${index}].path`);
    if (!isSafeWikiPath(path)) {
      throw new MergePlanError(
        "MERGE_TARGET_INVALID",
        `Candidate Target 必须位于 wiki/**/*.md：${path}`,
        2,
      );
    }
    if (paths.has(path)) {
      throw invalidPlan(`Candidate Target path 重复：${path}`);
    }
    paths.add(path);
    if (!MERGE_TARGET_INTENTS.includes(rawTarget.intent as MergeTargetIntent)) {
      throw invalidPlan(`Candidate Target intent 非法：${String(rawTarget.intent)}`);
    }
    if (
      !EXTRACTION_CONFIDENCE_LEVELS.includes(
        rawTarget.confidence as ExtractionConfidence,
      )
    ) {
      throw invalidPlan(
        `Candidate Target confidence 非法：${String(rawTarget.confidence)}`,
      );
    }
    return {
      path,
      reason: requiredString(rawTarget.reason, `candidateTargets[${index}].reason`),
      intent: rawTarget.intent as MergeTargetIntent,
      confidence: rawTarget.confidence as ExtractionConfidence,
    };
  });
}

function parseCoverage(value: unknown): CoverageEntry[] {
  if (!Array.isArray(value)) {
    throw invalidPlan("coverage 必须是数组");
  }
  return value.map((rawEntry, index) => {
    if (!isRecord(rawEntry)) {
      throw invalidPlan(`coverage[${index}] 必须是对象`);
    }
    if (!MERGE_DECISIONS.includes(rawEntry.decision as MergeDecision)) {
      throw invalidPlan(`coverage decision 非法：${String(rawEntry.decision)}`);
    }
    return {
      sourceId: requiredString(rawEntry.sourceId, `coverage[${index}].sourceId`),
      itemId: requiredString(rawEntry.itemId, `coverage[${index}].itemId`),
      decision: rawEntry.decision as MergeDecision,
      ...(rawEntry.target === undefined
        ? {}
        : { target: requiredString(rawEntry.target, `coverage[${index}].target`) }),
      reason: requiredString(rawEntry.reason, `coverage[${index}].reason`),
    };
  });
}

function requiredUniqueStringArray(
  value: unknown,
  field: string,
  requireNonEmpty: boolean,
): string[] {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    throw invalidPlan(`${field} 必须是${requireNonEmpty ? "非空" : ""}字符串数组`);
  }
  const values = value.map((item, index) =>
    requiredString(item, `${field}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    throw invalidPlan(`${field} 不能重复`);
  }
  return values;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidPlan(`${field} 必须是非空字符串`);
  }
  return value;
}

function invalidPlan(message: string): MergePlanError {
  return new MergePlanError("INVALID_MERGE_PLAN", message, 2);
}

function isSafeWikiPath(path: string): boolean {
  if (!path.startsWith("wiki/") || !path.endsWith(".md") || path.includes("\\")) {
    return false;
  }
  const resolved = resolve("/vault", path);
  return relative("/vault/wiki", resolved) !== "" &&
    !relative("/vault/wiki", resolved).startsWith("..") &&
    !resolve("/vault", path).includes("\0");
}

function itemKey(sourceId: string, itemId: string): string {
  return `${sourceId}#${itemId}`;
}

function buildSourceStatuses(
  plan: MergePlan,
): Record<string, SourceProcessingStatus> {
  const statuses: Record<string, SourceProcessingStatus> = {};
  for (const sourceId of plan.sourceIds) {
    const entries = plan.coverage.filter((entry) => entry.sourceId === sourceId);
    statuses[sourceId] = entries.some(
      (entry) =>
        entry.decision === "deferred" ||
        entry.decision === "needs_confirmation",
    )
      ? "partially_merged"
      : "merged";
  }
  return statuses;
}

function updateSourceManifest(
  manifest: SourceManifest,
  statuses: Record<string, SourceProcessingStatus>,
): SourceManifest {
  const next = { ...manifest };
  for (const [sourceId, processingStatus] of Object.entries(statuses)) {
    const source = next[sourceId];
    const normalized = normalizeSourceStatus(source);
    next[sourceId] = {
      ...source,
      processingStatus,
      lifecycleStatus: normalized.lifecycleStatus,
    };
    delete next[sourceId].status;
  }
  return next;
}

function renderCoverageSections(
  markdown: string,
  sourceId: string,
  coverage: CoverageEntry[],
): string {
  const entries = coverage.filter((entry) => entry.sourceId === sourceId);
  let result = markdown.replace(
    /^processing_status:\s*\S+/m,
    `processing_status: ${
      entries.some(
        (entry) =>
          entry.decision === "deferred" ||
          entry.decision === "needs_confirmation",
      )
        ? "partially_merged"
        : "merged"
    }`,
  );
  result = replaceSection(
    result,
    "Merge Coverage",
    entries.map(renderCoverageEntry).join("\n"),
  );
  result = replaceSection(
    result,
    "Deferred",
    entries.filter((entry) => entry.decision === "deferred").map(renderCoverageEntry).join("\n"),
  );
  result = replaceSection(
    result,
    "Discarded",
    entries.filter((entry) => entry.decision === "discarded").map(renderCoverageEntry).join("\n"),
  );
  result = replaceSection(
    result,
    "User Confirmation Needed",
    entries
      .filter((entry) => entry.decision === "needs_confirmation")
      .map(renderCoverageEntry)
      .join("\n"),
  );
  return ensureTrailingNewline(result);
}

function renderCoverageEntry(entry: CoverageEntry): string {
  const target = entry.target ? ` -> ${entry.target}` : "";
  return `- \`${entry.itemId}\`: **${entry.decision}**${target} (${entry.reason})`;
}

function replaceSection(markdown: string, heading: string, content: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start < 0) {
    throw new MergePlanError(
      "MERGE_PLAN_STALE",
      `Extracted Source 缺少 section：${heading}`,
    );
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  const body = content ? ["", ...content.split("\n"), ""] : [""];
  return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join("\n");
}

function writeFilesAtomically(vaultRoot: string, files: Map<string, string>): void {
  const suffix = `${process.pid}-${Date.now()}`;
  const prepared: Array<{
    target: string;
    temporary: string;
    backup: string;
    hadTarget: boolean;
  }> = [];
  try {
    for (const [path, content] of files) {
      const target = join(vaultRoot, path);
      const temporary = `${target}.tmp-${suffix}`;
      const backup = `${target}.bak-${suffix}`;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(temporary, content, "utf8");
      prepared.push({ target, temporary, backup, hadTarget: existsSync(target) });
    }
    for (const file of prepared) {
      if (file.hadTarget) {
        renameSync(file.target, file.backup);
      }
      renameSync(file.temporary, file.target);
    }
    for (const file of prepared) {
      rmSync(file.backup, { force: true });
    }
  } catch (error) {
    for (const file of [...prepared].reverse()) {
      rmSync(file.temporary, { force: true });
      if (existsSync(file.target)) {
        rmSync(file.target, { force: true });
      }
      if (existsSync(file.backup)) {
        renameSync(file.backup, file.target);
      }
    }
    throw error;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countDecision(plan: MergePlan, decision: MergeDecision): number {
  return plan.coverage.filter((entry) => entry.decision === decision).length;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
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
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${String(
    Math.floor(absoluteOffset / 60),
  ).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
}

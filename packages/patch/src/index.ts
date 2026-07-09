import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  isRecord,
  loadVault,
} from "@pkwiki/core";

export const PATCH_PLAN_VERSION = "pkwiki.patch-plan/0.1";

export type PatchPlan = {
  version: typeof PATCH_PLAN_VERSION;
  summary: string;
  sourceIds?: string[];
  createdBy?: string;
  createdAt?: string;
  notes?: string[];
  operations: PatchOperation[];
};

export type PatchOperation =
  | CreateMarkdownPageOperation
  | ReplaceTextOperation
  | AppendToSectionOperation
  | ReplaceSectionOperation;

export type PatchOperationBase = {
  type: string;
  path: string;
  expectedChecksum?: string;
};

export type CreateMarkdownPageOperation = PatchOperationBase & {
  type: "create_markdown_page";
  content: string;
};

export type ReplaceTextOperation = PatchOperationBase & {
  type: "replace_text";
  find: string;
  replace: string;
};

export type AppendToSectionOperation = PatchOperationBase & {
  type: "append_to_section";
  heading: string;
  content: string;
};

export type ReplaceSectionOperation = PatchOperationBase & {
  type: "replace_section";
  heading: string;
  content: string;
};

export type ApplyPatchOptions = {
  dryRun?: boolean;
};

export type ApplyPatchResult = {
  ok: true;
  vaultRoot: string;
  planPath: string;
  dryRun: boolean;
  operationCount: number;
  changedFiles: string[];
};

export type PatchPlanErrorCode =
  | "INVALID_PATCH_PLAN"
  | "UNSUPPORTED_PATCH_VERSION"
  | "UNSUPPORTED_OPERATION"
  | "UNSAFE_PATCH_PATH"
  | "TARGET_FILE_EXISTS"
  | "TARGET_FILE_MISSING"
  | "CHECKSUM_MISMATCH"
  | "TEXT_MATCH_COUNT_MISMATCH"
  | "HEADING_MATCH_COUNT_MISMATCH";

export class PatchPlanError extends Error {
  constructor(
    readonly code: PatchPlanErrorCode,
    message: string,
    readonly exitCode: 1 | 2 = 1,
    readonly path?: string,
    readonly operationIndex?: number,
  ) {
    super(message);
    this.name = "PatchPlanError";
  }
}

type SafeTarget = {
  relativePath: string;
  absolutePath: string;
};

type PendingFile = {
  text: string;
  exists: boolean;
};

export function applyPatchPlan(
  startPath: string,
  planPath: string,
  options: ApplyPatchOptions = {},
): ApplyPatchResult {
  const vault = loadVault(startPath);
  const absolutePlanPath = resolve(planPath);
  const plan = readPatchPlan(absolutePlanPath);
  const pendingFiles = new Map<string, PendingFile>();

  for (const [index, operation] of plan.operations.entries()) {
    applyOperation(vault.root, pendingFiles, operation, index);
  }

  const changedFiles = [...pendingFiles.keys()].sort();
  if (!options.dryRun) {
    for (const relativePath of changedFiles) {
      const pending = pendingFiles.get(relativePath);
      if (!pending) {
        continue;
      }
      const absolutePath = join(vault.root, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, ensureTrailingNewline(pending.text), "utf8");
    }
  }

  return {
    ok: true,
    vaultRoot: vault.root,
    planPath: absolutePlanPath,
    dryRun: Boolean(options.dryRun),
    operationCount: plan.operations.length,
    changedFiles,
  };
}

export function readPatchPlan(path: string): PatchPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      `无法读取或解析 PatchPlan：${path}`,
      2,
      path,
      undefined,
    );
  }
  return parsePatchPlan(parsed, path);
}

export function parsePatchPlan(value: unknown, path = "<memory>"): PatchPlan {
  if (!isRecord(value)) {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      "PatchPlan 必须是 JSON 对象",
      2,
      path,
    );
  }
  if (value.version !== PATCH_PLAN_VERSION) {
    throw new PatchPlanError(
      "UNSUPPORTED_PATCH_VERSION",
      `PatchPlan version 应为 ${PATCH_PLAN_VERSION}`,
      1,
      path,
    );
  }
  if (typeof value.summary !== "string" || value.summary === "") {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      "PatchPlan 缺少 summary",
      2,
      path,
    );
  }
  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      "PatchPlan operations 必须是非空数组",
      2,
      path,
    );
  }

  return {
    version: PATCH_PLAN_VERSION,
    summary: value.summary,
    sourceIds: readOptionalStringArray(value.sourceIds, "sourceIds", path),
    createdBy: readOptionalString(value.createdBy, "createdBy", path),
    createdAt: readOptionalString(value.createdAt, "createdAt", path),
    notes: readOptionalStringArray(value.notes, "notes", path),
    operations: value.operations.map((operation, index) =>
      parsePatchOperation(operation, path, index),
    ),
  };
}

function parsePatchOperation(
  value: unknown,
  path: string,
  operationIndex: number,
): PatchOperation {
  if (!isRecord(value)) {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      "PatchPlan operation 必须是对象",
      2,
      path,
      operationIndex,
    );
  }
  const type = readRequiredString(value.type, "type", path, operationIndex);
  const base = {
    type,
    path: readRequiredString(value.path, "path", path, operationIndex),
    expectedChecksum: readOptionalString(
      value.expectedChecksum,
      "expectedChecksum",
      path,
      operationIndex,
    ),
  };

  if (type === "create_markdown_page") {
    return {
      ...base,
      type,
      content: readRequiredString(value.content, "content", path, operationIndex),
    };
  }
  if (type === "replace_text") {
    return {
      ...base,
      type,
      find: readRequiredString(value.find, "find", path, operationIndex),
      replace: readRequiredString(value.replace, "replace", path, operationIndex),
    };
  }
  if (type === "append_to_section") {
    return {
      ...base,
      type,
      heading: readRequiredString(value.heading, "heading", path, operationIndex),
      content: readRequiredString(value.content, "content", path, operationIndex),
    };
  }
  if (type === "replace_section") {
    return {
      ...base,
      type,
      heading: readRequiredString(value.heading, "heading", path, operationIndex),
      content: readRequiredString(value.content, "content", path, operationIndex),
    };
  }

  throw new PatchPlanError(
    "UNSUPPORTED_OPERATION",
    `不支持的 PatchPlan operation：${type}`,
    1,
    path,
    operationIndex,
  );
}

function applyOperation(
  vaultRoot: string,
  pendingFiles: Map<string, PendingFile>,
  operation: PatchOperation,
  operationIndex: number,
): void {
  const target = resolveSafeTarget(vaultRoot, operation.path, operationIndex);
  if (operation.type === "create_markdown_page") {
    applyCreateMarkdownPage(pendingFiles, target, operation, operationIndex);
    return;
  }

  const current = getExistingText(vaultRoot, pendingFiles, target, operationIndex);
  assertChecksum(target, current, operation, operationIndex);

  if (operation.type === "replace_text") {
    setPendingText(
      pendingFiles,
      target.relativePath,
      replaceText(current.text, operation, operationIndex),
    );
    return;
  }
  if (operation.type === "append_to_section") {
    setPendingText(
      pendingFiles,
      target.relativePath,
      appendToSection(current.text, operation, operationIndex),
    );
    return;
  }
  if (operation.type === "replace_section") {
    setPendingText(
      pendingFiles,
      target.relativePath,
      replaceSection(current.text, operation, operationIndex),
    );
  }
}

function applyCreateMarkdownPage(
  pendingFiles: Map<string, PendingFile>,
  target: SafeTarget,
  operation: CreateMarkdownPageOperation,
  operationIndex: number,
): void {
  if (existsSync(target.absolutePath) || pendingFiles.has(target.relativePath)) {
    throw new PatchPlanError(
      "TARGET_FILE_EXISTS",
      `目标文件已存在：${target.relativePath}`,
      1,
      target.relativePath,
      operationIndex,
    );
  }
  if (!operation.content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)) {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      "create_markdown_page content 必须包含 YAML frontmatter",
      2,
      target.relativePath,
      operationIndex,
    );
  }
  pendingFiles.set(target.relativePath, {
    text: operation.content,
    exists: false,
  });

}

function getExistingText(
  vaultRoot: string,
  pendingFiles: Map<string, PendingFile>,
  target: SafeTarget,
  operationIndex: number,
): PendingFile {
  const pending = pendingFiles.get(target.relativePath);
  if (pending) {
    return pending;
  }
  if (!existsSync(target.absolutePath)) {
    throw new PatchPlanError(
      "TARGET_FILE_MISSING",
      `目标文件不存在：${target.relativePath}`,
      1,
      target.relativePath,
      operationIndex,
    );
  }
  return {
    text: readFileSync(target.absolutePath, "utf8"),
    exists: true,
  };
}

function assertChecksum(
  target: SafeTarget,
  current: PendingFile,
  operation: PatchOperation,
  operationIndex: number,
): void {
  if (!operation.expectedChecksum) {
    return;
  }
  const checksum = computeSha256FromText(current.text);
  if (checksum !== operation.expectedChecksum) {
    throw new PatchPlanError(
      "CHECKSUM_MISMATCH",
      `目标文件 checksum 不匹配：${target.relativePath}`,
      1,
      target.relativePath,
      operationIndex,
    );
  }
}

function replaceText(
  text: string,
  operation: ReplaceTextOperation,
  operationIndex: number,
): string {
  const count = countOccurrences(text, operation.find);
  if (count !== 1) {
    throw new PatchPlanError(
      "TEXT_MATCH_COUNT_MISMATCH",
      `replace_text find 命中次数必须为 1，实际为 ${count}`,
      1,
      operation.path,
      operationIndex,
    );
  }
  return text.replace(operation.find, operation.replace);
}

function appendToSection(
  text: string,
  operation: AppendToSectionOperation,
  operationIndex: number,
): string {
  const section = findUniqueSection(text, operation.heading, operation.path, operationIndex);
  const body = text.slice(section.bodyStart, section.bodyEnd);
  const prefix = text.slice(0, section.bodyEnd);
  const suffix = text.slice(section.bodyEnd);
  const separator = body.trimEnd() === "" ? "\n" : "\n\n";
  const trimmedPrefix = prefix.replace(/\s*$/, "");
  return ensureTrailingNewline(
    `${trimmedPrefix}${separator}${operation.content.trim()}\n${suffix.replace(/^\n*/, "")}`,
  );
}

function replaceSection(
  text: string,
  operation: ReplaceSectionOperation,
  operationIndex: number,
): string {
  const section = findUniqueSection(text, operation.heading, operation.path, operationIndex);
  const beforeBody = text.slice(0, section.bodyStart).replace(/\s*$/, "\n\n");
  const afterBody = text.slice(section.bodyEnd).replace(/^\n*/, "");
  return ensureTrailingNewline(
    `${beforeBody}${operation.content.trim()}\n${afterBody}`,
  );
}

function findUniqueSection(
  text: string,
  heading: string,
  path: string,
  operationIndex: number,
): {
  bodyStart: number;
  bodyEnd: number;
} {
  const matches = [...findHeadingMatches(text, heading)];
  if (matches.length !== 1) {
    throw new PatchPlanError(
      "HEADING_MATCH_COUNT_MISMATCH",
      `heading 命中次数必须为 1，实际为 ${matches.length}`,
      1,
      path,
      operationIndex,
    );
  }
  const match = matches[0];
  const nextHeading = findNextPeerOrParentHeading(text, match.bodyStart, match.level);
  return {
    bodyStart: match.bodyStart,
    bodyEnd: nextHeading ?? text.length,
  };
}

function* findHeadingMatches(
  text: string,
  expectedHeading: string,
): Generator<{
  level: number;
  bodyStart: number;
}> {
  const headingRe = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  for (const match of text.matchAll(headingRe)) {
    const marker = match[1] ?? "";
    const rawHeading = match[2] ?? "";
    const heading = rawHeading.trim();
    if (heading !== expectedHeading) {
      continue;
    }
    yield {
      level: marker.length,
      bodyStart: (match.index ?? 0) + match[0].length,
    };
  }
}

function findNextPeerOrParentHeading(
  text: string,
  startIndex: number,
  currentLevel: number,
): number | null {
  const headingRe = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  headingRe.lastIndex = startIndex;
  for (const match of text.matchAll(headingRe)) {
    const marker = match[1] ?? "";
    if (marker.length <= currentLevel) {
      return match.index ?? null;
    }
  }
  return null;
}

function resolveSafeTarget(
  vaultRoot: string,
  inputPath: string,
  operationIndex: number,
): SafeTarget {
  if (isAbsolute(inputPath)) {
    throwUnsafePath(inputPath, operationIndex);
  }
  const segments = inputPath.split("/");
  if (
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    !inputPath.startsWith("wiki/") ||
    !inputPath.endsWith(".md")
  ) {
    throwUnsafePath(inputPath, operationIndex);
  }
  const absolutePath = resolve(vaultRoot, inputPath);
  const relativePath = relative(vaultRoot, absolutePath).split("\\").join("/");
  if (relativePath.startsWith("..") || relativePath !== inputPath) {
    throwUnsafePath(inputPath, operationIndex);
  }
  return {
    relativePath,
    absolutePath,
  };
}

function throwUnsafePath(path: string, operationIndex: number): never {
  throw new PatchPlanError(
    "UNSAFE_PATCH_PATH",
    `PatchPlan path 不安全或不允许修改：${path}`,
    2,
    path,
    operationIndex,
  );
}

function setPendingText(
  pendingFiles: Map<string, PendingFile>,
  relativePath: string,
  text: string,
): void {
  const previous = pendingFiles.get(relativePath);
  pendingFiles.set(relativePath, {
    text,
    exists: previous?.exists ?? true,
  });
}

function countOccurrences(text: string, needle: string): number {
  if (needle === "") {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function computeSha256FromText(text: string): string {
  const hash = createHash("sha256");
  hash.update(text);
  return `sha256:${hash.digest("hex")}`;
}

function readRequiredString(
  value: unknown,
  field: string,
  planPath: string,
  operationIndex?: number,
): string {
  if (typeof value !== "string" || value === "") {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      `PatchPlan 字段 ${field} 必须是非空字符串`,
      2,
      planPath,
      operationIndex,
    );
  }
  return value;
}

function readOptionalString(
  value: unknown,
  field: string,
  planPath: string,
  operationIndex?: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRequiredString(value, field, planPath, operationIndex);
}

function readOptionalStringArray(
  value: unknown,
  field: string,
  planPath: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new PatchPlanError(
      "INVALID_PATCH_PLAN",
      `PatchPlan 字段 ${field} 必须是字符串数组`,
      2,
      planPath,
    );
  }
  return value;
}

function ensureTrailingNewline(text: string): string {
  return `${text.replace(/\s+$/g, "")}\n`;
}

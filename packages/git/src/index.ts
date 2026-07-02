import { execFileSync } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";

export type GitStatusSummary = {
  initialized: boolean;
  clean: boolean;
  files: string[];
  changedFiles: number;
};

export type VaultArea =
  | "wiki"
  | "raw"
  | "extracted"
  | "manifest"
  | "outputs"
  | "assets"
  | "system"
  | "other";

export type GitDiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

export type GitDiffFile = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  area: VaultArea;
  insertions: number | null;
  deletions: number | null;
};

export type GitDiffSummary = {
  ok: true;
  vaultRoot: string;
  clean: boolean;
  files: GitDiffFile[];
  areas: Record<VaultArea, number>;
  stat: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  rawStatText?: string;
};

export type GitDiffErrorCode =
  | "GIT_NOT_INITIALIZED"
  | "UNSAFE_DIFF_PATH"
  | "GIT_COMMAND_FAILED";

export class GitDiffError extends Error {
  constructor(
    readonly code: GitDiffErrorCode,
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "GitDiffError";
  }
}

type GitDiffOptions = {
  path?: string;
};

type NumstatEntry = {
  insertions: number | null;
  deletions: number | null;
};

const VAULT_AREAS: VaultArea[] = [
  "wiki",
  "raw",
  "extracted",
  "manifest",
  "outputs",
  "assets",
  "system",
  "other",
];

export function getGitStatus(cwd: string): GitStatusSummary {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
  } catch {
    return {
      initialized: false,
      clean: true,
      files: [],
      changedFiles: 0,
    };
  }

  const output = execFileSync("git", ["status", "--short"], {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const files = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    initialized: true,
    clean: files.length === 0,
    files,
    changedFiles: files.length,
  };
}

export function getGitDiffSummary(
  vaultRoot: string,
  options: GitDiffOptions = {},
): GitDiffSummary {
  ensureGitWorktree(vaultRoot);
  const filterPath = options.path
    ? normalizeDiffPath(vaultRoot, options.path)
    : undefined;
  const pathArgs = filterPath ? ["--", filterPath] : [];
  const statusOutput = runGit(vaultRoot, [
    "status",
    "--porcelain=v1",
    ...pathArgs,
  ]);
  const files = parsePorcelainStatus(statusOutput);
  const unstagedNumstat = parseNumstat(
    runGit(vaultRoot, ["diff", "--numstat", ...pathArgs]),
  );
  const stagedNumstat = parseNumstat(
    runGit(vaultRoot, ["diff", "--cached", "--numstat", ...pathArgs]),
  );
  const numstat = mergeNumstat(unstagedNumstat, stagedNumstat);
  const enrichedFiles = files.map((file) => {
    const stats = numstat.get(file.path);
    return {
      ...file,
      area: getVaultArea(file.path),
      insertions: stats?.insertions ?? null,
      deletions: stats?.deletions ?? null,
    };
  });
  const rawStatText = [
    runGit(vaultRoot, ["diff", "--stat", ...pathArgs]).trimEnd(),
    runGit(vaultRoot, ["diff", "--cached", "--stat", ...pathArgs]).trimEnd(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    vaultRoot,
    clean: enrichedFiles.length === 0,
    files: enrichedFiles,
    areas: countAreas(enrichedFiles),
    stat: summarizeFiles(enrichedFiles),
    rawStatText,
  };
}

export function parsePorcelainStatus(output: string): GitDiffFile[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const rawPath = line.slice(3);
      const renameParts = rawPath.split(" -> ");
      const previousPath = renameParts.length > 1 ? renameParts[0] : undefined;
      const filePath = renameParts.length > 1
        ? renameParts.slice(1).join(" -> ")
        : rawPath;
      return {
        path: normalizeGitPath(filePath),
        previousPath: previousPath ? normalizeGitPath(previousPath) : undefined,
        status: parseStatusCode(statusCode),
        area: getVaultArea(filePath),
        insertions: null,
        deletions: null,
      };
    });
}

export function parseStatusCode(statusCode: string): GitDiffFileStatus {
  if (statusCode === "??") {
    return "untracked";
  }
  if (statusCode.includes("R")) {
    return "renamed";
  }
  if (statusCode.includes("C")) {
    return "copied";
  }
  if (statusCode.includes("A")) {
    return "added";
  }
  if (statusCode.includes("D")) {
    return "deleted";
  }
  if (statusCode.includes("M")) {
    return "modified";
  }
  return "unknown";
}

export function parseNumstat(output: string): Map<string, NumstatEntry> {
  const entries = new Map<string, NumstatEntry>();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [insertionsText, deletionsText, ...pathParts] = line.split("\t");
    const path = normalizeGitPath(pathParts.join("\t"));
    entries.set(path, {
      insertions: parseNumstatNumber(insertionsText),
      deletions: parseNumstatNumber(deletionsText),
    });
  }
  return entries;
}

export function mergeNumstat(
  first: Map<string, NumstatEntry>,
  second: Map<string, NumstatEntry>,
): Map<string, NumstatEntry> {
  const merged = new Map<string, NumstatEntry>(first);
  for (const [path, entry] of second) {
    const existing = merged.get(path);
    if (!existing) {
      merged.set(path, entry);
      continue;
    }
    merged.set(path, {
      insertions: addNullableNumbers(existing.insertions, entry.insertions),
      deletions: addNullableNumbers(existing.deletions, entry.deletions),
    });
  }
  return merged;
}

export function getVaultArea(path: string): VaultArea {
  const normalizedPath = normalizeGitPath(path);
  if (normalizedPath === "wiki" || normalizedPath.startsWith("wiki/")) {
    return "wiki";
  }
  if (normalizedPath === "raw" || normalizedPath.startsWith("raw/")) {
    return "raw";
  }
  if (
    normalizedPath === "extracted" ||
    normalizedPath.startsWith("extracted/")
  ) {
    return "extracted";
  }
  if (normalizedPath === ".pkwiki" || normalizedPath.startsWith(".pkwiki/")) {
    return "manifest";
  }
  if (normalizedPath === "outputs" || normalizedPath.startsWith("outputs/")) {
    return "outputs";
  }
  if (normalizedPath === "assets" || normalizedPath.startsWith("assets/")) {
    return "assets";
  }
  if (normalizedPath === "system" || normalizedPath.startsWith("system/")) {
    return "system";
  }
  return "other";
}

export function normalizeDiffPath(vaultRoot: string, inputPath: string): string {
  if (isAbsolute(inputPath)) {
    throw new GitDiffError(
      "UNSAFE_DIFF_PATH",
      `diff 路径必须是相对 Vault root 的路径：${inputPath}`,
      2,
    );
  }

  const segments = inputPath.split(/[\\/]/);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new GitDiffError(
      "UNSAFE_DIFF_PATH",
      `diff 路径不能包含空 segment、. 或 ..：${inputPath}`,
      2,
    );
  }

  const absoluteVaultRoot = resolve(vaultRoot);
  const absoluteTarget = resolve(absoluteVaultRoot, inputPath);
  if (
    absoluteTarget !== absoluteVaultRoot &&
    !absoluteTarget.startsWith(`${absoluteVaultRoot}${sep}`)
  ) {
    throw new GitDiffError(
      "UNSAFE_DIFF_PATH",
      `diff 路径不能越过 Vault root：${inputPath}`,
      2,
    );
  }

  return normalizeGitPath(inputPath);
}

function ensureGitWorktree(cwd: string): void {
  try {
    const output = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]).trim();
    if (output !== "true") {
      throw new Error(output);
    }
  } catch {
    throw new GitDiffError(
      "GIT_NOT_INITIALIZED",
      `当前 Vault 不是 Git worktree：${cwd}`,
    );
  }
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GitDiffError(
      "GIT_COMMAND_FAILED",
      `Git 命令执行失败：git ${args.join(" ")}\n${message}`,
    );
  }
}

function countAreas(files: GitDiffFile[]): Record<VaultArea, number> {
  const counts = Object.fromEntries(
    VAULT_AREAS.map((area) => [area, 0]),
  ) as Record<VaultArea, number>;
  for (const file of files) {
    counts[file.area] += 1;
  }
  return counts;
}

function summarizeFiles(files: GitDiffFile[]): GitDiffSummary["stat"] {
  return {
    filesChanged: files.length,
    insertions: sumKnownLines(files.map((file) => file.insertions)),
    deletions: sumKnownLines(files.map((file) => file.deletions)),
  };
}

function parseNumstatNumber(value: string): number | null {
  if (value === "-") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function addNullableNumbers(
  first: number | null,
  second: number | null,
): number | null {
  if (first === null || second === null) {
    return null;
  }
  return first + second;
}

function sumKnownLines(values: Array<number | null>): number {
  let sum = 0;
  for (const value of values) {
    sum += value ?? 0;
  }
  return sum;
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, "/");
}

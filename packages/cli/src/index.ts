#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OKF_VERSION,
  PKWIKI_PROFILE,
  SourceContractError,
  chunkSource,
  countFiles,
  fileExists,
  ingestSource,
  loadVault,
  registerExtraction,
} from "@pkwiki/core";
import {
  GitDiffError,
  getGitDiffSummary,
  getGitStatus,
} from "@pkwiki/git";
import { generateIndex } from "@pkwiki/indexer";
import {
  MergePlanError,
  finalizeMerge,
  registerMergePlan,
} from "@pkwiki/merge";
import {
  PatchPlanError,
  applyPatchPlan,
} from "@pkwiki/patch";
import { validateVault } from "@pkwiki/validator";

type ParsedArgs = {
  command?: string;
  path?: string;
  json: boolean;
  force: boolean;
  git: boolean;
  dryRun: boolean;
  nameOnly: boolean;
  type?: string;
  domain?: string;
  title?: string;
  privacy?: string;
  language?: string;
  maxChars?: string;
};

type StatusResult = {
  ok: boolean;
  vaultRoot: string;
  profile: string;
  okfVersion: string;
  counts: {
    raw: number;
    extracted: number;
    wiki: number;
  };
  manifests: {
    source: boolean;
    chunk: boolean;
    page: boolean;
  };
  git: {
    initialized: boolean;
    clean: boolean;
    changedFiles: number;
  };
};

type ApplyPatchCliResult = ReturnType<typeof applyPatchPlan> & {
  validation?: ReturnType<typeof validateVault>;
};

function main(argv: string[]): void {
  const args = parseArgs(argv);

  try {
    if (!args.command || args.command === "help" || args.command === "--help") {
      printHelp();
      process.exit(0);
    }

    if (args.command === "init") {
      const result = runInit(args);
      writeOutput(args.json, result, formatInitResult(result));
      process.exit(0);
    }

    if (args.command === "status") {
      const result = buildStatus(args.path);
      writeOutput(args.json, result, formatStatus(result));
      process.exit(0);
    }

    if (args.command === "validate") {
      const result = validateVault(args.path ?? process.cwd());
      writeOutput(args.json, result, formatValidation(result));
      if (!result.vaultRoot) {
        process.exit(2);
      }
      process.exit(result.errors.length > 0 ? 1 : 0);
    }

    if (args.command === "ingest") {
      const result = runIngest(args);
      writeOutput(args.json, result, formatIngestResult(result));
      process.exit(0);
    }

    if (args.command === "chunk") {
      const result = runChunk(args);
      writeOutput(args.json, result, formatChunkResult(result));
      process.exit(0);
    }

    if (args.command === "register-extraction") {
      const result = runRegisterExtraction(args);
      writeOutput(args.json, result, formatRegisterExtractionResult(result));
      process.exit(0);
    }

    if (args.command === "register-merge-plan") {
      const result = runRegisterMergePlan(args);
      writeOutput(args.json, result, formatRegisterMergePlanResult(result));
      process.exit(0);
    }

    if (args.command === "finalize-merge") {
      const result = runFinalizeMerge(args);
      writeOutput(args.json, result, formatFinalizeMergeResult(result));
      process.exit(0);
    }

    if (args.command === "index") {
      const result = generateIndex(args.path ?? process.cwd());
      writeOutput(args.json, result, formatIndexResult(result));
      process.exit(0);
    }

    if (args.command === "apply-patch") {
      const result = runApplyPatch(args);
      writeOutput(args.json, result, formatApplyPatchResult(result));
      const validationErrors = result.validation?.errors.length ?? 0;
      process.exit(validationErrors > 0 ? 1 : 0);
    }

    if (args.command === "diff") {
      const result = runDiff(args);
      writeOutput(args.json, result, formatDiffResult(result, args.nameOnly));
      process.exit(0);
    }

    throw new CliError(`未知命令：${args.command}`, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      const patchError = error instanceof PatchPlanError ? error : null;
      const gitDiffError = error instanceof GitDiffError ? error : null;
      const sourceContractError =
        error instanceof SourceContractError ? error : null;
      const mergePlanError = error instanceof MergePlanError ? error : null;
      console.log(
        JSON.stringify(
          {
            ok: false,
            code:
              patchError?.code ??
              gitDiffError?.code ??
              sourceContractError?.code ??
              mergePlanError?.code,
            message,
            error: message,
            path: patchError?.path,
            operationIndex: patchError?.operationIndex,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`错误：${message}`);
    }
    if (error instanceof CliError) {
      process.exit(error.exitCode);
    }
    if (error instanceof PatchPlanError) {
      process.exit(error.exitCode);
    }
    if (error instanceof GitDiffError) {
      process.exit(error.exitCode);
    }
    if (error instanceof SourceContractError) {
      process.exit(error.exitCode);
    }
    if (error instanceof MergePlanError) {
      process.exit(error.exitCode);
    }
    process.exit(2);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const valueFlags = new Set([
    "--type",
    "--domain",
    "--title",
    "--privacy",
    "--language",
    "--max-chars",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const equalsIndex = arg.indexOf("=");
      if (equalsIndex > -1) {
        flags.set(arg.slice(0, equalsIndex), arg.slice(equalsIndex + 1));
        continue;
      }

      if (valueFlags.has(arg)) {
        const next = argv[index + 1];
        if (next && !next.startsWith("--")) {
          flags.set(arg, next);
          index += 1;
        } else {
          flags.set(arg, true);
        }
      } else {
        flags.set(arg, true);
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0],
    path: positional[1],
    json: flags.has("--json"),
    force: flags.has("--force"),
    git: flags.has("--git"),
    dryRun: flags.has("--dry-run"),
    nameOnly: flags.has("--name-only"),
    type: getStringFlag(flags, "--type"),
    domain: getStringFlag(flags, "--domain"),
    title: getStringFlag(flags, "--title"),
    privacy: getStringFlag(flags, "--privacy"),
    language: getStringFlag(flags, "--language"),
    maxChars: getStringFlag(flags, "--max-chars"),
  };
}

function runInit(args: ParsedArgs): {
  ok: true;
  path: string;
  gitInitialized: boolean;
} {
  if (!args.path) {
    throw new CliError("pkwiki init 需要目标路径", 2);
  }

  const targetPath = resolve(args.path);
  if (existsSync(targetPath)) {
    if (!statSync(targetPath).isDirectory()) {
      throw new CliError(`目标路径不是目录：${targetPath}`, 2);
    }
    const entries = readdirSync(targetPath).filter((entry) => entry !== ".DS_Store");
    if (entries.length > 0 && !args.force) {
      throw new CliError("目标目录非空。需要覆盖时请显式传入 --force", 1);
    }
  } else {
    mkdirSync(targetPath, { recursive: true });
  }

  const templateRoot = getTemplateRoot();
  cpSync(templateRoot, targetPath, {
    recursive: true,
    force: args.force,
    errorOnExist: !args.force,
  });

  if (args.git) {
    execFileSync("git", ["init"], {
      cwd: targetPath,
      stdio: "ignore",
    });
  }

  return {
    ok: true,
    path: targetPath,
    gitInitialized: args.git,
  };
}

function buildStatus(startPath?: string): StatusResult {
  const vault = loadVault(startPath ?? process.cwd());
  const git = getGitStatus(vault.root);

  return {
    ok: true,
    vaultRoot: vault.root,
    profile: vault.config.profile,
    okfVersion: vault.config.okfVersion,
    counts: {
      raw: countFiles(join(vault.root, vault.config.rawRoot)),
      extracted: countFiles(join(vault.root, vault.config.extractedRoot)),
      wiki: countFiles(join(vault.root, vault.config.wikiRoot)),
    },
    manifests: {
      source: fileExists(vault.root, ".pkwiki/source_manifest.json"),
      chunk: fileExists(vault.root, ".pkwiki/chunk_manifest.json"),
      page: fileExists(vault.root, ".pkwiki/page_manifest.json"),
    },
    git: {
      initialized: git.initialized,
      clean: git.clean,
      changedFiles: git.changedFiles,
    },
  };
}

function runIngest(args: ParsedArgs): ReturnType<typeof ingestSource> {
  if (!args.path) {
    throw new CliError("pkwiki ingest 需要输入文件路径", 2);
  }
  if (!args.type) {
    throw new CliError("pkwiki ingest 需要 --type", 2);
  }
  if (!args.domain) {
    throw new CliError("pkwiki ingest 需要 --domain", 2);
  }
  if (args.privacy === "") {
    throw new CliError("pkwiki ingest 的 --privacy 不能为空", 2);
  }
  if (args.language === "") {
    throw new CliError("pkwiki ingest 的 --language 不能为空", 2);
  }

  return ingestSource(process.cwd(), args.path, {
    type: args.type,
    domain: args.domain,
    title: args.title,
    privacy: args.privacy,
    language: args.language,
  });
}

function runApplyPatch(args: ParsedArgs): ApplyPatchCliResult {
  if (!args.path) {
    throw new CliError("pkwiki apply-patch 需要 PatchPlan 文件路径", 2);
  }
  const result = applyPatchPlan(process.cwd(), args.path, {
    dryRun: args.dryRun,
  });
  if (args.dryRun) {
    return result;
  }
  return {
    ...result,
    validation: validateVault(result.vaultRoot),
  };
}

function runChunk(args: ParsedArgs): ReturnType<typeof chunkSource> {
  if (!args.path) {
    throw new CliError("pkwiki chunk 需要 Source ID", 2);
  }
  let maxChars: number | undefined;
  if (args.maxChars !== undefined) {
    if (args.maxChars === "") {
      throw new CliError("pkwiki chunk 的 --max-chars 不能为空", 2);
    }
    maxChars = Number(args.maxChars);
  }
  return chunkSource(process.cwd(), args.path, { maxChars });
}

function runRegisterExtraction(
  args: ParsedArgs,
): ReturnType<typeof registerExtraction> {
  if (!args.path) {
    throw new CliError("pkwiki register-extraction 需要 artifact 文件路径", 2);
  }
  return registerExtraction(process.cwd(), args.path);
}

function runRegisterMergePlan(
  args: ParsedArgs,
): ReturnType<typeof registerMergePlan> {
  if (!args.path) {
    throw new CliError("pkwiki register-merge-plan 需要 plan 文件路径", 2);
  }
  return registerMergePlan(process.cwd(), args.path);
}

function runFinalizeMerge(args: ParsedArgs): ReturnType<typeof finalizeMerge> {
  if (!args.path) {
    throw new CliError("pkwiki finalize-merge 需要 Run ID", 2);
  }
  return finalizeMerge(process.cwd(), args.path);
}

function runDiff(args: ParsedArgs): ReturnType<typeof getGitDiffSummary> {
  const vault = loadVault(process.cwd());
  return getGitDiffSummary(vault.root, {
    path: args.path,
  });
}

function getTemplateRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const packageRoot = dirname(dirname(currentFile));
  const repoRoot = resolve(packageRoot, "../..");
  const templateRoot = join(repoRoot, "templates/default-vault");
  if (!existsSync(templateRoot)) {
    throw new CliError(`未找到默认 Vault 模板：${templateRoot}`, 2);
  }
  return templateRoot;
}

function writeOutput(json: boolean, value: unknown, text: string): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(text);
  }
}

function formatInitResult(result: {
  path: string;
  gitInitialized: boolean;
}): string {
  return [
    `Vault: ${result.path}`,
    "Status: created",
    `Git initialized: ${result.gitInitialized ? "yes" : "no"}`,
  ].join("\n");
}

function formatStatus(result: StatusResult): string {
  return [
    `Vault: ${result.vaultRoot}`,
    `Profile: ${result.profile}`,
    `OKF: ${result.okfVersion}`,
    "Files:",
    `  raw: ${result.counts.raw}`,
    `  extracted: ${result.counts.extracted}`,
    `  wiki: ${result.counts.wiki}`,
    "Manifests:",
    `  source: ${result.manifests.source ? "yes" : "no"}`,
    `  chunk: ${result.manifests.chunk ? "yes" : "no"}`,
    `  page: ${result.manifests.page ? "yes" : "no"}`,
    "Git:",
    `  initialized: ${result.git.initialized ? "yes" : "no"}`,
    `  clean: ${result.git.clean ? "yes" : "no"}`,
    `  changed files: ${result.git.changedFiles}`,
  ].join("\n");
}

function formatIngestResult(result: ReturnType<typeof ingestSource>): string {
  return [
    `Source: ${result.sourceId}`,
    `Raw: ${result.rawPath}`,
    `Extracted: ${result.extractedPath}`,
    `Checksum: ${result.checksum}`,
    `Processing status: ${result.processingStatus ?? result.status}`,
    `Lifecycle status: ${result.lifecycleStatus ?? "active"}${result.reused ? " (reused)" : ""}`,
  ].join("\n");
}

function formatIndexResult(result: ReturnType<typeof generateIndex>): string {
  return [
    `Vault: ${result.vaultRoot}`,
    `Pages indexed: ${result.pageCount}`,
    `Links indexed: ${result.linkCount}`,
    `Source references: ${result.sourceReferenceCount}`,
    `Page manifest: ${result.pageManifestPath}`,
    `Search index: ${result.indexPath}`,
  ].join("\n");
}

function formatChunkResult(result: ReturnType<typeof chunkSource>): string {
  return [
    `Source: ${result.sourceId}`,
    `Source checksum: ${result.sourceChecksum}`,
    `Max chars: ${result.maxChars}`,
    `Chunks: ${result.chunkCount}`,
  ].join("\n");
}

function formatRegisterExtractionResult(
  result: ReturnType<typeof registerExtraction>,
): string {
  return [
    `Source: ${result.sourceId}`,
    `Artifact: ${result.artifactPath}`,
    `Extracted: ${result.extractedPath}`,
    `Items: ${result.itemCount}`,
    `Processing status: ${result.processingStatus}`,
    `Lifecycle status: ${result.lifecycleStatus}`,
  ].join("\n");
}

function formatRegisterMergePlanResult(
  result: ReturnType<typeof registerMergePlan>,
): string {
  return [
    `Run: ${result.runId}`,
    `Directory: ${result.runDirectory}`,
    `Sources: ${result.sourceCount}`,
    `Coverage entries: ${result.coverageCount}`,
    `Status: ${result.status}`,
  ].join("\n");
}

function formatFinalizeMergeResult(
  result: ReturnType<typeof finalizeMerge>,
): string {
  return [
    `Run: ${result.runId}`,
    `Coverage: ${result.coveragePath}`,
    `Merged: ${result.mergedCount}`,
    `Deferred: ${result.deferredCount}`,
    `Discarded: ${result.discardedCount}`,
    `Needs confirmation: ${result.needsConfirmationCount}`,
  ].join("\n");
}

function formatApplyPatchResult(result: ApplyPatchCliResult): string {
  const lines = [
    `Vault: ${result.vaultRoot}`,
    `PatchPlan: ${result.planPath}`,
    `Mode: ${result.dryRun ? "dry-run" : "apply"}`,
    `Operations: ${result.operationCount}`,
    "Changed files:",
  ];
  for (const file of result.changedFiles) {
    lines.push(`  ${file}`);
  }
  if (result.validation) {
    lines.push(
      "Validation:",
      `  errors: ${result.validation.errors.length}`,
      `  warnings: ${result.validation.warnings.length}`,
    );
  }
  return lines.join("\n");
}

function formatDiffResult(
  result: ReturnType<typeof getGitDiffSummary>,
  nameOnly: boolean,
): string {
  if (nameOnly) {
    return result.files.map((file) => file.path).join("\n");
  }

  const lines = [
    `Vault: ${result.vaultRoot}`,
    `Clean: ${result.clean ? "yes" : "no"}`,
    "",
    "Changed files:",
  ];
  if (result.files.length === 0) {
    lines.push("  (none)");
  } else {
    for (const file of result.files) {
      const previousPath = file.previousPath ? ` <- ${file.previousPath}` : "";
      lines.push(`  ${formatDiffStatus(file.status)} ${file.path}${previousPath}`);
    }
  }

  lines.push("", "Areas:");
  for (const [area, count] of Object.entries(result.areas)) {
    if (count > 0) {
      lines.push(`  ${area}: ${count}`);
    }
  }
  if (Object.values(result.areas).every((count) => count === 0)) {
    lines.push("  (none)");
  }

  lines.push(
    "",
    "Diff stat:",
    `  files changed: ${result.stat.filesChanged}`,
    `  insertions: ${result.stat.insertions}`,
    `  deletions: ${result.stat.deletions}`,
  );
  if (result.rawStatText) {
    lines.push("", result.rawStatText);
  }
  return lines.join("\n");
}

function formatDiffStatus(status: string): string {
  const labels: Record<string, string> = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
    copied: "C",
    untracked: "??",
    unknown: "?",
  };
  return labels[status] ?? "?";
}

function formatValidation(result: ReturnType<typeof validateVault>): string {
  const lines = [
    `Vault: ${result.vaultRoot ?? "(not found)"}`,
    "Validation:",
    `  errors: ${result.errors.length}`,
    `  warnings: ${result.warnings.length}`,
  ];

  for (const issue of [...result.errors, ...result.warnings]) {
    const location = issue.path ? ` ${issue.path}` : "";
    const target = issue.target ? ` -> ${issue.target}` : "";
    lines.push(`  [${issue.severity}] ${issue.code}${location}${target}: ${issue.message}`);
  }

  return lines.join("\n");
}

function printHelp(): void {
  console.log(
    [
      `pkwiki ${PKWIKI_PROFILE} (OKF ${OKF_VERSION})`,
      "",
      "Usage:",
      "  pkwiki init <path> [--force] [--git] [--json]",
      "  pkwiki status [path] [--json]",
      "  pkwiki validate [path] [--json]",
      "  pkwiki ingest <file> --type <type> --domain <domain> [--title <title>] [--privacy <privacy>] [--language <language>] [--json]",
      "  pkwiki chunk <source-id> [--max-chars <number>] [--json]",
      "  pkwiki register-extraction <artifact.json> [--json]",
      "  pkwiki register-merge-plan <plan.json> [--json]",
      "  pkwiki finalize-merge <run-id> [--json]",
      "  pkwiki index [path] [--json]",
      "  pkwiki apply-patch <plan> [--dry-run] [--json]",
      "  pkwiki diff [path] [--name-only] [--json]",
    ].join("\n"),
  );
}

function getStringFlag(
  flags: Map<string, string | true>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  if (typeof value === "string") {
    return value;
  }
  return value === true ? "" : undefined;
}

class CliError extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message);
    this.name = "CliError";
  }
}

main(process.argv.slice(2));

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getRunDirectory } from "@pkwiki/merge";
import { isRecord, loadVault } from "@pkwiki/core";
import type { ModelConfigSummary } from "./config.js";
import type { HarnessErrorCategory } from "./errors.js";
import { HarnessError } from "./errors.js";
import { addUsage, emptyUsage, type RuntimeUsage } from "./runtime.js";

export const HARNESS_RUN_VERSION = "pkwiki.agent-run/0.1";

export const HARNESS_RUN_STATUSES = [
  "created",
  "preparing",
  "generating",
  "planning",
  "awaiting_approval",
  "applying",
  "validating",
  "completed",
  "failed",
  "cancelled",
] as const;

export type HarnessRunStatus = (typeof HARNESS_RUN_STATUSES)[number];
export type HarnessWorkflow = "plan-ingest" | "query" | "file-back";
export type ApprovalCheckpoint = "merge-plan" | "patch-apply" | "file-back";

export type HarnessRunRecord = {
  version: typeof HARNESS_RUN_VERSION;
  runId: string;
  workflow: HarnessWorkflow;
  status: HarnessRunStatus;
  createdAt: string;
  updatedAt: string;
  currentStep: string;
  sourceIds: string[];
  query?: string;
  parentRunId?: string;
  runtime: {
    adapter: string;
    model?: ModelConfigSummary;
  };
  retryCount: number;
  usage: RuntimeUsage;
  artifacts: Record<string, string>;
  approvalRequired?: ApprovalCheckpoint;
  lastError?: {
    category: HarnessErrorCategory;
    step: string;
    message: string;
  };
};

export type ApprovalRecord = {
  version: "pkwiki.approval/0.1";
  runId: string;
  checkpoints: Partial<
    Record<
      ApprovalCheckpoint,
      {
        status: "approved" | "rejected";
        decidedAt: string;
        artifact: string;
        checksum: string;
        reason?: string;
      }
    >
  >;
};

const TRANSITIONS: Record<HarnessRunStatus, readonly HarnessRunStatus[]> = {
  created: ["preparing", "cancelled", "failed"],
  preparing: ["generating", "planning", "awaiting_approval", "cancelled", "failed"],
  generating: ["planning", "awaiting_approval", "completed", "cancelled", "failed"],
  planning: ["generating", "awaiting_approval", "cancelled", "failed"],
  awaiting_approval: ["generating", "applying", "cancelled", "failed"],
  applying: ["validating", "cancelled", "failed"],
  validating: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class RunStore {
  readonly vaultRoot: string;

  constructor(startPath = process.cwd()) {
    this.vaultRoot = loadVault(startPath).root;
  }

  create(input: {
    workflow: HarnessWorkflow;
    adapter: string;
    model?: ModelConfigSummary;
    sourceIds?: string[];
    query?: string;
    parentRunId?: string;
    now?: Date;
  }): HarnessRunRecord {
    const now = input.now ?? new Date();
    const runId = createRunId(now);
    const directory = this.absoluteRunDirectory(runId);
    if (existsSync(directory)) {
      throw new HarnessError(
        "RUN_ALREADY_EXISTS",
        "tool_execution_failed",
        "run_create",
        false,
        `Run 已存在：${runId}`,
      );
    }
    const timestamp = now.toISOString();
    const record: HarnessRunRecord = {
      version: HARNESS_RUN_VERSION,
      runId,
      workflow: input.workflow,
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
      currentStep: "created",
      sourceIds: input.sourceIds ?? [],
      ...(input.query ? { query: input.query } : {}),
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      runtime: {
        adapter: input.adapter,
        ...(input.model ? { model: input.model } : {}),
      },
      retryCount: 0,
      usage: emptyUsage(),
      artifacts: {},
    };
    mkdirSync(directory, { recursive: true });
    this.writeRecord(record);
    this.appendEvent(runId, { type: "run_created", at: timestamp });
    return record;
  }

  read(runId: string): HarnessRunRecord {
    const path = join(this.absoluteRunDirectory(runId), "run.json");
    if (!existsSync(path)) {
      throw new HarnessError(
        "RUN_NOT_FOUND",
        "tool_input_invalid",
        "run_read",
        false,
        `Run 不存在：${runId}`,
      );
    }
    return parseHarnessRunRecord(JSON.parse(readFileSync(path, "utf8")));
  }

  transition(
    runId: string,
    status: HarnessRunStatus,
    currentStep: string,
    patch: Partial<HarnessRunRecord> = {},
  ): HarnessRunRecord {
    const current = this.read(runId);
    if (current.status !== status && !TRANSITIONS[current.status].includes(status)) {
      throw new HarnessError(
        "RUN_STATE_INVALID",
        "tool_input_invalid",
        currentStep,
        false,
        `Run 状态不能从 ${current.status} 进入 ${status}`,
      );
    }
    const next: HarnessRunRecord = {
      ...current,
      ...patch,
      version: HARNESS_RUN_VERSION,
      runId: current.runId,
      workflow: current.workflow,
      status,
      currentStep,
      updatedAt: new Date().toISOString(),
    };
    this.writeRecord(next);
    this.appendEvent(runId, {
      type: "status_changed",
      at: next.updatedAt,
      status,
      step: currentStep,
    });
    return next;
  }

  addUsage(runId: string, usage: RuntimeUsage, attempts: number): HarnessRunRecord {
    const current = this.read(runId);
    const next = {
      ...current,
      usage: addUsage(current.usage, usage),
      retryCount: current.retryCount + Math.max(0, attempts - 1),
      updatedAt: new Date().toISOString(),
    };
    this.writeRecord(next);
    return next;
  }

  writeArtifact(runId: string, name: string, value: unknown): string {
    assertArtifactName(name);
    const relativePath = join(getRunDirectory(runId), name);
    const absolutePath = join(this.vaultRoot, relativePath);
    writeJsonAtomic(absolutePath, value);
    const current = this.read(runId);
    this.writeRecord({
      ...current,
      artifacts: { ...current.artifacts, [name]: relativePath },
      updatedAt: new Date().toISOString(),
    });
    return relativePath;
  }

  writeTextArtifact(runId: string, name: string, value: string): string {
    assertArtifactName(name);
    const relativePath = join(getRunDirectory(runId), name);
    const absolutePath = join(this.vaultRoot, relativePath);
    writeTextAtomic(absolutePath, value);
    const current = this.read(runId);
    this.writeRecord({
      ...current,
      artifacts: { ...current.artifacts, [name]: relativePath },
      updatedAt: new Date().toISOString(),
    });
    return relativePath;
  }

  trackArtifact(runId: string, name: string): string {
    assertArtifactName(name);
    const relativePath = join(getRunDirectory(runId), name);
    if (!existsSync(join(this.vaultRoot, relativePath))) {
      throw new HarnessError(
        "RUN_ARTIFACT_INVALID",
        "tool_input_invalid",
        "run_artifact",
        false,
        `Run artifact 不存在：${name}`,
      );
    }
    const current = this.read(runId);
    this.writeRecord({
      ...current,
      artifacts: { ...current.artifacts, [name]: relativePath },
      updatedAt: new Date().toISOString(),
    });
    return relativePath;
  }

  readArtifact(runId: string, name: string): unknown {
    assertArtifactName(name);
    const path = join(this.absoluteRunDirectory(runId), name);
    if (!existsSync(path)) {
      throw new HarnessError(
        "RUN_ARTIFACT_INVALID",
        "tool_input_invalid",
        "run_artifact",
        false,
        `Run artifact 不存在：${name}`,
      );
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }

  recordApproval(input: {
    runId: string;
    checkpoint: ApprovalCheckpoint;
    artifact: string;
    status: "approved" | "rejected";
    reason?: string;
  }): ApprovalRecord {
    const absoluteArtifact = join(this.absoluteRunDirectory(input.runId), input.artifact);
    if (!existsSync(absoluteArtifact)) {
      throw new HarnessError(
        "RUN_ARTIFACT_INVALID",
        "tool_input_invalid",
        "approval",
        false,
        `审批 artifact 不存在：${input.artifact}`,
      );
    }
    const existing = existsSync(join(this.absoluteRunDirectory(input.runId), "approval.json"))
      ? (this.readArtifact(input.runId, "approval.json") as ApprovalRecord)
      : {
          version: "pkwiki.approval/0.1" as const,
          runId: input.runId,
          checkpoints: {},
        };
    const approval: ApprovalRecord = {
      ...existing,
      checkpoints: {
        ...existing.checkpoints,
        [input.checkpoint]: {
          status: input.status,
          decidedAt: new Date().toISOString(),
          artifact: input.artifact,
          checksum: checksumFile(absoluteArtifact),
          ...(input.reason ? { reason: input.reason } : {}),
        },
      },
    };
    this.writeArtifact(input.runId, "approval.json", approval);
    return approval;
  }

  assertApproval(runId: string, checkpoint: ApprovalCheckpoint): void {
    const approval = this.readArtifact(runId, "approval.json") as ApprovalRecord;
    const decision = approval.checkpoints[checkpoint];
    if (!decision || decision.status !== "approved") {
      throw new HarnessError(
        "APPROVAL_REQUIRED",
        "tool_input_invalid",
        "approval",
        false,
        `缺少审批：${checkpoint}`,
      );
    }
    const artifact = join(this.absoluteRunDirectory(runId), decision.artifact);
    if (!existsSync(artifact) || checksumFile(artifact) !== decision.checksum) {
      throw new HarnessError(
        "APPROVAL_STALE",
        "vault_changed",
        "approval",
        false,
        `审批后 artifact 已变化：${decision.artifact}`,
      );
    }
  }

  appendEvent(runId: string, event: Record<string, unknown>): void {
    const path = join(this.absoluteRunDirectory(runId), "events.jsonl");
    appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  }

  absoluteRunDirectory(runId: string): string {
    return join(this.vaultRoot, getRunDirectory(runId));
  }

  private writeRecord(record: HarnessRunRecord): void {
    writeJsonAtomic(join(this.absoluteRunDirectory(record.runId), "run.json"), record);
  }
}

export function parseHarnessRunRecord(value: unknown): HarnessRunRecord {
  if (!isRecord(value) || value.version !== HARNESS_RUN_VERSION) {
    throw invalidRun("Run Record version 非法");
  }
  if (!HARNESS_RUN_STATUSES.includes(value.status as HarnessRunStatus)) {
    throw invalidRun("Run Record status 非法");
  }
  if (
    value.workflow !== "plan-ingest" &&
    value.workflow !== "query" &&
    value.workflow !== "file-back"
  ) {
    throw invalidRun("Run Record workflow 非法");
  }
  if (!isRecord(value.runtime) || !isRecord(value.usage) || !isRecord(value.artifacts)) {
    throw invalidRun("Run Record runtime、usage 或 artifacts 非法");
  }
  return value as HarnessRunRecord;
}

export function createRunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `run:${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function checksumFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJsonAtomic(path: string, value: unknown): void {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function assertArtifactName(name: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || name.includes("..")) {
    throw new HarnessError(
      "RUN_ARTIFACT_INVALID",
      "tool_input_invalid",
      "run_artifact",
      false,
      `非法 artifact 名称：${name}`,
    );
  }
}

function invalidRun(message: string): HarnessError {
  return new HarnessError(
    "RUN_ARTIFACT_INVALID",
    "tool_input_invalid",
    "run_parse",
    false,
    message,
  );
}

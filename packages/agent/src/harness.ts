import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  chunkSource,
  ingestSource,
  normalizeSourceStatus,
  readSourceManifest,
  registerExtraction,
} from "@pkwiki/core";
import { getGitDiffSummary, getGitStatus } from "@pkwiki/git";
import { generateIndex } from "@pkwiki/indexer";
import {
  finalizeMerge,
  parseMergePlan,
  registerMergePlan,
  type MergePlan,
} from "@pkwiki/merge";
import { applyPatchPlan, type PatchPlan } from "@pkwiki/patch";
import {
  buildContextPack,
  parseContextPack,
  type ContextPack,
  type ContextRequest,
} from "@pkwiki/search";
import { validateVault } from "@pkwiki/validator";
import type { ModelConfigSummary } from "./config.js";
import { HarnessError, toHarnessError } from "./errors.js";
import {
  EXTRACTION_TOOL_SCHEMA,
  MERGE_PLAN_TOOL_SCHEMA,
  PATCH_PLAN_TOOL_SCHEMA,
  QUERY_ANSWER_TOOL_SCHEMA,
  parseExtraction,
  parseMerge,
  parsePatch,
  parseQueryAnswer,
  type QueryAnswer,
} from "./schemas.js";
import {
  RunStore,
  type ApprovalCheckpoint,
  type HarnessRunRecord,
} from "./run-store.js";
import {
  generateStructured,
  type RuntimeAdapter,
  type RuntimeRequest,
} from "./runtime.js";

const SYSTEM_PROMPT = `你是 pkwiki 的知识编译 Agent。你的职责是把 Source 转换为可审查的结构化 artifact，而不是直接操作文件。

必须遵守：
- 只根据当前消息提供的 Source、Context Pack 和规则判断。
- 不得虚构事实、来源、页面或证据。
- 每个重要 Information Item 都必须在 coverage 中有明确去向。
- 不确定、冲突、隐私敏感内容应保留并标记，而不是擅自丢弃。
- 只能调用当前提供的 submit 工具，不要输出替代性的 JSON 代码块。
- 不得请求或使用 shell、任意文件读写、网络或其他 coding tools。`;

export type AgentCommandResult = {
  ok: true;
  runId: string;
  workflow: HarnessRunRecord["workflow"];
  status: HarnessRunRecord["status"];
  approvalRequired?: ApprovalCheckpoint;
  nextCommand?: string;
  artifacts: Record<string, string>;
};

export class AgentHarness {
  readonly store: RunStore;

  constructor(
    startPath: string,
    private readonly adapter: RuntimeAdapter,
    private readonly model?: ModelConfigSummary,
  ) {
    this.store = new RunStore(startPath);
  }

  async planIngest(sourceId: string): Promise<AgentCommandResult> {
    this.assertCleanPreflight();
    const manifest = readSourceManifest(this.store.vaultRoot);
    const source = manifest[sourceId];
    if (!source) {
      throw inputError("plan_ingest", `Source 未登记：${sourceId}`);
    }
    const status = normalizeSourceStatus(source);
    if (status.lifecycleStatus !== "active") {
      throw inputError("plan_ingest", `Source lifecycle 不是 active：${sourceId}`);
    }

    const run = this.store.create({
      workflow: "plan-ingest",
      adapter: this.adapter.id,
      model: this.model,
      sourceIds: [sourceId],
    });
    try {
      this.store.transition(run.runId, "preparing", "source_preflight");
      const chunks = chunkSource(this.store.vaultRoot, sourceId);
      this.store.writeArtifact(run.runId, "chunk-result.json", chunks);

      this.store.transition(run.runId, "generating", "extraction");
      const extractionRequest = runtimeRequest(
        run.runId,
        "请提取 Source 中所有具有长期价值的信息。保留思想、经历、决策、不确定性和时间语境。",
        buildExtractionInput(this.store.vaultRoot, source, chunks.chunks),
        {
          name: "submit_extraction",
          description: "提交完整的 pkwiki Extraction Artifact。",
          parameters: EXTRACTION_TOOL_SCHEMA,
        },
      );
      const extraction = await generateStructured({
        adapter: this.adapter,
        request: extractionRequest,
        expectedTool: "submit_extraction",
        parse: (value) => {
          const artifact = parseExtraction(value);
          if (artifact.sourceId !== sourceId || artifact.sourceChecksum !== source.checksum) {
            throw new HarnessError(
              "MODEL_OUTPUT_INVALID",
              "model_output_invalid",
              "submit_extraction",
              true,
              "Extraction Artifact 与目标 Source 不一致",
            );
          }
          return artifact;
        },
      });
      this.store.addUsage(run.runId, extraction.usage, extraction.attempts);
      const extractionPath = this.store.writeArtifact(
        run.runId,
        "extraction.json",
        extraction.value,
      );
      registerExtraction(this.store.vaultRoot, join(this.store.vaultRoot, extractionPath));

      this.store.transition(run.runId, "planning", "build_merge_context");
      const context = buildContextPack(
        this.store.vaultRoot,
        createMergeContextRequest(run.runId, sourceId, extraction.value),
      );
      this.store.trackArtifact(run.runId, "context-pack.json");

      this.store.transition(run.runId, "generating", "merge_plan");
      const mergePlan = await generateStructured({
        adapter: this.adapter,
        request: runtimeRequest(
          run.runId,
          "请决定每个 Information Item 的去向，优先更新已有页面，只有形成长期稳定主题时才创建新页面。",
          buildMergeInput(context.contextPack),
          {
            name: "submit_merge_plan",
            description: "提交覆盖全部 Information Item 的 MergePlan。",
            parameters: MERGE_PLAN_TOOL_SCHEMA,
          },
        ),
        expectedTool: "submit_merge_plan",
        parse: (value) => {
          const plan = parseMerge(value);
          if (plan.runId !== run.runId) {
            throw new HarnessError(
              "MODEL_OUTPUT_INVALID",
              "model_output_invalid",
              "submit_merge_plan",
              true,
              "MergePlan runId 不一致",
            );
          }
          return plan;
        },
      });
      this.store.addUsage(run.runId, mergePlan.usage, mergePlan.attempts);
      withTemporaryJson(mergePlan.value, (path) =>
        registerMergePlan(this.store.vaultRoot, path, { manageRunRecord: false }),
      );
      this.store.trackArtifact(run.runId, "merge-plan.json");
      const next = this.store.transition(
        run.runId,
        "awaiting_approval",
        "merge_plan_approval",
        { approvalRequired: "merge-plan" },
      );
      return commandResult(next);
    } catch (error) {
      this.failRun(run.runId, error);
      throw error;
    }
  }

  async merge(input: {
    runId: string;
    approve?: "merge-plan" | "patch-apply";
    reject?: "merge-plan" | "patch-apply";
    reason?: string;
  }): Promise<AgentCommandResult> {
    const run = this.store.read(input.runId);
    if (run.workflow !== "plan-ingest") {
      throw inputError("merge", "只有 plan-ingest Run 可以进入 merge");
    }
    if (input.reject) {
      return this.rejectRun(run, input.reject, input.reason);
    }
    if (!input.approve) {
      return commandResult(run);
    }
    if (run.status !== "awaiting_approval" || run.approvalRequired !== input.approve) {
      throw inputError("merge", `当前不等待 ${input.approve} 审批`);
    }

    try {
      if (input.approve === "merge-plan") {
        this.store.recordApproval({
          runId: run.runId,
          checkpoint: "merge-plan",
          artifact: "merge-plan.json",
          status: "approved",
        });
        this.store.assertApproval(run.runId, "merge-plan");
        this.store.transition(run.runId, "generating", "patch_plan", {
          approvalRequired: undefined,
        });
        const plan = parseMergePlan(this.store.readArtifact(run.runId, "merge-plan.json"));
        const context = parseContextPack(
          this.store.readArtifact(run.runId, "context-pack.json"),
        );
        const patch = await generateStructured({
          adapter: this.adapter,
          request: runtimeRequest(
            run.runId,
            "请根据已批准的 MergePlan 生成最小、精确、可校验的 PatchPlan。不得修改 Candidate Targets 之外的 Wiki 页面。",
            buildPatchInput(plan, context),
            {
              name: "submit_patch_plan",
              description: "提交只修改已批准 Candidate Targets 的 PatchPlan。",
              parameters: PATCH_PLAN_TOOL_SCHEMA,
            },
          ),
          expectedTool: "submit_patch_plan",
          parse: (value) => assertPatchTargets(parsePatch(value), plan),
        });
        this.store.addUsage(run.runId, patch.usage, patch.attempts);
        const patchPath = this.store.writeArtifact(run.runId, "patch-plan.json", patch.value);
        const dryRun = applyPatchPlan(
          this.store.vaultRoot,
          join(this.store.vaultRoot, patchPath),
          { dryRun: true },
        );
        this.store.writeArtifact(run.runId, "patch-dry-run.json", dryRun);
        const next = this.store.transition(
          run.runId,
          "awaiting_approval",
          "patch_apply_approval",
          { approvalRequired: "patch-apply" },
        );
        return commandResult(next);
      }

      this.store.recordApproval({
        runId: run.runId,
        checkpoint: "patch-apply",
        artifact: "patch-plan.json",
        status: "approved",
      });
      this.store.assertApproval(run.runId, "merge-plan");
      this.store.assertApproval(run.runId, "patch-apply");
      this.store.transition(run.runId, "applying", "apply_patch", {
        approvalRequired: undefined,
      });
      const patchPath = join(this.store.absoluteRunDirectory(run.runId), "patch-plan.json");
      const applyResult = applyPatchPlan(this.store.vaultRoot, patchPath);
      this.store.writeArtifact(run.runId, "apply-result.json", applyResult);
      this.store.transition(run.runId, "validating", "validate_and_finalize");
      const firstValidation = validateVault(this.store.vaultRoot);
      if (firstValidation.errors.length > 0) {
        throw new HarnessError(
          "TOOL_EXECUTION_FAILED",
          "tool_execution_failed",
          "validate",
          false,
          `Patch 应用后存在 ${firstValidation.errors.length} 个校验错误`,
        );
      }
      generateIndex(this.store.vaultRoot);
      finalizeMerge(this.store.vaultRoot, run.runId, new Date(), {
        manageRunRecord: false,
      });
      this.store.trackArtifact(run.runId, "coverage.json");
      const finalValidation = validateVault(this.store.vaultRoot);
      this.store.writeArtifact(run.runId, "validation.json", finalValidation);
      if (finalValidation.errors.length > 0) {
        throw new HarnessError(
          "TOOL_EXECUTION_FAILED",
          "tool_execution_failed",
          "validate",
          false,
          `Finalize 后存在 ${finalValidation.errors.length} 个校验错误`,
        );
      }
      const diff = getGitDiffSummary(this.store.vaultRoot);
      assertWikiDiffScope(diff.files.map((file) => file.path), parseMergePlan(
        this.store.readArtifact(run.runId, "merge-plan.json"),
      ));
      this.store.writeArtifact(run.runId, "diff.json", diff);
      const next = this.store.transition(run.runId, "completed", "completed");
      return commandResult(next);
    } catch (error) {
      this.failRun(run.runId, error);
      throw error;
    }
  }

  async query(question: string): Promise<AgentCommandResult> {
    if (!question.trim()) {
      throw inputError("query", "问题不能为空");
    }
    const run = this.store.create({
      workflow: "query",
      adapter: this.adapter.id,
      model: this.model,
      query: question.trim(),
    });
    try {
      this.store.transition(run.runId, "preparing", "build_query_context");
      const context = buildContextPack(
        this.store.vaultRoot,
        createQueryContextRequest(run.runId, question.trim()),
      );
      this.store.trackArtifact(run.runId, "context-pack.json");
      this.store.transition(run.runId, "generating", "query_answer");
      const answer = await generateStructured({
        adapter: this.adapter,
        request: runtimeRequest(
          run.runId,
          "请只根据 Context Pack 回答问题。每个 claim 必须引用 Context Pack 中的 Page 或 Source；信息不足时明确说明。",
          JSON.stringify(context.contextPack),
          {
            name: "submit_query_answer",
            description: "提交带逐条引用的 Query Answer。",
            parameters: QUERY_ANSWER_TOOL_SCHEMA,
          },
        ),
        expectedTool: "submit_query_answer",
        parse: (value) => parseQueryAnswer(value, context.contextPack),
      });
      this.store.addUsage(run.runId, answer.usage, answer.attempts);
      this.store.writeArtifact(run.runId, "query-answer.json", answer.value);
      const next = this.store.transition(run.runId, "completed", "completed");
      return commandResult(next);
    } catch (error) {
      this.failRun(run.runId, error);
      throw error;
    }
  }

  fileBack(input: {
    runId: string;
    domain?: string;
    privacy?: string;
    approve?: boolean;
  }): AgentCommandResult {
    const sourceRun = this.store.read(input.runId);
    if (sourceRun.workflow === "query") {
      if (sourceRun.status !== "completed") {
        throw inputError("file_back", "Query Run 尚未完成");
      }
      if (!input.domain?.trim()) {
        throw inputError("file_back", "创建 File-back 候选需要 --domain");
      }
      const answer = this.store.readArtifact(
        sourceRun.runId,
        "query-answer.json",
      ) as QueryAnswer;
      const run = this.store.create({
        workflow: "file-back",
        adapter: this.adapter.id,
        model: this.model,
        parentRunId: sourceRun.runId,
        query: sourceRun.query,
      });
      this.store.transition(run.runId, "preparing", "build_file_back");
      const candidate = renderFileBack(sourceRun, answer);
      this.store.writeTextArtifact(run.runId, "file-back.md", candidate);
      this.store.writeArtifact(run.runId, "file-back.json", {
        version: "pkwiki.file-back/0.1",
        parentRunId: sourceRun.runId,
        domain: input.domain.trim(),
        privacy: input.privacy?.trim() || "private",
        type: "agent-answer",
      });
      const next = this.store.transition(
        run.runId,
        "awaiting_approval",
        "file_back_approval",
        { approvalRequired: "file-back" },
      );
      return commandResult(next);
    }

    if (sourceRun.workflow !== "file-back") {
      throw inputError("file_back", "只支持 Query Run 或 File-back Run");
    }
    if (!input.approve) {
      return commandResult(sourceRun);
    }
    if (
      sourceRun.status !== "awaiting_approval" ||
      sourceRun.approvalRequired !== "file-back"
    ) {
      throw inputError("file_back", "当前 Run 不等待 File-back 审批");
    }
    try {
      this.store.recordApproval({
        runId: sourceRun.runId,
        checkpoint: "file-back",
        artifact: "file-back.md",
        status: "approved",
      });
      this.store.assertApproval(sourceRun.runId, "file-back");
      this.store.transition(sourceRun.runId, "applying", "ingest_file_back", {
        approvalRequired: undefined,
      });
      const metadata = this.store.readArtifact(
        sourceRun.runId,
        "file-back.json",
      ) as { domain: string; privacy: string; type: string; parentRunId: string };
      const result = ingestSource(
        this.store.vaultRoot,
        join(this.store.absoluteRunDirectory(sourceRun.runId), "file-back.md"),
        {
          type: metadata.type,
          domain: metadata.domain,
          privacy: metadata.privacy,
          title: `query-answer-${metadata.parentRunId.replace(/:/g, "-")}`,
        },
      );
      this.store.writeArtifact(sourceRun.runId, "file-back-result.json", result);
      this.store.writeArtifact(metadata.parentRunId, "file-back-result.json", {
        fileBackRunId: sourceRun.runId,
        sourceId: result.sourceId,
      });
      const next = this.store.transition(sourceRun.runId, "validating", "validate");
      const validation = validateVault(this.store.vaultRoot);
      this.store.writeArtifact(sourceRun.runId, "validation.json", validation);
      if (validation.errors.length > 0) {
        throw new HarnessError(
          "TOOL_EXECUTION_FAILED",
          "tool_execution_failed",
          "validate",
          false,
          `File-back 后存在 ${validation.errors.length} 个校验错误`,
        );
      }
      return commandResult(
        this.store.transition(next.runId, "completed", "completed", {
          sourceIds: [result.sourceId],
        }),
      );
    } catch (error) {
      this.failRun(sourceRun.runId, error);
      throw error;
    }
  }

  status(runId: string): AgentCommandResult {
    return commandResult(this.store.read(runId));
  }

  private assertCleanPreflight(): void {
    const validation = validateVault(this.store.vaultRoot);
    if (validation.errors.length > 0) {
      throw new HarnessError(
        "TOOL_EXECUTION_FAILED",
        "tool_execution_failed",
        "preflight",
        false,
        `Vault preflight 存在 ${validation.errors.length} 个错误`,
      );
    }
    const git = getGitStatus(this.store.vaultRoot);
    if (!git.clean) {
      throw new HarnessError(
        "VAULT_CHANGED",
        "vault_changed",
        "preflight",
        false,
        "plan-ingest 要求 Vault Git 工作区干净",
      );
    }
  }

  private rejectRun(
    run: HarnessRunRecord,
    checkpoint: "merge-plan" | "patch-apply",
    reason?: string,
  ): AgentCommandResult {
    if (run.status !== "awaiting_approval" || run.approvalRequired !== checkpoint) {
      throw inputError("approval", `当前不等待 ${checkpoint} 审批`);
    }
    if (!reason?.trim()) {
      throw inputError("approval", "拒绝审批必须提供 --reason");
    }
    const artifact = checkpoint === "merge-plan" ? "merge-plan.json" : "patch-plan.json";
    this.store.recordApproval({
      runId: run.runId,
      checkpoint,
      artifact,
      status: "rejected",
      reason: reason.trim(),
    });
    return commandResult(
      this.store.transition(run.runId, "cancelled", "approval_rejected", {
        approvalRequired: undefined,
        lastError: {
          category: "approval_rejected",
          step: checkpoint,
          message: reason.trim(),
        },
      }),
    );
  }

  private failRun(runId: string, error: unknown): void {
    const harnessError = toHarnessError(error, "workflow");
    try {
      const current = this.store.read(runId);
      if (
        current.status !== "completed" &&
        current.status !== "failed" &&
        current.status !== "cancelled"
      ) {
        this.store.transition(runId, "failed", harnessError.step, {
          approvalRequired: undefined,
          lastError: {
            category: harnessError.category,
            step: harnessError.step,
            message: harnessError.safeMessage,
          },
        });
      }
    } catch {
      // 保留原始异常，RunStore 失败由调用方处理。
    }
  }
}

function runtimeRequest(
  runId: string,
  instruction: string,
  payload: string,
  tool: RuntimeRequest["tools"][number],
): RuntimeRequest {
  return {
    runId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${instruction}\n\n输入：\n${payload}`,
      },
    ],
    tools: [tool],
    thinkingLevel: "max",
    timeoutMs: 180_000,
  };
}

function buildExtractionInput(
  vaultRoot: string,
  source: ReturnType<typeof readSourceManifest>[string],
  chunks: Array<{ chunkId: string; path: string }>,
): string {
  return JSON.stringify({
    source: {
      sourceId: source.sourceId,
      checksum: source.checksum,
      type: source.type,
      domain: source.domain,
      privacy: source.privacy,
      language: source.language,
    },
    createdAt: new Date().toISOString(),
    chunks: chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      content: readFileSync(join(vaultRoot, chunk.path), "utf8"),
    })),
  });
}

function buildMergeInput(context: ContextPack): string {
  return `${JSON.stringify(context)}\n\nCandidate Target 规则：路径必须位于 wiki/ 下；update 必须指向 Context Pack 中已有页面；create 使用 wiki/<domain>/<slug>.md。`;
}

function buildPatchInput(plan: MergePlan, context: ContextPack): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${JSON.stringify({ mergePlan: plan, contextPack: context })}\n\n新建页面必须包含 YAML frontmatter：okf_version, profile, id, type, title, description, domain, status, created, updated, confidence, privacy, sources, tags。sources 必须包含相关 Source ID。日期使用 ${today} 或 Source 中更准确的日期。只做 MergePlan 要求的最小修改。`;
}

function createMergeContextRequest(
  runId: string,
  sourceId: string,
  extraction: { summary: string; items: Array<{ content: string }> },
): ContextRequest {
  return {
    version: "pkwiki.context-request/0.1",
    runId,
    workflow: "merge",
    query: `${extraction.summary}\n${extraction.items.map((item) => item.content).join("\n")}`,
    sourceIds: [sourceId],
    maxPages: 12,
    maxChars: 40_000,
    linkDepth: 2,
  };
}

function createQueryContextRequest(runId: string, question: string): ContextRequest {
  return {
    version: "pkwiki.context-request/0.1",
    runId,
    workflow: "query",
    query: question,
    sourceIds: [],
    maxPages: 12,
    maxChars: 40_000,
    linkDepth: 2,
  };
}

function assertPatchTargets(plan: PatchPlan, mergePlan: MergePlan): PatchPlan {
  const allowed = new Set(
    mergePlan.candidateTargets
      .filter((target) => target.intent !== "skip")
      .map((target) => target.path),
  );
  for (const operation of plan.operations) {
    if (!allowed.has(operation.path)) {
      throw new HarnessError(
        "MODEL_OUTPUT_INVALID",
        "model_output_invalid",
        "submit_patch_plan",
        true,
        `PatchPlan 超出 Candidate Targets：${operation.path}`,
      );
    }
  }
  return plan;
}

function assertWikiDiffScope(paths: string[], plan: MergePlan): void {
  const allowed = new Set(
    plan.candidateTargets
      .filter((target) => target.intent !== "skip")
      .map((target) => target.path),
  );
  const unexpected = paths.filter(
    (path) => path.startsWith("wiki/") && !allowed.has(path),
  );
  if (unexpected.length > 0) {
    throw new HarnessError(
      "VAULT_CHANGED",
      "vault_changed",
      "diff_scope",
      false,
      `发现 Candidate Targets 之外的 Wiki 修改：${unexpected.join(", ")}`,
    );
  }
}

function renderFileBack(run: HarnessRunRecord, answer: QueryAnswer): string {
  const claims = answer.claims
    .map(
      (claim) =>
        `- ${claim.text}\n  - 引用：${claim.citations
          .map((citation) => citation.path ?? citation.id)
          .join(", ")}`,
    )
    .join("\n");
  return `# Query Answer File-back\n\n- Query Run: ${run.runId}\n- Question: ${run.query ?? ""}\n- Created At: ${new Date().toISOString()}\n\n## Answer\n\n${answer.answer}\n\n## Claims\n\n${claims}\n\n## Uncertainties\n\n${answer.uncertainties.map((item) => `- ${item}`).join("\n") || "- 无"}\n`;
}

function commandResult(run: HarnessRunRecord): AgentCommandResult {
  return {
    ok: true,
    runId: run.runId,
    workflow: run.workflow,
    status: run.status,
    ...(run.approvalRequired ? { approvalRequired: run.approvalRequired } : {}),
    ...(nextCommand(run) ? { nextCommand: nextCommand(run) } : {}),
    artifacts: run.artifacts,
  };
}

function nextCommand(run: HarnessRunRecord): string | undefined {
  if (run.approvalRequired === "merge-plan") {
    return `pkwiki agent merge ${run.runId} --approve merge-plan`;
  }
  if (run.approvalRequired === "patch-apply") {
    return `pkwiki agent merge ${run.runId} --approve patch-apply`;
  }
  if (run.approvalRequired === "file-back") {
    return `pkwiki agent file-back ${run.runId} --approve`;
  }
  return undefined;
}

function withTemporaryJson<T>(value: unknown, callback: (path: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "pkwiki-agent-"));
  const path = join(directory, "artifact.json");
  try {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return callback(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function inputError(step: string, message: string): HarnessError {
  return new HarnessError(
    "TOOL_INPUT_INVALID",
    "tool_input_invalid",
    step,
    false,
    message,
  );
}

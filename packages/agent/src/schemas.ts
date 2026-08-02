import { Type } from "typebox";
import { isRecord, parseExtractionArtifact, type ExtractionArtifact } from "@pkwiki/core";
import { parseMergePlan, type MergePlan } from "@pkwiki/merge";
import { parsePatchPlan, type PatchPlan } from "@pkwiki/patch";
import type { ContextPack } from "@pkwiki/search";
import { HarnessError } from "./errors.js";

const stringArray = Type.Array(Type.String());

export const EXTRACTION_TOOL_SCHEMA = Type.Object({
  version: Type.Literal("pkwiki.extraction/0.1"),
  sourceId: Type.String(),
  sourceChecksum: Type.String(),
  createdAt: Type.String(),
  normalizedContent: Type.Optional(Type.String()),
  summary: Type.String(),
  items: Type.Array(
    Type.Object({
      itemId: Type.String(),
      kind: Type.Union([
        Type.Literal("fact"),
        Type.Literal("event"),
        Type.Literal("entity"),
        Type.Literal("decision"),
        Type.Literal("question"),
        Type.Literal("uncertainty"),
      ]),
      content: Type.String(),
      confidence: Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ]),
      evidence: Type.Array(
        Type.Object({
          chunkId: Type.String(),
          quote: Type.Optional(Type.String()),
        }),
      ),
    }),
  ),
});

const coverageSchema = Type.Object({
  sourceId: Type.String(),
  itemId: Type.String(),
  decision: Type.Union([
    Type.Literal("merged"),
    Type.Literal("deferred"),
    Type.Literal("discarded"),
    Type.Literal("needs_confirmation"),
  ]),
  target: Type.Optional(Type.String()),
  reason: Type.String(),
});

export const MERGE_PLAN_TOOL_SCHEMA = Type.Object({
  version: Type.Literal("pkwiki.merge-plan/0.1"),
  runId: Type.String(),
  createdAt: Type.String(),
  sourceIds: stringArray,
  summary: Type.String(),
  candidateTargets: Type.Array(
    Type.Object({
      path: Type.String(),
      intent: Type.Union([
        Type.Literal("create"),
        Type.Literal("update"),
        Type.Literal("skip"),
      ]),
      reason: Type.String(),
      confidence: Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ]),
    }),
  ),
  coverage: Type.Array(coverageSchema),
  unresolvedQuestions: stringArray,
  privacyNotes: stringArray,
  patchPlanPath: Type.Optional(Type.String()),
});

const patchBase = {
  path: Type.String(),
  expectedChecksum: Type.Optional(Type.String()),
};

export const PATCH_PLAN_TOOL_SCHEMA = Type.Object({
  version: Type.Literal("pkwiki.patch-plan/0.1"),
  summary: Type.String(),
  sourceIds: Type.Optional(stringArray),
  createdBy: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  notes: Type.Optional(stringArray),
  operations: Type.Array(
    Type.Union([
      Type.Object({
        type: Type.Literal("create_markdown_page"),
        ...patchBase,
        content: Type.String(),
      }),
      Type.Object({
        type: Type.Literal("replace_text"),
        ...patchBase,
        find: Type.String(),
        replace: Type.String(),
      }),
      Type.Object({
        type: Type.Literal("append_to_section"),
        ...patchBase,
        heading: Type.String(),
        content: Type.String(),
      }),
      Type.Object({
        type: Type.Literal("replace_section"),
        ...patchBase,
        heading: Type.String(),
        content: Type.String(),
      }),
    ]),
  ),
});

const citationSchema = Type.Object({
  kind: Type.Union([Type.Literal("page"), Type.Literal("source")]),
  id: Type.String(),
  path: Type.Optional(Type.String()),
});

export const QUERY_ANSWER_TOOL_SCHEMA = Type.Object({
  version: Type.Literal("pkwiki.query-answer/0.1"),
  runId: Type.String(),
  answer: Type.String(),
  claims: Type.Array(
    Type.Object({
      text: Type.String(),
      citations: Type.Array(citationSchema, { minItems: 1 }),
    }),
  ),
  uncertainties: stringArray,
  suggestedFileBack: Type.Object({
    recommended: Type.Boolean(),
    reason: Type.String(),
  }),
});

export type QueryCitation = {
  kind: "page" | "source";
  id: string;
  path?: string;
};

export type QueryAnswer = {
  version: "pkwiki.query-answer/0.1";
  runId: string;
  answer: string;
  claims: Array<{ text: string; citations: QueryCitation[] }>;
  uncertainties: string[];
  suggestedFileBack: { recommended: boolean; reason: string };
};

export function parseExtraction(value: unknown): ExtractionArtifact {
  return wrapParser("submit_extraction", () => parseExtractionArtifact(value));
}

export function parseMerge(value: unknown): MergePlan {
  return wrapParser("submit_merge_plan", () => parseMergePlan(value));
}

export function parsePatch(value: unknown): PatchPlan {
  return wrapParser("submit_patch_plan", () => parsePatchPlan(value));
}

export function parseQueryAnswer(
  value: unknown,
  context: ContextPack,
): QueryAnswer {
  return wrapParser("submit_query_answer", () => {
    if (!isRecord(value) || value.version !== "pkwiki.query-answer/0.1") {
      throw new Error("Query Answer version 非法");
    }
    if (value.runId !== context.runId) {
      throw new Error("Query Answer runId 与 Context Pack 不一致");
    }
    if (typeof value.answer !== "string" || value.answer.trim() === "") {
      throw new Error("Query Answer answer 不能为空");
    }
    if (!Array.isArray(value.claims) || value.claims.length === 0) {
      throw new Error("Query Answer claims 不能为空");
    }
    const pageIds = new Set(context.pages.map((page) => page.id));
    const pagePaths = new Set(context.pages.map((page) => page.path));
    const sourceIds = new Set(context.sources.map((source) => source.sourceId));
    const claims = value.claims.map((claim, claimIndex) => {
      if (!isRecord(claim) || typeof claim.text !== "string") {
        throw new Error(`claims[${claimIndex}] 非法`);
      }
      if (!Array.isArray(claim.citations) || claim.citations.length === 0) {
        throw new Error(`claims[${claimIndex}] 缺少 citation`);
      }
      const citations = claim.citations.map((citation, citationIndex) => {
        if (
          !isRecord(citation) ||
          (citation.kind !== "page" && citation.kind !== "source") ||
          typeof citation.id !== "string"
        ) {
          throw new Error(`claims[${claimIndex}].citations[${citationIndex}] 非法`);
        }
        if (
          citation.kind === "page" &&
          !pageIds.has(citation.id) &&
          !(typeof citation.path === "string" && pagePaths.has(citation.path))
        ) {
          throw new Error(`citation Page 不在 Context Pack：${citation.id}`);
        }
        if (citation.kind === "source" && !sourceIds.has(citation.id)) {
          throw new Error(`citation Source 不在 Context Pack：${citation.id}`);
        }
        return {
          kind: citation.kind,
          id: citation.id,
          ...(typeof citation.path === "string" ? { path: citation.path } : {}),
        } satisfies QueryCitation;
      });
      return { text: claim.text, citations };
    });
    if (!Array.isArray(value.uncertainties)) {
      throw new Error("Query Answer uncertainties 必须是数组");
    }
    if (
      !isRecord(value.suggestedFileBack) ||
      typeof value.suggestedFileBack.recommended !== "boolean" ||
      typeof value.suggestedFileBack.reason !== "string"
    ) {
      throw new Error("Query Answer suggestedFileBack 非法");
    }
    return {
      version: "pkwiki.query-answer/0.1",
      runId: value.runId,
      answer: value.answer,
      claims,
      uncertainties: value.uncertainties.map((item, index) => {
        if (typeof item !== "string") {
          throw new Error(`uncertainties[${index}] 非法`);
        }
        return item;
      }),
      suggestedFileBack: {
        recommended: value.suggestedFileBack.recommended,
        reason: value.suggestedFileBack.reason,
      },
    };
  });
}

function wrapParser<T>(step: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new HarnessError(
      "MODEL_OUTPUT_INVALID",
      "model_output_invalid",
      step,
      true,
      error instanceof Error ? error.message : String(error),
      error,
    );
  }
}

import type { TSchema } from "typebox";
import { HarnessError, toHarnessError } from "./errors.js";

export type RuntimeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RuntimeTool = {
  name: string;
  description: string;
  parameters: TSchema;
};

export type RuntimeRequest = {
  runId: string;
  systemPrompt: string;
  messages: RuntimeMessage[];
  tools: RuntimeTool[];
  thinkingLevel: "max";
  timeoutMs: number;
};

export type RuntimeUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
  totalTokens: number;
};

export type RuntimeEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; ok: boolean; message: string }
  | { type: "usage"; usage: RuntimeUsage }
  | { type: "completed" }
  | { type: "failed"; error: HarnessError };

export interface RuntimeAdapter {
  readonly id: string;
  generate(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
  abort(runId: string): Promise<void>;
}

export type StructuredGenerationResult<T> = {
  value: T;
  usage: RuntimeUsage;
  attempts: number;
};

export async function generateStructured<T>(input: {
  adapter: RuntimeAdapter;
  request: RuntimeRequest;
  expectedTool: string;
  parse: (value: unknown) => T;
  maxRepairAttempts?: number;
}): Promise<StructuredGenerationResult<T>> {
  const maxRepairAttempts = input.maxRepairAttempts ?? 2;
  let repairMessage: string | null = null;
  let lastError: HarnessError | null = null;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const calls: unknown[] = [];
    let usage = emptyUsage();
    const request: RuntimeRequest = {
      ...input.request,
      messages: repairMessage
        ? [
            ...input.request.messages,
            {
              role: "user",
              content: `上一次结构化输出无效。请只重新调用 ${input.expectedTool}。错误：${repairMessage}`,
            },
          ]
        : input.request.messages,
    };

    try {
      for await (const event of input.adapter.generate(request)) {
        if (event.type === "tool_call" && event.name === input.expectedTool) {
          calls.push(event.input);
        }
        if (event.type === "usage") {
          usage = addUsage(usage, event.usage);
        }
        if (event.type === "failed") {
          throw event.error;
        }
      }
      if (calls.length !== 1) {
        throw new HarnessError(
          "MODEL_OUTPUT_INVALID",
          "model_output_invalid",
          input.expectedTool,
          true,
          calls.length === 0
            ? `模型没有调用 ${input.expectedTool}`
            : `模型重复调用了 ${input.expectedTool}`,
        );
      }
      return {
        value: input.parse(calls[0]),
        usage,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = toHarnessError(error, input.expectedTool);
      if (
        lastError.category !== "model_output_invalid" &&
        lastError.category !== "tool_input_invalid"
      ) {
        throw lastError;
      }
      repairMessage = lastError.safeMessage;
    }
  }

  throw (
    lastError ??
    new HarnessError(
      "MODEL_OUTPUT_INVALID",
      "model_output_invalid",
      input.expectedTool,
      false,
      "模型结构化输出无效",
    )
  );
}

export function emptyUsage(): RuntimeUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
  };
}

export function addUsage(left: RuntimeUsage, right: RuntimeUsage): RuntimeUsage {
  const reasoning = (left.reasoning ?? 0) + (right.reasoning ?? 0);
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    ...(reasoning > 0 ? { reasoning } : {}),
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

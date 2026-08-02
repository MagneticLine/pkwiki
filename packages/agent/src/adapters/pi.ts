import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ModelConfig } from "../config.js";
import { HarnessError, sanitizeErrorMessage } from "../errors.js";
import type {
  RuntimeAdapter,
  RuntimeEvent,
  RuntimeRequest,
  RuntimeUsage,
} from "../runtime.js";

export class PiRuntimeAdapter implements RuntimeAdapter {
  readonly id = "pi";
  private readonly active = new Map<string, AgentSession>();

  constructor(private readonly config: ModelConfig) {}

  generate(request: RuntimeRequest): AsyncIterable<RuntimeEvent> {
    const queue = new AsyncEventQueue<RuntimeEvent>();
    void this.run(request, queue);
    return queue;
  }

  async abort(runId: string): Promise<void> {
    const session = this.active.get(runId);
    if (session) {
      await session.abort();
    }
  }

  private async run(
    request: RuntimeRequest,
    queue: AsyncEventQueue<RuntimeEvent>,
  ): Promise<void> {
    let session: AgentSession | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const modelRuntime = await ModelRuntime.create({ modelsPath: null });
      modelRuntime.registerProvider(this.config.provider, {
        name: this.config.provider,
        baseUrl: this.config.baseUrl,
        api: this.config.api,
        apiKey: this.config.apiKey.reveal(),
        authHeader: true,
        models: [
          {
            id: this.config.model,
            name: this.config.model,
            reasoning: true,
            thinkingLevelMap: { max: "max" },
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: this.config.contextWindow,
            maxTokens: this.config.maxTokens,
            compat: {
              supportsStore: false,
              supportsDeveloperRole: true,
              supportsReasoningEffort: true,
              supportsUsageInStreaming: true,
              supportsStrictMode: false,
            },
          },
        ],
      });
      const model = modelRuntime.getModel(this.config.provider, this.config.model);
      if (!model) {
        throw providerError("无法注册自定义模型", "provider_protocol");
      }
      const resourceLoader = new DefaultResourceLoader({
        cwd: process.cwd(),
        agentDir: process.cwd(),
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: request.systemPrompt,
        appendSystemPrompt: [],
      });
      await resourceLoader.reload();
      const customTools = request.tools.map((tool) =>
        defineTool({
          name: tool.name,
          label: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          executionMode: "sequential",
          execute: async (_toolCallId, params) => {
            queue.push({ type: "tool_call", name: tool.name, input: params });
            return {
              content: [
                {
                  type: "text",
                  text: "结构化 artifact 已提交。不要再次调用提交工具。",
                },
              ],
              details: { accepted: true },
              isError: false,
            };
          },
        }),
      );
      const result = await createAgentSession({
        cwd: process.cwd(),
        modelRuntime,
        model,
        thinkingLevel: "max",
        noTools: "all",
        tools: request.tools.map((tool) => tool.name),
        customTools,
        resourceLoader,
        sessionManager: SessionManager.inMemory(),
        settingsManager: SettingsManager.inMemory(),
      });
      session = result.session;
      this.active.set(request.runId, session);
      const unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          queue.push({
            type: "text_delta",
            delta: event.assistantMessageEvent.delta,
          });
        }
        if (event.type === "message_end" && event.message.role === "assistant") {
          queue.push({ type: "usage", usage: mapUsage(event.message) });
        }
      });
      timeout = setTimeout(() => {
        timedOut = true;
        void session?.abort();
      }, request.timeoutMs);
      const prompt = request.messages
        .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
        .join("\n\n");
      await session.prompt(prompt, { expandPromptTemplates: false });
      unsubscribe();
      if (timedOut) {
        throw new HarnessError(
          "PROVIDER_TIMEOUT",
          "provider_timeout",
          "pi_generate",
          true,
          "模型请求超时",
        );
      }
      queue.push({ type: "completed" });
    } catch (error) {
      queue.push({ type: "failed", error: mapProviderError(error) });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      this.active.delete(request.runId);
      session?.dispose();
      queue.close();
    }
  }
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    this.closed = true;
    for (const resolve of this.resolvers.splice(0)) {
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return { value, done: false };
        }
        if (this.closed) {
          return { value: undefined, done: true };
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

function mapUsage(message: AssistantMessage): RuntimeUsage {
  return {
    input: message.usage.input,
    output: message.usage.output,
    cacheRead: message.usage.cacheRead,
    cacheWrite: message.usage.cacheWrite,
    ...(message.usage.reasoning === undefined
      ? {}
      : { reasoning: message.usage.reasoning }),
    totalTokens: message.usage.totalTokens,
  };
}

function mapProviderError(error: unknown): HarnessError {
  if (error instanceof HarnessError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("401") || normalized.includes("unauthorized")) {
    return providerError("模型鉴权失败", "provider_auth", error);
  }
  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return providerError("模型请求被限流", "provider_rate_limit", error);
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return providerError("模型请求超时", "provider_timeout", error);
  }
  return providerError(sanitizeErrorMessage(message), "provider_protocol", error);
}

function providerError(
  message: string,
  category:
    | "provider_auth"
    | "provider_rate_limit"
    | "provider_timeout"
    | "provider_protocol",
  cause?: unknown,
): HarnessError {
  const code = {
    provider_auth: "PROVIDER_AUTH",
    provider_rate_limit: "PROVIDER_RATE_LIMIT",
    provider_timeout: "PROVIDER_TIMEOUT",
    provider_protocol: "PROVIDER_PROTOCOL",
  }[category] as
    | "PROVIDER_AUTH"
    | "PROVIDER_RATE_LIMIT"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_PROTOCOL";
  return new HarnessError(
    code,
    category,
    "pi_generate",
    category !== "provider_auth",
    message,
    cause,
  );
}

import { HarnessError } from "./errors.js";

export const GPT_56_LUNA_CONTEXT_WINDOW = 272_000;
export const GPT_56_LUNA_MAX_TOKENS = 128_000;

export class SecretString {
  constructor(private readonly secret: string) {}

  reveal(): string {
    return this.secret;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}

export type ModelConfig = {
  provider: string;
  baseUrl: string;
  api: "openai-completions";
  apiKey: SecretString;
  model: string;
  reasoningEffort: "max";
  contextWindow: number;
  maxTokens: number;
};

export type ModelConfigSummary = Omit<ModelConfig, "apiKey">;

export function loadModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig {
  const provider = required(env.PKWIKI_MODEL_PROVIDER, "PKWIKI_MODEL_PROVIDER");
  const baseUrl = normalizeBaseUrl(
    required(env.PKWIKI_MODEL_BASE_URL, "PKWIKI_MODEL_BASE_URL"),
  );
  const api = required(env.PKWIKI_MODEL_API, "PKWIKI_MODEL_API");
  if (api !== "openai-completions") {
    throw configError("PKWIKI_MODEL_API 当前只支持 openai-completions");
  }
  const model = required(env.PKWIKI_MODEL_NAME, "PKWIKI_MODEL_NAME");
  const reasoningEffort = env.PKWIKI_MODEL_REASONING_EFFORT?.trim() || "max";
  if (reasoningEffort !== "max") {
    throw configError("阶段 5 的思考级别必须为 max");
  }
  const defaults = isGpt56Luna(model)
    ? {
        contextWindow: GPT_56_LUNA_CONTEXT_WINDOW,
        maxTokens: GPT_56_LUNA_MAX_TOKENS,
      }
    : null;
  const contextWindow = positiveInteger(
    env.PKWIKI_MODEL_CONTEXT_WINDOW,
    "PKWIKI_MODEL_CONTEXT_WINDOW",
    defaults?.contextWindow,
  );
  const maxTokens = positiveInteger(
    env.PKWIKI_MODEL_MAX_TOKENS,
    "PKWIKI_MODEL_MAX_TOKENS",
    defaults?.maxTokens,
  );
  if (maxTokens > contextWindow) {
    throw configError("PKWIKI_MODEL_MAX_TOKENS 不能大于 context window");
  }

  return {
    provider,
    baseUrl,
    api,
    apiKey: new SecretString(required(env.PKWIKI_MODEL_API_KEY, "PKWIKI_MODEL_API_KEY")),
    model,
    reasoningEffort,
    contextWindow,
    maxTokens,
  };
}

export function summarizeModelConfig(config: ModelConfig): ModelConfigSummary {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    api: config.api,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
  };
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw configError(`缺少模型配置：${name}`);
  }
  return normalized;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configError("PKWIKI_MODEL_BASE_URL 不是合法 URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw configError("PKWIKI_MODEL_BASE_URL 只支持 http 或 https");
  }
  return value.replace(/\/+$/, "");
}

function positiveInteger(
  value: string | undefined,
  name: string,
  fallback?: number,
): number {
  if (!value?.trim()) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw configError(`未知模型必须显式配置：${name}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw configError(`${name} 必须是正整数`);
  }
  return parsed;
}

function isGpt56Luna(model: string): boolean {
  return model.toLowerCase().endsWith("gpt-5.6-luna");
}

function configError(message: string): HarnessError {
  return new HarnessError(
    "MODEL_CONFIG_INVALID",
    "tool_input_invalid",
    "model_config",
    false,
    message,
  );
}

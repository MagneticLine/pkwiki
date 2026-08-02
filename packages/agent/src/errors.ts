export type HarnessErrorCategory =
  | "provider_auth"
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_protocol"
  | "model_refusal"
  | "model_output_invalid"
  | "tool_input_invalid"
  | "tool_execution_failed"
  | "approval_rejected"
  | "vault_changed"
  | "cancelled";

export type HarnessErrorCode =
  | "MODEL_CONFIG_INVALID"
  | "RUN_NOT_FOUND"
  | "RUN_ALREADY_EXISTS"
  | "RUN_STATE_INVALID"
  | "RUN_ARTIFACT_INVALID"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_STALE"
  | "APPROVAL_REJECTED"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_PROTOCOL"
  | "MODEL_REFUSAL"
  | "MODEL_OUTPUT_INVALID"
  | "TOOL_INPUT_INVALID"
  | "TOOL_EXECUTION_FAILED"
  | "VAULT_CHANGED"
  | "CANCELLED";

export class HarnessError extends Error {
  constructor(
    readonly code: HarnessErrorCode,
    readonly category: HarnessErrorCategory,
    readonly step: string,
    readonly retryable: boolean,
    readonly safeMessage: string,
    readonly cause?: unknown,
  ) {
    super(safeMessage);
    this.name = "HarnessError";
  }
}

export function toHarnessError(error: unknown, step: string): HarnessError {
  if (error instanceof HarnessError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HarnessError(
    "TOOL_EXECUTION_FAILED",
    "tool_execution_failed",
    step,
    false,
    sanitizeErrorMessage(message),
    error,
  );
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .slice(0, 1000);
}

export type PatchPlan = {
  runId: string;
  operation: "ingest" | "file-back" | "lint" | "migrate";
  patches: unknown[];
};


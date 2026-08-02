import type {
  RuntimeAdapter,
  RuntimeEvent,
  RuntimeRequest,
} from "../runtime.js";

export type FakeRuntimeScript =
  | RuntimeEvent[]
  | ((request: RuntimeRequest) => RuntimeEvent[] | Promise<RuntimeEvent[]>);

export class FakeRuntimeAdapter implements RuntimeAdapter {
  readonly id = "fake";
  readonly requests: RuntimeRequest[] = [];
  private readonly scripts: FakeRuntimeScript[];
  private aborted = new Set<string>();

  constructor(scripts: FakeRuntimeScript[]) {
    this.scripts = [...scripts];
  }

  async *generate(request: RuntimeRequest): AsyncIterable<RuntimeEvent> {
    this.requests.push(request);
    const script = this.scripts.shift();
    if (!script) {
      throw new Error("FakeRuntime 缺少脚本");
    }
    const events =
      typeof script === "function" ? await script(request) : script;
    for (const event of events) {
      if (this.aborted.has(request.runId)) {
        return;
      }
      yield event;
    }
  }

  async abort(runId: string): Promise<void> {
    this.aborted.add(runId);
  }
}

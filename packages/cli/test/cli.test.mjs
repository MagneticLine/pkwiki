import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../dist/index.js");

function run(args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
  });
}

test("init/status/validate 支持 JSON 输出", () => {
  const parent = mkdtempSync(join(tmpdir(), "pkwiki-cli-"));
  const vault = join(parent, "vault");

  const init = JSON.parse(run(["init", vault, "--json"]));
  assert.equal(init.ok, true);
  assert.equal(init.path, vault);

  const status = JSON.parse(run(["status", vault, "--json"]));
  assert.equal(status.ok, true);
  assert.equal(status.profile, "pkwiki/0.1");
  assert.equal(status.counts.raw, 0);

  const validate = JSON.parse(run(["validate", vault, "--json"]));
  assert.equal(validate.ok, true);
  assert.deepEqual(validate.errors, []);
});


import { execFileSync } from "node:child_process";

export type GitStatusSummary = {
  initialized: boolean;
  clean: boolean;
  files: string[];
  changedFiles: number;
};

export function getGitStatus(cwd: string): GitStatusSummary {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
  } catch {
    return {
      initialized: false,
      clean: true,
      files: [],
      changedFiles: 0,
    };
  }

  const output = execFileSync("git", ["status", "--short"], {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const files = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    initialized: true,
    clean: files.length === 0,
    files,
    changedFiles: files.length,
  };
}

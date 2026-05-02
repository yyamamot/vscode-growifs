#!/usr/bin/env node
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 3_000;

function runOsascript(name, script, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("/usr/bin/osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 500).unref();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      settled = true;
      resolve({
        name,
        status: "error",
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      settled = true;
      resolve({
        name,
        status: timedOut ? "timeout" : code === 0 ? "ok" : "failed",
        code,
        signal,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

const checks = [
  {
    name: "osascript-return",
    script: 'return "ok"',
  },
  {
    name: "system-events-process-count",
    script: 'tell application "System Events" to count processes',
  },
  {
    name: "system-events-shift-f10",
    script: [
      'tell application "System Events"',
      "  key code 109 using {shift down}",
      "end tell",
    ].join("\n"),
  },
];

if (process.platform !== "darwin") {
  console.log(
    JSON.stringify(
      {
        platform: process.platform,
        status: "skipped",
        reason: "System Events diagnostics are macOS-only.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const results = [];
for (const check of checks) {
  results.push(await runOsascript(check.name, check.script));
}

const failed = results.some((result) => result.status !== "ok");
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      status: failed ? "failed" : "ok",
      results,
    },
    null,
    2,
  ),
);
process.exit(failed ? 1 : 0);

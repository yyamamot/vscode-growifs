import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    workspaceFile: undefined,
    getConfiguration: () => ({
      get: () => "",
    }),
  },
}));

describe("runtimeLogger", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.GROWI_RUNTIME_MODE;
    delete process.env.GROWI_RUNTIME_ROOT;
    delete process.env.GROWI_JSONL_PATH;
    vi.restoreAllMocks();
  });

  it("resolves relative path from workspace folder", async () => {
    const { resolveRuntimeLogPath } = await import(
      "../../src/vscode/runtimeLogger.js"
    );

    expect(
      resolveRuntimeLogPath(".growi-logs/runtime/run.jsonl", {
        workspaceFolderFsPath: "/tmp/workspace",
      }),
    ).toBe("/tmp/workspace/.growi-logs/runtime/run.jsonl");
  });

  it("resolves relative path from workspace file directory", async () => {
    const { resolveRuntimeLogPath } = await import(
      "../../src/vscode/runtimeLogger.js"
    );

    expect(
      resolveRuntimeLogPath(".growi-logs/runtime/run.jsonl", {
        workspaceFileFsPath: "/tmp/workspace/project.code-workspace",
      }),
    ).toBe("/tmp/workspace/.growi-logs/runtime/run.jsonl");
  });

  it("prefers absolute GROWI_JSONL_PATH over runtime root", async () => {
    const { resolveRuntimeLogPath } = await import(
      "../../src/vscode/runtimeLogger.js"
    );

    expect(
      resolveRuntimeLogPath("/tmp/absolute/runtime.jsonl", {
        runtimeRootFsPath: "/tmp/runtime-root",
        workspaceFolderFsPath: "/tmp/workspace",
      }),
    ).toBe("/tmp/absolute/runtime.jsonl");
  });

  it("returns runtime log status with resolved path", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    process.env.GROWI_JSONL_PATH = ".growi-logs/runtime/runtime.jsonl";
    const { RuntimeLogger } = await import("../../src/vscode/runtimeLogger.js");
    const logger = new RuntimeLogger();

    expect(logger.isEnabled()).toBe(true);
    expect(logger.getRuntimeLogStatus()).toEqual({
      enabled: true,
      mode: "debug-f5",
      configuredPath: ".growi-logs/runtime/runtime.jsonl",
      resolvedPath: undefined,
      workspaceResolved: false,
    });
  });

  it("writes JSONL and session.started only in debug-f5 mode", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-runtime-"));
    process.env.GROWI_JSONL_PATH = path.join(tempRoot, "runtime.jsonl");

    const { RuntimeLogger } = await import("../../src/vscode/runtimeLogger.js");
    const logger = new RuntimeLogger();

    await logger.log({
      level: "info",
      event: "attachment.list.requested",
      source: "adapter",
      operation: "attachment/list",
      entityType: "page",
      entityId: "page-1",
      virtualPath: "/_api/v3/attachment/list",
      outcome: "started",
      details: "safe=true",
    });
    await logger.log({
      level: "info",
      event: "attachment.list.succeeded",
      source: "adapter",
      operation: "attachment/list",
      entityType: "page",
      entityId: "page-1",
      virtualPath: "/_api/v3/attachment/list",
      outcome: "succeeded",
      details: "count=1",
    });

    const content = await readFile(process.env.GROWI_JSONL_PATH, "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string; details?: string });
    expect(
      lines.filter((line) => line.event === "session.started"),
    ).toHaveLength(1);
    expect(
      lines.some((line) => line.event === "attachment.list.requested"),
    ).toBe(true);
    expect(
      lines.some((line) => line.event === "attachment.list.succeeded"),
    ).toBe(true);
    expect(content).not.toContain("Authorization");
    expect(content).not.toContain("Bearer");
  });

  it("does not write JSONL outside debug-f5 mode", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-runtime-"));
    process.env.GROWI_JSONL_PATH = path.join(tempRoot, "runtime.jsonl");

    const { RuntimeLogger } = await import("../../src/vscode/runtimeLogger.js");
    const logger = new RuntimeLogger();

    await logger.log({
      level: "info",
      event: "attachment.list.requested",
      source: "adapter",
      operation: "attachment/list",
      entityType: "page",
      entityId: "page-1",
      virtualPath: "/_api/v3/attachment/list",
      outcome: "started",
    });

    await expect(stat(process.env.GROWI_JSONL_PATH)).rejects.toThrow();
  });

  it("returns safe error when log write fails", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    process.env.GROWI_JSONL_PATH = "/dev/null/runtime.jsonl";

    const { RuntimeLogger } = await import("../../src/vscode/runtimeLogger.js");
    const logger = new RuntimeLogger();
    const result = await logger.logWithStatus({
      level: "info",
      event: "attachment.list.requested",
      source: "adapter",
      operation: "attachment/list",
      entityType: "page",
      entityId: "page-1",
      virtualPath: "/_api/v3/attachment/list",
      outcome: "started",
    });

    expect(result).toEqual({
      ok: false,
      message: expect.any(String),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Authorization");
      expect(result.message).not.toContain("Bearer");
    }
  });
});

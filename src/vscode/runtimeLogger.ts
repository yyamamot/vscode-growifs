import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

type RuntimeLogResolutionContext = {
  runtimeRootFsPath?: string;
  workspaceFolderFsPath?: string;
  workspaceFileFsPath?: string;
};

export type RuntimeLogEvent = {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  source: "runtime" | "adapter" | "command";
  runId: string;
  operation: string;
  entityType: string;
  entityId: string;
  virtualPath: string;
  outcome: "started" | "succeeded" | "failed" | "canceled";
  errorCode?: string;
  message?: string;
  details?: string;
};

export type RuntimeLogStatus = {
  enabled: boolean;
  mode: string;
  configuredPath: string;
  resolvedPath?: string;
  workspaceResolved: boolean;
};

export class RuntimeLogger {
  readonly runId = randomUUID();
  private readonly enabled: boolean;
  private readonly configuredPath: string;
  private targetPath: string | undefined;
  private sessionStarted = false;

  constructor() {
    this.enabled = process.env.GROWI_RUNTIME_MODE === "debug-f5";
    this.configuredPath =
      process.env.GROWI_JSONL_PATH ?? defaultRuntimeLogPath();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getRuntimeLogStatus(): RuntimeLogStatus {
    const resolvedPath = this.getResolvedRuntimeLogPath();
    return {
      enabled: this.enabled,
      mode: process.env.GROWI_RUNTIME_MODE?.trim() || "(unset)",
      configuredPath: this.configuredPath,
      resolvedPath,
      workspaceResolved: isWorkspaceResolved(),
    };
  }

  async log(event: Omit<RuntimeLogEvent, "ts" | "runId">): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const targetPath = this.getResolvedRuntimeLogPath();
    if (!targetPath) {
      return;
    }

    await this.ensureSessionStarted(targetPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await appendFile(
      targetPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        runId: this.runId,
        ...event,
      })}\n`,
      "utf8",
    );
  }

  async logWithStatus(
    event: Omit<RuntimeLogEvent, "ts" | "runId">,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await this.log(event);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: formatRuntimeLogError(error) };
    }
  }

  getResolvedRuntimeLogPath(): string | undefined {
    if (!this.targetPath) {
      this.targetPath = resolveRuntimeLogPath(
        this.configuredPath,
        currentResolutionContext(),
      );
    }
    return this.targetPath;
  }

  getResolvedRuntimeLogDirectory(): string | undefined {
    const targetPath = this.getResolvedRuntimeLogPath();
    return targetPath
      ? path.dirname(targetPath)
      : defaultRuntimeLogDirectory(currentResolutionContext());
  }

  resetRuntimeLogState(): void {
    this.sessionStarted = false;
  }

  private async ensureSessionStarted(targetPath: string): Promise<void> {
    if (this.sessionStarted) {
      return;
    }

    this.sessionStarted = true;
    await mkdir(path.dirname(targetPath), { recursive: true });
    await appendFile(
      targetPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        runId: this.runId,
        level: "info",
        event: "session.started",
        source: "runtime",
        operation: "session",
        entityType: "runtimeLog",
        entityId: this.runId,
        virtualPath: targetPath,
        outcome: "started",
        details: `mode=debug-f5 baseUrlConfigured=${isBaseUrlConfigured()} runtimeRootConfigured=${isRuntimeRootConfigured()} workspaceResolved=${isWorkspaceResolved()}`,
      } satisfies RuntimeLogEvent)}\n`,
      "utf8",
    );
  }
}

export function defaultRuntimeLogPath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    ".growi-logs",
    "runtime",
    `run-${timestamp}-${process.pid}.jsonl`,
  );
}

export function resolveRuntimeLogPath(
  targetPath: string,
  context: RuntimeLogResolutionContext,
): string | undefined {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  if (context.runtimeRootFsPath) {
    return path.join(context.runtimeRootFsPath, targetPath);
  }

  if (context.workspaceFolderFsPath) {
    return path.join(context.workspaceFolderFsPath, targetPath);
  }

  if (context.workspaceFileFsPath) {
    return path.join(path.dirname(context.workspaceFileFsPath), targetPath);
  }

  return undefined;
}

export function defaultRuntimeLogDirectory(
  context: RuntimeLogResolutionContext,
): string | undefined {
  const placeholderPath = resolveRuntimeLogPath(
    path.join(".growi-logs", "runtime", "placeholder.jsonl"),
    context,
  );
  return placeholderPath ? path.dirname(placeholderPath) : undefined;
}

function currentResolutionContext(): RuntimeLogResolutionContext {
  const runtimeRootFsPath = process.env.GROWI_RUNTIME_ROOT?.trim() || undefined;
  const workspaceFolder = vscode.workspace.workspaceFolders?.find(
    (folder) => folder.uri.scheme === "file",
  );
  const workspaceFile = (
    vscode.workspace as typeof vscode.workspace & {
      workspaceFile?: vscode.Uri;
    }
  ).workspaceFile;

  return {
    runtimeRootFsPath,
    workspaceFolderFsPath: workspaceFolder?.uri.fsPath,
    workspaceFileFsPath:
      workspaceFile?.scheme === "file" ? workspaceFile.fsPath : undefined,
  };
}

function isBaseUrlConfigured(): boolean {
  const configured = vscode.workspace
    .getConfiguration("growi")
    .get<string>("baseUrl");
  return Boolean(configured?.trim());
}

function isWorkspaceResolved(): boolean {
  const context = currentResolutionContext();
  return Boolean(context.workspaceFolderFsPath || context.workspaceFileFsPath);
}

function isRuntimeRootConfigured(): boolean {
  return Boolean(process.env.GROWI_RUNTIME_ROOT?.trim());
}

function formatRuntimeLogError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

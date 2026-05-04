import * as assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  const registeredCommands = new Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  >();
  return {
    registeredCommands,
    executeCommand: vi.fn(async () => undefined),
    openTextDocument: vi.fn(async (uri: { scheme: string }) => ({
      getText: () => (uri.scheme === "growi" ? "# Remote\n" : "# Local\n"),
    })),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(async () => undefined),
    workspaceFolders: [] as { uri: { fsPath: string }; name: string }[],
  };
});

vi.mock("vscode", () => ({
  Uri: {
    file: vi.fn((value: string) => ({
      fsPath: value,
      path: value,
      scheme: "file",
      toString: () => `file:${value}`,
    })),
    from: vi.fn((value: { scheme: string; path: string }) => ({
      ...value,
      toString: () => `${value.scheme}:${value.path}`,
    })),
  },
  commands: {
    executeCommand: vscodeMock.executeCommand,
    registerCommand: vi.fn(
      (command: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        vscodeMock.registeredCommands.set(command, handler);
        return { dispose: vi.fn() };
      },
    ),
  },
  window: {
    showErrorMessage: vscodeMock.showErrorMessage,
    showInformationMessage: vscodeMock.showInformationMessage,
    showWarningMessage: vscodeMock.showWarningMessage,
  },
  workspace: {
    get workspaceFolders() {
      return vscodeMock.workspaceFolders;
    },
    openTextDocument: vscodeMock.openTextDocument,
  },
}));

import { GROWI_COMMANDS } from "../../src/vscode/commandsConstants";
import { registerLlmSkillPackCommands } from "../../src/vscode/llmSkillPackCommands";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

beforeEach(() => {
  vscodeMock.registeredCommands.clear();
  vscodeMock.executeCommand.mockClear();
  vscodeMock.openTextDocument.mockClear();
  vscodeMock.showErrorMessage.mockClear();
  vscodeMock.showInformationMessage.mockClear();
  vscodeMock.showWarningMessage.mockClear();
  vscodeMock.workspaceFolders = [];
});

async function createWorkspace() {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "growifs-llm-command-"),
  );
  tempDirs.push(workspaceRoot);
  vscodeMock.workspaceFolders = [
    { uri: { fsPath: workspaceRoot }, name: "workspace" },
  ];
  return workspaceRoot;
}

describe("llmSkillPackCommands", () => {
  it("prepares diff context without executing compare or opening VS Code diff", async () => {
    const workspaceRoot = await createWorkspace();
    const localPath = path.join(workspaceRoot, ".growi-mirrors", "page.md");
    registerLlmSkillPackCommands({
      getMirrorCompareScmState: () => ({
        currentCanonicalPath: "/page",
        targetScope: "page",
        resources: [
          {
            canonicalPath: "/page",
            status: "LocalChanged",
            localFileUri: {
              scheme: "file",
              path: localPath,
              fsPath: localPath,
            },
            remoteUri: {
              scheme: "growi",
              path: "/page.md",
            },
          },
        ],
      }),
    });

    const command = vscodeMock.registeredCommands.get(
      GROWI_COMMANDS.createLlmLocalMirrorDiffContext,
    );
    assert.ok(command);

    const result = await command(workspaceRoot);

    assert.equal((result as { resourceCount: number }).resourceCount, 1);
    assert.equal(vscodeMock.executeCommand.mock.calls.length, 0);
    assert.deepEqual(
      vscodeMock.openTextDocument.mock.calls.map(([uri]) => uri.scheme),
      ["growi", "file"],
    );
    const prompt = await readFile(
      path.join(workspaceRoot, ".growi-agent", "diff", "current", "prompt.md"),
      "utf8",
    );
    assert.match(prompt, /\$growi-local-mirror-diff/);
    assert.match(prompt, /You are reading GROWI local mirror SCM diff context/);
  });
});

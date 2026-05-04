import * as vscode from "vscode";
import { GROWI_COMMANDS } from "./commandsConstants";
import { localize } from "./l10n";
import { createLlmLocalMirrorDiffContext } from "./llmDiffContextService";
import {
  ensureLlmGitignoreEntries,
  formatGitignoreWarning,
  installLlmSkillPack,
  startLlmEditSession,
} from "./llmSkillPackService";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./mirror/mirrorCompareScm";

export interface RegisterLlmSkillPackCommandsOptions {
  getMirrorCompareScmState?: () => MirrorCompareScmState | undefined;
}

interface LlmCommandOptions {
  taskText?: string;
  updateGitignore?: boolean;
}

export function registerLlmSkillPackCommands(
  options: RegisterLlmSkillPackCommandsOptions = {},
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      GROWI_COMMANDS.installLlmSkillPack,
      async (...args: unknown[]) => {
        const workspaceRoot = resolveWorkspaceRoot(args[0]);
        if (!workspaceRoot) {
          vscode.window.showErrorMessage(
            localize(
              "Open a workspace folder before using LLM Assist Kit commands.",
            ),
          );
          return undefined;
        }
        const result = await installLlmSkillPack(workspaceRoot);
        vscode.window.showInformationMessage(
          localize(
            "LLM Local Mirror Skills installed. files={0}",
            result.files.length,
          ),
        );
        return result;
      },
    ),
    vscode.commands.registerCommand(
      GROWI_COMMANDS.startLlmEditSession,
      async (...args: unknown[]) => {
        const workspaceRoot = resolveWorkspaceRoot(args[0]);
        if (!workspaceRoot) {
          vscode.window.showErrorMessage(
            localize(
              "Open a workspace folder before using LLM Assist Kit commands.",
            ),
          );
          return undefined;
        }
        const commandOptions = resolveCommandOptions(args);
        const gitignoreResult = await resolveGitignoreResult(
          workspaceRoot,
          commandOptions,
        );
        const result = await startLlmEditSession(workspaceRoot, {
          gitignoreWarning: formatGitignoreWarning(gitignoreResult),
          taskText: commandOptions.taskText,
          uiLabels: localizedCommandLabels(),
        });
        vscode.window.showInformationMessage(
          localize(
            "LLM Local Mirror Prompt prepared. editable={0}",
            result.editableFiles.length,
          ),
        );
        if (!result.manifestFound || result.editableFiles.length === 0) {
          vscode.window.showWarningMessage(
            localize("Sync local mirror before editing."),
          );
        }
        return result;
      },
    ),
    vscode.commands.registerCommand(
      GROWI_COMMANDS.createLlmLocalMirrorDiffContext,
      async (...args: unknown[]) => {
        const workspaceRoot = resolveWorkspaceRoot(args[0]);
        if (!workspaceRoot) {
          vscode.window.showErrorMessage(
            localize(
              "Open a workspace folder before using LLM Assist Kit commands.",
            ),
          );
          return undefined;
        }
        const explicitState = isMirrorCompareScmState(args[1])
          ? args[1]
          : undefined;
        const state = explicitState ?? options.getMirrorCompareScmState?.();
        if (!state || state.resources.length === 0) {
          vscode.window.showWarningMessage(
            localize(
              "Run Compare Local Mirror with GROWI or Compare Again first.",
            ),
          );
          return undefined;
        }
        const result = await createLlmLocalMirrorDiffContext(
          workspaceRoot,
          state,
          {
            readResourceText,
            uiLabels: localizedCommandLabels(),
          },
        );
        vscode.window.showInformationMessage(
          localize(
            "LLM Local Mirror Diff prepared. resources={0}",
            result.resourceCount,
          ),
        );
        return result;
      },
    ),
  ];
}

async function resolveGitignoreResult(
  workspaceRoot: string,
  options: LlmCommandOptions,
) {
  if (typeof options.updateGitignore === "boolean") {
    return await ensureLlmGitignoreEntries(
      workspaceRoot,
      options.updateGitignore,
    );
  }
  const current = await ensureLlmGitignoreEntries(workspaceRoot, false);
  if (current.missingEntries.length === 0) {
    return current;
  }

  const add = localize("Add");
  const selected = await vscode.window.showWarningMessage(
    localize("Add {0} to .gitignore?", current.missingEntries.join(", ")),
    add,
    localize("Skip"),
  );
  if (selected === add) {
    return await ensureLlmGitignoreEntries(workspaceRoot, true);
  }
  return current;
}

function resolveWorkspaceRoot(candidate: unknown): string | undefined {
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  if (candidate instanceof vscode.Uri && candidate.scheme === "file") {
    return candidate.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveCommandOptions(args: readonly unknown[]): LlmCommandOptions {
  const candidate =
    typeof args[0] === "string" || args[0] instanceof vscode.Uri
      ? args[1]
      : args[0];
  return isRecord(candidate) ? candidate : {};
}

function localizedCommandLabels() {
  return {
    growiApply: localize("Apply to GROWI"),
    takeRemote: localize("Take Remote Changes"),
  };
}

async function readResourceText(
  resource: MirrorCompareScmResource,
  side: "local" | "remote",
): Promise<string> {
  const uriLike = side === "local" ? resource.localFileUri : resource.remoteUri;
  const document = await vscode.workspace.openTextDocument(
    toVscodeUri(uriLike),
  );
  return document.getText();
}

function toVscodeUri(uriLike: {
  scheme: string;
  path: string;
  fsPath?: string;
}) {
  if (uriLike.scheme === "file") {
    return vscode.Uri.file(uriLike.fsPath ?? uriLike.path);
  }
  return vscode.Uri.from({
    scheme: uriLike.scheme,
    path: uriLike.path,
  });
}

function isMirrorCompareScmState(
  value: unknown,
): value is MirrorCompareScmState {
  return (
    isRecord(value) &&
    typeof value.currentCanonicalPath === "string" &&
    (value.targetScope === "page" || value.targetScope === "subtree") &&
    Array.isArray(value.resources)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

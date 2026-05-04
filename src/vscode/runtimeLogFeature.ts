import { readdir, rm } from "node:fs/promises";
import * as vscode from "vscode";
import { registerRuntimeLogCommands } from "./commandRegistration";
import { GROWI_COMMANDS } from "./commandsConstants";
import { localize } from "./l10n";
import type { RuntimeLogger } from "./runtimeLogger";

export interface RuntimeLogFeatureDependencies {
  runtimeLogger: RuntimeLogger;
  runtimeLogsEnabled: boolean;
}

export function registerRuntimeLogFeature({
  runtimeLogger,
  runtimeLogsEnabled,
}: RuntimeLogFeatureDependencies): vscode.Disposable {
  return registerRuntimeLogCommands([
    {
      commandId: GROWI_COMMANDS.clearRuntimeLogs,
      handler: async () => {
        if (!runtimeLogsEnabled) {
          void vscode.window.showInformationMessage(
            localize("Runtime logs are available only in debug-f5 mode."),
          );
          return 0;
        }

        const directory = runtimeLogger.getResolvedRuntimeLogDirectory();
        if (!directory) {
          const status = runtimeLogger.getRuntimeLogStatus();
          void vscode.window.showInformationMessage(
            localize(
              "Runtime log path is not resolved yet. mode={0} configuredPath={1} workspaceResolved={2}",
              status.mode,
              status.configuredPath,
              status.workspaceResolved,
            ),
          );
          return 0;
        }

        let removed = 0;
        try {
          const entries = await readdir(directory, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".jsonl")) {
              await rm(
                vscode.Uri.joinPath(vscode.Uri.file(directory), entry.name)
                  .fsPath,
                { force: true },
              );
              removed += 1;
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }

        runtimeLogger.resetRuntimeLogState();
        void vscode.window.showInformationMessage(
          localize("Removed {0} runtime log file(s).", removed),
        );
        return removed;
      },
    },
    {
      commandId: GROWI_COMMANDS.revealRuntimeLogs,
      handler: async () => {
        if (!runtimeLogsEnabled) {
          void vscode.window.showInformationMessage(
            localize("Runtime logs are available only in debug-f5 mode."),
          );
          return;
        }

        const directory = runtimeLogger.getResolvedRuntimeLogDirectory();
        if (!directory) {
          const status = runtimeLogger.getRuntimeLogStatus();
          void vscode.window.showInformationMessage(
            localize(
              "Runtime log path is not resolved yet. mode={0} configuredPath={1} workspaceResolved={2}",
              status.mode,
              status.configuredPath,
              status.workspaceResolved,
            ),
          );
          return;
        }

        await vscode.env.openExternal(vscode.Uri.file(directory));
        return directory;
      },
    },
  ]);
}

import * as vscode from "vscode";

type CommandHandler = Parameters<typeof vscode.commands.registerCommand>[1];

export type CommandRegistrar = (
  commandId: string,
  handler: CommandHandler,
) => vscode.Disposable;

export interface CommandRegistrationSpec {
  commandId: string;
  handler: CommandHandler;
  registrar?: CommandRegistrar;
}

export function combineDisposables(
  disposables: readonly vscode.Disposable[],
): vscode.Disposable {
  return {
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

function registerCommandSpecs(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return combineDisposables(
    specs.map(({ commandId, handler, registrar }) =>
      (registrar ?? vscode.commands.registerCommand)(commandId, handler),
    ),
  );
}

export function registerBookmarkCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerCurrentPageCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerExplorerCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerMirrorCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerNavigationCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerPrefixCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

export function registerRuntimeLogCommands(
  specs: readonly CommandRegistrationSpec[],
): vscode.Disposable {
  return registerCommandSpecs(specs);
}

import * as vscode from "vscode";

import { buildGrowiUriFromInput } from "../core/uri";
import { combineDisposables } from "./commandRegistration";
import { GROWI_COMMANDS } from "./commandsConstants";
import { createGrowiDocumentSymbolProvider } from "./documentSymbols";
import {
  collectDrawioAutoFoldSelectionLines,
  createDrawioFoldingRangeProvider,
} from "./drawioFolding";
import type { GrowiEditSessionRegistry } from "./editSessionRegistry";
import {
  collectGrowiLinkDiagnostics,
  createGrowiDefinitionProvider,
  createGrowiDocumentLinkProvider,
  type GrowiLinkNavigationDeps,
} from "./linkNavigation";
import type { PageFreshnessService } from "./pageFreshnessService";
import type { GrowiPrefixTreeDataProvider } from "./prefixTree";

interface DocumentProviderFeatureDependencies extends GrowiLinkNavigationDeps {
  editSessionRegistry: Pick<
    GrowiEditSessionRegistry,
    "getEditSession" | "updateEditSession" | "onDidChange"
  >;
  fileSystemProvider: {
    fireFileChangedForCanonicalPath(canonicalPath: string): void;
  };
  mirrorRemoteMetadataChecker: {
    checkCurrentLocalChangedResources(): Promise<boolean>;
  };
  pageFreshnessService: PageFreshnessService;
  prefixTreeDataProvider: Pick<
    GrowiPrefixTreeDataProvider,
    "clearStaleState" | "setPageDecorationStatus" | "refresh"
  >;
}

export interface DocumentProviderFeature {
  disposable: vscode.Disposable;
  reevaluateActiveGrowiPageStatus(): Promise<void>;
}

const noopDisposable: vscode.Disposable = { dispose() {} };

export function registerDocumentProviderFeature(
  deps: DocumentProviderFeatureDependencies,
): DocumentProviderFeature {
  const vscodeModule = vscode as unknown as Record<string, unknown>;
  const languagesApi = Object.hasOwn(vscodeModule, "languages")
    ? (vscodeModule.languages as
        | {
            createDiagnosticCollection?: (
              name?: string,
            ) => vscode.DiagnosticCollection;
            registerDefinitionProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DefinitionProvider,
            ) => vscode.Disposable;
            registerDocumentLinkProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DocumentLinkProvider,
            ) => vscode.Disposable;
            registerDocumentSymbolProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DocumentSymbolProvider,
            ) => vscode.Disposable;
            registerFoldingRangeProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.FoldingRangeProvider,
            ) => vscode.Disposable;
          }
        | undefined)
    : undefined;
  const workspaceApi = vscode.workspace as unknown as {
    onDidOpenTextDocument?: (
      listener: (document: vscode.TextDocument) => unknown,
    ) => vscode.Disposable;
    onDidChangeTextDocument?: (
      listener: (event: { document: vscode.TextDocument }) => unknown,
    ) => vscode.Disposable;
    onDidCloseTextDocument?: (
      listener: (document: vscode.TextDocument) => unknown,
    ) => vscode.Disposable;
    textDocuments?: readonly vscode.TextDocument[];
  };
  const windowApi = vscode.window as unknown as {
    activeTextEditor?: vscode.TextEditor;
    createStatusBarItem?: (
      id?: string,
      alignment?: vscode.StatusBarAlignment,
      priority?: number,
    ) => vscode.StatusBarItem;
    onDidChangeActiveTextEditor?: (
      listener: (editor: vscode.TextEditor | undefined) => unknown,
    ) => vscode.Disposable;
    onDidChangeWindowState?: (
      listener: (state: { focused: boolean }) => unknown,
    ) => vscode.Disposable;
  };

  const documentLinkProviderDisposable =
    languagesApi?.registerDocumentLinkProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDocumentLinkProvider(deps),
    ) ?? noopDisposable;
  const definitionProviderDisposable =
    languagesApi?.registerDefinitionProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDefinitionProvider(deps),
    ) ?? noopDisposable;
  const documentSymbolProviderDisposable =
    languagesApi?.registerDocumentSymbolProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDocumentSymbolProvider(),
    ) ?? noopDisposable;
  const drawioFoldingRangeProviderDisposable =
    languagesApi?.registerFoldingRangeProvider?.(
      { language: "markdown", scheme: "growi" },
      createDrawioFoldingRangeProvider(),
    ) ?? noopDisposable;
  const diagnosticsCollection =
    languagesApi?.createDiagnosticCollection?.("growi-link-navigation") ??
    undefined;
  const drawioAutoFoldedDocumentUris = new Set<string>();

  const updateLinkDiagnostics = (document: vscode.TextDocument) => {
    if (
      !diagnosticsCollection ||
      document.uri.scheme !== "growi" ||
      document.languageId !== "markdown"
    ) {
      return;
    }

    void collectGrowiLinkDiagnostics(document, deps).then((diagnostics) => {
      diagnosticsCollection.set(document.uri, diagnostics);
    });
  };

  const clearLinkDiagnostics = (document: vscode.TextDocument) => {
    if (!diagnosticsCollection || document.uri.scheme !== "growi") {
      return;
    }

    diagnosticsCollection.delete(document.uri);
  };

  const updateEditSessionDirty = (document: vscode.TextDocument) => {
    if (document.uri.scheme !== "growi" || document.languageId !== "markdown") {
      return;
    }

    const editSession = deps.editSessionRegistry.getEditSession(
      document.uri.path,
    );
    if (!editSession) {
      return;
    }

    const dirty = document.getText() !== editSession.baseBody;
    deps.editSessionRegistry.updateEditSession(
      document.uri.path,
      (session) => ({
        ...session,
        dirty,
      }),
    );
  };
  const editStatusBarItem =
    windowApi.createStatusBarItem?.(
      "growi.editSessionStatus",
      vscode.StatusBarAlignment.Left,
      100,
    ) ?? undefined;

  const isGrowiFilePage = (document: vscode.TextDocument | undefined) =>
    Boolean(
      document &&
        document.uri.scheme === "growi" &&
        document.uri.path !== "/" &&
        !document.uri.path.endsWith("/"),
    );
  const isGrowiMarkdownPage = (document: vscode.TextDocument | undefined) =>
    Boolean(isGrowiFilePage(document) && document?.languageId === "markdown");

  const maybeAutoFoldDrawioDocument = async (
    editor: vscode.TextEditor | undefined = windowApi.activeTextEditor,
  ) => {
    if (!editor || !isGrowiMarkdownPage(editor.document)) {
      return;
    }

    const documentUri = editor.document.uri.toString();
    if (drawioAutoFoldedDocumentUris.has(documentUri)) {
      return;
    }

    const selectionLines = collectDrawioAutoFoldSelectionLines(editor.document);
    if (selectionLines.length === 0) {
      return;
    }

    drawioAutoFoldedDocumentUris.add(documentUri);
    try {
      await vscode.commands.executeCommand("editor.fold", { selectionLines });
    } catch {
      drawioAutoFoldedDocumentUris.delete(documentUri);
    }
  };

  const updateEditStatusBar = (
    editor: vscode.TextEditor | undefined = windowApi.activeTextEditor,
  ) => {
    if (!editStatusBarItem || !editor) {
      editStatusBarItem?.hide();
      return;
    }

    const { document } = editor;
    if (document.uri.scheme !== "growi") {
      editStatusBarItem.hide();
      return;
    }

    if (document.uri.path === "/" || document.uri.path.endsWith("/")) {
      editStatusBarItem.hide();
      return;
    }

    const isEditing = Boolean(
      deps.editSessionRegistry.getEditSession(document.uri.path),
    );
    editStatusBarItem.text = isEditing ? "$(unlock) 編集中" : "$(lock) 閲覧中";
    editStatusBarItem.command = isEditing
      ? GROWI_COMMANDS.endEdit
      : GROWI_COMMANDS.startEdit;
    editStatusBarItem.show();
  };

  const resolveGrowiPageCanonicalPath = (
    document: vscode.TextDocument | undefined,
  ): string | undefined => {
    if (!document || document.uri.scheme !== "growi") {
      return undefined;
    }
    if (!document.uri.path.endsWith(".md")) {
      return undefined;
    }

    const normalized = buildGrowiUriFromInput(document.uri.path);
    if (!normalized.ok || normalized.value.canonicalPath === "/") {
      return undefined;
    }

    return normalized.value.canonicalPath;
  };

  async function updatePageLiveStatus(
    document: vscode.TextDocument | undefined,
  ): Promise<void> {
    const canonicalPath = resolveGrowiPageCanonicalPath(document);
    if (!canonicalPath) {
      return;
    }

    const liveState =
      await deps.pageFreshnessService.getOpenedPageLiveState(canonicalPath);
    if (liveState.decorationStatus === "none") {
      deps.prefixTreeDataProvider.clearStaleState(canonicalPath);
    } else {
      deps.prefixTreeDataProvider.setPageDecorationStatus(
        canonicalPath,
        liveState.decorationStatus,
      );
    }
    deps.prefixTreeDataProvider.refresh();
  }

  async function reevaluateActiveGrowiPageStatus(): Promise<void> {
    await updatePageLiveStatus(windowApi.activeTextEditor?.document);
  }

  for (const document of workspaceApi.textDocuments ?? []) {
    updateLinkDiagnostics(document);
  }
  updateEditStatusBar();
  void maybeAutoFoldDrawioDocument();

  const onDidOpenTextDocumentDisposable =
    workspaceApi.onDidOpenTextDocument?.((document) => {
      updateLinkDiagnostics(document);
      if (
        windowApi.activeTextEditor?.document.uri.toString() ===
        document.uri.toString()
      ) {
        void maybeAutoFoldDrawioDocument(windowApi.activeTextEditor);
      }
    }) ?? noopDisposable;
  const onDidChangeTextDocumentDisposable =
    workspaceApi.onDidChangeTextDocument?.((event) => {
      updateLinkDiagnostics(event.document);
      updateEditSessionDirty(event.document);
      void reevaluateActiveGrowiPageStatus();
    }) ?? noopDisposable;
  const onDidCloseTextDocumentDisposable =
    workspaceApi.onDidCloseTextDocument?.((document) => {
      clearLinkDiagnostics(document);
      drawioAutoFoldedDocumentUris.delete(document.uri.toString());
    }) ?? noopDisposable;
  const onDidChangeActiveTextEditorDisposable =
    windowApi.onDidChangeActiveTextEditor?.((editor) => {
      updateEditStatusBar(editor);
      void maybeAutoFoldDrawioDocument(editor);
      void updatePageLiveStatus(editor?.document);
    }) ?? noopDisposable;
  const onDidChangeWindowStateDisposable =
    windowApi.onDidChangeWindowState?.((state) => {
      if (state.focused) {
        void deps.mirrorRemoteMetadataChecker.checkCurrentLocalChangedResources();
      }
    }) ?? noopDisposable;
  const onDidChangeEditSessionDisposable = deps.editSessionRegistry.onDidChange(
    (event) => {
      updateEditStatusBar();
      if (event.kind === "set" || event.kind === "close") {
        deps.fileSystemProvider.fireFileChangedForCanonicalPath(
          event.canonicalPath,
        );
        void reevaluateActiveGrowiPageStatus();
      }
    },
  );

  const diagnosticsRegistrationsDisposable = combineDisposables([
    documentLinkProviderDisposable,
    definitionProviderDisposable,
    documentSymbolProviderDisposable,
    drawioFoldingRangeProviderDisposable,
    {
      dispose() {
        diagnosticsCollection?.dispose();
      },
    },
  ]);
  const editorEventDisposables = combineDisposables([
    onDidOpenTextDocumentDisposable,
    onDidChangeTextDocumentDisposable,
    onDidCloseTextDocumentDisposable,
    onDidChangeActiveTextEditorDisposable,
    onDidChangeWindowStateDisposable,
    onDidChangeEditSessionDisposable,
    {
      dispose() {
        editStatusBarItem?.dispose();
      },
    },
  ]);

  return {
    disposable: combineDisposables([
      diagnosticsRegistrationsDisposable,
      editorEventDisposables,
    ]),
    reevaluateActiveGrowiPageStatus,
  };
}

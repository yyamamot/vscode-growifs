import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

function createDisposable() {
  return { dispose: vi.fn() };
}

type ListenerStore = {
  onDidChangeTextDocument?: (event: { document: MockTextDocument }) => void;
  onDidChangeActiveTextEditor?: (
    editor: { document: MockTextDocument } | undefined,
  ) => void;
  onDidOpenTextDocument?: (document: MockTextDocument) => void;
  onDidCloseTextDocument?: (document: MockTextDocument) => void;
};

type MockTextDocument = {
  uri: { scheme: string; path: string; toString(): string };
  languageId: string;
  getText(): string;
};

type MockEditSession = {
  pageId: string;
  baseRevisionId: string;
  baseUpdatedAt: string;
  baseBody: string;
  enteredAt: string;
  dirty: boolean;
};

const listenerStore = vi.hoisted<ListenerStore>(() => ({}));

const vscodeSpies = vi.hoisted(() => ({
  createStatusBarItem: vi.fn(() => ({
    command: undefined,
    text: "",
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  createDiagnosticCollection: vi.fn(() => ({
    delete: vi.fn(),
    dispose: vi.fn(),
    set: vi.fn(),
  })),
  executeCommand: vi.fn(async () => {}),
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
  onDidChangeTextDocument: vi.fn(
    (listener: (event: { document: MockTextDocument }) => unknown) => {
      listenerStore.onDidChangeTextDocument = listener;
      return createDisposable();
    },
  ),
  onDidCloseTextDocument: vi.fn(
    (listener: (document: MockTextDocument) => unknown) => {
      listenerStore.onDidCloseTextDocument = listener;
      return createDisposable();
    },
  ),
  onDidChangeActiveTextEditor: vi.fn(
    (
      listener: (editor: { document: MockTextDocument } | undefined) => unknown,
    ) => {
      listenerStore.onDidChangeActiveTextEditor = listener;
      return createDisposable();
    },
  ),
  onDidOpenTextDocument: vi.fn(
    (listener: (document: MockTextDocument) => unknown) => {
      listenerStore.onDidOpenTextDocument = listener;
      return createDisposable();
    },
  ),
  registerCommand: vi.fn(createDisposable),
  registerDefinitionProvider: vi.fn(createDisposable),
  registerDocumentLinkProvider: vi.fn(createDisposable),
  registerDocumentSymbolProvider: vi.fn(createDisposable),
  registerFoldingRangeProvider: vi.fn(createDisposable),
  registerFileSystemProvider: vi.fn(createDisposable),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(),
}));

const registryMock = vi.hoisted(() => {
  const sessions = new Map<string, MockEditSession>();
  const changeListeners = new Set<(event: unknown) => void>();

  function normalizePath(path: string): string | undefined {
    const trimmed = path.trim();
    if (!trimmed.startsWith("/")) {
      return undefined;
    }

    let normalized = trimmed.replace(/\/{2,}/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    if (normalized.length > 1 && normalized.endsWith(".md")) {
      normalized = normalized.slice(0, -3);
    }

    return normalized;
  }

  const setEditSession = vi.fn(
    (canonicalPath: string, editSession: MockEditSession) => {
      const normalized = normalizePath(canonicalPath);
      if (!normalized) {
        return;
      }
      sessions.set(normalized, editSession);
      for (const listener of changeListeners) {
        listener({ canonicalPath: normalized, kind: "set" });
      }
    },
  );

  const getEditSession = vi.fn(
    (canonicalPath: string): MockEditSession | undefined => {
      const normalized = normalizePath(canonicalPath);
      if (!normalized) {
        return undefined;
      }
      return sessions.get(normalized);
    },
  );

  const updateEditSession = vi.fn(
    (
      canonicalPath: string,
      updater: (editSession: MockEditSession) => MockEditSession,
    ) => {
      const normalized = normalizePath(canonicalPath);
      if (!normalized) {
        return;
      }

      const current = sessions.get(normalized);
      if (!current) {
        return;
      }

      sessions.set(normalized, updater(current));
      for (const listener of changeListeners) {
        listener({ canonicalPath: normalized, kind: "update" });
      }
    },
  );

  const closeEditSession = vi.fn((canonicalPath: string) => {
    const normalized = normalizePath(canonicalPath);
    if (!normalized) {
      return;
    }
    if (!sessions.delete(normalized)) {
      return;
    }
    for (const listener of changeListeners) {
      listener({ canonicalPath: normalized, kind: "close" });
    }
  });
  const onDidChange = vi.fn((listener: (event: unknown) => void) => {
    changeListeners.add(listener);
    return {
      dispose: vi.fn(() => {
        changeListeners.delete(listener);
      }),
    };
  });

  return {
    sessions,
    reset() {
      sessions.clear();
      changeListeners.clear();
      setEditSession.mockClear();
      getEditSession.mockClear();
      updateEditSession.mockClear();
      closeEditSession.mockClear();
      onDidChange.mockClear();
    },
    createRegistry() {
      return {
        setEditSession,
        getEditSession,
        updateEditSession,
        closeEditSession,
        onDidChange,
      };
    },
    setEditSession,
    getEditSession,
    updateEditSession,
    closeEditSession,
    onDidChange,
  };
});

vi.mock("../../src/vscode/editSessionRegistry", () => ({
  createEditSessionRegistry: vi.fn(() => registryMock.createRegistry()),
}));

vi.mock("vscode", () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  }

  class Range {
    constructor(
      public readonly start: Position,
      public readonly end: Position,
    ) {}

    contains(position: Position): boolean {
      return (
        position.line === this.start.line &&
        position.line === this.end.line &&
        position.character >= this.start.character &&
        position.character <= this.end.character
      );
    }
  }

  class DocumentLink {
    constructor(
      public readonly range: Range,
      public readonly target?: { toString(): string },
    ) {}
  }

  class Location {
    constructor(
      public readonly uri: { toString(): string },
      public readonly position: Position,
    ) {}
  }

  class Diagnostic {
    constructor(
      public readonly range: Range,
      public readonly message: string,
      public readonly severity: number,
    ) {}
  }

  class EventEmitter<T> {
    readonly event = vi.fn();
    fire(_event: T): void {}
    dispose(): void {}
  }

  return {
    commands: {
      executeCommand: vscodeSpies.executeCommand,
      registerCommand: vscodeSpies.registerCommand,
    },
    ConfigurationTarget: {
      Global: "Global",
    },
    Diagnostic,
    DiagnosticSeverity: {
      Information: 2,
      Warning: 1,
    },
    DocumentLink,
    EventEmitter,
    FileChangeType: {
      Changed: 1,
    },
    FileSystemError: {
      FileNotFound: vi.fn((value) => value),
      NoPermissions: vi.fn((value) => value),
      Unavailable: vi.fn((value) => value),
    },
    FileType: {
      Directory: 2,
      File: 1,
    },
    languages: {
      createDiagnosticCollection: vscodeSpies.createDiagnosticCollection,
      registerDefinitionProvider: vscodeSpies.registerDefinitionProvider,
      registerDocumentLinkProvider: vscodeSpies.registerDocumentLinkProvider,
      registerFoldingRangeProvider: vscodeSpies.registerFoldingRangeProvider,
      registerDocumentSymbolProvider:
        vscodeSpies.registerDocumentSymbolProvider,
    },
    Location,
    Position,
    Range,
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    Uri: {
      from: vi.fn((value: { scheme: string; path: string }) => ({
        ...value,
        toString: () => `${value.scheme}:${value.path}`,
      })),
      parse: vi.fn((value: string) => ({
        value,
        toString: () => value,
      })),
    },
    window: {
      activeTextEditor: undefined,
      createStatusBarItem: vscodeSpies.createStatusBarItem,
      onDidChangeActiveTextEditor: vscodeSpies.onDidChangeActiveTextEditor,
      showErrorMessage: vscodeSpies.showErrorMessage,
      showInformationMessage: vscodeSpies.showInformationMessage,
      showInputBox: vscodeSpies.showInputBox,
    },
    workspace: {
      getConfiguration: vscodeSpies.getConfiguration,
      onDidChangeTextDocument: vscodeSpies.onDidChangeTextDocument,
      onDidCloseTextDocument: vscodeSpies.onDidCloseTextDocument,
      onDidOpenTextDocument: vscodeSpies.onDidOpenTextDocument,
      registerFileSystemProvider: vscodeSpies.registerFileSystemProvider,
      textDocuments: [],
    },
  };
});

import { activate } from "../../src/extension";

function createSession(overrides?: Partial<MockEditSession>): MockEditSession {
  return {
    pageId: "page-id",
    baseRevisionId: "revision-id",
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    baseBody: "base body",
    enteredAt: "2026-01-01T00:00:00.000Z",
    dirty: false,
    ...overrides,
  };
}

function createDocument(
  overrides?: Partial<MockTextDocument>,
): MockTextDocument {
  return {
    uri: {
      scheme: "growi",
      path: "/team/dev/page.md",
      toString: () => "growi:/team/dev/page.md",
    },
    languageId: "markdown",
    getText: () => "base body",
    ...overrides,
  };
}

function setActiveTextEditor(
  editor: { document: MockTextDocument } | undefined,
) {
  (
    vscode.window as unknown as {
      activeTextEditor?: { document: MockTextDocument };
    }
  ).activeTextEditor = editor;
}

function createStateStore() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string, defaultValue?: unknown) =>
      store.has(key) ? store.get(key) : defaultValue,
    ),
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

describe("edit session dirty tracking", () => {
  beforeEach(() => {
    registryMock.reset();
    listenerStore.onDidChangeTextDocument = undefined;
    listenerStore.onDidChangeActiveTextEditor = undefined;
    listenerStore.onDidOpenTextDocument = undefined;
    listenerStore.onDidCloseTextDocument = undefined;
    vscodeSpies.createStatusBarItem.mockClear();
    vscodeSpies.onDidChangeTextDocument.mockClear();
    vscodeSpies.onDidChangeActiveTextEditor.mockClear();
    vscodeSpies.onDidOpenTextDocument.mockClear();
    vscodeSpies.onDidCloseTextDocument.mockClear();
    vscodeSpies.executeCommand.mockClear();
    vscodeSpies.getConfiguration.mockReturnValue({
      get: vi.fn((key: string) =>
        key === "baseUrl" ? "https://growi.example.com/" : undefined,
      ),
      update: vi.fn(),
    });
    setActiveTextEditor(undefined);
  });

  it("updates dirty=true when tracked growi markdown body diverges from baseBody", () => {
    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    registryMock.setEditSession(
      "/team/dev/page",
      createSession({ dirty: false }),
    );

    listenerStore.onDidChangeTextDocument?.({
      document: createDocument({ getText: () => "edited body" }),
    });

    expect(registryMock.updateEditSession).toHaveBeenCalledTimes(1);
    expect(registryMock.getEditSession("/team/dev/page")?.dirty).toBe(true);
  });

  it("updates dirty=false when tracked growi markdown body matches baseBody", () => {
    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    registryMock.setEditSession(
      "/team/dev/page",
      createSession({ dirty: true }),
    );

    listenerStore.onDidChangeTextDocument?.({
      document: createDocument({ getText: () => "base body" }),
    });

    expect(registryMock.updateEditSession).toHaveBeenCalledTimes(1);
    expect(registryMock.getEditSession("/team/dev/page")?.dirty).toBe(false);
  });

  it("ignores document changes when no edit session exists", () => {
    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    listenerStore.onDidChangeTextDocument?.({
      document: createDocument({
        uri: {
          scheme: "growi",
          path: "/team/dev/no-session.md",
          toString: () => "growi:/team/dev/no-session.md",
        },
      }),
    });

    expect(registryMock.updateEditSession).not.toHaveBeenCalled();
  });

  it("does not auto-close edit session on close events", () => {
    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    registryMock.setEditSession("/team/dev/page", createSession());

    listenerStore.onDidCloseTextDocument?.(createDocument());

    expect(registryMock.closeEditSession).not.toHaveBeenCalled();
    expect(registryMock.getEditSession("/team/dev/page")).toBeDefined();
  });

  it("shows lock status text for active growi page and switches with edit session state", () => {
    const activeEditor = { document: createDocument() };
    setActiveTextEditor(activeEditor);
    const workspaceState = createStateStore();

    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    const statusBarItem = vscodeSpies.createStatusBarItem.mock.results[0]
      ?.value as
      | {
          command?: string;
          text: string;
          show: ReturnType<typeof vi.fn>;
          hide: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(statusBarItem).toBeDefined();
    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe("growi.startEdit");
    expect(statusBarItem?.show).toHaveBeenCalled();

    registryMock.setEditSession("/team/dev/page", createSession());
    expect(statusBarItem?.text).toBe("$(unlock) 編集中");
    expect(statusBarItem?.command).toBe("growi.endEdit");

    registryMock.closeEditSession("/team/dev/page");
    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe("growi.startEdit");
  });

  it("hides status bar when active editor is non-growi, directory, or root", () => {
    setActiveTextEditor({ document: createDocument() });
    const workspaceState = createStateStore();

    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    const statusBarItem = vscodeSpies.createStatusBarItem.mock.results[0]
      ?.value as { hide: ReturnType<typeof vi.fn> } | undefined;
    expect(statusBarItem).toBeDefined();

    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        uri: {
          scheme: "file",
          path: "/tmp/file.md",
          toString: () => "file:/tmp/file.md",
        },
      }),
    });
    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        uri: {
          scheme: "growi",
          path: "/team/dev/",
          toString: () => "growi:/team/dev/",
        },
      }),
    });
    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        uri: {
          scheme: "growi",
          path: "/",
          toString: () => "growi:/",
        },
      }),
    });

    expect(statusBarItem?.hide).toHaveBeenCalledTimes(3);
  });

  it("tracks active editor changes and reflects each page session state", () => {
    const page1 = createDocument({
      uri: {
        scheme: "growi",
        path: "/team/dev/page-1.md",
        toString: () => "growi:/team/dev/page-1.md",
      },
    });
    const page2 = createDocument({
      uri: {
        scheme: "growi",
        path: "/team/dev/page-2.md",
        toString: () => "growi:/team/dev/page-2.md",
      },
    });

    setActiveTextEditor({ document: page1 });
    const workspaceState = createStateStore();

    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    const statusBarItem = vscodeSpies.createStatusBarItem.mock.results[0]
      ?.value as
      | {
          command?: string;
          text: string;
          show: ReturnType<typeof vi.fn>;
          hide: ReturnType<typeof vi.fn>;
        }
      | undefined;

    expect(statusBarItem).toBeDefined();
    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe("growi.startEdit");

    registryMock.setEditSession("/team/dev/page-1", createSession());
    expect(statusBarItem?.text).toBe("$(unlock) 編集中");
    expect(statusBarItem?.command).toBe("growi.endEdit");

    const page2Editor = { document: page2 };
    setActiveTextEditor(page2Editor);
    listenerStore.onDidChangeActiveTextEditor?.(page2Editor);
    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe("growi.startEdit");

    registryMock.setEditSession("/team/dev/page-2", createSession());
    expect(statusBarItem?.text).toBe("$(unlock) 編集中");
    expect(statusBarItem?.command).toBe("growi.endEdit");

    const nonGrowiEditor = {
      document: createDocument({
        uri: {
          scheme: "file",
          path: "/tmp/note.md",
          toString: () => "file:/tmp/note.md",
        },
      }),
    };
    setActiveTextEditor(nonGrowiEditor);
    listenerStore.onDidChangeActiveTextEditor?.(nonGrowiEditor);
    expect(statusBarItem?.hide).toHaveBeenCalled();

    const page1Editor = { document: page1 };
    setActiveTextEditor(page1Editor);
    listenerStore.onDidChangeActiveTextEditor?.(page1Editor);
    expect(statusBarItem?.text).toBe("$(unlock) 編集中");
    expect(statusBarItem?.command).toBe("growi.endEdit");

    registryMock.closeEditSession("/team/dev/page-1");
    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe("growi.startEdit");
  });

  it("auto-folds drawio fences only once per open growi markdown document", async () => {
    const document = createDocument({
      getText: () => ["```drawio", "content", "```"].join("\n"),
    });
    const editor = { document };
    setActiveTextEditor(editor);

    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);

    await vi.waitFor(() => {
      expect(vscodeSpies.executeCommand).toHaveBeenCalledWith("editor.fold", {
        selectionLines: [0],
      });
    });

    vscodeSpies.executeCommand.mockClear();

    listenerStore.onDidChangeActiveTextEditor?.(editor);
    listenerStore.onDidOpenTextDocument?.(document);

    expect(vscodeSpies.executeCommand).not.toHaveBeenCalled();

    listenerStore.onDidCloseTextDocument?.(document);
    listenerStore.onDidChangeActiveTextEditor?.(editor);

    await vi.waitFor(() => {
      expect(vscodeSpies.executeCommand).toHaveBeenCalledWith("editor.fold", {
        selectionLines: [0],
      });
    });
  });

  it("does not auto-fold non-growi, non-markdown, or directory documents", async () => {
    const workspaceState = createStateStore();
    activate({
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
      workspaceState,
      globalState: createStateStore(),
    } as never);
    vscodeSpies.executeCommand.mockClear();

    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        uri: {
          scheme: "file",
          path: "/tmp/file.md",
          toString: () => "file:/tmp/file.md",
        },
        getText: () => ["```drawio", "content", "```"].join("\n"),
      }),
    });
    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        languageId: "plaintext",
        getText: () => ["```drawio", "content", "```"].join("\n"),
      }),
    });
    listenerStore.onDidChangeActiveTextEditor?.({
      document: createDocument({
        uri: {
          scheme: "growi",
          path: "/team/dev/",
          toString: () => "growi:/team/dev/",
        },
        getText: () => ["```drawio", "content", "```"].join("\n"),
      }),
    });

    await Promise.resolve();

    expect(vscodeSpies.executeCommand).not.toHaveBeenCalled();
  });
});

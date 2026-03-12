import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeSpies = vi.hoisted(() => ({
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
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerDocumentLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerFoldingRangeProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(),
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
  }

  class DocumentSymbol {
    readonly children: DocumentSymbol[] = [];

    constructor(
      public readonly name: string,
      public readonly detail: string,
      public readonly kind: number,
      public readonly range: Range,
      public readonly selectionRange: Range,
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
    DocumentSymbol,
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
    Position,
    Range,
    SymbolKind: {
      Namespace: 3,
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
import { collectAtxHeadingSymbols } from "../../src/vscode/documentSymbols";

function createDocument(text: string) {
  return {
    getText() {
      return text;
    },
  };
}

describe("collectAtxHeadingSymbols", () => {
  it("builds heading hierarchy from ATX headings", () => {
    const symbols = collectAtxHeadingSymbols(
      createDocument("# Root\n## Child\n### Grandchild\n## Child 2") as never,
    );

    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.name).toBe("Root");
    expect(symbols[0]?.children).toHaveLength(2);
    expect(symbols[0]?.children[0]?.name).toBe("Child");
    expect(symbols[0]?.children[0]?.children[0]?.name).toBe("Grandchild");
    expect(symbols[0]?.children[1]?.name).toBe("Child 2");
  });

  it("ignores hash markers inside fenced code blocks", () => {
    const symbols = collectAtxHeadingSymbols(
      createDocument(
        "# Visible\n```md\n# Hidden\n## Also Hidden\n```\n## Visible 2",
      ) as never,
    );

    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.name).toBe("Visible");
    expect(symbols[0]?.children).toHaveLength(1);
    expect(symbols[0]?.children[0]?.name).toBe("Visible 2");
  });
});

describe("extension document symbol registration", () => {
  beforeEach(() => {
    vscodeSpies.registerDocumentSymbolProvider.mockClear();
    vscodeSpies.registerFoldingRangeProvider.mockClear();
  });

  it("registers document symbol provider for growi markdown", () => {
    const context = {
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
    };

    activate(context as never);

    expect(vscodeSpies.registerDocumentSymbolProvider).toHaveBeenCalledWith(
      { language: "markdown", scheme: "growi" },
      expect.any(Object),
    );
  });

  it("registers drawio folding provider for growi markdown", () => {
    const context = {
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
    };

    activate(context as never);

    expect(vscodeSpies.registerFoldingRangeProvider).toHaveBeenCalledWith(
      { language: "markdown", scheme: "growi" },
      expect.any(Object),
    );
  });
});

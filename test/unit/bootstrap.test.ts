import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  const workspaceState = {
    workspaceFolders: [] as {
      uri: { scheme: string; path: string; toString(): string };
      name: string;
    }[],
  };
  const toUri = (value: string) => {
    const separator = value.indexOf(":");
    const scheme = separator >= 0 ? value.slice(0, separator) : "";
    const path = separator >= 0 ? value.slice(separator + 1) : value;
    return {
      scheme,
      path,
      toString: () => value,
    };
  };

  return {
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
      dispose = vi.fn();
    },
    TreeItem: class {
      label: string;
      collapsibleState: number;
      resourceUri?: { scheme: string; path: string; toString(): string };
      contextValue?: string;
      iconPath?: unknown;
      description?: string;
      tooltip?: unknown;
      command?: { command: string; title: string; arguments?: unknown[] };

      constructor(label: string, collapsibleState: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    ThemeIcon: class {
      static File = { id: "file" };
      static Folder = { id: "folder" };
      static Warning = { id: "warning" };
      id: string;

      constructor(id: string) {
        this.id = id;
      }
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    FileType: {
      File: 1,
      Directory: 2,
    },
    commands: {
      executeCommand: vi.fn(async () => {}),
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ConfigurationTarget: {
      Global: "Global",
    },
    Uri: {
      file: vi.fn((value: string) => ({
        fsPath: value,
        path: value,
        scheme: "file",
        toString: () => `file:${value}`,
      })),
      joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => ({
        fsPath: path.join(base.fsPath, ...segments),
        path: path.join(base.fsPath, ...segments),
        scheme: "file",
        toString: () => `file:${path.join(base.fsPath, ...segments)}`,
      })),
      parse: vi.fn((value: string) => {
        const separator = value.indexOf(":");
        const scheme = separator >= 0 ? value.slice(0, separator) : "";
        const parsedPath = separator >= 0 ? value.slice(separator + 1) : value;
        return {
          scheme,
          path: parsedPath,
          toString: () => value,
        };
      }),
    },
    env: {
      openExternal: vi.fn(async () => true),
    },
    window: {
      activeTextEditor: undefined,
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
      createStatusBarItem: vi.fn(() => ({
        text: "",
        command: undefined,
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      })),
      registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showInputBox: vi.fn(),
      showQuickPick: vi.fn(),
      showWarningMessage: vi.fn(async () => undefined),
    },
    workspace: {
      get workspaceFolders() {
        return workspaceState.workspaceFolders;
      },
      set workspaceFolders(value) {
        workspaceState.workspaceFolders = value;
      },
      fs: {
        readDirectory: vi.fn(async () => []),
        readFile: vi.fn(async () => new TextEncoder().encode("")),
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn(),
        update: vi.fn(),
      })),
      registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      updateWorkspaceFolders: vi.fn(
        (
          start: number,
          deleteCount?: number,
          ...folders: { uri: string; name: string }[]
        ) => {
          const next = [...workspaceState.workspaceFolders];
          next.splice(
            start,
            deleteCount ?? 0,
            ...folders.map((folder) => ({
              name: folder.name,
              uri: toUri(folder.uri),
            })),
          );
          workspaceState.workspaceFolders = next;
          return true;
        },
      ),
    },
  };
});

import * as vscode from "vscode";
import { activate, deactivate, extendMarkdownIt } from "../../src/extension";
import * as assetProxy from "../../src/vscode/assetProxy";
import { GROWI_COMMANDS } from "../../src/vscode/commands";
import { PREFIX_REGISTRY_STATE_KEY } from "../../src/vscode/prefixRegistry";
import { GROWI_REVISION_SCHEME } from "../../src/vscode/revisionModel";

const API_NOT_SUPPORTED_MESSAGE =
  "編集開始 API が未対応のため Start Edit を実行できません。";
const BASE_URL_NOT_CONFIGURED_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const API_TOKEN_NOT_CONFIGURED_MESSAGE =
  "GROWI API token が未設定です。先に Configure API Token を実行してください。";
const INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効です。Configure API Token を確認してください。";
const PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否しました。権限設定と API Token を確認してください。";
const CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Start Edit を実行できませんでした。";
const NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Start Edit を実行できませんでした。";

function createContext(options?: {
  baseUrl?: string;
  apiToken?: string;
  fetchMock?: ReturnType<typeof vi.fn>;
  prefixes?: string[];
  readFileMock?: ReturnType<typeof vi.fn>;
}) {
  const baseUrl =
    options && "baseUrl" in options
      ? options.baseUrl
      : "https://growi.example.com/";
  const apiToken =
    options && "apiToken" in options ? options.apiToken : "test-token";
  const fetchMock = options?.fetchMock ?? vi.fn();
  const prefixes = options?.prefixes ?? [];
  const workspaceStateStore = {
    byBaseUrl: baseUrl
      ? {
          [baseUrl]: [...prefixes],
        }
      : {},
  };
  const readFileMock =
    options?.readFileMock ??
    vi.fn(async () => new TextEncoder().encode("# default body"));

  const getConfigurationMock = vi.mocked(vscode.workspace.getConfiguration);
  getConfigurationMock.mockReturnValue({
    get: vi.fn((key: string) => (key === "baseUrl" ? baseUrl : undefined)),
    update: vi.fn(async () => {}),
  } as never);

  const workspaceApi = vscode.workspace as unknown as {
    workspaceFolders: {
      uri: { scheme: string; toString(): string };
      name: string;
    }[];
  };
  workspaceApi.workspaceFolders = [];

  const windowApi = vscode.window as unknown as {
    activeTextEditor:
      | {
          document: {
            uri: {
              scheme: string;
              path: string;
              toString(): string;
            };
          };
        }
      | undefined;
  };
  windowApi.activeTextEditor = {
    document: {
      uri: {
        scheme: "growi",
        path: "/team/dev/spec.md",
        toString: () => "growi:/team/dev/spec.md",
      },
    },
  };

  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(vscode.workspace.fs.readFile).mockImplementation(
    readFileMock as never,
  );

  return {
    context: {
      secrets: {
        get: vi.fn(async () => apiToken),
        store: vi.fn(),
      },
      subscriptions: [],
      workspaceState: {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          if (key === PREFIX_REGISTRY_STATE_KEY && baseUrl) {
            return workspaceStateStore;
          }
          return defaultValue;
        }),
        update: vi.fn(async (key: string, value: unknown) => {
          if (key === PREFIX_REGISTRY_STATE_KEY && value) {
            Object.assign(workspaceStateStore, value);
          }
        }),
      },
      globalState: {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn(async () => {}),
      },
    } as never,
    extensionUri: {
      fsPath: process.cwd(),
      path: process.cwd(),
      scheme: "file",
      toString: () => `file:${process.cwd()}`,
    },
    fetchMock,
  };
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function resolveRegisteredCommand(
  command: string,
): (...args: unknown[]) => Promise<void> {
  const registerCommandMock = vi.mocked(vscode.commands.registerCommand);
  const commandRegistration = registerCommandMock.mock.calls
    .filter(([registered]) => registered === command)
    .at(-1);
  expect(commandRegistration).toBeDefined();
  return commandRegistration?.[1] as (...args: unknown[]) => Promise<void>;
}

describe("bootstrap extension entrypoint", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.GROWI_RUNTIME_MODE;
    delete process.env.GROWI_JSONL_PATH;
    delete process.env.GROWI_RUNTIME_ROOT;
    const workspaceApi = vscode.workspace as unknown as {
      workspaceFolders: unknown[];
    };
    workspaceApi.workspaceFolders = [];
  });

  it("exports activate and deactivate hooks", () => {
    expect(typeof activate).toBe("function");
    expect(typeof deactivate).toBe("function");
  });

  it("registers growi.startEdit and growi.endEdit on activate", () => {
    const registerCommandMock = vi.mocked(vscode.commands.registerCommand);
    registerCommandMock.mockClear();

    activate({
      secrets: { store: vi.fn() },
      subscriptions: [],
      workspaceState: {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn(async () => {}),
      },
      globalState: {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn(async () => {}),
      },
    } as never);

    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.startEdit,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.endEdit,
      expect.any(Function),
    );
    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("GROWI");
    const outputChannel = vi.mocked(vscode.window.createOutputChannel).mock
      .results[0]?.value as
      | { appendLine: ReturnType<typeof vi.fn> }
      | undefined;
    expect(outputChannel?.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("runtime log status enabled=false"),
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "growi.runtimeLogsEnabled",
      false,
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.showCurrentPageActions,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.showLocalMirrorActions,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.showRevisionHistoryDiff,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.clearRuntimeLogs,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.revealRuntimeLogs,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.openReadme,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.openPrefixRootPage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.openDirectoryPage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerOpenPageItem,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerOpenPageInBrowser,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerCreatePageHere,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerRenamePage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerDeletePage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerRefreshCurrentPage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerShowBacklinks,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerShowCurrentPageInfo,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerShowCurrentPageAttachments,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.showCurrentPageAttachments,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerShowRevisionHistoryDiff,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerDownloadCurrentPageToLocalFile,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerDownloadCurrentPageSetToLocalBundle,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerCompareLocalWorkFileWithCurrentPage,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerUploadExportedLocalFileToGrowi,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerCompareLocalBundleWithGrowi,
      expect.any(Function),
    );
    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.explorerUploadLocalBundleToGrowi,
      expect.any(Function),
    );
  });

  it("registers the growi revision content provider on activate", () => {
    const registerTextDocumentContentProviderMock = vi.mocked(
      (
        vscode.workspace as unknown as {
          registerTextDocumentContentProvider: (
            scheme: string,
            provider: unknown,
          ) => vscode.Disposable;
        }
      ).registerTextDocumentContentProvider,
    );
    registerTextDocumentContentProviderMock.mockClear();

    activate({
      secrets: { store: vi.fn() },
      subscriptions: [],
      workspaceState: {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn(async () => {}),
      },
      globalState: {
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn(async () => {}),
      },
    } as never);

    expect(registerTextDocumentContentProviderMock).toHaveBeenCalledWith(
      GROWI_REVISION_SCHEME,
      expect.any(Object),
    );
  });

  it("shows a lock status bar item for growi pages in read mode", () => {
    const { context } = createContext();

    activate(context);

    const statusBarItem = vi.mocked(vscode.window.createStatusBarItem).mock
      .results[0]?.value as
      | {
          text?: string;
          command?: string;
          show: ReturnType<typeof vi.fn>;
        }
      | undefined;

    expect(statusBarItem?.text).toBe("$(lock) 閲覧中");
    expect(statusBarItem?.command).toBe(GROWI_COMMANDS.startEdit);
    expect(statusBarItem?.show).toHaveBeenCalled();
  });

  it("registers the GROWI explorer tree data provider on activate", () => {
    const registerTreeDataProviderMock = vi.mocked(
      vscode.window.registerTreeDataProvider,
    );
    const { context } = createContext({
      prefixes: ["/team/dev", "/team/ops"],
    });

    activate(context);

    expect(registerTreeDataProviderMock).toHaveBeenCalledWith(
      "growi.explorer",
      expect.any(Object),
    );
  });

  it("marks the active growi page stale and clears it on refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
            lastUpdateUser: { username: "alice" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-2" },
            updatedAt: "2026-03-08T09:05:00.000Z",
            lastUpdateUser: { username: "bob" },
          },
        }),
      );
    const { context } = createContext({
      fetchMock,
      prefixes: ["/team/dev"],
    });

    activate(context);

    const growiDocument = vscode.window.activeTextEditor?.document;
    if (!growiDocument) {
      throw new Error("Expected a growi document to be active");
    }

    const registeredProvider = vi.mocked(
      vscode.workspace.registerFileSystemProvider,
    ).mock.calls[0]?.[1] as unknown as {
      readFile(uri: { path: string }): Promise<Uint8Array>;
    };
    const treeProvider = vi.mocked(vscode.window.registerTreeDataProvider).mock
      .calls[0]?.[1] as unknown as {
      getChildren(element?: {
        kind: "directory" | "page";
        uri: { path: string };
        contextValue?: string;
      }): Promise<
        {
          label?: string | { label: string };
          kind: "directory" | "page";
          uri: { path: string };
          description?: string;
          tooltip?: string;
          iconPath?: { id: string };
          contextValue?: string;
        }[]
      >;
      markCanonicalPathStale(canonicalPath: string): void;
      clearStaleState(canonicalPath: string): void;
    };

    vi.mocked(vscode.workspace.fs.readDirectory).mockImplementation(
      async (uri: { path: string }) => {
        if (uri.path === "/team/dev/" || uri.path === "/team/dev") {
          return [["spec.md", vscode.FileType.File]];
        }
        return [];
      },
    );

    await registeredProvider.readFile({
      path: "/team/dev/spec.md",
    } as never);

    const growiEditorChangeListener = vi.mocked(
      vscode.window.onDidChangeActiveTextEditor,
    ).mock.calls[0]?.[0] as (editor: {
      document: {
        uri: { scheme: string; path: string };
      };
    }) => void;

    growiEditorChangeListener({
      document: {
        uri: {
          scheme: "file",
          path: "/tmp/note.md",
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    growiEditorChangeListener({
      document: {
        uri: {
          scheme: "growi",
          path: "/team/dev/spec.md",
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [root] = await treeProvider.getChildren();
    const stalePage = (await treeProvider.getChildren(root)).find(
      (item) => item.uri.path === "/team/dev/spec.md",
    );
    expect(stalePage).toBeDefined();
    expect(stalePage?.description).toBe("remote changed");
    expect(stalePage?.tooltip).toBe(
      "remote が更新されています。Refresh Current Page で再読込してください。",
    );
    expect((stalePage?.iconPath as { id?: string } | undefined)?.id).toBe(
      "warning",
    );

    (
      vscode.workspace as unknown as {
        textDocuments: { uri: { toString(): string } }[];
      }
    ).textDocuments = [{ uri: growiDocument.uri as never }];

    treeProvider.clearStaleState("/team/dev/spec");

    const freshPage = (await treeProvider.getChildren(root)).find(
      (item) => item.uri.path === "/team/dev/spec.md",
    );
    expect(freshPage).toBeDefined();
    expect(freshPage?.description).toBeUndefined();
    expect(freshPage?.tooltip).toBeUndefined();
    expect((freshPage?.iconPath as { id?: string } | undefined)?.id).not.toBe(
      "warning",
    );
  });

  it("reveals runtime log directory only in debug-f5 mode", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    process.env.GROWI_JSONL_PATH = "/tmp/growi-runtime/runtime.jsonl";
    const { context } = createContext();

    activate(context);

    const result = await resolveRegisteredCommand(
      GROWI_COMMANDS.revealRuntimeLogs,
    )();

    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: "/tmp/growi-runtime",
      }),
    );
    expect(result).toBe("/tmp/growi-runtime");

    delete process.env.GROWI_RUNTIME_MODE;
    delete process.env.GROWI_JSONL_PATH;
  });

  it("logs runtime status and write failure to output channel", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    process.env.GROWI_JSONL_PATH = "/dev/null/runtime.jsonl";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
            lastUpdateUser: { username: "alice" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          docs: [
            {
              _id: "attachment-1",
              originalName: "diagram.png",
              fileFormat: "image/png",
              fileSize: 1024,
              url: "/attachment/attachment-1",
            },
          ],
        }),
      );
    const { context } = createContext({ fetchMock });

    activate(context);
    const registeredProvider = vi.mocked(
      vscode.workspace.registerFileSystemProvider,
    ).mock.calls[0]?.[1] as unknown as {
      readFile(uri: { path: string }): Thenable<Uint8Array>;
    };
    expect(registeredProvider).toBeDefined();
    await registeredProvider.readFile({ path: "/team/dev/spec.md" } as never);

    await resolveRegisteredCommand(GROWI_COMMANDS.showCurrentPageAttachments)();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outputChannel = vi.mocked(vscode.window.createOutputChannel).mock
      .results[0]?.value as
      | { appendLine: ReturnType<typeof vi.fn> }
      | undefined;
    const calls =
      outputChannel?.appendLine.mock.calls.map(([value]) => String(value)) ??
      [];
    expect(
      calls.some((value) => value.includes("runtime log status enabled=true")),
    ).toBe(true);
    expect(calls.join("\n")).not.toContain("Authorization");
    expect(calls.join("\n")).not.toContain("Bearer");
  });

  it("writes command and external open trace for showCurrentPageAttachments", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-runtime-"));
    process.env.GROWI_JSONL_PATH = path.join(tempRoot, "runtime.jsonl");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
            lastUpdateUser: { username: "alice" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          docs: [
            {
              _id: "attachment-1",
              originalName: "diagram.png",
              fileFormat: "image/png",
              fileSize: 1024,
              url: "/attachment/attachment-1",
            },
          ],
        }),
      );
    const { context } = createContext({ fetchMock });
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "diagram.png",
      canonicalPath: "/team/dev/spec",
      downloadUrl: "https://growi.example.com/attachment/attachment-1",
    } as never);

    activate(context);
    const registeredProvider = vi.mocked(
      vscode.workspace.registerFileSystemProvider,
    ).mock.calls[0]?.[1] as unknown as {
      readFile(uri: { path: string }): Thenable<Uint8Array>;
    };
    await registeredProvider.readFile({ path: "/team/dev/spec.md" } as never);
    await resolveRegisteredCommand(GROWI_COMMANDS.showCurrentPageAttachments)();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = await readFile(process.env.GROWI_JSONL_PATH, "utf8");
    expect(content).toContain('"event":"command.started"');
    expect(content).toContain(
      '"operation":"command:growi.showCurrentPageAttachments"',
    );
    expect(content).toContain('"event":"attachment.list.requested"');
    expect(content).toContain('"event":"externalOpen.started"');
    expect(content).toContain('"event":"externalOpen.succeeded"');
    expect(content).toContain(
      '"virtualPath":"growi.example.com/attachment/attachment-1"',
    );
    expect(content).toContain('"event":"command.succeeded"');
    expect(content).not.toContain("Authorization");
    expect(content).not.toContain("Bearer");
  });

  it("writes command and page read trace for openPage", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-runtime-"));
    process.env.GROWI_JSONL_PATH = path.join(tempRoot, "runtime.jsonl");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
            lastUpdateUser: { username: "alice" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      );
    const { context } = createContext({ fetchMock });

    activate(context);
    await resolveRegisteredCommand(GROWI_COMMANDS.openPage)("/team/dev/spec");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = await readFile(process.env.GROWI_JSONL_PATH, "utf8");
    expect(content).toContain('"event":"command.started"');
    expect(content).toContain('"operation":"command:growi.openPage"');
    expect(content).toContain('"event":"command.succeeded"');
  });

  it("shows info for runtime log commands outside debug-f5 mode", async () => {
    const { context } = createContext();
    activate(context);

    const reveal = await resolveRegisteredCommand(
      GROWI_COMMANDS.revealRuntimeLogs,
    )();
    const cleared = await resolveRegisteredCommand(
      GROWI_COMMANDS.clearRuntimeLogs,
    )();

    expect(reveal).toBeUndefined();
    expect(cleared).toBe(0);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Runtime logs are available only in debug-f5 mode.",
    );
  });

  it("shows runtime status when path is unresolved in debug-f5 mode", async () => {
    process.env.GROWI_RUNTIME_MODE = "debug-f5";
    process.env.GROWI_JSONL_PATH = ".growi-logs/runtime/runtime.jsonl";
    const { context } = createContext();
    activate(context);

    const reveal = await resolveRegisteredCommand(
      GROWI_COMMANDS.revealRuntimeLogs,
    )();
    const directory = await resolveRegisteredCommand(
      "growi.__test.getResolvedRuntimeLogDirectory",
    )();

    expect(reveal).toBeUndefined();
    expect(directory).toBe(
      "unresolved: mode=debug-f5 configuredPath=.growi-logs/runtime/runtime.jsonl workspaceResolved=false",
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Runtime log path is not resolved yet. mode=debug-f5 configuredPath=.growi-logs/runtime/runtime.jsonl workspaceResolved=false",
    );
  });

  it("does not sync workspace folders on activate", () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const { context } = createContext({
      prefixes: ["/team/dev", "/team/ops"],
    });
    activate(context);

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("does not sync workspace folders on activate when baseUrl is missing", () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const { context } = createContext({
      baseUrl: undefined,
      prefixes: ["/team/dev"],
    });

    activate(context);

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("does not update workspace folders when addPrefix succeeds", async () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const { context } = createContext();

    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.addPrefix)("/team/dev");

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("registers growi.clearPrefixes on activate", () => {
    const registerCommandMock = vi.mocked(vscode.commands.registerCommand);

    activate(createContext().context);

    expect(registerCommandMock).toHaveBeenCalledWith(
      GROWI_COMMANDS.clearPrefixes,
      expect.any(Function),
    );
  });

  it("does not update workspace folders when clearPrefixes succeeds", async () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const showWarningMessageMock = vi.mocked(vscode.window.showWarningMessage);
    showWarningMessageMock.mockResolvedValue("削除する" as never);
    const { context } = createContext({
      prefixes: ["/team/dev", "/team/ops"],
    });

    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.clearPrefixes)();

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("does not update workspace folders when addPrefix is duplicate", async () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const { context } = createContext({
      prefixes: ["/team/dev"],
    });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.addPrefix)("/team/dev");

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("does not update workspace folders when base URL changes", async () => {
    const updateWorkspaceFoldersMock = vi.mocked(
      vscode.workspace.updateWorkspaceFolders,
    );
    const { context } = createContext({
      baseUrl: "https://growi.example.com/",
      prefixes: ["/team/dev"],
    });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.configureBaseUrl)(
      "https://other.example.com/",
    );

    expect(updateWorkspaceFoldersMock).not.toHaveBeenCalled();
  });

  it("opens the bundled README via vscode.open", async () => {
    const executeCommandMock = vi.mocked(vscode.commands.executeCommand);
    const { context } = createContext();

    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.openReadme)();

    expect(executeCommandMock).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({
        scheme: "file",
        path: expect.stringMatching(/\/README\.md$/),
      }),
    );
  });

  it("bootstraps startEdit via bearer token API with two fetch steps", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-001",
            revision: { _id: "rev-001" },
            updatedAt: "2026-03-08T09:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# spec",
          },
        }),
      );
    const { context } = createContext({ fetchMock });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();

    const statusBarItem = vi.mocked(vscode.window.createStatusBarItem).mock
      .results[0]?.value as
      | {
          text?: string;
          command?: string;
        }
      | undefined;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusBarItem?.text).toBe("$(unlock) 編集中");
    expect(statusBarItem?.command).toBe(GROWI_COMMANDS.endEdit);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://growi.example.com/_api/v3/page?path=%2Fteam%2Fdev%2Fspec",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
      },
      method: "GET",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://growi.example.com/_api/v3/revisions/rev-001?pageId=page-001",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
      },
      method: "GET",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it("maps baseUrl missing and missing token before calling API", async () => {
    const showErrorMessageMock = vi.mocked(vscode.window.showErrorMessage);

    const baseUrlMissing = createContext({ baseUrl: undefined });
    activate(baseUrlMissing.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      BASE_URL_NOT_CONFIGURED_MESSAGE,
    );

    const tokenMissing = createContext({ apiToken: undefined });
    activate(tokenMissing.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      API_TOKEN_NOT_CONFIGURED_MESSAGE,
    );
  });

  it("maps 404 response to NotFound", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ error: "not found" }, 404));
    const { context } = createContext({ fetchMock });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();

    expect(vscode.window.showErrorMessage).toHaveBeenLastCalledWith(
      NOT_FOUND_MESSAGE,
    );
  });

  it("maps redirect login, non-json, and 405 response to ApiNotSupported", async () => {
    const showErrorMessageMock = vi.mocked(vscode.window.showErrorMessage);

    const loginRedirect = createContext({
      fetchMock: vi.fn().mockResolvedValueOnce(
        new Response(null, {
          headers: { location: "/login" },
          status: 302,
        }),
      ),
    });
    activate(loginRedirect.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      API_NOT_SUPPORTED_MESSAGE,
    );

    const nonJson = createContext({
      fetchMock: vi.fn().mockResolvedValueOnce(
        new Response("<html>login</html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      ),
    });
    activate(nonJson.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      API_NOT_SUPPORTED_MESSAGE,
    );

    const methodNotAllowed = createContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ error: "method not allowed" }, 405),
        ),
    });
    activate(methodNotAllowed.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      API_NOT_SUPPORTED_MESSAGE,
    );
  });

  it("maps 401 and 403 to auth-specific messages", async () => {
    const showErrorMessageMock = vi.mocked(vscode.window.showErrorMessage);

    const invalidToken = createContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ error: "unauthorized" }, 401),
        ),
    });
    activate(invalidToken.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      INVALID_API_TOKEN_MESSAGE,
    );

    const permissionDenied = createContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(createJsonResponse({ error: "forbidden" }, 403)),
    });
    activate(permissionDenied.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      PERMISSION_DENIED_MESSAGE,
    );
  });

  it("maps malformed payload to ApiNotSupported", async () => {
    const showErrorMessageMock = vi.mocked(vscode.window.showErrorMessage);

    const malformedPayload = createContext({
      fetchMock: vi.fn().mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-001",
            revision: {},
            updatedAt: "2026-03-08T09:00:00.000Z",
          },
        }),
      ),
    });
    activate(malformedPayload.context);
    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();
    expect(showErrorMessageMock).toHaveBeenLastCalledWith(
      API_NOT_SUPPORTED_MESSAGE,
    );
  });

  it("shows error when asset proxy resolver cannot provide URL", () => {
    vi.spyOn(assetProxy, "createGrowiAssetProxy").mockReturnValue({
      async dispose() {},
      resolveProxyUrl: () => undefined,
    });
    const { context } = createContext();
    activate(context);

    const md = extendMarkdownIt({
      renderer: {
        rules: {
          image: vi.fn(
            (
              tokens: readonly {
                attrGet(name: string): string | null;
                attrSet(name: string, value: string): void;
              }[],
              index: number,
            ) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
          ),
        },
      },
    });

    const token = {
      source: "/files/example.png",
      attrGet(name: string): string | null {
        return name === "src" ? this.source : null;
      },
      attrSet(name: string, value: string): void {
        if (name === "src") {
          this.source = value;
        }
      },
    };
    const output =
      (
        md.renderer.rules.image as
          | ((
              tokens: readonly (typeof token)[],
              index: number,
              options: unknown,
              env: unknown,
              self: { renderToken(...args: unknown[]): string },
            ) => string)
          | undefined
      )?.([token], 0, {}, {}, { renderToken: vi.fn() }) ?? "";

    expect(output).toBe("<img src='/files/example.png'>");
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "GROWI image proxy is unavailable; image preview may be incomplete.",
    );
  });

  it("maps fetch rejection to ConnectionFailed", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const { context } = createContext({ fetchMock });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.startEdit)();

    expect(vscode.window.showErrorMessage).toHaveBeenLastCalledWith(
      CONNECTION_FAILED_MESSAGE,
    );
  });

  it("maps timeout via AbortController to ConnectionFailed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const abortError = new Error("aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });
    const { context } = createContext({ fetchMock });
    activate(context);

    const startEdit = resolveRegisteredCommand(GROWI_COMMANDS.startEdit);
    const startEditPromise = startEdit();
    await vi.advanceTimersByTimeAsync(10_000);
    await startEditPromise;

    expect(vscode.window.showErrorMessage).toHaveBeenLastCalledWith(
      CONNECTION_FAILED_MESSAGE,
    );

    vi.useRealTimers();
  });

  it("uses workspace.fs.readFile for showBacklinks page body reads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        pages: [{ path: "/team/dev/backlink" }],
      }),
    );
    const readFileMock = vi.fn(async () =>
      new TextEncoder().encode("no backlinks here"),
    );
    const { context } = createContext({
      fetchMock,
      prefixes: ["/team/dev"],
      readFileMock,
    });
    activate(context);

    await resolveRegisteredCommand(GROWI_COMMANDS.showBacklinks)();

    expect(readFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheme: "growi",
        path: "/team/dev/backlink.md",
      }),
    );
  });

  it("shows current page actions quick pick and delegates to existing commands", async () => {
    const showQuickPickMock = vi.mocked(vscode.window.showQuickPick);
    const executeCommandMock = vi.mocked(vscode.commands.executeCommand);
    const { context } = createContext();
    activate(context);

    showQuickPickMock.mockResolvedValueOnce({
      label: "現在ページ配下の mirror を作成",
      description: "prefix mirror を生成",
      command: GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
    } as never);

    await resolveRegisteredCommand(GROWI_COMMANDS.showCurrentPageActions)();

    expect(showQuickPickMock).toHaveBeenCalledWith(
      [
        { label: "ページを更新", command: GROWI_COMMANDS.refreshCurrentPage },
        { label: "ページ名を変更", command: GROWI_COMMANDS.renamePage },
        { label: "ページを削除", command: GROWI_COMMANDS.deletePage },
        { label: "被リンクを表示", command: GROWI_COMMANDS.showBacklinks },
        {
          label: "ページ情報を表示",
          command: GROWI_COMMANDS.showCurrentPageInfo,
        },
        {
          label: "添付一覧を表示",
          command: GROWI_COMMANDS.showCurrentPageAttachments,
        },
        {
          label: "履歴差分を表示",
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        },
        {
          label: "現在ページのローカルミラーを同期",
          description: "__<page>__.md と .growi-mirror.json を作成または更新",
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
        },
        {
          label: "現在ページ配下をローカルミラーに同期",
          description: "prefix mirror を作成または更新",
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
        },
      ],
      {
        placeHolder: "現在ページに対して実行する操作を選択してください。",
      },
    );
    expect(executeCommandMock).toHaveBeenLastCalledWith(
      GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
      expect.objectContaining({
        scheme: "growi",
        path: "/team/dev/spec.md",
      }),
    );
  });

  it("shows local mirror actions quick pick and delegates to existing commands", async () => {
    const showQuickPickMock = vi.mocked(vscode.window.showQuickPick);
    const executeCommandMock = vi.mocked(vscode.commands.executeCommand);
    const { context } = createContext();
    activate(context);

    showQuickPickMock.mockResolvedValueOnce({
      label: "ローカルミラーを反映",
      description: "changed pages のみ送信",
      command: GROWI_COMMANDS.uploadLocalMirrorToGrowi,
    } as never);

    await resolveRegisteredCommand(GROWI_COMMANDS.showLocalMirrorActions)();

    expect(showQuickPickMock).toHaveBeenCalledWith(
      [
        {
          label: "現在ページのローカルミラーを同期",
          description: "mirror が無ければ作成、あれば更新",
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
        },
        {
          label: "ローカルミラーを比較",
          description: "mirror manifest を使用",
          command: GROWI_COMMANDS.compareLocalMirrorWithGrowi,
        },
        {
          label: "ローカルミラーを反映",
          description: "changed pages のみ送信",
          command: GROWI_COMMANDS.uploadLocalMirrorToGrowi,
        },
      ],
      {
        placeHolder: "ローカルミラーに対して実行する操作を選択してください。",
      },
    );
    expect(executeCommandMock).toHaveBeenLastCalledWith(
      GROWI_COMMANDS.uploadLocalMirrorToGrowi,
      expect.objectContaining({
        scheme: "growi",
        path: "/team/dev/spec.md",
      }),
    );
  });
});

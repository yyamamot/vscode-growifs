import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  registerFileSystemProvider,
  registerCommand,
  FileSystemError,
  EventEmitter,
} = vi.hoisted(() => {
  class FileSystemError extends Error {
    static Unavailable(message?: string) {
      return new FileSystemError(message ?? "Unavailable");
    }

    static NoPermissions(message?: string) {
      return new FileSystemError(message ?? "Permission denied");
    }

    static FileNotFound(_uriOrMessage?: unknown) {
      return new FileSystemError("File not found");
    }
  }

  class EventEmitter<T> {
    event = vi.fn();
    fire = vi.fn((_data: T) => {});
  }

  return {
    registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    FileSystemError,
    EventEmitter,
  };
});

vi.mock("vscode", () => ({
  commands: {
    registerCommand,
  },
  ConfigurationTarget: {
    Global: "Global",
  },
  EventEmitter,
  FileChangeType: {
    Changed: 1,
  },
  FilePermission: {
    Readonly: 1,
  },
  FileSystemError,
  FileType: {
    File: 0,
    Directory: 1,
  },
  Uri: {
    from: vi.fn(
      (components: { scheme: string; path: string }): vscode.Uri =>
        components as unknown as vscode.Uri,
    ),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    registerFileSystemProvider,
  },
}));

import * as vscode from "vscode";

import { activate } from "../../src/extension";
import { GROWI_COMMANDS } from "../../src/vscode/commands";
import {
  type GrowiCurrentPageInfo,
  type GrowiCurrentRevisionReader,
  type GrowiEditSession,
  type GrowiEditSessionReference,
  GrowiFileSystemProvider,
  type GrowiPageListReader,
  type GrowiPageListResult,
  type GrowiPageReader,
  type GrowiPageReadResult,
  type GrowiPageWriteResult,
  type GrowiPageWriter,
  type GrowiSaveFailureNotifier,
} from "../../src/vscode/fsProvider";

function createContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    secrets: {
      store: vi.fn(async (_key: string, _value: string) => {}),
    },
  } as unknown as vscode.ExtensionContext;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function activateWithApiContext(options?: {
  baseUrl?: string;
  apiToken?: string;
  fetchMock?: ReturnType<typeof vi.fn>;
}): {
  provider: GrowiFileSystemProvider;
  fetchMock: ReturnType<typeof vi.fn>;
  baseUrlGetMock: ReturnType<typeof vi.fn>;
  secretGetMock: ReturnType<typeof vi.fn>;
} {
  const baseUrl =
    options && "baseUrl" in options
      ? options.baseUrl
      : "https://growi.example.com/";
  const apiToken =
    options && "apiToken" in options ? options.apiToken : "test-token";
  const fetchMock = options?.fetchMock ?? vi.fn();

  const getConfigurationMock = vi.mocked(vscode.workspace.getConfiguration);
  const baseUrlGetMock = vi.fn((key: string) =>
    key === "baseUrl" ? baseUrl : undefined,
  );
  getConfigurationMock.mockReturnValue({
    get: baseUrlGetMock,
    update: vi.fn(async () => {}),
  } as never);

  vi.stubGlobal("fetch", fetchMock);

  const secretGetMock = vi.fn(async () => apiToken);
  const context = {
    secrets: {
      get: secretGetMock,
      store: vi.fn(async (_key: string, _value: string) => {}),
    },
    subscriptions: [],
    workspaceState: {
      get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
      update: vi.fn(async () => {}),
    },
  } as unknown as vscode.ExtensionContext;

  activate(context);

  const latestRegistration = vi
    .mocked(registerFileSystemProvider)
    .mock.calls.at(-1) as unknown[] | undefined;
  const provider = latestRegistration?.[1];
  expect(provider).toBeInstanceOf(GrowiFileSystemProvider);

  return {
    provider: provider as unknown as GrowiFileSystemProvider,
    fetchMock,
    baseUrlGetMock,
    secretGetMock,
  };
}

function getRegisteredCommandHandler<TArgs extends unknown[]>(
  commandId: string,
): (...args: TArgs) => Promise<void> {
  const commandCalls = vi.mocked(registerCommand).mock.calls as unknown[][];
  let commandRegistration: unknown[] | undefined;
  for (let i = commandCalls.length - 1; i >= 0; i -= 1) {
    const call = commandCalls[i];
    if (call?.[0] === commandId) {
      commandRegistration = call as unknown[];
      break;
    }
  }
  expect(commandRegistration).toBeDefined();
  return commandRegistration?.[1] as (...args: TArgs) => Promise<void>;
}

async function startEdit(uri: vscode.Uri): Promise<void> {
  const startEditCommand = getRegisteredCommandHandler<[vscode.Uri]>(
    GROWI_COMMANDS.startEdit,
  );
  await startEditCommand(uri);
}

async function endEdit(uri: vscode.Uri): Promise<void> {
  const endEditCommand = getRegisteredCommandHandler<[vscode.Uri]>(
    GROWI_COMMANDS.endEdit,
  );
  await endEditCommand(uri);
}

describe("GrowiFileSystemProvider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function createListReader(
    listPages: GrowiPageListReader["listPages"],
  ): GrowiPageListReader {
    return { listPages };
  }

  function createProvider({
    readPage,
    listPages,
    editSession,
    closeEditSession,
    currentRevision,
    writePage,
    registeredPrefixes,
    saveFailureNotifier,
  }: {
    readPage?: GrowiPageReadResult | GrowiPageReader["readPage"];
    listPages?: GrowiPageListReader["listPages"];
    editSession?:
      | GrowiEditSession
      | GrowiEditSessionReference["getEditSession"];
    closeEditSession?: GrowiEditSessionReference["closeEditSession"];
    currentRevision?:
      | GrowiCurrentRevisionReader["getCurrentRevision"]
      | { ok: true; revisionId: string }
      | { ok: false };
    writePage?: GrowiPageWriteResult | GrowiPageWriter["writePage"];
    registeredPrefixes?: string[];
    saveFailureNotifier?: GrowiSaveFailureNotifier;
  } = {}) {
    const pageReader = {
      readPage: vi.fn(
        async (canonicalPath: string): Promise<GrowiPageReadResult> => {
          if (typeof readPage === "function") {
            return readPage(canonicalPath);
          }
          return readPage ?? { ok: true, body: "" };
        },
      ),
    };
    const pageListReader = createListReader(
      listPages ??
        vi.fn(async (): Promise<GrowiPageListResult> => {
          return { ok: true, paths: [] };
        }),
    );
    const editSessionReference: GrowiEditSessionReference = {
      getEditSession:
        typeof editSession === "function" ? editSession : () => editSession,
      closeEditSession: closeEditSession ?? (() => {}),
    };
    const currentRevisionReader: GrowiCurrentRevisionReader = {
      getCurrentRevision: vi.fn(
        async (
          canonicalPath: string,
        ): Promise<{ ok: true; revisionId: string } | { ok: false }> => {
          if (typeof currentRevision === "function") {
            return currentRevision(canonicalPath);
          }
          if (currentRevision) {
            return currentRevision;
          }
          if (editSession && typeof editSession !== "function") {
            return { ok: true, revisionId: editSession.baseRevisionId };
          }
          return { ok: true, revisionId: "rev-001" };
        },
      ),
    };
    const pageWriter: GrowiPageWriter = {
      writePage: vi.fn(
        async (
          canonicalPath: string,
          body: string,
          _editSession: GrowiEditSession,
        ): Promise<GrowiPageWriteResult> => {
          if (typeof writePage === "function") {
            return writePage(canonicalPath, body, _editSession);
          }
          return writePage ?? { ok: true };
        },
      ),
    };
    return new GrowiFileSystemProvider(
      pageReader,
      pageListReader,
      editSessionReference,
      currentRevisionReader,
      pageWriter,
      () => registeredPrefixes ?? [],
      saveFailureNotifier,
    );
  }

  it("registers the provider on activate", () => {
    const context = createContext();

    activate(context);

    expect(registerFileSystemProvider).toHaveBeenCalledWith(
      "growi",
      expect.any(GrowiFileSystemProvider),
      { isCaseSensitive: true },
    );
    expect(context.subscriptions.length).toBe(7);
  });

  it("reads file via bearer token API in two fetch steps when activated", async () => {
    const { provider, fetchMock } = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# spec from api" },
          }),
        ),
    });
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;

    const bytes = await provider.readFile(uri);

    expect(new TextDecoder().decode(bytes)).toBe("# spec from api");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
  });

  it("updates showCurrentPageInfo output after page open and explicit reread", async () => {
    const { provider } = activateWithApiContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              _id: "page-001",
              path: "/team/dev/spec",
              revision: { _id: "rev-001" },
              updatedAt: "2026-03-08T09:00:00.000Z",
              lastUpdateUser: { username: "alice" },
            },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            revision: { body: "# first body" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              _id: "page-001",
              path: "/team/dev/spec",
              revision: { _id: "rev-002" },
              updatedAt: "2026-03-08T10:00:00.000Z",
              lastUpdateUser: { username: "bob" },
            },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            revision: { body: "# second body" },
          }),
        ),
    });
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const showCurrentPageInfoCommand = getRegisteredCommandHandler<
      [vscode.Uri]
    >(GROWI_COMMANDS.showCurrentPageInfo);
    const showInformationMessageMock = vi.mocked(
      vscode.window.showInformationMessage,
    );

    await provider.readFile(uri);
    await showCurrentPageInfoCommand(uri);

    expect(showInformationMessageMock).toHaveBeenNthCalledWith(
      1,
      [
        "URL: https://growi.example.com/team/dev/spec",
        "Path: /team/dev/spec",
        "Last Updated By: alice",
        "Last Updated At: 2026-03-08T09:00:00.000Z",
      ].join("\n"),
    );

    provider.invalidateReadFileCache("/team/dev/spec");
    await provider.readFile(uri);
    await showCurrentPageInfoCommand(uri);

    expect(showInformationMessageMock).toHaveBeenNthCalledWith(
      2,
      [
        "URL: https://growi.example.com/team/dev/spec",
        "Path: /team/dev/spec",
        "Last Updated By: bob",
        "Last Updated At: 2026-03-08T10:00:00.000Z",
      ].join("\n"),
    );
  });

  it("classifies missing baseUrl/token and malformed payload as ApiNotSupported", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;

    const withoutBaseUrl = activateWithApiContext({ baseUrl: undefined });
    await expect(withoutBaseUrl.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );
    expect(withoutBaseUrl.fetchMock).not.toHaveBeenCalled();

    const withoutToken = activateWithApiContext({ apiToken: undefined });
    await expect(withoutToken.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );
    expect(withoutToken.fetchMock).not.toHaveBeenCalled();

    const malformedPayload = activateWithApiContext({
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
    await expect(malformedPayload.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );
  });

  it("classifies 404 as NotFound on readFile", async () => {
    const { provider } = activateWithApiContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(createJsonResponse({ error: "not found" }, 404)),
    });
    const uri = { scheme: "growi", path: "/team/dev/missing.md" } as vscode.Uri;

    await expect(provider.readFile(uri)).rejects.toThrow(/File not found/);
  });

  it("classifies login redirect, non-json, and 405 as ApiNotSupported on readFile", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;

    const loginRedirect = activateWithApiContext({
      fetchMock: vi.fn().mockResolvedValueOnce(
        new Response(null, {
          headers: { location: "/login" },
          status: 302,
        }),
      ),
    });
    await expect(loginRedirect.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );

    const nonJson = activateWithApiContext({
      fetchMock: vi.fn().mockResolvedValueOnce(
        new Response("<html>login</html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      ),
    });
    await expect(nonJson.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );

    const methodNotAllowed = activateWithApiContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ error: "method not allowed" }, 405),
        ),
    });
    await expect(methodNotAllowed.provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );
  });

  it("classifies fetch rejection and timeout as ConnectionFailed on readFile", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;

    const fetchRejected = activateWithApiContext({
      fetchMock: vi.fn().mockRejectedValueOnce(new Error("network down")),
    });
    await expect(fetchRejected.provider.readFile(uri)).rejects.toThrow(
      /failed to connect to GROWI/,
    );

    vi.useFakeTimers();
    try {
      const timeoutCase = activateWithApiContext({
        fetchMock: vi.fn((_input: URL, init?: RequestInit) => {
          const signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          });
        }),
      });

      const readPromise = timeoutCase.provider.readFile(uri);
      const assertion = expect(readPromise).rejects.toThrow(
        /failed to connect to GROWI/,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads directory via pages/list API with pagination", async () => {
    const firstPagePaths = Array.from(
      { length: 100 },
      (_unused, index) => `/team/dev/page-${index + 1}`,
    );
    const secondPagePaths = ["/team/dev/docs/guide", "/team/dev/readme"];
    const { provider, fetchMock } = activateWithApiContext({
      fetchMock: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({
            pages: firstPagePaths.map((path) => ({ path })),
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            pages: secondPagePaths.map((path) => ({ path })),
          }),
        ),
    });
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    const entries = await provider.readDirectory(uri);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://growi.example.com/_api/v3/pages/list?path=%2Fteam%2Fdev&limit=100&page=1",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://growi.example.com/_api/v3/pages/list?path=%2Fteam%2Fdev&limit=100&page=2",
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
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
      },
      method: "GET",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(entries).toContainEqual(["docs", 1]);
    expect(entries).toContainEqual(["page-1.md", 0]);
    expect(entries).toContainEqual(["page-100.md", 0]);
    expect(entries).toContainEqual(["readme.md", 0]);
    expect(entries).toHaveLength(102);
  });

  it("classifies list API unsupported cases as ApiNotSupported on readDirectory", async () => {
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    const withoutBaseUrl = activateWithApiContext({ baseUrl: undefined });
    await expect(withoutBaseUrl.provider.readDirectory(uri)).rejects.toThrow(
      /list pages API is not supported/,
    );
    expect(withoutBaseUrl.fetchMock).not.toHaveBeenCalled();

    const withoutToken = activateWithApiContext({ apiToken: undefined });
    await expect(withoutToken.provider.readDirectory(uri)).rejects.toThrow(
      /list pages API is not supported/,
    );
    expect(withoutToken.fetchMock).not.toHaveBeenCalled();

    const scenarios: Array<{ name: string; response: Response }> = [
      {
        name: "required fields missing",
        response: createJsonResponse({
          pages: [{}],
        }),
      },
      {
        name: "404 response",
        response: createJsonResponse({ error: "not found" }, 404),
      },
      {
        name: "405 response",
        response: createJsonResponse({ error: "method not allowed" }, 405),
      },
      {
        name: "non-json response",
        response: new Response("<html>not json</html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      },
      {
        name: "login redirect response",
        response: new Response(null, {
          headers: { location: "/login" },
          status: 302,
        }),
      },
    ];

    for (const scenario of scenarios) {
      const { provider } = activateWithApiContext({
        fetchMock: vi.fn().mockResolvedValueOnce(scenario.response),
      });
      await expect(
        provider.readDirectory(uri),
        `scenario: ${scenario.name}`,
      ).rejects.toThrow(/list pages API is not supported/);
    }
  });

  it("classifies list fetch rejection and timeout as ConnectionFailed on readDirectory", async () => {
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    const fetchRejected = activateWithApiContext({
      fetchMock: vi.fn().mockRejectedValueOnce(new Error("network down")),
    });
    await expect(fetchRejected.provider.readDirectory(uri)).rejects.toThrow(
      /failed to connect to GROWI/,
    );

    vi.useFakeTimers();
    try {
      const timeoutCase = activateWithApiContext({
        fetchMock: vi.fn((_input: URL, init?: RequestInit) => {
          const signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          });
        }),
      });

      const readPromise = timeoutCase.provider.readDirectory(uri);
      const assertion = expect(readPromise).rejects.toThrow(
        /failed to connect to GROWI/,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a registered prefix root mounted when readDirectory is temporarily unavailable", async () => {
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;
    const provider = createProvider({
      listPages: async () => ({ ok: false, reason: "ConnectionFailed" }),
      registeredPrefixes: ["/team/dev"],
    });

    await expect(provider.readDirectory(uri)).resolves.toEqual([]);
  });

  it("still fails readDirectory for non-root directories when listing is unavailable", async () => {
    const uri = { scheme: "growi", path: "/team/dev/docs/" } as vscode.Uri;
    const provider = createProvider({
      listPages: async () => ({ ok: false, reason: "ConnectionFailed" }),
      registeredPrefixes: ["/team/dev"],
    });

    await expect(provider.readDirectory(uri)).rejects.toThrow(
      /failed to connect to GROWI/,
    );
  });

  it("fetches current revision from page API and rejects write on revision conflict", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const { provider, fetchMock } = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# base" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              revision: { _id: "rev-002" },
            },
          }),
        ),
    });

    await startEdit(uri);

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("# updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/revision conflict detected/);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://growi.example.com/_api/v3/page?path=%2Fteam%2Fdev%2Fspec",
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
      },
      method: "GET",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });

  it("treats current revision API failures as write rejection", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const scenarios: Array<{
      name: string;
      baseUrl?: string;
      apiToken?: string;
      thirdResponse?: Response;
      thirdReject?: Error;
      mutateAfterStartEdit?: (deps: {
        baseUrlGetMock: ReturnType<typeof vi.fn>;
        secretGetMock: ReturnType<typeof vi.fn>;
      }) => void;
      timeout?: boolean;
    }> = [
      {
        name: "baseUrl missing",
        mutateAfterStartEdit: ({ baseUrlGetMock }) => {
          baseUrlGetMock.mockImplementation(() => undefined);
        },
      },
      {
        name: "api token missing",
        mutateAfterStartEdit: ({ secretGetMock }) => {
          secretGetMock.mockResolvedValue(undefined);
        },
      },
      {
        name: "required fields missing",
        thirdResponse: createJsonResponse({
          page: {
            revision: {},
          },
        }),
      },
      {
        name: "404 response",
        thirdResponse: createJsonResponse({ error: "not found" }, 404),
      },
      {
        name: "405 response",
        thirdResponse: createJsonResponse({ error: "method not allowed" }, 405),
      },
      {
        name: "non-json response",
        thirdResponse: new Response("<html>not json</html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      },
      {
        name: "login redirect response",
        thirdResponse: new Response(null, {
          headers: { location: "/login" },
          status: 302,
        }),
      },
      {
        name: "fetch reject",
        thirdReject: new Error("network down"),
      },
      {
        name: "timeout",
        timeout: true,
      },
    ];

    for (const scenario of scenarios) {
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
            revision: { body: "# base" },
          }),
        );

      if (scenario.timeout) {
        fetchMock.mockImplementationOnce((_input: URL, init?: RequestInit) => {
          const signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          });
        });
      } else if (scenario.thirdReject) {
        fetchMock.mockRejectedValueOnce(scenario.thirdReject);
      } else {
        fetchMock.mockResolvedValueOnce(
          scenario.thirdResponse ??
            createJsonResponse({
              page: {
                revision: { _id: "rev-001" },
              },
            }),
        );
      }

      const activationOptions: {
        baseUrl?: string;
        apiToken?: string;
        fetchMock: ReturnType<typeof vi.fn>;
      } = { fetchMock };
      if ("baseUrl" in scenario) {
        activationOptions.baseUrl = scenario.baseUrl;
      }
      if ("apiToken" in scenario) {
        activationOptions.apiToken = scenario.apiToken;
      }

      const { provider, baseUrlGetMock, secretGetMock } =
        activateWithApiContext(activationOptions);

      await startEdit(uri);
      scenario.mutateAfterStartEdit?.({ baseUrlGetMock, secretGetMock });

      if (scenario.timeout) {
        vi.useFakeTimers();
        try {
          const writePromise = provider.writeFile(
            uri,
            new TextEncoder().encode("# updated"),
            {
              create: true,
              overwrite: true,
            },
          );
          const assertion = expect(writePromise).rejects.toThrow(
            /failed to fetch current revision/,
          );
          await vi.advanceTimersByTimeAsync(10_000);
          await assertion;
        } finally {
          vi.useRealTimers();
        }
      } else {
        const writePromise = provider.writeFile(
          uri,
          new TextEncoder().encode("# updated"),
          {
            create: true,
            overwrite: true,
          },
        );
        await expect(writePromise).rejects.toThrow(
          /failed to fetch current revision/,
        );
      }
    }
  });

  it("writes file via PUT /_api/v3/page with minimal payload when activated", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const { provider, fetchMock } = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# base" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              revision: { _id: "rev-001" },
            },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              _id: "page-001",
              revision: { _id: "rev-002" },
            },
          }),
        ),
    });

    await startEdit(uri);
    await expect(
      provider.writeFile(uri, new TextEncoder().encode("# updated"), {
        create: true,
        overwrite: true,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      "https://growi.example.com/_api/v3/page",
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual({
      body: JSON.stringify({
        body: "# updated",
        origin: "view",
        pageId: "page-001",
        revisionId: "rev-001",
      }),
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "PUT",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });

  it("classifies 403 as PermissionDenied on writeFile", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const { provider } = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# base" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              revision: { _id: "rev-001" },
            },
          }),
        )
        .mockResolvedValueOnce(createJsonResponse({ error: "forbidden" }, 403)),
    });

    await startEdit(uri);
    await expect(
      provider.writeFile(uri, new TextEncoder().encode("# updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("classifies write API unsupported cases as ApiNotSupported", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const scenarios: Array<{
      name: string;
      fourthResponse?: Response;
      mutateBeforeWrite?: (deps: {
        baseUrlGetMock: ReturnType<typeof vi.fn>;
        secretGetMock: ReturnType<typeof vi.fn>;
      }) => void;
    }> = [
      {
        name: "baseUrl missing on write",
        mutateBeforeWrite: ({ baseUrlGetMock }) => {
          baseUrlGetMock
            .mockImplementationOnce((key: string) =>
              key === "baseUrl" ? "https://growi.example.com/" : undefined,
            )
            .mockImplementation(() => undefined);
        },
      },
      {
        name: "api token missing on write",
        mutateBeforeWrite: ({ secretGetMock }) => {
          secretGetMock.mockResolvedValueOnce("test-token");
          secretGetMock.mockResolvedValue(undefined);
        },
      },
      {
        name: "404 response",
        fourthResponse: createJsonResponse({ error: "not found" }, 404),
      },
      {
        name: "405 response",
        fourthResponse: createJsonResponse(
          { error: "method not allowed" },
          405,
        ),
      },
      {
        name: "non-json response",
        fourthResponse: new Response("<html>not json</html>", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      },
      {
        name: "login redirect response",
        fourthResponse: new Response(null, {
          headers: { location: "/login" },
          status: 302,
        }),
      },
    ];

    for (const scenario of scenarios) {
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
            revision: { body: "# base" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              revision: { _id: "rev-001" },
            },
          }),
        );

      if (scenario.fourthResponse) {
        fetchMock.mockResolvedValueOnce(scenario.fourthResponse);
      }

      const { provider, baseUrlGetMock, secretGetMock } =
        activateWithApiContext({ fetchMock });
      await startEdit(uri);
      scenario.mutateBeforeWrite?.({ baseUrlGetMock, secretGetMock });

      await expect(
        provider.writeFile(uri, new TextEncoder().encode("# updated"), {
          create: true,
          overwrite: true,
        }),
        `scenario: ${scenario.name}`,
      ).rejects.toThrow(/write page API is not supported/);
    }
  });

  it("classifies write fetch rejection and timeout as ConnectionFailed", async () => {
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const fetchRejected = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# base" },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            page: {
              revision: { _id: "rev-001" },
            },
          }),
        )
        .mockRejectedValueOnce(new Error("network down")),
    });

    await startEdit(uri);
    await expect(
      fetchRejected.provider.writeFile(
        uri,
        new TextEncoder().encode("# updated"),
        {
          create: true,
          overwrite: true,
        },
      ),
    ).rejects.toThrow(/failed to connect to GROWI/);

    vi.useFakeTimers();
    try {
      const timeoutCase = activateWithApiContext({
        fetchMock: vi
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
              revision: { body: "# base" },
            }),
          )
          .mockResolvedValueOnce(
            createJsonResponse({
              page: {
                revision: { _id: "rev-001" },
              },
            }),
          )
          .mockImplementationOnce((_input: URL, init?: RequestInit) => {
            const signal = init?.signal;
            return new Promise<Response>((_resolve, reject) => {
              signal?.addEventListener("abort", () => {
                const abortError = new Error("aborted");
                abortError.name = "AbortError";
                reject(abortError);
              });
            });
          }),
      });

      await startEdit(uri);
      const writePromise = timeoutCase.provider.writeFile(
        uri,
        new TextEncoder().encode("# updated"),
        {
          create: true,
          overwrite: true,
        },
      );
      const assertion = expect(writePromise).rejects.toThrow(
        /failed to connect to GROWI/,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks file as readonly by default and directory as writable", () => {
    const provider = createProvider();

    const fileStat = provider.stat({
      scheme: "growi",
      path: "/team/dev/設計.md",
    } as vscode.Uri);
    const dirStat = provider.stat({
      scheme: "growi",
      path: "/team/dev/",
    } as vscode.Uri);

    expect(fileStat.type).toBe(0);
    expect(fileStat.permissions).toBe(vscode.FilePermission.Readonly);
    expect(dirStat.type).toBe(1);
    expect(dirStat.permissions).toBeUndefined();
  });

  it("treats child directory stat without trailing slash as directory", () => {
    const provider = createProvider();

    const dirStat = provider.stat({
      scheme: "growi",
      path: "/team/dev/docs",
    } as vscode.Uri);

    expect(dirStat.type).toBe(vscode.FileType.Directory);
    expect(dirStat.permissions).toBeUndefined();
  });

  it("returns writable file stat when edit session exists", () => {
    const provider = createProvider({
      editSession: {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      },
    });

    const fileStat = provider.stat({
      scheme: "growi",
      path: "/team/dev/設計.md",
    } as vscode.Uri);

    expect(fileStat.type).toBe(0);
    expect(fileStat.permissions).toBeUndefined();
  });

  it("reads file contents via the reader", async () => {
    const provider = createProvider({
      readPage: async (canonicalPath: string) => {
        expect(canonicalPath).toBe("/team/dev/設計");
        return { ok: true, body: "hello" };
      },
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    const bytes = await provider.readFile(uri);

    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("stores current page info after readFile succeeds", async () => {
    const provider = createProvider({
      readPage: async () => ({
        ok: true,
        body: "hello",
        pageInfo: {
          pageId: "page-001",
          url: "https://growi.example.com/team/dev/設計",
          path: "/team/dev/設計",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T09:00:00.000Z",
        },
      }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await provider.readFile(uri);

    expect(provider.getCurrentPageInfo("/team/dev/設計")).toEqual({
      pageId: "page-001",
      url: "https://growi.example.com/team/dev/設計",
      path: "/team/dev/設計",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    } satisfies GrowiCurrentPageInfo);
  });

  it("updates current page info after explicit readFile cache invalidation and re-read", async () => {
    const readPage = vi
      .fn<GrowiPageReader["readPage"]>()
      .mockResolvedValueOnce({
        ok: true,
        body: "before-refresh",
        pageInfo: {
          pageId: "page-001",
          url: "https://growi.example.com/team/dev/設計",
          path: "/team/dev/設計",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T09:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        body: "after-refresh",
        pageInfo: {
          pageId: "page-001",
          url: "https://growi.example.com/team/dev/設計",
          path: "/team/dev/設計",
          lastUpdatedBy: "bob",
          lastUpdatedAt: "2026-03-08T10:00:00.000Z",
        },
      });
    const provider = createProvider({ readPage });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await provider.readFile(uri);
    provider.invalidateReadFileCache("/team/dev/設計");
    await provider.readFile(uri);

    expect(provider.getCurrentPageInfo("/team/dev/設計")).toEqual({
      pageId: "page-001",
      url: "https://growi.example.com/team/dev/設計",
      path: "/team/dev/設計",
      lastUpdatedBy: "bob",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    } satisfies GrowiCurrentPageInfo);
  });

  it("maps NotFound to FileSystemError.FileNotFound", async () => {
    const provider = createProvider({
      readPage: async () => ({ ok: false, reason: "NotFound" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/missing.md" } as vscode.Uri;

    await expect(provider.readFile(uri)).rejects.toThrow(/File not found/);
  });

  it("maps ApiNotSupported to FileSystemError.Unavailable", async () => {
    const provider = createProvider({
      readPage: async () => ({ ok: false, reason: "ApiNotSupported" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(provider.readFile(uri)).rejects.toThrow(
      /read page API is not supported/,
    );
  });

  it("maps ConnectionFailed to FileSystemError.Unavailable", async () => {
    const provider = createProvider({
      readPage: async () => ({ ok: false, reason: "ConnectionFailed" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(provider.readFile(uri)).rejects.toThrow(
      /failed to connect to GROWI/,
    );
  });

  it("shares a single in-flight read request for the same canonical path", async () => {
    let releaseRead: (() => void) | undefined;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });

    const readPage = vi.fn(async () => {
      await waitForRelease;
      return { ok: true, body: "shared-result" } as const;
    });
    const provider = createProvider({ readPage });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    const read1 = provider.readFile(uri);
    const read2 = provider.readFile(uri);

    expect(readPage).toHaveBeenCalledTimes(1);

    releaseRead?.();
    const [bytes1, bytes2] = await Promise.all([read1, read2]);

    expect(new TextDecoder().decode(bytes1)).toBe("shared-result");
    expect(new TextDecoder().decode(bytes2)).toBe("shared-result");
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it("clears in-flight state after read failure so next read retries", async () => {
    let releaseRead: (() => void) | undefined;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });

    let attempt = 0;
    const readPage = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        await waitForRelease;
        return { ok: false, reason: "ConnectionFailed" } as const;
      }
      return { ok: true, body: "retry-success" } as const;
    });
    const provider = createProvider({ readPage });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    const failedRead1 = provider.readFile(uri);
    const failedRead2 = provider.readFile(uri);

    expect(readPage).toHaveBeenCalledTimes(1);

    releaseRead?.();
    await expect(Promise.all([failedRead1, failedRead2])).rejects.toThrow(
      /failed to connect to GROWI/,
    );
    expect(readPage).toHaveBeenCalledTimes(1);

    const retriedBytes = await provider.readFile(uri);

    expect(new TextDecoder().decode(retriedBytes)).toBe("retry-success");
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("reuses readFile body cache within 60 seconds without calling reader again", async () => {
    vi.useFakeTimers();
    try {
      const readPage = vi
        .fn<GrowiPageReader["readPage"]>()
        .mockResolvedValueOnce({ ok: true, body: "cached" });
      const provider = createProvider({ readPage });
      const uri = {
        scheme: "growi",
        path: "/team/dev/設計.md",
      } as vscode.Uri;

      const first = await provider.readFile(uri);
      const second = await provider.readFile(uri);

      expect(new TextDecoder().decode(first)).toBe("cached");
      expect(new TextDecoder().decode(second)).toBe("cached");
      expect(readPage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-fetches body after readFile cache TTL elapsed", async () => {
    vi.useFakeTimers();
    try {
      const readPage = vi
        .fn<GrowiPageReader["readPage"]>()
        .mockResolvedValueOnce({ ok: true, body: "before-ttl" })
        .mockResolvedValueOnce({ ok: true, body: "after-ttl" });
      const provider = createProvider({ readPage });
      const uri = {
        scheme: "growi",
        path: "/team/dev/設計.md",
      } as vscode.Uri;

      const first = await provider.readFile(uri);
      vi.advanceTimersByTime(60_001);
      const second = await provider.readFile(uri);

      expect(new TextDecoder().decode(first)).toBe("before-ttl");
      expect(new TextDecoder().decode(second)).toBe("after-ttl");
      expect(readPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-fetches body after explicit readFile cache invalidation", async () => {
    vi.useFakeTimers();
    try {
      const readPage = vi
        .fn<GrowiPageReader["readPage"]>()
        .mockResolvedValueOnce({ ok: true, body: "before-invalidate" })
        .mockResolvedValueOnce({ ok: true, body: "after-invalidate" });
      const provider = createProvider({ readPage });
      const uri = {
        scheme: "growi",
        path: "/team/dev/設計.md",
      } as vscode.Uri;

      const first = await provider.readFile(uri);
      provider.invalidateReadFileCache("/team/dev/設計");
      const second = await provider.readFile(uri);

      expect(new TextDecoder().decode(first)).toBe("before-invalidate");
      expect(new TextDecoder().decode(second)).toBe("after-invalidate");
      expect(readPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires Changed event for growi file URI when readFile cache is invalidated", async () => {
    const readPage = vi
      .fn<GrowiPageReader["readPage"]>()
      .mockResolvedValue({ ok: true, body: "cached" });
    const provider = createProvider({ readPage });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;
    const fireMock = (
      provider as unknown as {
        emitter: { fire: ReturnType<typeof vi.fn> };
      }
    ).emitter.fire;

    await provider.readFile(uri);
    provider.invalidateReadFileCache("/team/dev/設計");

    expect(fireMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith([
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/設計.md" },
      },
    ]);
  });

  it("fires Changed event when edit session is set and closed", async () => {
    const { provider } = activateWithApiContext({
      fetchMock: vi
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
            revision: { body: "# base body" },
          }),
        ),
    });
    const uri = { scheme: "growi", path: "/team/dev/spec.md" } as vscode.Uri;
    const fireMock = (
      provider as unknown as {
        emitter: { fire: ReturnType<typeof vi.fn> };
      }
    ).emitter.fire;

    await startEdit(uri);
    await endEdit(uri);

    expect(fireMock).toHaveBeenCalledTimes(3);
    expect(fireMock).toHaveBeenNthCalledWith(1, [
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/spec.md" },
      },
    ]);
    expect(fireMock).toHaveBeenNthCalledWith(2, [
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/spec.md" },
      },
    ]);
    expect(fireMock).toHaveBeenNthCalledWith(3, [
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/spec.md" },
      },
    ]);
  });

  it("rejects write when edit session is missing", async () => {
    const provider = createProvider();
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new Uint8Array(), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/writeFile requires an edit session/);
  });

  it("writes file via the page writer when edit session exists", async () => {
    const editSession: GrowiEditSession = {
      pageId: "page-123",
      baseRevisionId: "rev-001",
      baseUpdatedAt: "2024-06-01T00:00:00.000Z",
      baseBody: "base",
      enteredAt: "2024-06-01T01:00:00.000Z",
      dirty: false,
    };
    const provider = createProvider({
      editSession,
      writePage: async (canonicalPath: string, body: string, session) => {
        expect(canonicalPath).toBe("/team/dev/設計");
        expect(body).toBe("updated");
        expect(session).toBe(editSession);
        return { ok: true };
      },
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("closes edit session after writeFile succeeds", async () => {
    const editSession: GrowiEditSession = {
      pageId: "page-123",
      baseRevisionId: "rev-001",
      baseUpdatedAt: "2024-06-01T00:00:00.000Z",
      baseBody: "base",
      enteredAt: "2024-06-01T01:00:00.000Z",
      dirty: false,
    };
    const closeEditSession = vi.fn();
    const provider = createProvider({
      editSession,
      closeEditSession,
      writePage: async () => ({ ok: true }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await provider.writeFile(uri, new TextEncoder().encode("updated"), {
      create: true,
      overwrite: true,
    });

    expect(closeEditSession).toHaveBeenCalledTimes(1);
    expect(closeEditSession).toHaveBeenCalledWith("/team/dev/設計");
  });

  it("updates readFile body cache with saved content after writeFile succeeds", async () => {
    vi.useFakeTimers();
    try {
      const editSession: GrowiEditSession = {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      };
      const readPage = vi
        .fn<GrowiPageReader["readPage"]>()
        .mockResolvedValueOnce({ ok: true, body: "old-body" });
      const provider = createProvider({
        readPage,
        editSession,
        writePage: async () => ({ ok: true }),
      });
      const uri = {
        scheme: "growi",
        path: "/team/dev/設計.md",
      } as vscode.Uri;

      const beforeWrite = await provider.readFile(uri);
      await provider.writeFile(uri, new TextEncoder().encode("new-body"), {
        create: true,
        overwrite: true,
      });
      const afterWrite = await provider.readFile(uri);

      expect(new TextDecoder().decode(beforeWrite)).toBe("old-body");
      expect(new TextDecoder().decode(afterWrite)).toBe("new-body");
      expect(readPage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates current page info after writeFile succeeds", async () => {
    const editSession: GrowiEditSession = {
      pageId: "page-123",
      baseRevisionId: "rev-001",
      baseUpdatedAt: "2024-06-01T00:00:00.000Z",
      baseBody: "base",
      enteredAt: "2024-06-01T01:00:00.000Z",
      dirty: false,
    };
    const provider = createProvider({
      readPage: async () => ({
        ok: true,
        body: "old-body",
        pageInfo: {
          pageId: "page-123",
          url: "https://growi.example.com/team/dev/設計",
          path: "/team/dev/設計",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T09:00:00.000Z",
        },
      }),
      editSession,
      writePage: async () => ({
        ok: true,
        pageInfo: {
          pageId: "page-123",
          url: "https://growi.example.com/team/dev/設計",
          path: "/team/dev/設計",
          lastUpdatedBy: "bob",
          lastUpdatedAt: "2026-03-08T10:00:00.000Z",
        },
      }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await provider.readFile(uri);
    await provider.writeFile(uri, new TextEncoder().encode("new-body"), {
      create: true,
      overwrite: true,
    });

    expect(provider.getCurrentPageInfo("/team/dev/設計")).toEqual({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/設計",
      path: "/team/dev/設計",
      lastUpdatedBy: "bob",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    } satisfies GrowiCurrentPageInfo);
  });

  it("invalidates only ancestor directory caches from saved page parent to matching prefix", async () => {
    vi.useFakeTimers();
    try {
      const listPages = vi
        .fn<GrowiPageListReader["listPages"]>()
        .mockImplementation(
          async (prefix: string): Promise<GrowiPageListResult> => {
            switch (prefix) {
              case "/team/dev":
                return { ok: true, paths: ["/team/dev/docs/guide/設計"] };
              case "/team/dev/docs":
                return { ok: true, paths: ["/team/dev/docs/guide/設計"] };
              case "/team/dev/docs/guide":
                return { ok: true, paths: ["/team/dev/docs/guide/設計"] };
              case "/team/dev/docs/guide/sub":
                return { ok: true, paths: ["/team/dev/docs/guide/sub/メモ"] };
              case "/team/ops":
                return { ok: true, paths: ["/team/ops/運用"] };
              case "/product":
                return { ok: true, paths: ["/product/roadmap"] };
              default:
                return { ok: true, paths: [] };
            }
          },
        );
      const editSession: GrowiEditSession = {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      };
      const provider = createProvider({
        listPages,
        editSession,
        writePage: async () => ({ ok: true }),
        registeredPrefixes: ["/team/dev", "/product"],
      });

      const devUri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;
      const devDocsUri = {
        scheme: "growi",
        path: "/team/dev/docs/",
      } as vscode.Uri;
      const guideUri = {
        scheme: "growi",
        path: "/team/dev/docs/guide/",
      } as vscode.Uri;
      const guideSubUri = {
        scheme: "growi",
        path: "/team/dev/docs/guide/sub/",
      } as vscode.Uri;
      const opsUri = { scheme: "growi", path: "/team/ops/" } as vscode.Uri;
      const productUri = { scheme: "growi", path: "/product/" } as vscode.Uri;

      await provider.readDirectory(devUri);
      await provider.readDirectory(devDocsUri);
      await provider.readDirectory(guideUri);
      await provider.readDirectory(guideSubUri);
      await provider.readDirectory(opsUri);
      await provider.readDirectory(productUri);
      expect(listPages).toHaveBeenCalledTimes(6);

      await provider.writeFile(
        { scheme: "growi", path: "/team/dev/docs/guide/設計.md" } as vscode.Uri,
        new TextEncoder().encode("updated"),
        { create: true, overwrite: true },
      );

      await provider.readDirectory(devUri);
      await provider.readDirectory(devDocsUri);
      await provider.readDirectory(guideUri);
      await provider.readDirectory(guideSubUri);
      await provider.readDirectory(opsUri);
      await provider.readDirectory(productUri);

      expect(listPages).toHaveBeenCalledTimes(9);
      expect(listPages).toHaveBeenNthCalledWith(7, "/team/dev");
      expect(listPages).toHaveBeenNthCalledWith(8, "/team/dev/docs");
      expect(listPages).toHaveBeenNthCalledWith(9, "/team/dev/docs/guide");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invalidate directory cache when saved page does not match any registered prefix", async () => {
    vi.useFakeTimers();
    try {
      const listPages = vi
        .fn<GrowiPageListReader["listPages"]>()
        .mockImplementation(
          async (prefix: string): Promise<GrowiPageListResult> => {
            switch (prefix) {
              case "/team/dev":
                return { ok: true, paths: ["/team/dev/設計"] };
              case "/team/ops":
                return { ok: true, paths: ["/team/ops/運用"] };
              default:
                return { ok: true, paths: [] };
            }
          },
        );
      const editSession: GrowiEditSession = {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      };
      const provider = createProvider({
        listPages,
        editSession,
        writePage: async () => ({ ok: true }),
        registeredPrefixes: ["/product"],
      });
      const devUri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;
      const opsUri = { scheme: "growi", path: "/team/ops/" } as vscode.Uri;

      await provider.readDirectory(devUri);
      await provider.readDirectory(opsUri);
      expect(listPages).toHaveBeenCalledTimes(2);

      await provider.writeFile(
        { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri,
        new TextEncoder().encode("updated"),
        { create: true, overwrite: true },
      );

      await provider.readDirectory(devUri);
      await provider.readDirectory(opsUri);
      expect(listPages).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects write when current revision differs from base revision", async () => {
    const editSession: GrowiEditSession = {
      pageId: "page-123",
      baseRevisionId: "rev-001",
      baseUpdatedAt: "2024-06-01T00:00:00.000Z",
      baseBody: "base",
      enteredAt: "2024-06-01T01:00:00.000Z",
      dirty: false,
    };
    const writePage = vi.fn<GrowiPageWriter["writePage"]>(async () => ({
      ok: true,
    }));
    const closeEditSession = vi.fn();
    const provider = createProvider({
      editSession,
      currentRevision: { ok: true, revisionId: "rev-002" },
      writePage,
      closeEditSession,
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/revision conflict detected/);
    expect(writePage).not.toHaveBeenCalled();
    expect(closeEditSession).not.toHaveBeenCalled();
  });

  it("maps PermissionDenied to FileSystemError.NoPermissions", async () => {
    const provider = createProvider({
      editSession: {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      },
      writePage: async () => ({ ok: false, reason: "PermissionDenied" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("maps ApiNotSupported to FileSystemError.Unavailable", async () => {
    const provider = createProvider({
      editSession: {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      },
      writePage: async () => ({ ok: false, reason: "ApiNotSupported" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/write page API is not supported/);
  });

  it("maps ConnectionFailed to FileSystemError.Unavailable", async () => {
    const closeEditSession = vi.fn();
    const provider = createProvider({
      editSession: {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      },
      closeEditSession,
      writePage: async () => ({ ok: false, reason: "ConnectionFailed" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).rejects.toThrow(/failed to connect to GROWI/);
    expect(closeEditSession).not.toHaveBeenCalled();
  });

  it("shows Japanese save failure message for each failure kind", async () => {
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;
    const editSession: GrowiEditSession = {
      pageId: "page-123",
      baseRevisionId: "rev-001",
      baseUpdatedAt: "2024-06-01T00:00:00.000Z",
      baseBody: "base",
      enteredAt: "2024-06-01T01:00:00.000Z",
      dirty: false,
    };

    const cases: Array<{
      name: string;
      currentRevision?:
        | GrowiCurrentRevisionReader["getCurrentRevision"]
        | { ok: true; revisionId: string }
        | { ok: false };
      writePage?: GrowiPageWriteResult | GrowiPageWriter["writePage"];
      expectedError: RegExp;
      expectedMessage: string;
    }> = [
      {
        name: "conflict",
        currentRevision: { ok: true, revisionId: "rev-002" },
        expectedError: /revision conflict detected/,
        expectedMessage:
          "保存できません: 他の更新が先に保存されました。ページを再読込して内容を確認してください。",
      },
      {
        name: "permission denied",
        writePage: async () => ({ ok: false, reason: "PermissionDenied" }),
        expectedError: /permission denied/,
        expectedMessage:
          "保存できません: 更新権限がありません。GROWI の権限設定を確認してください。",
      },
      {
        name: "api not supported",
        writePage: async () => ({ ok: false, reason: "ApiNotSupported" }),
        expectedError: /write page API is not supported/,
        expectedMessage:
          "保存できません: 更新 API が未対応です。接続先の GROWI 環境を確認してください。",
      },
      {
        name: "connection failed",
        writePage: async () => ({ ok: false, reason: "ConnectionFailed" }),
        expectedError: /failed to connect to GROWI/,
        expectedMessage:
          "保存できません: GROWI への接続に失敗しました。接続先と認証情報を確認してください。",
      },
      {
        name: "current revision failed",
        currentRevision: { ok: false },
        expectedError: /failed to fetch current revision/,
        expectedMessage:
          "保存できません: 最新 revision の確認に失敗しました。接続状態を確認して再試行してください。",
      },
      {
        name: "other failure",
        writePage: async () => {
          throw new Error("unexpected failure");
        },
        expectedError: /unexpected failure/,
        expectedMessage: "保存できません: 保存処理に失敗しました。",
      },
    ];

    for (const testCase of cases) {
      const showSaveFailure = vi.fn();
      const provider = createProvider({
        editSession,
        currentRevision: testCase.currentRevision,
        writePage: testCase.writePage,
        saveFailureNotifier: { showSaveFailure },
      });

      await expect(
        provider.writeFile(uri, new TextEncoder().encode("updated"), {
          create: true,
          overwrite: true,
        }),
        `case: ${testCase.name}`,
      ).rejects.toThrow(testCase.expectedError);

      expect(showSaveFailure, `case: ${testCase.name}`).toHaveBeenCalledTimes(
        1,
      );
      expect(showSaveFailure, `case: ${testCase.name}`).toHaveBeenCalledWith(
        testCase.expectedMessage,
      );
    }
  });

  it("does not show save failure notification on successful save", async () => {
    const showSaveFailure = vi.fn();
    const provider = createProvider({
      editSession: {
        pageId: "page-123",
        baseRevisionId: "rev-001",
        baseUpdatedAt: "2024-06-01T00:00:00.000Z",
        baseBody: "base",
        enteredAt: "2024-06-01T01:00:00.000Z",
        dirty: false,
      },
      writePage: async () => ({ ok: true }),
      saveFailureNotifier: { showSaveFailure },
    });
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;

    await expect(
      provider.writeFile(uri, new TextEncoder().encode("updated"), {
        create: true,
        overwrite: true,
      }),
    ).resolves.toBeUndefined();
    expect(showSaveFailure).not.toHaveBeenCalled();
  });

  it("fails non-supported file operations with FileSystemError.Unavailable", () => {
    const provider = createProvider();
    const uri = { scheme: "growi", path: "/team/dev/設計.md" } as vscode.Uri;
    const runAndCapture = (fn: () => void) => {
      try {
        fn();
        throw new Error("Expected FileSystemError.Unavailable to be thrown.");
      } catch (error) {
        return error;
      }
    };

    const createDirectoryError = runAndCapture(() =>
      provider.createDirectory(uri),
    );
    expect(createDirectoryError).toBeInstanceOf(FileSystemError);
    expect((createDirectoryError as Error).message).toMatch(
      /createDirectory is not supported/,
    );

    const deleteError = runAndCapture(() =>
      provider.delete(uri, { recursive: false }),
    );
    expect(deleteError).toBeInstanceOf(FileSystemError);
    expect((deleteError as Error).message).toMatch(/delete is not supported/);

    const renameError = runAndCapture(() =>
      provider.rename(uri, uri, { overwrite: false }),
    );
    expect(renameError).toBeInstanceOf(FileSystemError);
    expect((renameError as Error).message).toMatch(/rename is not supported/);
  });

  it("returns a no-op disposable from watch", () => {
    const provider = createProvider();
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    const disposable = provider.watch(uri, { recursive: false, excludes: [] });

    expect(typeof disposable.dispose).toBe("function");
  });

  it("reconstructs immediate children from flat paths", async () => {
    const provider = createProvider({
      listPages: async (prefix: string) => {
        expect(prefix).toBe("/team/dev");
        return {
          ok: true,
          paths: [
            "/team/dev/設計",
            "/team/dev/設計/レビュー",
            "/team/dev/共通",
            "/team/dev/共通/内規",
            "/team/dev/ガイド/入門",
            "/team/dev/メモ",
            "/team/ops/運用",
          ],
        };
      },
    });
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    const entries = await provider.readDirectory(uri);

    expect(entries).toEqual([
      ["ガイド", 1],
      ["メモ.md", 0],
      ["共通.md", 0],
      ["共通", 1],
      ["設計.md", 0],
      ["設計", 1],
    ]);
  });

  it("retries directory listing with trailing slash when non-root prefix has no descendants", async () => {
    const listPages = vi.fn(
      async (prefix: string): Promise<GrowiPageListResult> => {
        if (prefix === "/sample") {
          return {
            ok: true,
            paths: ["/sample"],
          };
        }
        if (prefix === "/sample/") {
          return {
            ok: true,
            paths: ["/sample/test"],
          };
        }
        return {
          ok: true,
          paths: [],
        };
      },
    );
    const provider = createProvider({
      listPages,
    });

    const entries = await provider.readDirectory({
      scheme: "growi",
      path: "/sample/",
    } as vscode.Uri);

    expect(entries).toEqual([["test.md", 0]]);
    expect(listPages).toHaveBeenNthCalledWith(1, "/sample");
    expect(listPages).toHaveBeenNthCalledWith(2, "/sample/");
  });

  it("lists immediate children for root prefix", async () => {
    const provider = createProvider({
      listPages: async (prefix: string) => {
        expect(prefix).toBe("/");
        return {
          ok: true,
          paths: [
            "/team",
            "/team/dev",
            "/misc",
            "/misc/guide",
            "/docs/guide",
            "/README",
          ],
        };
      },
    });
    const uri = { scheme: "growi", path: "/" } as vscode.Uri;

    const entries = await provider.readDirectory(uri);

    expect(entries).toEqual([
      ["docs", 1],
      ["misc.md", 0],
      ["misc", 1],
      ["README.md", 0],
      ["team.md", 0],
      ["team", 1],
    ]);
  });

  it("maps ApiNotSupported to FileSystemError.Unavailable", async () => {
    const provider = createProvider({
      listPages: async () => ({ ok: false, reason: "ApiNotSupported" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    await expect(provider.readDirectory(uri)).rejects.toThrow(
      /list pages API is not supported/,
    );
  });

  it("maps ConnectionFailed to FileSystemError.Unavailable", async () => {
    const provider = createProvider({
      listPages: async () => ({ ok: false, reason: "ConnectionFailed" }),
    });
    const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

    await expect(provider.readDirectory(uri)).rejects.toThrow(
      /failed to connect to GROWI/,
    );
  });

  it("reuses readDirectory result within 300 seconds without calling listPages again", async () => {
    vi.useFakeTimers();
    try {
      const listPages = vi
        .fn<GrowiPageListReader["listPages"]>()
        .mockResolvedValueOnce({
          ok: true,
          paths: ["/team/dev/設計", "/team/dev/共通/内規"],
        });
      const provider = createProvider({ listPages });
      const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

      const first = await provider.readDirectory(uri);
      const second = await provider.readDirectory(uri);

      expect(first).toEqual([
        ["共通", 1],
        ["設計.md", 0],
      ]);
      expect(second).toEqual(first);
      expect(listPages).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-fetches readDirectory result after 300 seconds TTL elapsed", async () => {
    vi.useFakeTimers();
    try {
      const listPages = vi
        .fn<GrowiPageListReader["listPages"]>()
        .mockResolvedValueOnce({
          ok: true,
          paths: ["/team/dev/設計"],
        })
        .mockResolvedValueOnce({
          ok: true,
          paths: ["/team/dev/共通"],
        });
      const provider = createProvider({ listPages });
      const uri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;

      const first = await provider.readDirectory(uri);
      vi.advanceTimersByTime(300_001);
      const second = await provider.readDirectory(uri);

      expect(first).toEqual([["設計.md", 0]]);
      expect(second).toEqual([["共通.md", 0]]);
      expect(listPages).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidates readDirectory cache under a target prefix and re-fetches only invalidated paths", async () => {
    vi.useFakeTimers();
    try {
      const listPages = vi
        .fn<GrowiPageListReader["listPages"]>()
        .mockImplementation(
          async (prefix: string): Promise<GrowiPageListResult> => {
            switch (prefix) {
              case "/team/dev":
                return { ok: true, paths: ["/team/dev/設計"] };
              case "/team/dev/docs":
                return { ok: true, paths: ["/team/dev/docs/手順"] };
              case "/team/ops":
                return { ok: true, paths: ["/team/ops/運用"] };
              default:
                return { ok: true, paths: [] };
            }
          },
        );
      const provider = createProvider({ listPages });

      const devUri = { scheme: "growi", path: "/team/dev/" } as vscode.Uri;
      const devDocsUri = {
        scheme: "growi",
        path: "/team/dev/docs/",
      } as vscode.Uri;
      const opsUri = { scheme: "growi", path: "/team/ops/" } as vscode.Uri;

      await provider.readDirectory(devUri);
      await provider.readDirectory(devDocsUri);
      await provider.readDirectory(opsUri);
      expect(listPages).toHaveBeenCalledTimes(3);

      provider.invalidateReadDirectoryCache("/team/dev");

      await provider.readDirectory(devUri);
      await provider.readDirectory(devDocsUri);
      await provider.readDirectory(opsUri);

      expect(listPages).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires Changed event per invalidated directory when readDirectory cache is invalidated", async () => {
    const listPages = vi
      .fn<GrowiPageListReader["listPages"]>()
      .mockImplementation(async (): Promise<GrowiPageListResult> => {
        return { ok: true, paths: [] };
      });
    const provider = createProvider({ listPages });
    const fireMock = (
      provider as unknown as {
        emitter: { fire: ReturnType<typeof vi.fn> };
      }
    ).emitter.fire;

    await provider.readDirectory({
      scheme: "growi",
      path: "/team/dev/",
    } as vscode.Uri);
    await provider.readDirectory({
      scheme: "growi",
      path: "/team/dev/docs/",
    } as vscode.Uri);
    await provider.readDirectory({
      scheme: "growi",
      path: "/team/ops/",
    } as vscode.Uri);
    fireMock.mockClear();

    provider.invalidateReadDirectoryCache("/team/dev");

    expect(fireMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith([
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/" },
      },
      {
        type: 1,
        uri: { scheme: "growi", path: "/team/dev/docs/" },
      },
    ]);
  });
});

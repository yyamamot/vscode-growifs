import * as vscode from "vscode";

import { normalizeCanonicalPath } from "../core/uri";

export type GrowiAccessFailureReason =
  | "BaseUrlNotConfigured"
  | "ApiTokenNotConfigured"
  | "InvalidApiToken"
  | "PermissionDenied"
  | "ApiNotSupported"
  | "ConnectionFailed";

export type GrowiReadFailureReason = GrowiAccessFailureReason | "NotFound";

export type GrowiPageReadResult =
  | { ok: true; body: string; pageInfo?: GrowiCurrentPageInfo }
  | { ok: false; reason: GrowiReadFailureReason };

export type GrowiPageReader = {
  readPage(canonicalPath: string): Promise<GrowiPageReadResult>;
};

export type GrowiPageWriteResult =
  | { ok: true; pageInfo?: GrowiCurrentPageInfo }
  | {
      ok: false;
      reason: GrowiAccessFailureReason;
    };

export type GrowiPageCreateFailureReason =
  | GrowiAccessFailureReason
  | "NotFound"
  | "AlreadyExists";

export type GrowiPageCreateResult =
  | { ok: true; pageInfo?: GrowiCurrentPageInfo }
  | {
      ok: false;
      reason: GrowiPageCreateFailureReason;
    };

export type GrowiPageRenameFailureReason =
  | GrowiAccessFailureReason
  | "NotFound"
  | "ParentNotFound"
  | "AlreadyExists"
  | "Rejected";

export type GrowiPageRenameMode = "page" | "subtree";

export type GrowiPageRenameResult =
  | {
      ok: true;
      canonicalPath: string;
      pageInfo?: GrowiCurrentPageInfo;
    }
  | {
      ok: false;
      reason: GrowiPageRenameFailureReason;
      message?: string;
    };

export type GrowiPageDeleteFailureReason =
  | GrowiAccessFailureReason
  | "NotFound"
  | "HasChildren"
  | "Rejected";

export type GrowiPageDeleteMode = "page" | "subtree";

export type GrowiPageDeleteResult =
  | { ok: true }
  | {
      ok: false;
      reason: GrowiPageDeleteFailureReason;
      message?: string;
    };

export type GrowiPageWriter = {
  writePage(
    canonicalPath: string,
    body: string,
    editSession: GrowiEditSession,
  ): Promise<GrowiPageWriteResult>;
};

export type GrowiPageCreator = {
  createPage(
    canonicalPath: string,
    body: string,
  ): Promise<GrowiPageCreateResult>;
  resolveCreatePageBody(canonicalPath: string): Promise<string>;
};

export type GrowiPageRenamer = {
  renamePage(input: {
    pageId: string;
    revisionId: string;
    currentCanonicalPath: string;
    targetCanonicalPath: string;
    mode: GrowiPageRenameMode;
  }): Promise<GrowiPageRenameResult>;
};

export type GrowiPageDeleter = {
  deletePage(input: {
    pageId: string;
    revisionId: string;
    canonicalPath: string;
    mode: GrowiPageDeleteMode;
  }): Promise<GrowiPageDeleteResult>;
};

export type GrowiCurrentRevisionResult =
  | { ok: true; revisionId: string }
  | { ok: false };

export type GrowiCurrentRevisionReader = {
  getCurrentRevision(
    canonicalPath: string,
  ): Promise<GrowiCurrentRevisionResult>;
};

export type GrowiPageListResult =
  | { ok: true; paths: string[] }
  | { ok: false; reason: GrowiAccessFailureReason };

export type GrowiPageListReader = {
  listPages(canonicalPrefixPath: string): Promise<GrowiPageListResult>;
};

export type GrowiEditSession = {
  pageId: string;
  baseRevisionId: string;
  baseUpdatedAt: string;
  baseBody: string;
  enteredAt: string;
  dirty: boolean;
};

export type GrowiEditSessionReference = {
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  closeEditSession(canonicalPath: string): void;
};

export type GrowiSaveFailureNotifier = {
  showSaveFailure(message: string): void;
};

export type GrowiCurrentPageInfo = {
  pageId: string;
  revisionId?: string;
  url: string;
  path: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
};

type FailureKind =
  | "ReadFileUnimplemented"
  | "ReadDirectoryUnimplemented"
  | "WriteFileNotSupported"
  | "WriteFileUnimplemented"
  | "CreateDirectoryNotSupported"
  | "DeleteNotSupported"
  | "RenameNotSupported";

const FAILURE_MESSAGES: Record<FailureKind, string> = {
  ReadFileUnimplemented: "readFile is not implemented",
  ReadDirectoryUnimplemented: "readDirectory is not implemented",
  WriteFileNotSupported: "writeFile requires an edit session",
  WriteFileUnimplemented: "writeFile save path is not implemented yet",
  CreateDirectoryNotSupported:
    "createDirectory is not supported in initial version",
  DeleteNotSupported: "delete is not supported in initial version",
  RenameNotSupported: "rename is not supported in initial version",
};

function createUnavailableError(kind: FailureKind): vscode.FileSystemError {
  return vscode.FileSystemError.Unavailable(`growi: ${FAILURE_MESSAGES[kind]}`);
}

const LIST_FAILURE_MESSAGES = {
  BaseUrlNotConfigured: "base URL is not configured",
  ApiTokenNotConfigured: "API token is not configured",
  InvalidApiToken: "invalid API token",
  PermissionDenied: "permission denied",
  ApiNotSupported: "list pages API is not supported",
  ConnectionFailed: "failed to connect to GROWI",
} as const;

function createListReaderError(
  kind: keyof typeof LIST_FAILURE_MESSAGES,
): vscode.FileSystemError {
  const message = `growi: ${LIST_FAILURE_MESSAGES[kind]}`;
  if (kind === "InvalidApiToken" || kind === "PermissionDenied") {
    return vscode.FileSystemError.NoPermissions(message);
  }
  return vscode.FileSystemError.Unavailable(message);
}

const READ_FAILURE_MESSAGES = {
  BaseUrlNotConfigured: "base URL is not configured",
  ApiTokenNotConfigured: "API token is not configured",
  InvalidApiToken: "invalid API token",
  PermissionDenied: "permission denied",
  ApiNotSupported: "read page API is not supported",
  ConnectionFailed: "failed to connect to GROWI",
} as const;

function createReadReaderError(
  kind: keyof typeof READ_FAILURE_MESSAGES,
): vscode.FileSystemError {
  const message = `growi: ${READ_FAILURE_MESSAGES[kind]}`;
  if (kind === "InvalidApiToken" || kind === "PermissionDenied") {
    return vscode.FileSystemError.NoPermissions(message);
  }
  return vscode.FileSystemError.Unavailable(message);
}

const WRITE_FAILURE_MESSAGES = {
  BaseUrlNotConfigured: "base URL is not configured",
  ApiTokenNotConfigured: "API token is not configured",
  InvalidApiToken: "invalid API token",
  PermissionDenied: "permission denied",
  ApiNotSupported: "write page API is not supported",
  ConnectionFailed: "failed to connect to GROWI",
} as const;

function createWriteWriterError(
  kind: keyof typeof WRITE_FAILURE_MESSAGES,
): vscode.FileSystemError {
  const message = `growi: ${WRITE_FAILURE_MESSAGES[kind]}`;
  if (kind === "InvalidApiToken" || kind === "PermissionDenied") {
    return vscode.FileSystemError.NoPermissions(message);
  }
  return vscode.FileSystemError.Unavailable(message);
}

function createCurrentRevisionError(): vscode.FileSystemError {
  return vscode.FileSystemError.Unavailable(
    "growi: failed to fetch current revision",
  );
}

function createConflictError(): vscode.FileSystemError {
  return vscode.FileSystemError.Unavailable(
    "growi: revision conflict detected",
  );
}

type SaveFailureKind =
  | "Conflict"
  | "BaseUrlNotConfigured"
  | "ApiTokenNotConfigured"
  | "InvalidApiToken"
  | "PermissionDenied"
  | "ApiNotSupported"
  | "ConnectionFailed"
  | "CurrentRevisionFailed"
  | "Other";

const SAVE_FAILURE_MESSAGES: Record<SaveFailureKind, string> = {
  Conflict:
    "保存できません: 他の更新が先に保存されました。ページを再読込して内容を確認してください。",
  BaseUrlNotConfigured:
    "保存できません: GROWI base URL が未設定です。Configure Base URL を実行してください。",
  ApiTokenNotConfigured:
    "保存できません: GROWI API token が未設定です。Configure API Token を実行してください。",
  InvalidApiToken:
    "保存できません: GROWI API token が無効です。Configure API Token を確認してください。",
  PermissionDenied:
    "保存できません: 更新権限がありません。GROWI の権限設定を確認してください。",
  ApiNotSupported:
    "保存できません: 更新 API が未対応です。接続先の GROWI 環境を確認してください。",
  ConnectionFailed:
    "保存できません: GROWI への接続に失敗しました。接続先と認証情報を確認してください。",
  CurrentRevisionFailed:
    "保存できません: 最新 revision の確認に失敗しました。接続状態を確認して再試行してください。",
  Other: "保存できません: 保存処理に失敗しました。",
};

export class GrowiFileSystemProvider implements vscode.FileSystemProvider {
  private static readonly READ_FILE_CACHE_TTL_MS = 60_000;
  private static readonly READ_DIRECTORY_CACHE_TTL_MS = 300_000;

  constructor(
    private readonly reader: GrowiPageReader,
    private readonly listReader: GrowiPageListReader,
    private readonly editSessionReference: GrowiEditSessionReference,
    private readonly currentRevisionReader: GrowiCurrentRevisionReader,
    private readonly writer: GrowiPageWriter,
    private readonly getRegisteredPrefixes:
      | (() => string[])
      | undefined = undefined,
    private readonly saveFailureNotifier:
      | GrowiSaveFailureNotifier
      | undefined = undefined,
  ) {}

  private readonly emitter = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  private readonly inFlightReadRequests = new Map<
    string,
    Promise<Uint8Array>
  >();
  private readonly readFileCache = new Map<
    string,
    {
      body: string;
      expiresAtMs: number;
    }
  >();
  private readonly fileModifiedAtMs = new Map<string, number>();
  private readonly readDirectoryCache = new Map<
    string,
    {
      entries: [string, vscode.FileType][];
      expiresAtMs: number;
    }
  >();
  private readonly currentPageInfo = new Map<string, GrowiCurrentPageInfo>();

  readonly onDidChangeFile = this.emitter.event;

  private notifySaveFailure(kind: SaveFailureKind): void {
    this.saveFailureNotifier?.showSaveFailure(SAVE_FAILURE_MESSAGES[kind]);
  }

  private touchFile(canonicalPath: string): number {
    const previous = this.fileModifiedAtMs.get(canonicalPath) ?? 0;
    const next = Math.max(Date.now(), previous + 1);
    this.fileModifiedAtMs.set(canonicalPath, next);
    return next;
  }

  private emitFileChanged(canonicalPath: string): void {
    this.touchFile(canonicalPath);
    this.emitter.fire([
      {
        type: 1 as vscode.FileChangeType,
        uri: {
          scheme: "growi",
          path: `${canonicalPath}.md`,
        } as vscode.Uri,
      },
    ]);
  }

  private isRegisteredPrefixRoot(canonicalPath: string): boolean {
    return this.getRegisteredPrefixes?.().includes(canonicalPath) ?? false;
  }

  invalidateReadFileCache(canonicalPath: string): void {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok) {
      return;
    }

    const canonicalFilePath = normalized.value;
    this.readFileCache.delete(canonicalFilePath);
    this.inFlightReadRequests.delete(canonicalFilePath);
    this.emitFileChanged(canonicalFilePath);
  }

  invalidateReadDirectoryCache(canonicalDirectoryPath: string): void {
    const normalized = normalizeCanonicalPath(canonicalDirectoryPath);
    if (!normalized.ok) {
      return;
    }

    const prefix = normalized.value;
    const invalidatedPaths: string[] = [];
    for (const key of this.readDirectoryCache.keys()) {
      if (this.isSameOrDescendantPath(key, prefix)) {
        invalidatedPaths.push(key);
        this.readDirectoryCache.delete(key);
      }
    }

    if (invalidatedPaths.length > 0) {
      this.emitter.fire(
        invalidatedPaths.map((directoryPath) => ({
          type: vscode.FileChangeType.Changed,
          uri: vscode.Uri.from({
            scheme: "growi",
            path: directoryPath === "/" ? "/" : `${directoryPath}/`,
          }),
        })),
      );
    }
  }

  invalidateReadDirectoryCacheExact(
    canonicalDirectoryPaths: readonly string[],
  ): void {
    const invalidatedPaths: string[] = [];
    for (const canonicalDirectoryPath of canonicalDirectoryPaths) {
      const normalized = normalizeCanonicalPath(canonicalDirectoryPath);
      if (!normalized.ok) {
        continue;
      }

      const path = normalized.value;
      if (!this.readDirectoryCache.delete(path)) {
        continue;
      }
      invalidatedPaths.push(path);
    }

    if (invalidatedPaths.length > 0) {
      this.emitter.fire(
        invalidatedPaths.map((directoryPath) => ({
          type: vscode.FileChangeType.Changed,
          uri: vscode.Uri.from({
            scheme: "growi",
            path: directoryPath === "/" ? "/" : `${directoryPath}/`,
          }),
        })),
      );
    }
  }

  getCurrentPageInfo(canonicalPath: string): GrowiCurrentPageInfo | undefined {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok) {
      return undefined;
    }
    return this.currentPageInfo.get(normalized.value);
  }

  private setCurrentPageInfo(
    canonicalPath: string,
    info: GrowiCurrentPageInfo | undefined,
  ): void {
    if (!info) {
      this.currentPageInfo.delete(canonicalPath);
      return;
    }
    this.currentPageInfo.set(canonicalPath, info);
  }

  private async listDirectoryPaths(
    canonicalDirectoryPath: string,
  ): Promise<GrowiPageListResult> {
    const initialResult = await this.listReader.listPages(
      canonicalDirectoryPath,
    );
    if (!initialResult.ok || canonicalDirectoryPath === "/") {
      return initialResult;
    }

    const descendantPrefix = `${canonicalDirectoryPath}/`;
    const hasDescendant = initialResult.paths.some((path) =>
      path.startsWith(descendantPrefix),
    );
    if (hasDescendant) {
      return initialResult;
    }

    const fallbackResult = await this.listReader.listPages(descendantPrefix);
    if (!fallbackResult.ok) {
      return initialResult;
    }

    return fallbackResult;
  }

  private isSameOrDescendantPath(path: string, prefix: string): boolean {
    if (prefix === "/") {
      return true;
    }
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  private isDescendantPath(path: string, ancestor: string): boolean {
    if (ancestor === "/") {
      return path !== "/";
    }
    return path.startsWith(`${ancestor}/`);
  }

  private toParentDirectoryPath(canonicalPath: string): string {
    if (canonicalPath === "/") {
      return "/";
    }

    const lastSeparator = canonicalPath.lastIndexOf("/");
    if (lastSeparator <= 0) {
      return "/";
    }
    return canonicalPath.slice(0, lastSeparator);
  }

  private resolveAncestorDirectoriesForSave(
    savedCanonicalPath: string,
  ): string[] {
    const prefixes = this.getRegisteredPrefixes?.() ?? [];
    if (prefixes.length === 0) {
      return [];
    }

    const matchingPrefixes: string[] = [];
    for (const rawPrefix of prefixes) {
      const normalized = normalizeCanonicalPath(rawPrefix);
      if (!normalized.ok) {
        continue;
      }

      const prefix = normalized.value;
      if (this.isDescendantPath(savedCanonicalPath, prefix)) {
        matchingPrefixes.push(prefix);
      }
    }

    if (matchingPrefixes.length === 0) {
      return [];
    }

    matchingPrefixes.sort((a, b) => b.length - a.length);
    const targetPrefix = matchingPrefixes[0];
    const parentDirectory = this.toParentDirectoryPath(savedCanonicalPath);
    if (!this.isSameOrDescendantPath(parentDirectory, targetPrefix)) {
      return [];
    }

    const ancestors: string[] = [];
    let currentDirectory = parentDirectory;
    while (true) {
      ancestors.push(currentDirectory);
      if (currentDirectory === targetPrefix) {
        break;
      }
      currentDirectory = this.toParentDirectoryPath(currentDirectory);
    }

    return ancestors;
  }

  fireFileChangedForCanonicalPath(canonicalPath: string): void {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok || normalized.value === "/") {
      return;
    }

    this.emitFileChanged(normalized.value);
  }

  clearSubtreeState(canonicalPrefixPath: string): void {
    const normalized = normalizeCanonicalPath(canonicalPrefixPath);
    if (!normalized.ok) {
      return;
    }

    const prefix = normalized.value;
    for (const key of this.readFileCache.keys()) {
      if (this.isSameOrDescendantPath(key, prefix)) {
        this.readFileCache.delete(key);
      }
    }
    for (const key of this.inFlightReadRequests.keys()) {
      if (this.isSameOrDescendantPath(key, prefix)) {
        this.inFlightReadRequests.delete(key);
      }
    }
    for (const key of this.fileModifiedAtMs.keys()) {
      if (this.isSameOrDescendantPath(key, prefix)) {
        this.fileModifiedAtMs.delete(key);
      }
    }
    for (const key of this.currentPageInfo.keys()) {
      if (this.isSameOrDescendantPath(key, prefix)) {
        this.currentPageInfo.delete(key);
      }
    }
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const path = uri.path ?? "";
    const type =
      path === "/" || !path.endsWith(".md")
        ? vscode.FileType.Directory
        : vscode.FileType.File;
    const normalized = normalizeCanonicalPath(path);
    const permissions =
      type === vscode.FileType.File &&
      (!normalized.ok ||
        !this.editSessionReference.getEditSession(normalized.value))
        ? vscode.FilePermission.Readonly
        : undefined;

    return {
      type,
      ctime: 0,
      mtime:
        type === vscode.FileType.File && normalized.ok
          ? (this.fileModifiedAtMs.get(normalized.value) ?? 0)
          : 0,
      size: 0,
      permissions,
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const normalized = normalizeCanonicalPath(uri.path ?? "");
    if (!normalized.ok) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const prefix = normalized.value;
    const cached = this.readDirectoryCache.get(prefix);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now) {
      return cached.entries;
    }
    if (cached) {
      this.readDirectoryCache.delete(prefix);
    }

    const prefixWithSlash = prefix === "/" ? "/" : `${prefix}/`;
    const listResult = await this.listDirectoryPaths(prefix);
    if (!listResult.ok) {
      if (this.isRegisteredPrefixRoot(prefix)) {
        return [];
      }
      throw createListReaderError(listResult.reason);
    }
    const paths = listResult.paths;

    const entries = new Map<string, { hasPage: boolean; hasChild: boolean }>();

    for (const path of paths) {
      if (!path.startsWith(prefixWithSlash)) {
        continue;
      }

      const remaining = path.slice(prefixWithSlash.length);
      if (remaining.length === 0) {
        continue;
      }

      const firstSlash = remaining.indexOf("/");
      const name =
        firstSlash === -1 ? remaining : remaining.slice(0, firstSlash);
      if (name.length === 0) {
        continue;
      }

      const current = entries.get(name) ?? {
        hasPage: false,
        hasChild: false,
      };

      if (firstSlash === -1) {
        current.hasPage = true;
      } else {
        current.hasChild = true;
      }

      entries.set(name, current);
    }

    const result: [string, vscode.FileType][] = [];
    const names = [...entries.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const entry = entries.get(name);
      if (!entry) {
        continue;
      }

      if (entry.hasPage) {
        result.push([`${name}.md`, vscode.FileType.File]);
      }
      if (entry.hasChild) {
        result.push([name, vscode.FileType.Directory]);
      }
    }

    this.readDirectoryCache.set(prefix, {
      entries: result,
      expiresAtMs:
        Date.now() + GrowiFileSystemProvider.READ_DIRECTORY_CACHE_TTL_MS,
    });
    return result;
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const normalized = normalizeCanonicalPath(uri.path ?? "");
    if (!normalized.ok) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const canonicalPath = normalized.value;
    const cached = this.readFileCache.get(canonicalPath);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now) {
      return new TextEncoder().encode(cached.body);
    }
    if (cached) {
      this.readFileCache.delete(canonicalPath);
    }

    const inFlight = this.inFlightReadRequests.get(canonicalPath);
    if (inFlight) {
      return inFlight;
    }

    const request = (async (): Promise<Uint8Array> => {
      const result = await this.reader.readPage(canonicalPath);
      if (!result.ok) {
        if (result.reason === "NotFound") {
          throw vscode.FileSystemError.FileNotFound(uri);
        }
        throw createReadReaderError(result.reason);
      }

      this.readFileCache.set(canonicalPath, {
        body: result.body,
        expiresAtMs:
          Date.now() + GrowiFileSystemProvider.READ_FILE_CACHE_TTL_MS,
      });
      this.touchFile(canonicalPath);
      this.setCurrentPageInfo(canonicalPath, result.pageInfo);
      return new TextEncoder().encode(result.body);
    })();

    this.inFlightReadRequests.set(canonicalPath, request);
    try {
      return await request;
    } finally {
      if (this.inFlightReadRequests.get(canonicalPath) === request) {
        this.inFlightReadRequests.delete(canonicalPath);
      }
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const normalized = normalizeCanonicalPath(uri.path ?? "");
    if (!normalized.ok) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const editSession = this.editSessionReference.getEditSession(
      normalized.value,
    );
    if (!editSession) {
      throw createUnavailableError("WriteFileNotSupported");
    }

    const currentRevision = await this.currentRevisionReader.getCurrentRevision(
      normalized.value,
    );
    if (!currentRevision.ok) {
      this.notifySaveFailure("CurrentRevisionFailed");
      throw createCurrentRevisionError();
    }
    if (currentRevision.revisionId !== editSession.baseRevisionId) {
      this.notifySaveFailure("Conflict");
      throw createConflictError();
    }

    const body = new TextDecoder().decode(content);
    let result: GrowiPageWriteResult;
    try {
      result = await this.writer.writePage(normalized.value, body, editSession);
    } catch (error) {
      this.notifySaveFailure("Other");
      throw error;
    }
    if (!result.ok) {
      this.notifySaveFailure(result.reason);
      throw createWriteWriterError(result.reason);
    }

    this.readFileCache.set(normalized.value, {
      body,
      expiresAtMs: Date.now() + GrowiFileSystemProvider.READ_FILE_CACHE_TTL_MS,
    });
    this.touchFile(normalized.value);
    this.setCurrentPageInfo(normalized.value, result.pageInfo);
    const ancestorsToInvalidate = this.resolveAncestorDirectoriesForSave(
      normalized.value,
    );
    this.invalidateReadDirectoryCacheExact(ancestorsToInvalidate);
    this.editSessionReference.closeEditSession(normalized.value);
  }

  createDirectory(_uri: vscode.Uri): void {
    throw createUnavailableError("CreateDirectoryNotSupported");
  }

  delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
    throw createUnavailableError("DeleteNotSupported");
  }

  rename(
    _oldUri: vscode.Uri,
    _newUri: vscode.Uri,
    _options: { overwrite: boolean },
  ): void {
    throw createUnavailableError("RenameNotSupported");
  }

  watch(
    _uri: vscode.Uri,
    _options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    return { dispose() {} };
  }
}

import type { ParsedGrowiReference } from "../core/uri";
import type {
  GrowiEditSession,
  GrowiPageCreateResult,
  GrowiPageDeleteResult,
  GrowiPageListOptions,
  GrowiPageListResult,
  GrowiPageRenameResult,
  GrowiPageWriteResult,
  GrowiReadFailureReason,
} from "./fsProvider";
import type { GrowiAttachmentListResult } from "./growiApi";
import type { MirrorCompareScmState } from "./mirror/mirrorCompareScm";
import type {
  GrowiRevisionListResult,
  GrowiRevisionReadResult,
} from "./revisionModel";

export type BaseUrlResult =
  | { ok: true; value: string }
  | { ok: false; reason: "InvalidUrl" };

export interface InputBoxOptionsLike {
  password?: boolean;
  placeHolder?: string;
  prompt?: string;
  title?: string;
  value?: string;
}

export interface MirrorCommandDeps {
  executeCommand?(command: string, ...args: unknown[]): Promise<void>;
  bootstrapEditSession(
    canonicalPath: string,
  ): Promise<StartEditBootstrapResult>;
  getBaseUrl(): string | undefined;
  getActiveEditorUri(): UriLike | undefined;
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  getLocalWorkspaceRoot(): string | undefined;
  getLocalMirrorMaxPrefixPages(): number;
  invalidateReadFileCache(canonicalPath: string): void;
  listPages(
    canonicalPrefixPath: string,
    options?: GrowiPageListOptions,
  ): Promise<GrowiPageListResult>;
  findOpenTextDocument(path: string): { isDirty: boolean } | undefined;
  openLocalFile(path: string): Promise<void>;
  openChanges?(
    title: string,
    resources: readonly ChangesResourceTuple[],
  ): Promise<void>;
  clearMirrorCompareSourceControlState?(): void;
  clearMirrorCompareTreeSnapshotState?(): void;
  getMirrorCompareSourceControlState?(): MirrorCompareScmState | undefined;
  readLocalFile(path: string): Promise<string>;
  refreshOpenGrowiPage(
    canonicalPath: string,
  ): Promise<"reopened" | "not-open" | "dirty" | "failed">;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
  showQuickPick(
    items: readonly (
      | BacklinkQuickPickItem
      | CurrentPageActionQuickPickItem
      | AttachmentQuickPickItem
      | OpenPageQuickPickItem
      | RevisionQuickPickItem
    )[],
    options: { placeHolder: string },
  ): Promise<
    | BacklinkQuickPickItem
    | CurrentPageActionQuickPickItem
    | AttachmentQuickPickItem
    | OpenPageQuickPickItem
    | RevisionQuickPickItem
    | undefined
  >;
  setMirrorCompareSourceControlState?(input: MirrorCompareScmState): void;
  setMirrorCompareTreeSnapshotState?(input: MirrorCompareScmState): void;
  showWarningMessage(message: string): void;
  deleteLocalPath(path: string): Promise<void>;
  writeLocalFile(path: string, content: string): Promise<void>;
  writePage(
    canonicalPath: string,
    body: string,
    editSession: GrowiEditSession,
  ): Promise<GrowiPageWriteResult>;
}

export interface NavigationCommandDeps {
  checkRemoteMetadataForPage?(canonicalPath: string): Promise<boolean>;
  executeCommand?(command: string, ...args: unknown[]): Promise<void>;
  getActiveEditorUri(): UriLike | undefined;
  getBaseUrl(): string | undefined;
  getCurrentPageInfo(canonicalPath: string): CurrentPageInfo | undefined;
  getOpenPageBoundedSearchLimit(): number;
  getOpenPageInitialCandidatePaths(): readonly string[];
  getRegisteredPrefixes(): string[];
  listPages(
    canonicalPrefixPath: string,
    options?: GrowiPageListOptions,
  ): Promise<GrowiPageListResult>;
  openExternalUri(uri: string): Promise<void>;
  openUri(uri: string): Promise<void>;
  readPageBody(
    canonicalPath: string,
  ): Promise<
    { ok: true; body: string } | { ok: false; reason: GrowiReadFailureReason }
  >;
  resolvePageReference(
    reference: ParsedGrowiReference,
  ): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
  showInputBox(
    options: InputBoxOptionsLike,
  ): PromiseLike<string | undefined> | undefined;
  showOpenPageQuickPick(
    items: readonly OpenPageSearchEntry[],
    options: {
      placeHolder: string;
      directInputLabel: string;
      directInputDescription: string;
      search(query: string): Promise<readonly OpenPageSearchEntry[]>;
    },
  ): Promise<string | { action: "directInput" } | undefined>;
  showQuickPick(
    items: readonly (
      | BacklinkQuickPickItem
      | CurrentPageActionQuickPickItem
      | AttachmentQuickPickItem
      | OpenPageQuickPickItem
      | RevisionQuickPickItem
    )[],
    options: { placeHolder: string },
  ): Promise<
    | BacklinkQuickPickItem
    | CurrentPageActionQuickPickItem
    | AttachmentQuickPickItem
    | OpenPageQuickPickItem
    | RevisionQuickPickItem
    | undefined
  >;
}

export interface PrefixCommandDeps {
  addPrefix(rawPrefix: string): Promise<
    | { ok: true; value: string[]; added: boolean }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "AncestorConflict"
          | "DescendantConflict";
      }
  >;
  clearPrefixes(): Promise<
    | { ok: true; value: string[]; cleared: boolean; removed: string[] }
    | { ok: false; reason: "InvalidBaseUrl" }
  >;
  deletePrefix(
    rawPrefix: string,
  ): Promise<
    | { ok: true; value: string[]; removed: boolean }
    | { ok: false; reason: "InvalidBaseUrl" | "InvalidPath" }
  >;
  getBaseUrl(): string | undefined;
  getRegisteredPrefixes(): string[];
  resolvePageReference(
    reference: ParsedGrowiReference,
  ): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
  showClearPrefixesConfirmation(
    baseUrl: string,
    prefixes: readonly string[],
  ): Promise<boolean>;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
  showInputBox(
    options: InputBoxOptionsLike,
  ): PromiseLike<string | undefined> | undefined;
}

export interface EditCommandDeps {
  bootstrapEditSession(
    canonicalPath: string,
  ): Promise<StartEditBootstrapResult>;
  closeEditSession(canonicalPath: string): void;
  getActiveEditorUri(): UriLike | undefined;
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  invalidateReadDirectoryCache(canonicalDirectoryPath: string): void;
  invalidateReadFileCache(canonicalPath: string): void;
  openUri(uri: string): Promise<void>;
  readDirectory(uri: string): Promise<void>;
  refreshPrefixTree(): void;
  saveDocument(uri: UriLike): Promise<boolean>;
  setEditSession(canonicalPath: string, editSession: GrowiEditSession): void;
  showEndEditDiscardConfirmation(): Promise<
    "saveAndReturn" | "discardAndReturn" | "cancel"
  >;
  showErrorMessage(message: string): void;
}

export interface DialogCommandDeps {
  getBaseUrl(): string | undefined;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
  showInputBox(
    options: InputBoxOptionsLike,
  ): PromiseLike<string | undefined> | undefined;
  storeSecret(key: string, value: string): Promise<void>;
  updateBaseUrl(value: string): Promise<void>;
}

export interface BookmarkCommandDeps {
  addBookmark(
    canonicalPath: string,
    pageId?: string,
  ): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
        added: boolean;
      }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed"
          | "NotFound";
      }
  >;
  deleteBookmark(
    canonicalPath: string,
    pageId?: string,
  ): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
        removed: boolean;
      }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed"
          | "NotFound";
      }
  >;
  getActiveEditorUri(): UriLike | undefined;
  getBookmarks(): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
      }
    | {
        ok: false;
        reason:
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed";
      }
  >;
  getCurrentPageInfo(canonicalPath: string): CurrentPageInfo | undefined;
  isBookmarked(canonicalPath: string): boolean;
  openUri(uri: string): Promise<void>;
  refreshPrefixTree(): void;
  showBookmarkQuickPick(
    items: readonly BookmarkQuickPickItem[],
    options: { placeHolder: string },
  ): Promise<BookmarkQuickPickSelection | undefined>;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
}

export interface CurrentPageCommandDeps {
  getActiveEditorUri(): UriLike | undefined;
  getBaseUrl(): string | undefined;
  getCurrentPageInfo(canonicalPath: string): CurrentPageInfo | undefined;
  getRegisteredPrefixes(): string[];
  listAttachments(pageId: string): Promise<GrowiAttachmentListResult>;
  listPages(
    canonicalPrefixPath: string,
    options?: GrowiPageListOptions,
  ): Promise<GrowiPageListResult>;
  listRevisions(pageId: string): Promise<GrowiRevisionListResult>;
  openDiff(leftUri: UriLike, rightUri: UriLike, title: string): Promise<void>;
  openExternalUri(uri: string): Promise<void>;
  readPageBody(
    canonicalPath: string,
  ): Promise<
    { ok: true; body: string } | { ok: false; reason: GrowiReadFailureReason }
  >;
  readRevision(
    pageId: string,
    revisionId: string,
  ): Promise<GrowiRevisionReadResult>;
  resolvePageReference(
    reference: ParsedGrowiReference,
  ): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
  seedRevisionContent(uri: UriLike, body: string): void;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string): void;
  showQuickPick(
    items: readonly (
      | BacklinkQuickPickItem
      | CurrentPageActionQuickPickItem
      | AttachmentQuickPickItem
      | OpenPageQuickPickItem
      | RevisionQuickPickItem
    )[],
    options: { placeHolder: string },
  ): Promise<
    | BacklinkQuickPickItem
    | CurrentPageActionQuickPickItem
    | AttachmentQuickPickItem
    | OpenPageQuickPickItem
    | RevisionQuickPickItem
    | undefined
  >;
}

export interface CommandDeps
  extends MirrorCommandDeps,
    NavigationCommandDeps,
    PrefixCommandDeps,
    EditCommandDeps,
    DialogCommandDeps,
    BookmarkCommandDeps,
    CurrentPageCommandDeps {
  addBookmark(
    canonicalPath: string,
    pageId?: string,
  ): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
        added: boolean;
      }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed"
          | "NotFound";
      }
  >;
  deleteBookmark(
    canonicalPath: string,
    pageId?: string,
  ): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
        removed: boolean;
      }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed"
          | "NotFound";
      }
  >;
  checkRemoteMetadataForPage?(canonicalPath: string): Promise<boolean>;
  closeEditSession(canonicalPath: string): void;
  getActiveEditorText(): string | undefined;
  getCurrentPageInfo(canonicalPath: string): CurrentPageInfo | undefined;
  getBookmarks(): Promise<
    | {
        ok: true;
        value: readonly BookmarkListEntry[];
      }
    | {
        ok: false;
        reason:
          | "BaseUrlNotConfigured"
          | "ApiTokenNotConfigured"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed";
      }
  >;
  isBookmarked(canonicalPath: string): boolean;
  invalidateReadDirectoryCache(canonicalDirectoryPath: string): void;
  createPage(
    canonicalPath: string,
    body: string,
  ): Promise<GrowiPageCreateResult>;
  resolveCreatePageBody(canonicalPath: string): Promise<string>;
  deletePage(input: {
    pageId: string;
    revisionId: string;
    canonicalPath: string;
    mode: "page" | "subtree";
  }): Promise<GrowiPageDeleteResult>;
  renamePage(input: {
    pageId: string;
    revisionId: string;
    currentCanonicalPath: string;
    targetCanonicalPath: string;
    mode: "page" | "subtree";
  }): Promise<GrowiPageRenameResult>;
  listRevisions(pageId: string): Promise<GrowiRevisionListResult>;
  listAttachments(pageId: string): Promise<GrowiAttachmentListResult>;
  findOpenTextDocumentByUri(uri: UriLike): { isDirty: boolean } | undefined;
  openDiff(leftUri: UriLike, rightUri: UriLike, title: string): Promise<void>;
  saveDocument(uri: UriLike): Promise<boolean>;
  readRevision(
    pageId: string,
    revisionId: string,
  ): Promise<GrowiRevisionReadResult>;
  readDirectory(uri: string): Promise<void>;
  reopenRenamedPages(
    oldCanonicalPath: string,
    newCanonicalPath: string,
  ): Promise<{ attempted: boolean; hasDirty: boolean; hasFailed: boolean }>;
  closeDeletedPages(
    canonicalPath: string,
    mode: "page" | "subtree",
  ): Promise<{ attempted: boolean; hasFailed: boolean }>;
  refreshPrefixTree(): void;
  clearSubtreeState(canonicalPrefixPath: string): void;
  seedRevisionContent(uri: UriLike, body: string): void;
  showEndEditDiscardConfirmation(): Promise<
    "saveAndReturn" | "discardAndReturn" | "cancel"
  >;
  showBookmarkQuickPick(
    items: readonly BookmarkQuickPickItem[],
    options: { placeHolder: string },
  ): Promise<BookmarkQuickPickSelection | undefined>;
  showRenameScopeConfirmation(
    canonicalPath: string,
  ): Promise<"single" | "subtree" | "cancel">;
  showDeleteScopeConfirmation(
    canonicalPath: string,
  ): Promise<"single" | "subtree" | "cancel">;
  showDeletePageConfirmation(
    canonicalPath: string,
    mode: "page" | "subtree",
  ): Promise<boolean>;
  storeSecret(key: string, value: string): Promise<void>;
  setEditSession(canonicalPath: string, editSession: GrowiEditSession): void;
  updateBaseUrl(value: string): Promise<void>;
}

export interface UriLike {
  scheme: string;
  path: string;
  fsPath?: string;
}

export interface CurrentPageInfo {
  pageId: string;
  revisionId?: string;
  url: string;
  path: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

export interface BacklinkQuickPickItem {
  label: string;
  canonicalPath: string;
}

export interface CurrentPageActionQuickPickItem {
  label: string;
  description?: string;
  command: string;
}

export interface CurrentPageDetailAction {
  label: string;
  description: string;
  command: string;
}

export interface CurrentPageDetailWebviewInput {
  canonicalPath: string;
  targetUri: UriLike;
  actions: readonly CurrentPageDetailAction[];
  summary?: CurrentPageDetailSummary;
}

export interface CurrentPageDetailSummary {
  pageInfo?: CurrentPageInfo;
  backlinks?: CurrentPageDetailPreviewList;
  attachments?: CurrentPageDetailPreviewList;
  revisions?: CurrentPageDetailPreviewList;
}

export interface CurrentPageDetailPreviewList {
  items: readonly string[];
  totalCount?: number;
  partial?: boolean;
  unavailableReason?: string;
}

export interface BookmarkQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  canonicalPath: string;
  addedAt: string;
  pageId: string;
  status?: "normal" | "outsidePrefix" | "unresolvable";
}

export interface BookmarkQuickPickSelection {
  action: "open" | "remove";
  canonicalPath: string;
  pageId: string;
}

export interface BookmarkListEntry {
  canonicalPath: string;
  addedAt: string;
  pageId: string;
  status?: "normal" | "outsidePrefix" | "unresolvable";
}

export interface AttachmentQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  attachmentId: string;
  downloadUrl: string;
}

export interface RevisionQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  revisionId: string;
  createdAt: string;
  author: string;
}

export interface OpenPageQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  canonicalPath?: string;
  action?: "directInput";
  alwaysShow?: boolean;
}

export interface OpenPageSearchEntry {
  label: string;
  description: string;
  detail?: string;
  canonicalPath: string;
  basenameLower: string;
  canonicalPathLower: string;
  pathSegmentsLower: readonly string[];
}

export interface BundleCompareResult {
  canonicalPath: string;
  status:
    | "Unchanged"
    | "LocalChanged"
    | "RemoteChanged"
    | "Conflict"
    | "MissingRemote"
    | "MissingLocal";
}

export type ChangesResourceTuple = readonly [UriLike, UriLike, UriLike];

export type StartEditBootstrapResult =
  | {
      ok: true;
      value: {
        pageId: string;
        baseRevisionId: string;
        baseUpdatedAt: string;
        baseBody: string;
      };
    }
  | { ok: false; reason: GrowiReadFailureReason };

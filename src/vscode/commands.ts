import { createHash } from "node:crypto";
import path from "node:path";

import {
  buildGrowiUri,
  buildGrowiUriFromInput,
  normalizeCanonicalPath,
  type ParsedGrowiReference,
  parseAddPrefixInput,
  parseOpenPageInput,
} from "../core/uri";
import type {
  GrowiAccessFailureReason,
  GrowiEditSession,
  GrowiPageCreateResult,
  GrowiPageDeleteResult,
  GrowiPageRenameResult,
  GrowiPageWriteResult,
  GrowiReadFailureReason,
} from "./fsProvider";
import {
  buildInstanceKey,
  buildLegacyInstanceKey,
  buildMirrorManifestPath,
  buildMirrorManifestPathWithInstanceKey,
  buildMirrorPageFilePath,
  buildMirrorPageFilePathWithInstanceKey,
  listMirrorInstanceKeys,
  type MirrorManifest,
  type MirrorManifestPage,
  type MirrorManifestSkippedPage,
  parseMirrorManifest,
  planMirrorRelativeFilePaths,
  serializeMirrorManifest,
} from "./localRoundTrip";
import { findBacklinks } from "./pageSearch";
import {
  buildGrowiRevisionUri,
  type GrowiRevisionListResult,
  type GrowiRevisionReadResult,
  type GrowiRevisionSummary,
} from "./revisionModel";

export const GROWI_COMMANDS = {
  configureBaseUrl: "growi.configureBaseUrl",
  configureApiToken: "growi.configureApiToken",
  openReadme: "growi.openReadme",
  addPrefix: "growi.addPrefix",
  createPage: "growi.createPage",
  deletePage: "growi.deletePage",
  renamePage: "growi.renamePage",
  clearPrefixes: "growi.clearPrefixes",
  openPage: "growi.openPage",
  openPrefixRootPage: "growi.openPrefixRootPage",
  openDirectoryPage: "growi.openDirectoryPage",
  explorerOpenPageItem: "growi.explorerOpenPageItem",
  explorerCreatePageHere: "growi.explorerCreatePageHere",
  explorerRenamePage: "growi.explorerRenamePage",
  explorerDeletePage: "growi.explorerDeletePage",
  explorerRefreshCurrentPage: "growi.explorerRefreshCurrentPage",
  explorerShowBacklinks: "growi.explorerShowBacklinks",
  explorerShowCurrentPageInfo: "growi.explorerShowCurrentPageInfo",
  explorerShowRevisionHistoryDiff: "growi.explorerShowRevisionHistoryDiff",
  explorerCreateLocalMirrorForCurrentPage:
    "growi.explorerCreateLocalMirrorForCurrentPage",
  explorerCreateLocalMirrorForCurrentPrefix:
    "growi.explorerCreateLocalMirrorForCurrentPrefix",
  explorerCompareLocalMirrorWithGrowi:
    "growi.explorerCompareLocalMirrorWithGrowi",
  explorerUploadLocalMirrorToGrowi: "growi.explorerUploadLocalMirrorToGrowi",
  explorerCompareLocalMirrorSubtreeWithGrowi:
    "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
  explorerUploadLocalMirrorSubtreeToGrowi:
    "growi.explorerUploadLocalMirrorSubtreeToGrowi",
  explorerDownloadCurrentPageToLocalFile:
    "growi.explorerCreateLocalMirrorForCurrentPage",
  explorerDownloadCurrentPageSetToLocalBundle:
    "growi.explorerCreateLocalMirrorForCurrentPrefix",
  explorerCompareLocalWorkFileWithCurrentPage:
    "growi.explorerCompareLocalMirrorWithGrowi",
  explorerUploadExportedLocalFileToGrowi:
    "growi.explorerUploadLocalMirrorToGrowi",
  explorerCompareLocalBundleWithGrowi:
    "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
  explorerUploadLocalBundleToGrowi:
    "growi.explorerUploadLocalMirrorSubtreeToGrowi",
  startEdit: "growi.startEdit",
  endEdit: "growi.endEdit",
  showCurrentPageActions: "growi.showCurrentPageActions",
  showLocalMirrorActions: "growi.showLocalMirrorActions",
  showLocalRoundTripActions: "growi.showLocalMirrorActions",
  refreshCurrentPage: "growi.refreshCurrentPage",
  refreshListing: "growi.refreshListing",
  createLocalMirrorForCurrentPage: "growi.createLocalMirrorForCurrentPage",
  createLocalMirrorForCurrentPrefix: "growi.createLocalMirrorForCurrentPrefix",
  refreshLocalMirror: "growi.refreshLocalMirror",
  compareLocalMirrorWithGrowi: "growi.compareLocalMirrorWithGrowi",
  uploadLocalMirrorToGrowi: "growi.uploadLocalMirrorToGrowi",
  downloadCurrentPageToLocalFile: "growi.createLocalMirrorForCurrentPage",
  compareLocalWorkFileWithCurrentPage: "growi.compareLocalMirrorWithGrowi",
  uploadExportedLocalFileToGrowi: "growi.uploadLocalMirrorToGrowi",
  downloadCurrentPageSetToLocalBundle:
    "growi.createLocalMirrorForCurrentPrefix",
  compareLocalBundleWithGrowi: "growi.compareLocalMirrorWithGrowi",
  uploadLocalBundleToGrowi: "growi.uploadLocalMirrorToGrowi",
  showCurrentPageInfo: "growi.showCurrentPageInfo",
  showBacklinks: "growi.showBacklinks",
  showRevisionHistoryDiff: "growi.showRevisionHistoryDiff",
} as const;

export const GROWI_SECRET_KEYS = {
  apiToken: "growi.apiToken",
} as const;

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

export interface CommandDeps {
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
  executeCommand?(command: string, ...args: unknown[]): Promise<void>;
  bootstrapEditSession(
    canonicalPath: string,
  ): Promise<StartEditBootstrapResult>;
  closeEditSession(canonicalPath: string): void;
  getBaseUrl(): string | undefined;
  getActiveEditorUri(): UriLike | undefined;
  getActiveEditorText(): string | undefined;
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  getCurrentPageInfo(canonicalPath: string): CurrentPageInfo | undefined;
  getLocalWorkspaceRoot(): string | undefined;
  getRegisteredPrefixes(): string[];
  invalidateReadDirectoryCache(canonicalDirectoryPath: string): void;
  invalidateReadFileCache(canonicalPath: string): void;
  listPages(
    canonicalPrefixPath: string,
  ): Promise<
    | { ok: true; paths: string[] }
    | { ok: false; reason: GrowiAccessFailureReason }
  >;
  createPage(canonicalPath: string): Promise<GrowiPageCreateResult>;
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
  findOpenTextDocument(path: string): { isDirty: boolean } | undefined;
  findOpenTextDocumentByUri(uri: UriLike): { isDirty: boolean } | undefined;
  openUri(uri: string): Promise<void>;
  openLocalFile(path: string): Promise<void>;
  openDiff(leftUri: UriLike, rightUri: UriLike, title: string): Promise<void>;
  openChanges?(
    title: string,
    resources: readonly ChangesResourceTuple[],
  ): Promise<void>;
  readLocalFile(path: string): Promise<string>;
  refreshOpenGrowiPage(
    canonicalPath: string,
  ): Promise<"reopened" | "not-open" | "dirty" | "failed">;
  resolvePageReference(
    reference: ParsedGrowiReference,
  ): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
  saveDocument(uri: UriLike): Promise<boolean>;
  readPageBody(
    canonicalPath: string,
  ): Promise<
    { ok: true; body: string } | { ok: false; reason: GrowiReadFailureReason }
  >;
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
  showErrorMessage(message: string): void;
  showEndEditDiscardConfirmation(): Promise<
    "saveAndReturn" | "discardAndReturn" | "cancel"
  >;
  showInformationMessage(message: string): void;
  showInputBox(
    options: InputBoxOptionsLike,
  ): PromiseLike<string | undefined> | undefined;
  showClearPrefixesConfirmation(
    baseUrl: string,
    prefixes: readonly string[],
  ): Promise<boolean>;
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
  showQuickPick(
    items: readonly (
      | BacklinkQuickPickItem
      | CurrentPageActionQuickPickItem
      | RevisionQuickPickItem
    )[],
    options: { placeHolder: string },
  ): Promise<
    | BacklinkQuickPickItem
    | CurrentPageActionQuickPickItem
    | RevisionQuickPickItem
    | undefined
  >;
  showWarningMessage(message: string): void;
  storeSecret(key: string, value: string): Promise<void>;
  setEditSession(canonicalPath: string, editSession: GrowiEditSession): void;
  updateBaseUrl(value: string): Promise<void>;
  deleteLocalPath(path: string): Promise<void>;
  writeLocalFile(path: string, content: string): Promise<void>;
  writePage(
    canonicalPath: string,
    body: string,
    editSession: GrowiEditSession,
  ): Promise<GrowiPageWriteResult>;
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

export interface RevisionQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  revisionId: string;
  createdAt: string;
  author: string;
}

interface BundleCompareResult {
  canonicalPath: string;
  status:
    | "Unchanged"
    | "LocalChanged"
    | "RemoteChanged"
    | "Conflict"
    | "MissingRemote"
    | "MissingLocal";
}

type ChangesResourceTuple = readonly [UriLike, UriLike, UriLike];
type MirrorRequestScope = "page" | "subtree";

interface BundleUploadResult {
  canonicalPath: string;
  status:
    | "Uploaded"
    | "Unchanged"
    | "Conflict"
    | "MissingRemote"
    | "MissingLocal";
}

interface LoadedMirrorSelection {
  workspaceRoot: string;
  baseUrl: string;
  manifestPath: string;
  manifest: MirrorManifest;
  instanceKey: string;
  requestedCanonicalPath: string;
  requestedScope: MirrorRequestScope;
  effectiveRootCanonicalPath: string;
  selectedPages: MirrorManifestPage[];
  reusedAncestorPrefix: boolean;
}

interface CurrentPageActionsCommandDeps {
  getActiveEditorUri(): UriLike | undefined;
  executeCommand(command: string, ...args: unknown[]): Promise<void>;
  showErrorMessage(message: string): void;
  showQuickPick(
    items: readonly CurrentPageActionQuickPickItem[],
    options: { placeHolder: string },
  ): Promise<CurrentPageActionQuickPickItem | undefined>;
}

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

const REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE =
  "Refresh Current Page は growi: ページでのみ実行できます。";
const REFRESH_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Refresh Current Page を実行できません。先に保存または End Edit を実行してください。";
const REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Refresh Current Page を実行できませんでした。";
const REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため Refresh Current Page を実行できませんでした。";
const REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Refresh Current Page を実行できませんでした。";
const REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE =
  "Refresh Current Page の再読込に失敗しました。";
const START_EDIT_INVALID_TARGET_MESSAGE =
  "Start Edit は growi: ページでのみ実行できます。";
const END_EDIT_INVALID_TARGET_MESSAGE =
  "End Edit は growi: ページでのみ実行できます。";
const START_EDIT_API_NOT_SUPPORTED_MESSAGE =
  "編集開始 API が未対応のため Start Edit を実行できません。";
const START_EDIT_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Start Edit を実行できませんでした。";
const START_EDIT_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Start Edit を実行できませんでした。";
const REFRESH_LISTING_INVALID_TARGET_MESSAGE =
  "Refresh Listing は growi: ディレクトリでのみ実行できます。";
const REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE =
  "一覧取得 API が未対応のため Refresh Listing を実行できませんでした。";
const REFRESH_LISTING_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Refresh Listing を実行できませんでした。";
const REFRESH_LISTING_UNEXPECTED_ERROR_MESSAGE =
  "Refresh Listing の再読込に失敗しました。";
const DOWNLOAD_CURRENT_PAGE_INVALID_TARGET_MESSAGE =
  "Sync Local Mirror for Current Page は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Sync Local Mirror for Current Page を実行できません。先に file: workspace を開いてください。";
const DOWNLOAD_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Sync Local Mirror for Current Page を実行できません。先に保存または End Edit を実行してください。";
const DOWNLOAD_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため Sync Local Mirror for Current Page を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Sync Local Mirror for Current Page を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Sync Local Mirror for Current Page を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_WRITE_LOCAL_FILE_FAILED_MESSAGE =
  "ローカルミラーの同期に失敗したため Sync Local Mirror for Current Page を完了できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SUCCESS_MESSAGE =
  "現在ページのローカルミラーを同期しました。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SUCCESS_MESSAGE =
  "既存 prefix mirror 内の現在ページローカルミラーを同期しました。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE =
  "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Page を実行できません。先に保存してください。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SKIPPED_MESSAGE =
  "既存 prefix mirror で対象ページが衝突により skip されているため Sync Local Mirror for Current Page を実行できません。prefix mirror を見直してください。";
const CURRENT_PAGE_SET_MAX_PAGES = 50;
const DOWNLOAD_CURRENT_PAGE_SET_INVALID_TARGET_MESSAGE =
  "Sync Local Mirror for Current Prefix は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_SET_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Sync Local Mirror for Current Prefix を実行できません。先に file: workspace を開いてください。";
const DOWNLOAD_CURRENT_PAGE_SET_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Sync Local Mirror for Current Prefix を実行できません。先に保存または End Edit を実行してください。";
const DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE =
  "一覧取得 API または本文取得 API が未対応のため Sync Local Mirror for Current Prefix を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Sync Local Mirror for Current Prefix を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE =
  "対象ページ配下の export 中にページが見つからなくなったため Sync Local Mirror for Current Prefix を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_TOO_MANY_PAGES_MESSAGE =
  "active page 配下が 50 pages を超えるため Sync Local Mirror for Current Prefix を実行できません。";
const DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE =
  "ローカルミラーの同期に失敗したため Sync Local Mirror for Current Prefix を完了できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_SUCCESS_MESSAGE =
  "現在ページ配下のローカルミラーを同期しました。";
const DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_SUCCESS_MESSAGE =
  "既存 prefix mirror 内の現在ページ配下ローカルミラーを同期しました。";
const DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE =
  "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Prefix を実行できません。先に保存してください。";
const COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE =
  "Compare Local Mirror with GROWI は growi: ページでのみ実行できます。";
const COMPARE_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Compare Local Mirror with GROWI を実行できません。先に file: workspace を開いてください。";
const COMPARE_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE =
  ".growi-mirror.json の読み込みに失敗したため Compare Local Mirror with GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。";
const COMPARE_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE =
  ".growi-mirror.json の GROWI metadata を読み取れないため Compare Local Mirror with GROWI を実行できません。再度 Sync Local Mirror を実行してください。";
const COMPARE_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定のため Compare Local Mirror with GROWI を実行できません。先に Configure Base URL を実行してください。";
const COMPARE_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE =
  "mirror の GROWI base URL が現在設定と一致しないため Compare Local Mirror with GROWI を実行できません。接続先を確認してください。";
const COMPARE_LOCAL_BUNDLE_MIRROR_NOT_FOUND_MESSAGE =
  "対象の local mirror が見つからないため Compare Local Mirror with GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。";
const COMPARE_LOCAL_BUNDLE_REUSED_PREFIX_SKIPPED_MESSAGE =
  "既存 prefix mirror で対象ページまたは配下が衝突により skip されているため Compare Local Mirror with GROWI を実行できません。prefix mirror を見直してください。";
const COMPARE_LOCAL_BUNDLE_NO_DIFF_MESSAGE =
  "Compare Local Mirror with GROWI で changes editor の対象はありませんでした。";
const COMPARE_LOCAL_BUNDLE_OPEN_DIFF_FAILED_MESSAGE =
  "mirror の差分ビューを開けませんでした。";
const ADD_PREFIX_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const ADD_PREFIX_INVALID_PATH_MESSAGE =
  "Prefix には先頭 / 付きのページパスを入力してください。";
const ADD_PREFIX_INVALID_INPUT_MESSAGE =
  "Prefix には先頭 / 付き canonical path または same-instance idurl を入力してください。";
const ADD_PREFIX_DUPLICATE_MESSAGE =
  "指定した Prefix は既に登録済みです。Explorer 表示を再同期しました。";
const ADD_PREFIX_ANCESTOR_CONFLICT_MESSAGE =
  "指定した Prefix は既存 Prefix の祖先です。より具体的な Prefix を指定してください。";
const ADD_PREFIX_DESCENDANT_CONFLICT_MESSAGE =
  "指定した Prefix は既存 Prefix の子孫です。既存 Prefix と重複しない Prefix を指定してください。";
const ADD_PREFIX_NOT_FOUND_MESSAGE =
  "指定した idurl に対応するページが見つかりませんでした。";
const ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE =
  "pageId 解決 API が未対応のため Prefix を追加できませんでした。";
const ADD_PREFIX_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Prefix を追加できませんでした。";
const CREATE_PAGE_INVALID_PATH_MESSAGE =
  "Create Page には先頭 / 付きのページパスを入力してください。";
const CREATE_PAGE_ALREADY_EXISTS_MESSAGE =
  "指定した path のページは既に存在します。";
const CREATE_PAGE_PARENT_NOT_FOUND_MESSAGE =
  "指定した親ページが見つからないため Create Page を実行できませんでした。";
const CREATE_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ作成 API が未対応のため Create Page を実行できませんでした。";
const CREATE_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Create Page を実行できませんでした。";
const DELETE_PAGE_INVALID_TARGET_MESSAGE =
  "Delete Page は現在開いている growi: ページでのみ実行できます。";
const DELETE_PAGE_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため Delete Page を実行できません。ページを開き直して再実行してください。";
const DELETE_PAGE_DIRTY_MESSAGE =
  "未保存の変更があるため Delete Page を実行できません。先に保存してください。";
const DELETE_PAGE_HAS_CHILDREN_MESSAGE =
  "子ページがあるためこのページのみは削除できません。配下も含めて削除してください。";
const DELETE_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Delete Page を実行できませんでした。";
const DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ削除 API が未対応のため Delete Page を実行できませんでした。";
const DELETE_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Delete Page を実行できませんでした。";
const DELETE_PAGE_CLOSE_FAILED_WARNING_MESSAGE =
  "Delete Page は成功しましたが、一部ページタブを閉じられませんでした。手動で閉じてください。";
const RENAME_PAGE_INVALID_TARGET_MESSAGE =
  "Rename Page は現在開いている growi: ページでのみ実行できます。";
const RENAME_PAGE_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため Rename Page を実行できません。ページを開き直して再実行してください。";
const RENAME_PAGE_DIRTY_MESSAGE =
  "未保存の変更があるため Rename Page を実行できません。先に保存してください。";
const RENAME_PAGE_INVALID_PATH_MESSAGE =
  "Rename Page には先頭 / 付きのページパスを入力してください。";
const RENAME_PAGE_SAME_PATH_MESSAGE =
  "現在の path と同じため Rename Page は実行しませんでした。";
const RENAME_PAGE_DESCENDANT_PATH_MESSAGE =
  "現在ページ配下の path へは Rename Page を実行できません。別の path を入力してください。";
const RENAME_PAGE_ALREADY_EXISTS_MESSAGE =
  "同じ path のページが既に存在します。";
const RENAME_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Rename Page を実行できませんでした。";
const RENAME_PAGE_PARENT_NOT_FOUND_MESSAGE =
  "指定した親ページが見つからないため Rename Page を実行できませんでした。";
const RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ名変更 API が未対応のため Rename Page を実行できませんでした。";
const RENAME_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Rename Page を実行できませんでした。";
const RENAME_PAGE_REOPEN_DIRTY_WARNING_MESSAGE =
  "Rename Page は成功しましたが、未保存変更のあるページは自動で開き直しませんでした。新しい path を開き直してください。";
const RENAME_PAGE_REOPEN_FAILED_WARNING_MESSAGE =
  "Rename Page は成功しましたが、一部ページの開き直しに失敗しました。新しい path を開き直してください。";
const CLEAR_PREFIXES_NO_TARGET_MESSAGE =
  "現在の接続先に削除対象の Prefix はありません。";
const CLEAR_PREFIXES_SUCCESS_MESSAGE =
  "現在の接続先に登録された GROWI Prefix を削除しました。";
const GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE =
  "GROWI API token が未設定です。先に Configure API Token を実行してください。";
const GENERIC_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効です。Configure API Token を確認してください。";
const GENERIC_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否しました。権限設定と API Token を確認してください。";
const OPEN_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため GROWI ページを開けませんでした。";
const OPEN_PAGE_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効なため GROWI ページを開けませんでした。Configure API Token を確認してください。";
const OPEN_PAGE_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため GROWI ページを開けませんでした。権限設定と API Token を確認してください。";
const OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため GROWI ページを開けませんでした。";
const OPEN_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため GROWI ページを開けませんでした。";
const OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE = "GROWI ページを開けませんでした。";
const OPEN_PREFIX_ROOT_PAGE_INVALID_TARGET_MESSAGE =
  "Open Prefix Root Page は登録済み Prefix root でのみ実行できます。";
const OPEN_DIRECTORY_PAGE_INVALID_TARGET_MESSAGE =
  "Open Directory Page は実ページを持つ growi: ディレクトリでのみ実行できます。";
const SHOW_CURRENT_PAGE_INFO_INVALID_TARGET_MESSAGE =
  "Show Current Page Info は growi: ページでのみ実行できます。";
const SHOW_CURRENT_PAGE_INFO_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できませんでした。ページを開き直して再実行してください。";
const SHOW_CURRENT_PAGE_ACTIONS_INVALID_TARGET_MESSAGE =
  "現在ページメニューは growi: ページでのみ実行できます。";
const SHOW_CURRENT_PAGE_ACTIONS_PLACEHOLDER =
  "現在ページに対して実行する操作を選択してください。";
const SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE =
  "Show Revision History Diff は growi: ページでのみ実行できます。";
const SHOW_REVISION_HISTORY_DIFF_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため履歴差分を実行できません。ページを開き直して再実行してください。";
const SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE =
  "revision 一覧 API が未対応のため履歴差分を実行できません。";
const SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE =
  "revision 本文取得 API が未対応のため履歴差分を実行できません。";
const SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため履歴差分を実行できませんでした。";
const SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE =
  "比較可能な revision が不足しているため履歴差分を表示できません。";
const SHOW_REVISION_HISTORY_DIFF_OPEN_DIFF_FAILED_MESSAGE =
  "履歴差分ビューを開けませんでした。";
const SHOW_REVISION_HISTORY_DIFF_REVISION_PLACEHOLDER =
  "比較したい revision を選択してください。";
const SHOW_LOCAL_ROUND_TRIP_ACTIONS_INVALID_TARGET_MESSAGE =
  "ローカル操作メニューは growi: ページでのみ実行できます。";
const SHOW_LOCAL_ROUND_TRIP_ACTIONS_PLACEHOLDER =
  "ローカルミラーに対して実行する操作を選択してください。";
const SHOW_BACKLINKS_INVALID_TARGET_MESSAGE =
  "Show Backlinks は growi: ページでのみ実行できます。";
const SHOW_BACKLINKS_NO_PREFIX_MESSAGE =
  "Backlinks の対象 Prefix がありません。先に Add Prefix を実行してください。";
const SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE =
  "Backlinks は見つかりませんでした。";
const SHOW_BACKLINKS_BASE_URL_NOT_CONFIGURED_MESSAGE =
  "GROWI base URL が未設定のため Backlinks を実行できません。先に Configure Base URL を実行してください。";
const SHOW_BACKLINKS_API_TOKEN_NOT_CONFIGURED_MESSAGE =
  "GROWI API token が未設定のため Backlinks を実行できません。先に Configure API Token を実行してください。";
const SHOW_BACKLINKS_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効なため Backlinks を実行できません。Configure API Token を確認してください。";
const SHOW_BACKLINKS_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため Backlinks を実行できませんでした。権限設定と API Token を確認してください。";
const SHOW_BACKLINKS_LIST_API_NOT_SUPPORTED_MESSAGE =
  "Backlinks の対象一覧 API が未対応のため実行できません。";
const SHOW_BACKLINKS_READ_API_NOT_SUPPORTED_MESSAGE =
  "Backlinks の本文取得 API が未対応のため実行できません。";
const SHOW_BACKLINKS_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Backlinks を実行できませんでした。";
const SHOW_BACKLINKS_UNEXPECTED_ERROR_MESSAGE =
  "Backlinks の取得に失敗しました。";
const SHOW_BACKLINKS_PLACEHOLDER_NORMAL =
  "登録済み Prefix 配下を検索しました。";
const SHOW_BACKLINKS_PLACEHOLDER_LIMIT =
  "登録済み Prefix 配下を検索しました。結果は最大100件で打ち切られています。";
const SHOW_BACKLINKS_PLACEHOLDER_TIMEOUT =
  "登録済み Prefix 配下を検索しました。結果は5秒で打ち切られています。";
const SHOW_BACKLINKS_PLACEHOLDER_LIMIT_AND_TIMEOUT =
  "登録済み Prefix 配下を検索しました。結果は最大100件で打ち切られています。結果は5秒で打ち切られています。";
const UPLOAD_EXPORTED_LOCAL_FILE_NOT_FOUND_MESSAGE =
  "upload 先のページが見つからないため Upload Local Mirror to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE =
  "更新 API または本文取得 API が未対応のため Upload Local Mirror to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Upload Local Mirror to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_PERMISSION_DENIED_MESSAGE =
  "更新権限がないため Upload Local Mirror to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_DIRTY_GROWI_REOPEN_WARNING_MESSAGE =
  "GROWI への upload は成功しましたが、表示中の growi: ページは未保存変更があるため自動再読込しませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_REOPEN_FAILED_WARNING_MESSAGE =
  "GROWI への upload は成功しましたが、表示中の growi: ページ再読込に失敗しました。Refresh Current Page を実行してください。";
const UPLOAD_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Upload Local Mirror to GROWI を実行できません。先に file: workspace を開いてください。";
const UPLOAD_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE =
  ".growi-mirror.json の読み込みに失敗したため Upload Local Mirror to GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。";
const UPLOAD_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE =
  ".growi-mirror.json の GROWI metadata を読み取れませんでした。再度 Sync Local Mirror を実行してください。";
const UPLOAD_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const UPLOAD_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE =
  "mirror の GROWI base URL が現在設定と一致しません。接続先を確認してください。";
const UPLOAD_LOCAL_BUNDLE_MIRROR_NOT_FOUND_MESSAGE =
  "対象の local mirror が見つからないため Upload Local Mirror to GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。";
const UPLOAD_LOCAL_BUNDLE_REUSED_PREFIX_SKIPPED_MESSAGE =
  "既存 prefix mirror で対象ページまたは配下が衝突により skip されているため Upload Local Mirror to GROWI を実行できません。prefix mirror を見直してください。";
const UPLOAD_LOCAL_BUNDLE_METADATA_REFRESH_WARNING_MESSAGE =
  "GROWI への mirror upload は成功しましたが manifest の更新に一部失敗しました。次回 upload 前に再度 Sync Local Mirror を実行してください。";
const REFRESH_LOCAL_MIRROR_INVALID_TARGET_MESSAGE =
  "Refresh Local Mirror は growi: ページでのみ実行できます。";
const REFRESH_LOCAL_MIRROR_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Refresh Local Mirror を実行できません。先に file: workspace を開いてください。";
const REFRESH_LOCAL_MIRROR_READ_MANIFEST_FAILED_MESSAGE =
  ".growi-mirror.json の読み込みに失敗したため Refresh Local Mirror を実行できませんでした。先に Sync Local Mirror を実行してください。";
const REFRESH_LOCAL_MIRROR_INVALID_MANIFEST_MESSAGE =
  ".growi-mirror.json の GROWI metadata を読み取れないため Refresh Local Mirror を実行できません。再度 Sync Local Mirror を実行してください。";
const REFRESH_LOCAL_MIRROR_BASE_URL_MISMATCH_MESSAGE =
  "mirror の GROWI base URL が現在設定と一致しないため Refresh Local Mirror を実行できません。接続先を確認してください。";
const REFRESH_LOCAL_MIRROR_LOCAL_CHANGES_MESSAGE =
  "local changed があるため Refresh Local Mirror を実行できません。Compare Local Mirror with GROWI または Upload Local Mirror to GROWI を先に実行してください。";
const REFRESH_LOCAL_MIRROR_SUCCESS_MESSAGE = "Local Mirror を再取得しました。";
const SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION =
  "mirror が無ければ作成、あれば更新";
const COMPARE_LOCAL_MIRROR_DESCRIPTION = "mirror manifest を使用";
const UPLOAD_LOCAL_MIRROR_DESCRIPTION = "changed pages のみ送信";

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function buildMirrorManifestFilePath(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
): string {
  return buildMirrorManifestPath(workspaceRoot, baseUrl, rootCanonicalPath);
}

function buildMirrorLocalFilePath(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
  relativeFilePath: string,
): string {
  return buildMirrorPageFilePath(
    workspaceRoot,
    baseUrl,
    rootCanonicalPath,
    relativeFilePath,
  );
}

function buildPreferredMirrorInstanceKey(baseUrl: string): string {
  return buildInstanceKey(baseUrl);
}

function _buildLegacyMirrorInstanceKey(baseUrl: string): string {
  return buildLegacyInstanceKey(baseUrl);
}

function buildMirrorManifestFilePathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
): string {
  return buildMirrorManifestPathWithInstanceKey(
    workspaceRoot,
    instanceKey,
    rootCanonicalPath,
  );
}

function buildMirrorLocalFilePathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
  relativeFilePath: string,
): string {
  return buildMirrorPageFilePathWithInstanceKey(
    workspaceRoot,
    instanceKey,
    rootCanonicalPath,
    relativeFilePath,
  );
}

function listMirrorManifestCandidates(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
): Array<{ instanceKey: string; manifestPath: string }> {
  return listMirrorInstanceKeys(baseUrl).map((instanceKey) => ({
    instanceKey,
    manifestPath: buildMirrorManifestFilePathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      rootCanonicalPath,
    ),
  }));
}

async function migrateMirrorRootIfNeeded(
  deps: CommandDeps,
  input: {
    workspaceRoot: string;
    baseUrl: string;
    rootCanonicalPath: string;
    sourceInstanceKey: string;
    manifest: MirrorManifest;
  },
): Promise<string> {
  const targetInstanceKey = buildPreferredMirrorInstanceKey(input.baseUrl);
  if (targetInstanceKey === input.sourceInstanceKey) {
    return buildMirrorManifestFilePathWithInstanceKey(
      input.workspaceRoot,
      input.sourceInstanceKey,
      input.rootCanonicalPath,
    );
  }

  for (const page of input.manifest.pages) {
    const sourcePath = buildMirrorLocalFilePathWithInstanceKey(
      input.workspaceRoot,
      input.sourceInstanceKey,
      input.rootCanonicalPath,
      page.relativeFilePath,
    );
    try {
      await deps.readLocalFile(
        buildMirrorLocalFilePathWithInstanceKey(
          input.workspaceRoot,
          targetInstanceKey,
          input.rootCanonicalPath,
          page.relativeFilePath,
        ),
      );
      continue;
    } catch {
      // Target file does not exist yet.
    }

    try {
      const body = await deps.readLocalFile(sourcePath);
      await deps.writeLocalFile(
        buildMirrorLocalFilePathWithInstanceKey(
          input.workspaceRoot,
          targetInstanceKey,
          input.rootCanonicalPath,
          page.relativeFilePath,
        ),
        body,
      );
    } catch {
      // Preserve missing locals as-is.
    }
  }

  for (const page of input.manifest.pages) {
    await deps.deleteLocalPath(
      buildMirrorLocalFilePathWithInstanceKey(
        input.workspaceRoot,
        input.sourceInstanceKey,
        input.rootCanonicalPath,
        page.relativeFilePath,
      ),
    );
  }
  for (const page of input.manifest.skippedPages ?? []) {
    await deps.deleteLocalPath(
      buildMirrorLocalFilePathWithInstanceKey(
        input.workspaceRoot,
        input.sourceInstanceKey,
        input.rootCanonicalPath,
        page.relativeFilePath,
      ),
    );
  }
  await deps.deleteLocalPath(
    buildMirrorManifestFilePathWithInstanceKey(
      input.workspaceRoot,
      input.sourceInstanceKey,
      input.rootCanonicalPath,
    ),
  );

  return buildMirrorManifestFilePathWithInstanceKey(
    input.workspaceRoot,
    targetInstanceKey,
    input.rootCanonicalPath,
  );
}

function listAncestorCanonicalPaths(canonicalPath: string): string[] {
  const segments = canonicalPath
    .split("/")
    .filter((segment) => segment.length > 0);
  const ancestors: string[] = [];
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    ancestors.push(`/${segments.slice(0, length).join("/")}`);
  }
  if (segments.length > 0) {
    ancestors.push("/");
  }
  return ancestors;
}

function isWithinCanonicalSubtree(
  candidatePath: string,
  rootCanonicalPath: string,
): boolean {
  return (
    candidatePath === rootCanonicalPath ||
    candidatePath.startsWith(`${rootCanonicalPath}/`)
  );
}

async function findReusableAncestorPrefixMirror(
  deps: CommandDeps,
  input: {
    workspaceRoot: string;
    baseUrl: string;
    canonicalPath: string;
  },
): Promise<
  | {
      kind: "reusable";
      manifestPath: string;
      manifest: MirrorManifest;
      page: MirrorManifestPage;
      instanceKey: string;
    }
  | {
      kind: "skipped";
      manifest: MirrorManifest;
      skippedPage: MirrorManifestSkippedPage;
    }
  | undefined
> {
  for (const ancestorPath of listAncestorCanonicalPaths(input.canonicalPath)) {
    for (const { instanceKey, manifestPath } of listMirrorManifestCandidates(
      input.workspaceRoot,
      input.baseUrl,
      ancestorPath,
    )) {
      let rawManifest: string;
      try {
        rawManifest = await deps.readLocalFile(manifestPath);
      } catch {
        continue;
      }
      const parsedManifest = parseMirrorManifest(rawManifest);
      if (!parsedManifest.ok || parsedManifest.value.mode !== "prefix") {
        continue;
      }
      const manifest = parsedManifest.value;
      const page = manifest.pages.find(
        (candidate) => candidate.canonicalPath === input.canonicalPath,
      );
      if (page) {
        return { kind: "reusable", manifestPath, manifest, page, instanceKey };
      }
      const skippedPage = manifest.skippedPages?.find(
        (candidate) => candidate.canonicalPath === input.canonicalPath,
      );
      if (skippedPage) {
        return { kind: "skipped", manifest, skippedPage };
      }
    }
  }
  return undefined;
}

async function exportPageIntoExistingPrefixMirror(
  deps: CommandDeps,
  input: {
    workspaceRoot: string;
    baseUrl: string;
    canonicalPath: string;
    writeFailedMessage: string;
  },
): Promise<{ handled: false } | { handled: true; manifest?: MirrorManifest }> {
  const reusable = await findReusableAncestorPrefixMirror(deps, {
    workspaceRoot: input.workspaceRoot,
    baseUrl: input.baseUrl,
    canonicalPath: input.canonicalPath,
  });
  if (!reusable) {
    return { handled: false };
  }
  if (reusable.kind === "skipped") {
    deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SKIPPED_MESSAGE);
    return { handled: true };
  }

  const _localFilePath = buildMirrorLocalFilePath(
    input.workspaceRoot,
    input.baseUrl,
    reusable.manifest.rootCanonicalPath,
    reusable.page.relativeFilePath,
  );
  const sourceLocalFilePath = buildMirrorLocalFilePathWithInstanceKey(
    input.workspaceRoot,
    reusable.instanceKey,
    reusable.manifest.rootCanonicalPath,
    reusable.page.relativeFilePath,
  );
  if (deps.findOpenTextDocument(sourceLocalFilePath)?.isDirty) {
    deps.showErrorMessage(
      DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE,
    );
    return { handled: true };
  }

  const snapshot = await deps.bootstrapEditSession(input.canonicalPath);
  if (!snapshot.ok) {
    deps.showErrorMessage(
      mapSnapshotFailureToMessage(snapshot, {
        apiNotSupported: DOWNLOAD_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE,
        connectionFailed: DOWNLOAD_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE,
        notFound: DOWNLOAD_CURRENT_PAGE_NOT_FOUND_MESSAGE,
      }),
    );
    return { handled: true };
  }

  const exportedAt = new Date().toISOString();
  const updatedPages = reusable.manifest.pages.map((page) =>
    page.canonicalPath === input.canonicalPath
      ? {
          ...page,
          pageId: snapshot.value.pageId,
          baseRevisionId: snapshot.value.baseRevisionId,
          exportedAt,
          contentHash: hashBody(snapshot.value.baseBody),
        }
      : page,
  );

  try {
    const targetLocalFilePath = buildMirrorLocalFilePath(
      input.workspaceRoot,
      input.baseUrl,
      reusable.manifest.rootCanonicalPath,
      reusable.page.relativeFilePath,
    );
    await deps.writeLocalFile(targetLocalFilePath, snapshot.value.baseBody);
    const updatedManifest: MirrorManifest = {
      ...reusable.manifest,
      exportedAt,
      pages: updatedPages,
    };
    const targetManifestPath = await migrateMirrorRootIfNeeded(deps, {
      workspaceRoot: input.workspaceRoot,
      baseUrl: input.baseUrl,
      rootCanonicalPath: reusable.manifest.rootCanonicalPath,
      sourceInstanceKey: reusable.instanceKey,
      manifest: updatedManifest,
    });
    await deps.writeLocalFile(
      targetManifestPath,
      serializeMirrorManifest(updatedManifest),
    );
    await deps.openLocalFile(targetLocalFilePath);
    deps.showInformationMessage(
      DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SUCCESS_MESSAGE,
    );
    return { handled: true, manifest: updatedManifest };
  } catch {
    deps.showErrorMessage(input.writeFailedMessage);
    return { handled: true };
  }
}

async function exportPrefixIntoExistingPrefixMirror(
  deps: CommandDeps,
  input: {
    workspaceRoot: string;
    baseUrl: string;
    canonicalPath: string;
    writeFailedMessage: string;
  },
): Promise<{ handled: false } | { handled: true; manifest?: MirrorManifest }> {
  const reusable = await findReusableAncestorPrefixMirror(deps, {
    workspaceRoot: input.workspaceRoot,
    baseUrl: input.baseUrl,
    canonicalPath: input.canonicalPath,
  });
  if (!reusable) {
    return { handled: false };
  }
  if (reusable.kind === "skipped") {
    deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SKIPPED_MESSAGE);
    return { handled: true };
  }

  const listedPages = await deps.listPages(input.canonicalPath);
  if (!listedPages.ok) {
    deps.showErrorMessage(mapBundleListFailureToMessage(listedPages));
    return { handled: true };
  }

  const subtreePagePaths = dedupeAndSortCanonicalPaths([
    input.canonicalPath,
    ...listedPages.paths,
  ]);
  if (subtreePagePaths.length > CURRENT_PAGE_SET_MAX_PAGES) {
    deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_TOO_MANY_PAGES_MESSAGE);
    return { handled: true };
  }

  const plannedPages = planMirrorRelativeFilePaths(
    reusable.manifest.rootCanonicalPath,
    subtreePagePaths,
  );

  const subtreeManifestPages = reusable.manifest.pages.filter((page) =>
    isWithinCanonicalSubtree(page.canonicalPath, input.canonicalPath),
  );
  for (const page of subtreeManifestPages) {
    const localFilePath = buildMirrorLocalFilePathWithInstanceKey(
      input.workspaceRoot,
      reusable.instanceKey,
      reusable.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );
    if (deps.findOpenTextDocument(localFilePath)?.isDirty) {
      deps.showErrorMessage(
        DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE,
      );
      return { handled: true };
    }
  }

  const exportedAt = new Date().toISOString();
  const updatedSubtreePages: MirrorManifestPage[] = [];

  try {
    for (const plannedPage of plannedPages.pages) {
      const snapshot = await deps.bootstrapEditSession(
        plannedPage.canonicalPath,
      );
      if (!snapshot.ok) {
        deps.showErrorMessage(mapBundleSnapshotFailureToMessage(snapshot));
        return { handled: true };
      }
      const localFilePath = buildMirrorLocalFilePath(
        input.workspaceRoot,
        input.baseUrl,
        reusable.manifest.rootCanonicalPath,
        plannedPage.relativeFilePath,
      );
      await deps.writeLocalFile(localFilePath, snapshot.value.baseBody);
      updatedSubtreePages.push({
        canonicalPath: plannedPage.canonicalPath,
        relativeFilePath: plannedPage.relativeFilePath,
        pageId: snapshot.value.pageId,
        baseRevisionId: snapshot.value.baseRevisionId,
        exportedAt,
        contentHash: hashBody(snapshot.value.baseBody),
      });
    }

    const previousTrackedPaths = new Set(
      [
        ...reusable.manifest.pages
          .filter((page) =>
            isWithinCanonicalSubtree(page.canonicalPath, input.canonicalPath),
          )
          .map((page) => page.relativeFilePath),
        ...(reusable.manifest.skippedPages ?? [])
          .filter((page) =>
            isWithinCanonicalSubtree(page.canonicalPath, input.canonicalPath),
          )
          .map((page) => page.relativeFilePath),
      ].map((relativeFilePath) =>
        buildMirrorLocalFilePathWithInstanceKey(
          input.workspaceRoot,
          reusable.instanceKey,
          reusable.manifest.rootCanonicalPath,
          relativeFilePath,
        ),
      ),
    );
    const currentTrackedPaths = new Set(
      [
        ...updatedSubtreePages.map((page) => page.relativeFilePath),
        ...plannedPages.skippedPages.map((page) => page.relativeFilePath),
      ].map((relativeFilePath) =>
        buildMirrorLocalFilePath(
          input.workspaceRoot,
          input.baseUrl,
          reusable.manifest.rootCanonicalPath,
          relativeFilePath,
        ),
      ),
    );
    const updatedManifest: MirrorManifest = {
      ...reusable.manifest,
      exportedAt,
      pages: [
        ...reusable.manifest.pages.filter(
          (page) =>
            !isWithinCanonicalSubtree(page.canonicalPath, input.canonicalPath),
        ),
        ...updatedSubtreePages,
      ],
      ...(reusable.manifest.skippedPages || plannedPages.skippedPages.length > 0
        ? {
            skippedPages: [
              ...(reusable.manifest.skippedPages ?? []).filter(
                (page) =>
                  !isWithinCanonicalSubtree(
                    page.canonicalPath,
                    input.canonicalPath,
                  ),
              ),
              ...plannedPages.skippedPages,
            ],
          }
        : {}),
    };

    const targetManifestPath = await migrateMirrorRootIfNeeded(deps, {
      workspaceRoot: input.workspaceRoot,
      baseUrl: input.baseUrl,
      rootCanonicalPath: reusable.manifest.rootCanonicalPath,
      sourceInstanceKey: reusable.instanceKey,
      manifest: updatedManifest,
    });

    for (const stalePath of previousTrackedPaths) {
      if (currentTrackedPaths.has(stalePath)) {
        continue;
      }
      await deps.deleteLocalPath(stalePath);
    }

    await deps.writeLocalFile(
      targetManifestPath,
      serializeMirrorManifest(updatedManifest),
    );
    await deps.openLocalFile(
      buildMirrorLocalFilePath(
        input.workspaceRoot,
        input.baseUrl,
        reusable.manifest.rootCanonicalPath,
        updatedSubtreePages[0]?.relativeFilePath ??
          plannedPages.skippedPages[0]?.relativeFilePath ??
          reusable.page.relativeFilePath,
      ),
    );
    if (plannedPages.skippedPages.length > 0) {
      deps.showWarningMessage(
        [
          DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_SUCCESS_MESSAGE,
          formatSkippedMirrorPagesSummary(plannedPages.skippedPages),
        ].join("\n"),
      );
    } else {
      deps.showInformationMessage(
        DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_SUCCESS_MESSAGE,
      );
    }
    return { handled: true, manifest: updatedManifest };
  } catch {
    deps.showErrorMessage(input.writeFailedMessage);
    return { handled: true };
  }
}

function formatBundleCompareSkippedSummary(
  results: readonly BundleCompareResult[],
): string {
  return [
    "Compare Local Mirror with GROWI では一部ページを changes editor に含めませんでした。",
    ...results.map((result) => `${result.status}: ${result.canonicalPath}`),
  ].join("\n");
}

function formatBundleUploadSummary(
  results: readonly BundleUploadResult[],
): string {
  return [
    "Upload Local Mirror to GROWI を完了しました。",
    ...results.map((result) => `${result.status}: ${result.canonicalPath}`),
  ].join("\n");
}

function formatSkippedMirrorPagesSummary(
  skippedPages: readonly MirrorManifestSkippedPage[],
): string {
  return [
    "Local Mirror では一部ページを保存しませんでした。",
    ...skippedPages.map(
      (page) =>
        `${page.reason}: ${page.canonicalPath} -> ${page.relativeFilePath}`,
    ),
  ].join("\n");
}

function dedupeAndSortCanonicalPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

type AccessFailureMessages = {
  baseUrlNotConfigured?: string;
  apiTokenNotConfigured?: string;
  invalidApiToken?: string;
  permissionDenied?: string;
  apiNotSupported: string;
  connectionFailed: string;
  notFound?: string;
};

function mapAccessFailureReasonToMessage(
  reason: GrowiAccessFailureReason,
  messages: AccessFailureMessages,
): string {
  if (reason === "BaseUrlNotConfigured") {
    return (
      messages.baseUrlNotConfigured ?? GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE
    );
  }
  if (reason === "ApiTokenNotConfigured") {
    return (
      messages.apiTokenNotConfigured ?? GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE
    );
  }
  if (reason === "InvalidApiToken") {
    return messages.invalidApiToken ?? GENERIC_INVALID_API_TOKEN_MESSAGE;
  }
  if (reason === "PermissionDenied") {
    return messages.permissionDenied ?? GENERIC_PERMISSION_DENIED_MESSAGE;
  }
  if (reason === "ApiNotSupported") {
    return messages.apiNotSupported;
  }
  return messages.connectionFailed;
}

function mapReadFailureReasonToMessage(
  reason: GrowiReadFailureReason,
  messages: AccessFailureMessages & { notFound: string },
): string {
  if (reason === "NotFound") {
    return messages.notFound;
  }
  return mapAccessFailureReasonToMessage(reason, messages);
}

type CreatePageFailureReason = Exclude<
  Exclude<GrowiPageCreateResult, { ok: true }>["reason"],
  undefined
>;

function mapCreatePageFailureReasonToMessage(
  reason: CreatePageFailureReason,
): string {
  if (reason === "BaseUrlNotConfigured") {
    return GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "ApiTokenNotConfigured") {
    return GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "InvalidApiToken") {
    return GENERIC_INVALID_API_TOKEN_MESSAGE;
  }
  if (reason === "PermissionDenied") {
    return GENERIC_PERMISSION_DENIED_MESSAGE;
  }
  if (reason === "NotFound") {
    return CREATE_PAGE_PARENT_NOT_FOUND_MESSAGE;
  }
  if (reason === "AlreadyExists") {
    return CREATE_PAGE_ALREADY_EXISTS_MESSAGE;
  }
  if (reason === "ApiNotSupported") {
    return CREATE_PAGE_API_NOT_SUPPORTED_MESSAGE;
  }
  return CREATE_PAGE_CONNECTION_FAILED_MESSAGE;
}

function mapDeletePageFailureReasonToMessage(
  result: Exclude<GrowiPageDeleteResult, { ok: true }>,
): string {
  const { reason } = result;
  if (reason === "BaseUrlNotConfigured") {
    return GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "ApiTokenNotConfigured") {
    return GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "InvalidApiToken") {
    return GENERIC_INVALID_API_TOKEN_MESSAGE;
  }
  if (reason === "PermissionDenied") {
    return GENERIC_PERMISSION_DENIED_MESSAGE;
  }
  if (reason === "NotFound") {
    return DELETE_PAGE_NOT_FOUND_MESSAGE;
  }
  if (reason === "HasChildren") {
    return DELETE_PAGE_HAS_CHILDREN_MESSAGE;
  }
  if (reason === "Rejected") {
    return (
      result.message ??
      "Delete Page のリクエストが接続先 GROWI に拒否されました。"
    );
  }
  if (reason === "ApiNotSupported") {
    return result.message ?? DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE;
  }
  return DELETE_PAGE_CONNECTION_FAILED_MESSAGE;
}

function mapRenamePageFailureReasonToMessage(
  result: Exclude<GrowiPageRenameResult, { ok: true }>,
): string {
  const { reason } = result;
  if (reason === "BaseUrlNotConfigured") {
    return GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "ApiTokenNotConfigured") {
    return GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE;
  }
  if (reason === "InvalidApiToken") {
    return GENERIC_INVALID_API_TOKEN_MESSAGE;
  }
  if (reason === "PermissionDenied") {
    return GENERIC_PERMISSION_DENIED_MESSAGE;
  }
  if (reason === "NotFound") {
    return RENAME_PAGE_NOT_FOUND_MESSAGE;
  }
  if (reason === "ParentNotFound") {
    return RENAME_PAGE_PARENT_NOT_FOUND_MESSAGE;
  }
  if (reason === "AlreadyExists") {
    return RENAME_PAGE_ALREADY_EXISTS_MESSAGE;
  }
  if (reason === "Rejected") {
    return (
      result.message ??
      "Rename Page のリクエストが接続先 GROWI に拒否されました。"
    );
  }
  if (reason === "ApiNotSupported") {
    return result.message ?? RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE;
  }
  return RENAME_PAGE_CONNECTION_FAILED_MESSAGE;
}

function mapBundleListFailureToMessage(result: {
  ok: false;
  reason: GrowiAccessFailureReason;
}): string {
  return mapAccessFailureReasonToMessage(result.reason, {
    apiNotSupported: DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
  });
}

function mapBundleSnapshotFailureToMessage(
  result: Exclude<StartEditBootstrapResult, { ok: true }>,
): string {
  return mapReadFailureReasonToMessage(result.reason, {
    apiNotSupported: DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
    notFound: DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE,
  });
}

function resolveCommandInput(
  injected:
    | string
    | {
        input?: string;
        initialValue?: string;
      }
    | undefined,
): string | undefined {
  if (typeof injected === "string") {
    return injected;
  }
  if (typeof injected?.input === "string") {
    return injected.input;
  }
  return undefined;
}

function resolveCommandInitialValue(
  injected:
    | string
    | {
        input?: string;
        initialValue?: string;
      }
    | undefined,
): string | undefined {
  if (
    typeof injected === "object" &&
    typeof injected?.initialValue === "string"
  ) {
    return injected.initialValue;
  }
  return undefined;
}

async function openChangesEditor(
  deps: CommandDeps,
  title: string,
  resources: readonly ChangesResourceTuple[],
): Promise<void> {
  if (deps.openChanges) {
    await deps.openChanges(title, resources);
    return;
  }

  const vscode = await import("vscode");
  const toVscodeUri = (uri: UriLike) =>
    uri.scheme === "file"
      ? vscode.Uri.file(uri.fsPath ?? uri.path)
      : vscode.Uri.parse(`${uri.scheme}:${uri.path}`);

  await vscode.commands.executeCommand(
    "vscode.changes",
    title,
    resources.map(([goToFileUri, originalUri, modifiedUri]) => [
      toVscodeUri(goToFileUri),
      toVscodeUri(originalUri),
      toVscodeUri(modifiedUri),
    ]),
  );
}

async function openResolvedGrowiPage(
  deps: CommandDeps,
  reference: ParsedGrowiReference,
): Promise<boolean> {
  const resolved = await deps.resolvePageReference(reference);
  if (!resolved.ok) {
    deps.showErrorMessage(
      mapReadFailureReasonToMessage(resolved.reason, {
        apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
        baseUrlNotConfigured: GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
        invalidApiToken: OPEN_PAGE_INVALID_API_TOKEN_MESSAGE,
        permissionDenied: OPEN_PAGE_PERMISSION_DENIED_MESSAGE,
        apiNotSupported: OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE,
        connectionFailed: OPEN_PAGE_CONNECTION_FAILED_MESSAGE,
        notFound: OPEN_PAGE_NOT_FOUND_MESSAGE,
      }),
    );
    return false;
  }

  const page = await deps.readPageBody(resolved.canonicalPath);
  if (!page.ok) {
    deps.showErrorMessage(
      mapReadFailureReasonToMessage(page.reason, {
        apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
        baseUrlNotConfigured: GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
        invalidApiToken: OPEN_PAGE_INVALID_API_TOKEN_MESSAGE,
        permissionDenied: OPEN_PAGE_PERMISSION_DENIED_MESSAGE,
        apiNotSupported: OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE,
        connectionFailed: OPEN_PAGE_CONNECTION_FAILED_MESSAGE,
        notFound: OPEN_PAGE_NOT_FOUND_MESSAGE,
      }),
    );
    return false;
  }

  try {
    await deps.openUri(resolved.uri);
    return true;
  } catch {
    deps.showErrorMessage(OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE);
    return false;
  }
}

function resolvePrefixRootCanonicalPath(
  target:
    | string
    | UriLike
    | {
        uri?: UriLike;
      }
    | undefined,
): string | undefined {
  if (typeof target === "string") {
    const normalized = normalizeCanonicalPath(target);
    return normalized.ok ? normalized.value : undefined;
  }

  const targetWithUri =
    typeof target === "object" &&
    target !== null &&
    "uri" in target &&
    target.uri?.scheme === "growi" &&
    typeof target.uri.path === "string"
      ? target.uri
      : undefined;
  const uriPath =
    targetWithUri?.path ??
    (typeof target === "object" &&
    target !== null &&
    "scheme" in target &&
    "path" in target &&
    target.scheme === "growi" &&
    typeof target.path === "string"
      ? target.path
      : undefined);
  if (!uriPath) {
    return undefined;
  }

  const normalized = normalizeCanonicalPath(uriPath);
  return normalized.ok ? normalized.value : undefined;
}

function resolveDirectoryPageCanonicalPath(
  target:
    | string
    | UriLike
    | {
        uri?: UriLike;
      }
    | undefined,
): string | undefined {
  if (typeof target === "string") {
    const normalized = normalizeCanonicalPath(target);
    return normalized.ok ? normalized.value : undefined;
  }

  const commandUri = resolveCommandUri(target);
  if (!commandUri) {
    return undefined;
  }

  return resolveDirectoryCanonicalPathFromDirectoryUri(commandUri);
}

function toGrowiPageUri(canonicalPath: string): UriLike {
  return {
    scheme: "growi",
    path: `${canonicalPath}.md`,
  };
}

type ExplorerCommandTarget =
  | string
  | UriLike
  | {
      uri?: UriLike;
      contextValue?: string;
    }
  | undefined;

type MirrorCommandTarget =
  | UriLike
  | {
      uri?: UriLike;
      scope?: MirrorRequestScope;
    }
  | undefined;

function resolveExplorerTargetUri(
  target: ExplorerCommandTarget,
): UriLike | undefined {
  if (typeof target === "string") {
    const normalized = normalizeCanonicalPath(target);
    return normalized.ok ? toGrowiPageUri(normalized.value) : undefined;
  }

  const commandUri = resolveCommandUri(target);
  if (!commandUri || commandUri.scheme !== "growi") {
    return undefined;
  }

  if (isPageUri(commandUri)) {
    return commandUri;
  }

  const canonicalPath =
    resolveDirectoryCanonicalPathFromDirectoryUri(commandUri);
  if (!canonicalPath) {
    return undefined;
  }

  return toGrowiPageUri(canonicalPath);
}

function resolveMirrorRequestScope(
  target: MirrorCommandTarget,
): MirrorRequestScope {
  return typeof target === "object" &&
    target !== null &&
    "scope" in target &&
    target.scope === "subtree"
    ? "subtree"
    : "page";
}

function resolveMirrorTargetUri(
  target: MirrorCommandTarget,
): UriLike | undefined {
  if (typeof target === "object" && target !== null && "uri" in target) {
    return target.uri;
  }
  if (
    typeof target === "object" &&
    target !== null &&
    "scheme" in target &&
    "path" in target
  ) {
    return target as UriLike;
  }
  return undefined;
}

function buildMirrorDiffTitle(loaded: LoadedMirrorSelection): string {
  if (!loaded.reusedAncestorPrefix) {
    return `GROWI Mirror Diff: ${loaded.manifest.rootCanonicalPath}`;
  }
  if (loaded.requestedScope === "page") {
    return `GROWI Mirror Diff: ${loaded.requestedCanonicalPath}`;
  }
  return `GROWI Mirror Diff: ${loaded.requestedCanonicalPath}/*`;
}

function createExplorerDelegatingCommand(
  deps: CommandDeps,
  command: string,
): (target?: ExplorerCommandTarget) => Promise<void> {
  return async function explorerDelegatingCommand(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri = resolveExplorerTargetUri(target);
    if (!targetUri) {
      return;
    }

    await deps.executeCommand?.(command, targetUri);
  };
}

function createExplorerBundleDelegatingCommand(
  deps: CommandDeps,
  command: string,
): (target?: ExplorerCommandTarget) => Promise<void> {
  return async function explorerBundleDelegatingCommand(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri = resolveExplorerTargetUri(target);
    if (!targetUri) {
      return;
    }

    await deps.executeCommand?.(command, targetUri);
  };
}

function createExplorerMirrorDelegatingCommand(
  deps: CommandDeps,
  command: string,
): (target?: ExplorerCommandTarget) => Promise<void> {
  return async function explorerMirrorDelegatingCommand(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri = resolveExplorerTargetUri(target);
    if (!targetUri) {
      return;
    }

    const scope: MirrorRequestScope =
      typeof target === "object" &&
      target !== null &&
      "contextValue" in target &&
      (target.contextValue === "growi.directory" ||
        target.contextValue === "growi.prefixRoot")
        ? "subtree"
        : "page";

    await deps.executeCommand?.(command, { uri: targetUri, scope });
  };
}

function _createExplorerPassthroughCommand(
  deps: CommandDeps,
  command: string,
): (_target?: ExplorerCommandTarget) => Promise<void> {
  return async function explorerPassthroughCommand(): Promise<void> {
    await deps.executeCommand?.(command);
  };
}

function resolveCommandUri(
  target:
    | UriLike
    | {
        uri?: UriLike;
      }
    | undefined,
): UriLike | undefined {
  const targetWithUri =
    typeof target === "object" &&
    target !== null &&
    "uri" in target &&
    target.uri !== undefined
      ? target.uri
      : undefined;
  if (targetWithUri) {
    return targetWithUri;
  }

  return typeof target === "object" &&
    target !== null &&
    "scheme" in target &&
    "path" in target
    ? (target as UriLike)
    : undefined;
}

export function normalizeBaseUrl(input: string): BaseUrlResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "InvalidUrl" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "InvalidUrl" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "InvalidUrl" };
  }

  return { ok: true, value: parsed.toString() };
}

export function createConfigureBaseUrlCommand(deps: CommandDeps) {
  return async function configureBaseUrl(
    injectedInput?:
      | string
      | {
          input?: string;
        },
  ): Promise<void> {
    const inputFromCommand = resolveCommandInput(injectedInput);
    const input =
      inputFromCommand ??
      (await deps.showInputBox({
        placeHolder: "https://growi.example.com/",
        prompt: "接続先の GROWI base URL を入力してください",
        title: "GROWI: Configure Base URL",
        value: deps.getBaseUrl() ?? "",
      }));

    if (input === undefined) {
      return;
    }

    const normalized = normalizeBaseUrl(input);
    if (!normalized.ok) {
      deps.showErrorMessage(
        "GROWI base URL には http:// または https:// の URL を入力してください。",
      );
      return;
    }

    await deps.updateBaseUrl(normalized.value);
    deps.showInformationMessage("GROWI base URL を更新しました。");
  };
}

export function createConfigureApiTokenCommand(deps: CommandDeps) {
  return async function configureApiToken(
    injectedInput?:
      | string
      | {
          input?: string;
        },
  ): Promise<void> {
    const inputFromCommand = resolveCommandInput(injectedInput);
    const input =
      inputFromCommand ??
      (await deps.showInputBox({
        password: true,
        placeHolder: "Paste API token",
        prompt: "GROWI API token を入力してください",
        title: "GROWI: Configure API Token",
      }));

    if (input === undefined) {
      return;
    }

    const token = input.trim();
    if (token.length === 0) {
      deps.showErrorMessage("GROWI API token は空にできません。");
      return;
    }

    await deps.storeSecret(GROWI_SECRET_KEYS.apiToken, token);
    deps.showInformationMessage("GROWI API token を保存しました。");
  };
}

export function createOpenReadmeCommand(deps: {
  getExtensionRoot(): string;
  openLocalFile(path: string): Promise<void>;
}) {
  return async function openReadme(): Promise<void> {
    await deps.openLocalFile(path.join(deps.getExtensionRoot(), "README.md"));
  };
}

export function createAddPrefixCommand(deps: CommandDeps) {
  return async function addPrefix(
    injectedInput?:
      | string
      | {
          input?: string;
        },
  ): Promise<void> {
    const inputFromCommand = resolveCommandInput(injectedInput);
    const input =
      inputFromCommand ??
      (await deps.showInputBox({
        placeHolder: "https://growi.example.com/67ca... or /team/dev",
        prompt: "登録する Prefix または same-instance idurl を入力してください",
        title: "GROWI: Add Prefix",
      }));

    if (input === undefined) {
      return;
    }

    const parsed = parseAddPrefixInput(input, {
      baseUrl: deps.getBaseUrl(),
    });
    if (!parsed.ok) {
      if (parsed.reason === "InvalidPath") {
        deps.showErrorMessage(ADD_PREFIX_INVALID_PATH_MESSAGE);
        return;
      }
      deps.showErrorMessage(ADD_PREFIX_INVALID_INPUT_MESSAGE);
      return;
    }

    const resolved = await deps.resolvePageReference(parsed.value);
    if (!resolved.ok) {
      deps.showErrorMessage(
        mapReadFailureReasonToMessage(resolved.reason, {
          apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
          baseUrlNotConfigured: ADD_PREFIX_INVALID_BASE_URL_MESSAGE,
          invalidApiToken: GENERIC_INVALID_API_TOKEN_MESSAGE,
          permissionDenied: GENERIC_PERMISSION_DENIED_MESSAGE,
          apiNotSupported: ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: ADD_PREFIX_CONNECTION_FAILED_MESSAGE,
          notFound: ADD_PREFIX_NOT_FOUND_MESSAGE,
        }),
      );
      return;
    }

    const result = await deps.addPrefix(resolved.canonicalPath);
    if (result.ok) {
      deps.showInformationMessage(
        result.added
          ? "GROWI Prefix を追加しました。"
          : ADD_PREFIX_DUPLICATE_MESSAGE,
      );
      return;
    }

    if (result.reason === "InvalidBaseUrl") {
      deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
      return;
    }
    if (result.reason === "InvalidPath") {
      deps.showErrorMessage(ADD_PREFIX_INVALID_PATH_MESSAGE);
      return;
    }
    if (result.reason === "AncestorConflict") {
      deps.showErrorMessage(ADD_PREFIX_ANCESTOR_CONFLICT_MESSAGE);
      return;
    }

    deps.showErrorMessage(ADD_PREFIX_DESCENDANT_CONFLICT_MESSAGE);
  };
}

export function createClearPrefixesCommand(deps: CommandDeps) {
  return async function clearPrefixes(): Promise<void> {
    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
      return;
    }

    const prefixes = deps.getRegisteredPrefixes();
    if (prefixes.length === 0) {
      deps.showInformationMessage(CLEAR_PREFIXES_NO_TARGET_MESSAGE);
      return;
    }

    const confirmed = await deps.showClearPrefixesConfirmation(
      baseUrl,
      prefixes,
    );
    if (!confirmed) {
      return;
    }

    const result = await deps.clearPrefixes();
    if (!result.ok) {
      deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
      return;
    }

    if (!result.cleared) {
      deps.showInformationMessage(CLEAR_PREFIXES_NO_TARGET_MESSAGE);
      return;
    }

    deps.showInformationMessage(CLEAR_PREFIXES_SUCCESS_MESSAGE);
  };
}

export function createOpenPageCommand(deps: CommandDeps) {
  return async function openPage(
    injectedInput?:
      | string
      | {
          input?: string;
        },
  ): Promise<void> {
    const inputFromCommand = resolveCommandInput(injectedInput);
    const input =
      inputFromCommand ??
      (await deps.showInputBox({
        placeHolder:
          "https://growi.example.com/67ca... or /team/dev/spec or /67ca...",
        prompt: "GROWI の URL、permalink、またはページパスを入力してください",
        title: "GROWI: Open Page",
      }));

    if (input === undefined) {
      return;
    }

    const parsed = parseOpenPageInput(input, {
      baseUrl: deps.getBaseUrl(),
    });
    if (!parsed.ok) {
      deps.showErrorMessage(
        "GROWI の URL、same-instance permalink、または先頭 / 付きのページパスを入力してください。",
      );
      return;
    }

    await openResolvedGrowiPage(deps, parsed.value);
  };
}

export function createCreatePageCommand(deps: CommandDeps) {
  return async function createPage(
    injectedInput?:
      | string
      | {
          input?: string;
          initialValue?: string;
        },
  ): Promise<void> {
    const inputFromCommand = resolveCommandInput(injectedInput);
    const initialValue = resolveCommandInitialValue(injectedInput);
    const input =
      inputFromCommand ??
      (await deps.showInputBox({
        placeHolder: "/team/dev/new-page",
        prompt: "作成する GROWI ページパスを入力してください",
        title: "GROWI: Create Page",
        value: initialValue,
      }));

    if (input === undefined) {
      return;
    }

    const normalized = normalizeCanonicalPath(input);
    if (!normalized.ok || normalized.value === "/") {
      deps.showErrorMessage(CREATE_PAGE_INVALID_PATH_MESSAGE);
      return;
    }

    const canonicalPath = normalized.value;
    const created = await deps.createPage(canonicalPath);
    if (!created.ok) {
      deps.showErrorMessage(
        mapCreatePageFailureReasonToMessage(created.reason),
      );
      return;
    }

    for (const ancestorPath of listAncestorCanonicalPaths(canonicalPath)) {
      deps.invalidateReadDirectoryCache(ancestorPath);
    }

    const opened = await openResolvedGrowiPage(deps, {
      kind: "canonicalPath",
      canonicalPath,
      uri: buildGrowiUri(canonicalPath),
      source: "path",
    });
    if (!opened) {
      return;
    }

    await createStartEditCommand(deps)({
      scheme: "growi",
      path: `${canonicalPath}.md`,
    });
    deps.refreshPrefixTree();
  };
}

type DeleteCommandTarget = UriLike | { uri?: UriLike } | undefined;

type RenameCommandTarget =
  | string
  | UriLike
  | {
      input?: string;
      uri?: UriLike;
    }
  | undefined;

function mapRenamedCanonicalPath(
  oldCanonicalPath: string,
  newCanonicalPath: string,
  candidatePath: string,
): string {
  if (candidatePath === oldCanonicalPath) {
    return newCanonicalPath;
  }
  return `${newCanonicalPath}${candidatePath.slice(oldCanonicalPath.length)}`;
}

export function createDeletePageCommand(deps: CommandDeps) {
  return async function deletePage(
    target?: DeleteCommandTarget,
  ): Promise<void> {
    const targetUri = resolveCommandUri(target) ?? deps.getActiveEditorUri();
    if (!targetUri) {
      deps.showErrorMessage(DELETE_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(DELETE_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    if (deps.findOpenTextDocumentByUri(targetUri)?.isDirty) {
      deps.showErrorMessage(DELETE_PAGE_DIRTY_MESSAGE);
      return;
    }

    const pageInfo = deps.getCurrentPageInfo(canonicalPath);
    const pageId =
      pageInfo?.pageId ?? deps.getEditSession(canonicalPath)?.pageId;
    const revisionId =
      pageInfo?.revisionId ??
      deps.getEditSession(canonicalPath)?.baseRevisionId;
    if (!pageId || !revisionId) {
      deps.showErrorMessage(DELETE_PAGE_UNAVAILABLE_MESSAGE);
      return;
    }

    const listedPages = await deps.listPages(canonicalPath);
    if (!listedPages.ok) {
      deps.showErrorMessage(
        mapAccessFailureReasonToMessage(listedPages.reason, {
          apiNotSupported: DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: DELETE_PAGE_CONNECTION_FAILED_MESSAGE,
        }),
      );
      return;
    }

    const descendantPaths = dedupeAndSortCanonicalPaths(
      listedPages.paths.filter(
        (path) =>
          path !== canonicalPath &&
          isWithinCanonicalSubtree(path, canonicalPath),
      ),
    );
    const dirtyOpenPath = [canonicalPath, ...descendantPaths].find(
      (path) => deps.findOpenTextDocumentByUri(toGrowiPageUri(path))?.isDirty,
    );
    if (dirtyOpenPath) {
      deps.showErrorMessage(DELETE_PAGE_DIRTY_MESSAGE);
      return;
    }

    let mode: "page" | "subtree" = "page";
    if (descendantPaths.length > 0) {
      const selectedMode =
        await deps.showDeleteScopeConfirmation(canonicalPath);
      if (selectedMode === "cancel") {
        return;
      }
      mode = selectedMode === "subtree" ? "subtree" : "page";
    }

    const confirmed = await deps.showDeletePageConfirmation(
      canonicalPath,
      mode,
    );
    if (!confirmed) {
      return;
    }

    const deleted = await deps.deletePage({
      pageId,
      revisionId,
      canonicalPath,
      mode,
    });
    if (!deleted.ok) {
      deps.showErrorMessage(mapDeletePageFailureReasonToMessage(deleted));
      return;
    }

    deps.closeEditSession(canonicalPath);
    deps.clearSubtreeState(canonicalPath);

    const directoriesToInvalidate = dedupeAndSortCanonicalPaths([
      canonicalPath,
      ...listAncestorCanonicalPaths(canonicalPath),
    ]);
    for (const directoryPath of directoriesToInvalidate) {
      deps.invalidateReadDirectoryCache(directoryPath);
    }

    deps.refreshPrefixTree();

    const closeResult = await deps.closeDeletedPages(canonicalPath, mode);
    if (closeResult.hasFailed) {
      deps.showWarningMessage(DELETE_PAGE_CLOSE_FAILED_WARNING_MESSAGE);
    }
  };
}

export function createRenamePageCommand(deps: CommandDeps) {
  return async function renamePage(
    target?: RenameCommandTarget,
  ): Promise<void> {
    const targetWithInput =
      typeof target === "object" && target !== null && "input" in target
        ? target
        : undefined;
    const targetUri =
      resolveCommandUri(
        targetWithInput
          ? { uri: targetWithInput.uri }
          : (target as UriLike | { uri?: UriLike } | undefined),
      ) ??
      (typeof target === "object" &&
      target !== null &&
      "scheme" in target &&
      "path" in target
        ? (target as UriLike)
        : deps.getActiveEditorUri());
    if (!targetUri) {
      deps.showErrorMessage(RENAME_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(RENAME_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    if (deps.findOpenTextDocumentByUri(targetUri)?.isDirty) {
      deps.showErrorMessage(RENAME_PAGE_DIRTY_MESSAGE);
      return;
    }

    const pageInfo = deps.getCurrentPageInfo(canonicalPath);
    const pageId =
      pageInfo?.pageId ?? deps.getEditSession(canonicalPath)?.pageId;
    const revisionId =
      pageInfo?.revisionId ??
      deps.getEditSession(canonicalPath)?.baseRevisionId;
    if (!pageId || !revisionId) {
      deps.showErrorMessage(RENAME_PAGE_UNAVAILABLE_MESSAGE);
      return;
    }

    const injectedInput = resolveCommandInput(
      typeof target === "string" || typeof targetWithInput?.input === "string"
        ? (target as string | { input?: string })
        : undefined,
    );
    const input =
      injectedInput ??
      (await deps.showInputBox({
        placeHolder: "/team/dev/renamed-page",
        prompt: "変更後の GROWI ページパスを入力してください",
        title: "GROWI: Rename Page",
        value: canonicalPath,
      }));
    if (input === undefined) {
      return;
    }

    const normalized = normalizeCanonicalPath(input);
    if (!normalized.ok || normalized.value === "/") {
      deps.showErrorMessage(RENAME_PAGE_INVALID_PATH_MESSAGE);
      return;
    }

    const targetCanonicalPath = normalized.value;
    if (targetCanonicalPath === canonicalPath) {
      deps.showErrorMessage(RENAME_PAGE_SAME_PATH_MESSAGE);
      return;
    }
    if (isWithinCanonicalSubtree(targetCanonicalPath, canonicalPath)) {
      deps.showErrorMessage(RENAME_PAGE_DESCENDANT_PATH_MESSAGE);
      return;
    }

    const listedPages = await deps.listPages(canonicalPath);
    if (!listedPages.ok) {
      deps.showErrorMessage(
        mapAccessFailureReasonToMessage(listedPages.reason, {
          apiNotSupported: RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: RENAME_PAGE_CONNECTION_FAILED_MESSAGE,
        }),
      );
      return;
    }

    const descendantPaths = dedupeAndSortCanonicalPaths(
      listedPages.paths.filter(
        (path) =>
          path !== canonicalPath &&
          isWithinCanonicalSubtree(path, canonicalPath),
      ),
    );
    const dirtyOpenPath = [canonicalPath, ...descendantPaths].find(
      (path) => deps.findOpenTextDocumentByUri(toGrowiPageUri(path))?.isDirty,
    );
    if (dirtyOpenPath) {
      deps.showErrorMessage(RENAME_PAGE_DIRTY_MESSAGE);
      return;
    }

    let mode: "page" | "subtree" = "page";
    if (descendantPaths.length > 0) {
      const selectedMode =
        await deps.showRenameScopeConfirmation(canonicalPath);
      if (selectedMode === "cancel") {
        return;
      }
      mode = selectedMode === "subtree" ? "subtree" : "page";
    }

    const renamed = await deps.renamePage({
      pageId,
      revisionId,
      currentCanonicalPath: canonicalPath,
      targetCanonicalPath,
      mode,
    });
    if (!renamed.ok) {
      deps.showErrorMessage(mapRenamePageFailureReasonToMessage(renamed));
      return;
    }

    const effectiveCanonicalPath = renamed.canonicalPath;
    deps.closeEditSession(canonicalPath);
    deps.clearSubtreeState(canonicalPath);

    const directoriesToInvalidate = dedupeAndSortCanonicalPaths([
      canonicalPath,
      effectiveCanonicalPath,
      ...listAncestorCanonicalPaths(canonicalPath),
      ...listAncestorCanonicalPaths(effectiveCanonicalPath),
      ...(mode === "subtree"
        ? descendantPaths.map((path) =>
            mapRenamedCanonicalPath(
              canonicalPath,
              effectiveCanonicalPath,
              path,
            ),
          )
        : []),
    ]);
    for (const directoryPath of directoriesToInvalidate) {
      deps.invalidateReadDirectoryCache(directoryPath);
    }

    deps.refreshPrefixTree();

    const reopenResult = await deps.reopenRenamedPages(
      canonicalPath,
      effectiveCanonicalPath,
    );
    if (reopenResult.hasFailed) {
      deps.showWarningMessage(RENAME_PAGE_REOPEN_FAILED_WARNING_MESSAGE);
      return;
    }
    if (reopenResult.hasDirty) {
      deps.showWarningMessage(RENAME_PAGE_REOPEN_DIRTY_WARNING_MESSAGE);
    }
  };
}

export function createOpenPrefixRootPageCommand(deps: CommandDeps) {
  return async function openPrefixRootPage(
    target?:
      | string
      | UriLike
      | {
          uri?: UriLike;
        },
  ): Promise<void> {
    const canonicalPath = resolvePrefixRootCanonicalPath(target);
    if (!canonicalPath) {
      deps.showErrorMessage(OPEN_PREFIX_ROOT_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    await openResolvedGrowiPage(deps, {
      kind: "canonicalPath",
      canonicalPath,
      uri: buildGrowiUri(canonicalPath),
      source: "path",
    });
  };
}

export function createOpenDirectoryPageCommand(deps: CommandDeps) {
  return async function openDirectoryPage(
    target?:
      | string
      | UriLike
      | {
          uri?: UriLike;
        },
  ): Promise<void> {
    const canonicalPath = resolveDirectoryPageCanonicalPath(target);
    if (!canonicalPath) {
      deps.showErrorMessage(OPEN_DIRECTORY_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    await openResolvedGrowiPage(deps, {
      kind: "canonicalPath",
      canonicalPath,
      uri: buildGrowiUri(canonicalPath),
      source: "path",
    });
  };
}

export function createExplorerOpenPageItemCommand(deps: CommandDeps) {
  return async function explorerOpenPageItem(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri = resolveExplorerTargetUri(target);
    if (!targetUri) {
      return;
    }

    await deps.executeCommand?.("vscode.open", targetUri);
  };
}

function ensureDirectoryInitialValue(canonicalPath: string): string {
  return canonicalPath === "/" ? canonicalPath : `${canonicalPath}/`;
}

export function createExplorerCreatePageHereCommand(deps: CommandDeps) {
  return async function explorerCreatePageHere(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const commandUri =
      typeof target === "string" ? undefined : resolveCommandUri(target);
    if (!commandUri || commandUri.scheme !== "growi") {
      return;
    }

    const initialCanonicalPath = isPageUri(commandUri)
      ? resolveParentDirectoryCanonicalPathFromPageUri(commandUri)
      : resolveDirectoryCanonicalPathFromDirectoryUri(commandUri);
    if (!initialCanonicalPath) {
      return;
    }

    await deps.executeCommand?.(GROWI_COMMANDS.createPage, {
      initialValue: ensureDirectoryInitialValue(initialCanonicalPath),
    });
  };
}

export function createExplorerRenamePageCommand(deps: CommandDeps) {
  return createExplorerDelegatingCommand(deps, GROWI_COMMANDS.renamePage);
}

export function createExplorerDeletePageCommand(deps: CommandDeps) {
  return createExplorerDelegatingCommand(deps, GROWI_COMMANDS.deletePage);
}

export function createExplorerRefreshCurrentPageCommand(deps: CommandDeps) {
  return createExplorerDelegatingCommand(
    deps,
    GROWI_COMMANDS.refreshCurrentPage,
  );
}

export function createExplorerShowBacklinksCommand(deps: CommandDeps) {
  return createExplorerDelegatingCommand(deps, GROWI_COMMANDS.showBacklinks);
}

export function createExplorerShowCurrentPageInfoCommand(deps: CommandDeps) {
  return createExplorerDelegatingCommand(
    deps,
    GROWI_COMMANDS.showCurrentPageInfo,
  );
}

export function createExplorerShowRevisionHistoryDiffCommand(
  deps: CommandDeps,
) {
  return createExplorerDelegatingCommand(
    deps,
    GROWI_COMMANDS.showRevisionHistoryDiff,
  );
}

export function createExplorerDownloadCurrentPageToLocalFileCommand(
  deps: CommandDeps,
) {
  return createExplorerDelegatingCommand(
    deps,
    GROWI_COMMANDS.createLocalMirrorForCurrentPage,
  );
}

export function createExplorerDownloadCurrentPageSetToLocalBundleCommand(
  deps: CommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
  );
}

export function createExplorerCompareLocalWorkFileWithCurrentPageCommand(
  deps: CommandDeps,
) {
  return createExplorerMirrorDelegatingCommand(
    deps,
    GROWI_COMMANDS.compareLocalMirrorWithGrowi,
  );
}

export function createExplorerCompareLocalBundleWithGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.compareLocalMirrorWithGrowi,
  );
}

export function createExplorerUploadExportedLocalFileToGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerMirrorDelegatingCommand(
    deps,
    GROWI_COMMANDS.uploadLocalMirrorToGrowi,
  );
}

export function createExplorerUploadLocalBundleToGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.uploadLocalMirrorToGrowi,
  );
}

function resolveCurrentPageCanonicalPath(
  uri: UriLike | undefined,
): string | undefined {
  if (!uri || uri.scheme !== "growi") {
    return undefined;
  }

  const normalized = buildGrowiUriFromInput(uri.path);
  if (!normalized.ok) {
    return undefined;
  }
  if (normalized.value.canonicalPath === "/") {
    return undefined;
  }

  return normalized.value.canonicalPath;
}

function isPageUri(uri: UriLike | undefined): uri is UriLike {
  return Boolean(uri && uri.scheme === "growi" && !uri.path.endsWith("/"));
}

function toParentDirectoryPath(canonicalPath: string): string {
  if (canonicalPath === "/") {
    return "/";
  }

  const lastSeparator = canonicalPath.lastIndexOf("/");
  if (lastSeparator <= 0) {
    return "/";
  }
  return canonicalPath.slice(0, lastSeparator);
}

function mapSnapshotFailureToMessage(
  result: Exclude<StartEditBootstrapResult, { ok: true }>,
  messages: AccessFailureMessages & { notFound: string },
): string {
  return mapReadFailureReasonToMessage(result.reason, messages);
}

function mapUploadWriteFailureToMessage(
  result: Exclude<GrowiPageWriteResult, { ok: true }>,
): string {
  return mapAccessFailureReasonToMessage(result.reason, {
    permissionDenied: UPLOAD_EXPORTED_LOCAL_FILE_PERMISSION_DENIED_MESSAGE,
    apiNotSupported: UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE,
  });
}

function resolveDirectoryCanonicalPathFromDirectoryUri(
  uri: UriLike | undefined,
): string | undefined {
  if (!uri || uri.scheme !== "growi") {
    return undefined;
  }

  if (!uri.path.endsWith("/")) {
    return undefined;
  }

  const normalizedDirectory = buildGrowiUriFromInput(uri.path);
  if (!normalizedDirectory.ok) {
    return undefined;
  }
  return normalizedDirectory.value.canonicalPath;
}

function resolveParentDirectoryCanonicalPathFromPageUri(
  uri: UriLike | undefined,
): string | undefined {
  const canonicalPath = resolveCurrentPageCanonicalPath(uri);
  if (!canonicalPath) {
    return undefined;
  }
  return toParentDirectoryPath(canonicalPath);
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function parseVirtualFsFailureReason(
  error: unknown,
): GrowiReadFailureReason | undefined {
  const text = getErrorText(error);
  if (text.includes("FileNotFound")) {
    return "NotFound";
  }
  if (text.includes("base URL is not configured")) {
    return "BaseUrlNotConfigured";
  }
  if (text.includes("API token is not configured")) {
    return "ApiTokenNotConfigured";
  }
  if (text.includes("invalid API token")) {
    return "InvalidApiToken";
  }
  if (text.includes("permission denied")) {
    return "PermissionDenied";
  }
  if (
    text.includes("read page API is not supported") ||
    text.includes("list pages API is not supported")
  ) {
    return "ApiNotSupported";
  }
  if (text.includes("failed to connect to GROWI")) {
    return "ConnectionFailed";
  }
  return undefined;
}

function mapRefreshCurrentPageErrorMessage(error: unknown): string {
  const reason = parseVirtualFsFailureReason(error);
  if (reason) {
    return mapReadFailureReasonToMessage(reason, {
      apiNotSupported: REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE,
      connectionFailed: REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE,
      notFound: REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE,
    });
  }
  return REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE;
}

function mapRefreshListingErrorMessage(error: unknown): string {
  const reason = parseVirtualFsFailureReason(error);
  if (reason && reason !== "NotFound") {
    return mapAccessFailureReasonToMessage(reason, {
      apiNotSupported: REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE,
      connectionFailed: REFRESH_LISTING_CONNECTION_FAILED_MESSAGE,
    });
  }
  return REFRESH_LISTING_UNEXPECTED_ERROR_MESSAGE;
}

export function createRefreshCurrentPageCommand(deps: CommandDeps) {
  return async function refreshCurrentPage(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (!targetUri) {
      deps.showErrorMessage(REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    const editSession = deps.getEditSession(canonicalPath);
    if (editSession?.dirty) {
      deps.showErrorMessage(REFRESH_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE);
      return;
    }

    deps.invalidateReadFileCache(canonicalPath);
    try {
      await deps.openUri(`growi:${targetUri.path}`);
    } catch (error) {
      deps.showErrorMessage(mapRefreshCurrentPageErrorMessage(error));
    }
  };
}

export function createStartEditCommand(deps: CommandDeps) {
  return async function startEdit(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (
      !targetUri ||
      targetUri.scheme !== "growi" ||
      targetUri.path.endsWith("/")
    ) {
      deps.showErrorMessage(START_EDIT_INVALID_TARGET_MESSAGE);
      return;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(START_EDIT_INVALID_TARGET_MESSAGE);
      return;
    }

    const existingSession = deps.getEditSession(canonicalPath);
    if (existingSession) {
      return;
    }

    const bootstrapResult = await deps.bootstrapEditSession(canonicalPath);
    if (!bootstrapResult.ok) {
      deps.showErrorMessage(
        mapSnapshotFailureToMessage(bootstrapResult, {
          apiNotSupported: START_EDIT_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: START_EDIT_CONNECTION_FAILED_MESSAGE,
          notFound: START_EDIT_NOT_FOUND_MESSAGE,
        }),
      );
      return;
    }

    deps.setEditSession(canonicalPath, {
      ...bootstrapResult.value,
      enteredAt: new Date().toISOString(),
      dirty: false,
    });
    deps.invalidateReadFileCache(canonicalPath);
  };
}

export function createEndEditCommand(deps: CommandDeps) {
  return async function endEdit(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (
      !targetUri ||
      targetUri.scheme !== "growi" ||
      targetUri.path.endsWith("/")
    ) {
      deps.showErrorMessage(END_EDIT_INVALID_TARGET_MESSAGE);
      return;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(END_EDIT_INVALID_TARGET_MESSAGE);
      return;
    }

    const editSession = deps.getEditSession(canonicalPath);
    if (!editSession) {
      return;
    }

    if (!editSession.dirty) {
      deps.closeEditSession(canonicalPath);
      return;
    }

    const action = await deps.showEndEditDiscardConfirmation();
    if (action === "cancel") {
      return;
    }

    if (action === "saveAndReturn") {
      await deps.saveDocument(targetUri);
      return;
    }

    deps.closeEditSession(canonicalPath);
    await deps.openUri(`growi:${targetUri.path}`);
  };
}

export function createRefreshListingCommand(deps: CommandDeps) {
  return async function refreshListing(
    target?:
      | UriLike
      | {
          uri?: UriLike;
        },
  ): Promise<void> {
    const commandUri = resolveCommandUri(target);
    const targetUri = commandUri ?? deps.getActiveEditorUri();
    const canonicalDirectoryPath = commandUri
      ? resolveDirectoryCanonicalPathFromDirectoryUri(commandUri)
      : resolveParentDirectoryCanonicalPathFromPageUri(targetUri);
    if (!canonicalDirectoryPath) {
      deps.showErrorMessage(REFRESH_LISTING_INVALID_TARGET_MESSAGE);
      return;
    }

    deps.invalidateReadDirectoryCache(canonicalDirectoryPath);
    const directoryUri = commandUri
      ? `growi:${commandUri.path}`
      : `growi:${canonicalDirectoryPath === "/" ? "/" : `${canonicalDirectoryPath}/`}`;
    try {
      await deps.readDirectory(directoryUri);
      deps.refreshPrefixTree();
    } catch (error) {
      deps.showErrorMessage(mapRefreshListingErrorMessage(error));
    }
  };
}

export function createShowCurrentPageInfoCommand(deps: CommandDeps) {
  return async function showCurrentPageInfo(uri?: UriLike): Promise<void> {
    const canonicalPath = resolveCurrentPageCanonicalPath(
      uri ?? deps.getActiveEditorUri(),
    );
    if (!canonicalPath) {
      deps.showErrorMessage(SHOW_CURRENT_PAGE_INFO_INVALID_TARGET_MESSAGE);
      return;
    }

    const info = deps.getCurrentPageInfo(canonicalPath);
    if (!info) {
      deps.showErrorMessage(SHOW_CURRENT_PAGE_INFO_UNAVAILABLE_MESSAGE);
      return;
    }

    deps.showInformationMessage(
      [
        `URL: ${info.url}`,
        `Path: ${info.path}`,
        `Last Updated By: ${info.lastUpdatedBy}`,
        `Last Updated At: ${info.lastUpdatedAt}`,
      ].join("\n"),
    );
  };
}

function mapRevisionSummaryToQuickPickItem(
  revision: GrowiRevisionSummary,
): RevisionQuickPickItem {
  return {
    label: revision.createdAt,
    description: revision.author,
    detail: revision.revisionId,
    revisionId: revision.revisionId,
    createdAt: revision.createdAt,
    author: revision.author,
  };
}

function mapShowRevisionHistoryDiffReadFailureToMessage(
  result: Extract<GrowiRevisionReadResult, { ok: false }>,
): string {
  return mapReadFailureReasonToMessage(result.reason, {
    baseUrlNotConfigured: GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
    apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
    invalidApiToken: GENERIC_INVALID_API_TOKEN_MESSAGE,
    permissionDenied: GENERIC_PERMISSION_DENIED_MESSAGE,
    apiNotSupported: SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE,
    notFound: SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE,
  });
}

export function createShowRevisionHistoryDiffCommand(deps: CommandDeps) {
  return async function showRevisionHistoryDiff(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (!targetUri) {
      deps.showErrorMessage(SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE);
      return;
    }
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE);
      return;
    }
    const currentPageUri = targetUri;

    const pageInfo = deps.getCurrentPageInfo(canonicalPath);
    if (!pageInfo) {
      deps.showErrorMessage(SHOW_REVISION_HISTORY_DIFF_UNAVAILABLE_MESSAGE);
      return;
    }

    const revisions = await deps.listRevisions(pageInfo.pageId);
    if (!revisions.ok) {
      deps.showErrorMessage(
        mapAccessFailureReasonToMessage(revisions.reason, {
          baseUrlNotConfigured: GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
          apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
          invalidApiToken: GENERIC_INVALID_API_TOKEN_MESSAGE,
          permissionDenied: GENERIC_PERMISSION_DENIED_MESSAGE,
          apiNotSupported:
            SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed:
            SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE,
        }),
      );
      return;
    }
    if (revisions.revisions.length < 2) {
      deps.showInformationMessage(
        SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE,
      );
      return;
    }

    const revisionCandidates = revisions.revisions
      .slice(1)
      .map(mapRevisionSummaryToQuickPickItem);
    if (revisionCandidates.length === 0) {
      deps.showInformationMessage(
        SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE,
      );
      return;
    }

    const selectedRevision = (await deps.showQuickPick(revisionCandidates, {
      placeHolder: SHOW_REVISION_HISTORY_DIFF_REVISION_PLACEHOLDER,
    })) as RevisionQuickPickItem | undefined;
    if (!selectedRevision) {
      return;
    }

    const revisionBody = await deps.readRevision(
      pageInfo.pageId,
      selectedRevision.revisionId,
    );
    if (!revisionBody.ok) {
      deps.showErrorMessage(
        mapShowRevisionHistoryDiffReadFailureToMessage(revisionBody),
      );
      return;
    }

    const revisionUri = buildGrowiRevisionUri({
      pageId: pageInfo.pageId,
      revisionId: selectedRevision.revisionId,
      canonicalPath,
    });

    deps.seedRevisionContent(revisionUri, revisionBody.body);

    try {
      await deps.openDiff(
        {
          scheme: currentPageUri.scheme,
          path: currentPageUri.path,
        },
        {
          scheme: revisionUri.scheme,
          path: revisionUri.path,
        },
        `GROWI Revision Diff: ${canonicalPath} (current <-> ${selectedRevision.revisionId})`,
      );
    } catch {
      deps.showErrorMessage(
        SHOW_REVISION_HISTORY_DIFF_OPEN_DIFF_FAILED_MESSAGE,
      );
    }
  };
}

export function createShowCurrentPageActionsCommand(
  deps: CurrentPageActionsCommandDeps,
) {
  return async function showCurrentPageActions(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath || !targetUri) {
      deps.showErrorMessage(SHOW_CURRENT_PAGE_ACTIONS_INVALID_TARGET_MESSAGE);
      return;
    }

    const selected = (await deps.showQuickPick(
      [
        {
          label: "ページを更新",
          command: GROWI_COMMANDS.refreshCurrentPage,
        },
        {
          label: "ページ名を変更",
          command: GROWI_COMMANDS.renamePage,
        },
        {
          label: "ページを削除",
          command: GROWI_COMMANDS.deletePage,
        },
        {
          label: "被リンクを表示",
          command: GROWI_COMMANDS.showBacklinks,
        },
        {
          label: "ページ情報を表示",
          command: GROWI_COMMANDS.showCurrentPageInfo,
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
      ] as readonly CurrentPageActionQuickPickItem[],
      {
        placeHolder: SHOW_CURRENT_PAGE_ACTIONS_PLACEHOLDER,
      },
    )) as CurrentPageActionQuickPickItem | undefined;

    if (!selected) {
      return;
    }

    await deps.executeCommand(selected.command, targetUri);
  };
}

export function createShowLocalRoundTripActionsCommand(
  deps: CurrentPageActionsCommandDeps,
) {
  return async function showLocalMirrorActions(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath || !targetUri) {
      deps.showErrorMessage(
        SHOW_LOCAL_ROUND_TRIP_ACTIONS_INVALID_TARGET_MESSAGE,
      );
      return;
    }

    const selected = (await deps.showQuickPick(
      [
        {
          label: "現在ページのローカルミラーを同期",
          description: SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION,
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
        },
        {
          label: "ローカルミラーを比較",
          description: COMPARE_LOCAL_MIRROR_DESCRIPTION,
          command: GROWI_COMMANDS.compareLocalMirrorWithGrowi,
        },
        {
          label: "ローカルミラーを反映",
          description: UPLOAD_LOCAL_MIRROR_DESCRIPTION,
          command: GROWI_COMMANDS.uploadLocalMirrorToGrowi,
        },
      ] as readonly CurrentPageActionQuickPickItem[],
      {
        placeHolder: SHOW_LOCAL_ROUND_TRIP_ACTIONS_PLACEHOLDER,
      },
    )) as CurrentPageActionQuickPickItem | undefined;

    if (!selected) {
      return;
    }

    await deps.executeCommand(selected.command, targetUri);
  };
}

async function exportMirror(
  deps: CommandDeps,
  input: {
    rootCanonicalPath: string;
    mode: "page" | "prefix";
    successMessage: string;
    writeFailedMessage: string;
  },
): Promise<MirrorManifest | undefined> {
  const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
  if (!localWorkspaceRoot) {
    deps.showErrorMessage(
      input.mode === "page"
        ? DOWNLOAD_CURRENT_PAGE_NO_LOCAL_WORKSPACE_MESSAGE
        : DOWNLOAD_CURRENT_PAGE_SET_NO_LOCAL_WORKSPACE_MESSAGE,
    );
    return undefined;
  }

  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
    return undefined;
  }

  if (input.mode === "page") {
    const reused = await exportPageIntoExistingPrefixMirror(deps, {
      workspaceRoot: localWorkspaceRoot,
      baseUrl,
      canonicalPath: input.rootCanonicalPath,
      writeFailedMessage: input.writeFailedMessage,
    });
    if (reused.handled) {
      return reused.manifest;
    }
  } else {
    const reused = await exportPrefixIntoExistingPrefixMirror(deps, {
      workspaceRoot: localWorkspaceRoot,
      baseUrl,
      canonicalPath: input.rootCanonicalPath,
      writeFailedMessage: input.writeFailedMessage,
    });
    if (reused.handled) {
      return reused.manifest;
    }
  }

  let pagePaths: string[];
  if (input.mode === "page") {
    pagePaths = [input.rootCanonicalPath];
  } else {
    const listedPages = await deps.listPages(input.rootCanonicalPath);
    if (!listedPages.ok) {
      deps.showErrorMessage(mapBundleListFailureToMessage(listedPages));
      return undefined;
    }
    pagePaths = dedupeAndSortCanonicalPaths([
      input.rootCanonicalPath,
      ...listedPages.paths,
    ]);
    if (pagePaths.length > CURRENT_PAGE_SET_MAX_PAGES) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_TOO_MANY_PAGES_MESSAGE);
      return undefined;
    }
  }

  const exportedAt = new Date().toISOString();
  const pages: MirrorManifestPage[] = [];
  let previousManifest: MirrorManifest | undefined;
  let previousManifestInstanceKey: string | undefined;

  try {
    for (const { instanceKey, manifestPath } of listMirrorManifestCandidates(
      localWorkspaceRoot,
      baseUrl,
      input.rootCanonicalPath,
    )) {
      const rawPreviousManifest = await deps.readLocalFile(manifestPath);
      const parsedPreviousManifest = parseMirrorManifest(rawPreviousManifest);
      if (parsedPreviousManifest.ok) {
        previousManifest = parsedPreviousManifest.value;
        previousManifestInstanceKey = instanceKey;
        break;
      }
    }
  } catch {
    // Treat missing or unreadable previous manifests as a fresh export.
  }

  const plannedPages = planMirrorRelativeFilePaths(
    input.rootCanonicalPath,
    pagePaths,
  );

  try {
    for (const plannedPage of plannedPages.pages) {
      const pagePath = plannedPage.canonicalPath;
      const snapshot = await deps.bootstrapEditSession(pagePath);
      if (!snapshot.ok) {
        deps.showErrorMessage(
          input.mode === "page"
            ? mapSnapshotFailureToMessage(snapshot, {
                apiNotSupported:
                  DOWNLOAD_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE,
                connectionFailed:
                  DOWNLOAD_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE,
                notFound: DOWNLOAD_CURRENT_PAGE_NOT_FOUND_MESSAGE,
              })
            : mapBundleSnapshotFailureToMessage(snapshot),
        );
        return undefined;
      }

      await deps.writeLocalFile(
        buildMirrorLocalFilePath(
          localWorkspaceRoot,
          baseUrl,
          input.rootCanonicalPath,
          plannedPage.relativeFilePath,
        ),
        snapshot.value.baseBody,
      );
      pages.push({
        canonicalPath: pagePath,
        relativeFilePath: plannedPage.relativeFilePath,
        pageId: snapshot.value.pageId,
        baseRevisionId: snapshot.value.baseRevisionId,
        exportedAt,
        contentHash: hashBody(snapshot.value.baseBody),
      });
    }

    const currentTrackedPaths = new Set(
      [
        ...pages.map((page) => page.relativeFilePath),
        ...plannedPages.skippedPages.map((page) => page.relativeFilePath),
      ].map((relativeFilePath) =>
        buildMirrorLocalFilePath(
          localWorkspaceRoot,
          baseUrl,
          input.rootCanonicalPath,
          relativeFilePath,
        ),
      ),
    );
    const previousTrackedPaths = new Set(
      [
        ...(previousManifest?.pages ?? []).map((page) => page.relativeFilePath),
        ...(previousManifest?.skippedPages ?? []).map(
          (page) => page.relativeFilePath,
        ),
      ].map((relativeFilePath) =>
        buildMirrorLocalFilePath(
          localWorkspaceRoot,
          baseUrl,
          input.rootCanonicalPath,
          relativeFilePath,
        ),
      ),
    );
    for (const stalePath of previousTrackedPaths) {
      if (currentTrackedPaths.has(stalePath)) {
        continue;
      }
      await deps.deleteLocalPath(stalePath);
    }

    const manifest: MirrorManifest = {
      version: 1,
      baseUrl,
      rootCanonicalPath: input.rootCanonicalPath,
      mode: input.mode,
      exportedAt,
      pages,
      ...(plannedPages.skippedPages.length > 0
        ? { skippedPages: plannedPages.skippedPages }
        : {}),
    };
    const preferredManifestPath = buildMirrorManifestFilePath(
      localWorkspaceRoot,
      baseUrl,
      input.rootCanonicalPath,
    );
    await deps.writeLocalFile(
      preferredManifestPath,
      serializeMirrorManifest(manifest),
    );
    if (
      previousManifest &&
      previousManifestInstanceKey &&
      previousManifestInstanceKey !== buildPreferredMirrorInstanceKey(baseUrl)
    ) {
      await migrateMirrorRootIfNeeded(deps, {
        workspaceRoot: localWorkspaceRoot,
        baseUrl,
        rootCanonicalPath: input.rootCanonicalPath,
        sourceInstanceKey: previousManifestInstanceKey,
        manifest,
      });
    }
    await deps.openLocalFile(
      buildMirrorLocalFilePath(
        localWorkspaceRoot,
        baseUrl,
        input.rootCanonicalPath,
        pages[0]?.relativeFilePath ??
          plannedPages.pages[0]?.relativeFilePath ??
          plannedPages.skippedPages[0]?.relativeFilePath ??
          "__root__.md",
      ),
    );
    if (plannedPages.skippedPages.length > 0) {
      deps.showWarningMessage(
        [
          input.successMessage,
          formatSkippedMirrorPagesSummary(plannedPages.skippedPages),
        ].join("\n"),
      );
    } else {
      deps.showInformationMessage(input.successMessage);
    }
    return manifest;
  } catch {
    deps.showErrorMessage(input.writeFailedMessage);
    return undefined;
  }
}

async function loadMirrorManifest(
  deps: CommandDeps,
  input: {
    requestedCanonicalPath: string;
    requestedScope: MirrorRequestScope;
    allowAncestorReuse?: boolean;
    noWorkspaceMessage: string;
    readManifestFailedMessage: string;
    invalidManifestMessage: string;
    invalidBaseUrlMessage: string;
    baseUrlMismatchMessage: string;
    mirrorNotFoundMessage: string;
    reusedPrefixSkippedMessage: string;
  },
): Promise<LoadedMirrorSelection | undefined> {
  const workspaceRoot = deps.getLocalWorkspaceRoot();
  if (!workspaceRoot) {
    deps.showErrorMessage(input.noWorkspaceMessage);
    return undefined;
  }

  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    deps.showErrorMessage(input.invalidBaseUrlMessage);
    return undefined;
  }

  for (const {
    instanceKey,
    manifestPath: exactManifestPath,
  } of listMirrorManifestCandidates(
    workspaceRoot,
    baseUrl,
    input.requestedCanonicalPath,
  )) {
    let rawManifest: string | undefined;
    try {
      rawManifest = await deps.readLocalFile(exactManifestPath);
    } catch {
      rawManifest = undefined;
    }

    if (rawManifest === undefined) {
      continue;
    }
    const parsedManifest = parseMirrorManifest(rawManifest);
    if (!parsedManifest.ok) {
      deps.showErrorMessage(input.invalidManifestMessage);
      return undefined;
    }
    if (parsedManifest.value.baseUrl !== baseUrl) {
      deps.showErrorMessage(input.baseUrlMismatchMessage);
      return undefined;
    }

    return {
      workspaceRoot,
      baseUrl,
      manifestPath: exactManifestPath,
      manifest: parsedManifest.value,
      instanceKey,
      requestedCanonicalPath: input.requestedCanonicalPath,
      requestedScope: input.requestedScope,
      effectiveRootCanonicalPath: parsedManifest.value.rootCanonicalPath,
      selectedPages: parsedManifest.value.pages,
      reusedAncestorPrefix: false,
    };
  }

  if (!input.allowAncestorReuse) {
    deps.showErrorMessage(input.readManifestFailedMessage);
    return undefined;
  }

  for (const ancestorPath of listAncestorCanonicalPaths(
    input.requestedCanonicalPath,
  )) {
    for (const { instanceKey, manifestPath } of listMirrorManifestCandidates(
      workspaceRoot,
      baseUrl,
      ancestorPath,
    )) {
      let ancestorRawManifest: string;
      try {
        ancestorRawManifest = await deps.readLocalFile(manifestPath);
      } catch {
        continue;
      }

      const parsedManifest = parseMirrorManifest(ancestorRawManifest);
      if (!parsedManifest.ok) {
        deps.showErrorMessage(input.invalidManifestMessage);
        return undefined;
      }
      if (parsedManifest.value.baseUrl !== baseUrl) {
        deps.showErrorMessage(input.baseUrlMismatchMessage);
        return undefined;
      }
      if (parsedManifest.value.mode !== "prefix") {
        continue;
      }

      const selectedPages = parsedManifest.value.pages.filter((page) =>
        input.requestedScope === "page"
          ? page.canonicalPath === input.requestedCanonicalPath
          : isWithinCanonicalSubtree(
              page.canonicalPath,
              input.requestedCanonicalPath,
            ),
      );
      if (selectedPages.length > 0) {
        return {
          workspaceRoot,
          baseUrl,
          manifestPath,
          manifest: parsedManifest.value,
          instanceKey,
          requestedCanonicalPath: input.requestedCanonicalPath,
          requestedScope: input.requestedScope,
          effectiveRootCanonicalPath: parsedManifest.value.rootCanonicalPath,
          selectedPages,
          reusedAncestorPrefix: true,
        };
      }

      const skippedPages = (parsedManifest.value.skippedPages ?? []).filter(
        (page) =>
          input.requestedScope === "page"
            ? page.canonicalPath === input.requestedCanonicalPath
            : isWithinCanonicalSubtree(
                page.canonicalPath,
                input.requestedCanonicalPath,
              ),
      );
      if (skippedPages.length > 0) {
        deps.showErrorMessage(input.reusedPrefixSkippedMessage);
        return undefined;
      }
    }
  }

  deps.showErrorMessage(input.mirrorNotFoundMessage);
  return undefined;
}

async function compareMirror(
  deps: CommandDeps,
  target?: MirrorCommandTarget,
): Promise<BundleCompareResult[] | undefined> {
  const targetUri = resolveMirrorTargetUri(target) ?? deps.getActiveEditorUri();
  const requestedCanonicalPath = resolveCurrentPageCanonicalPath(targetUri);
  if (!requestedCanonicalPath) {
    deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE);
    return undefined;
  }

  const requestedScope = resolveMirrorRequestScope(target);
  const loaded = await loadMirrorManifest(deps, {
    requestedCanonicalPath,
    requestedScope,
    allowAncestorReuse: true,
    noWorkspaceMessage: COMPARE_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE,
    readManifestFailedMessage:
      COMPARE_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE,
    invalidManifestMessage: COMPARE_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE,
    invalidBaseUrlMessage: COMPARE_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE,
    baseUrlMismatchMessage: COMPARE_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE,
    mirrorNotFoundMessage: COMPARE_LOCAL_BUNDLE_MIRROR_NOT_FOUND_MESSAGE,
    reusedPrefixSkippedMessage:
      COMPARE_LOCAL_BUNDLE_REUSED_PREFIX_SKIPPED_MESSAGE,
  });
  if (!loaded) {
    return undefined;
  }

  const results: BundleCompareResult[] = [];
  const skippedDiffResults: BundleCompareResult[] = [];
  const diffResources: ChangesResourceTuple[] = [];
  for (const page of loaded.selectedPages) {
    const _localFilePath = buildMirrorLocalFilePath(
      loaded.workspaceRoot,
      loaded.baseUrl,
      loaded.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );
    const sourceLocalFilePath = buildMirrorLocalFilePathWithInstanceKey(
      loaded.workspaceRoot,
      loaded.instanceKey,
      loaded.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );

    let localBody: string;
    try {
      localBody = await deps.readLocalFile(sourceLocalFilePath);
    } catch {
      results.push({
        canonicalPath: page.canonicalPath,
        status: "MissingLocal",
      });
      continue;
    }

    const localChanged = hashBody(localBody) !== page.contentHash;
    const currentSnapshot = await deps.bootstrapEditSession(page.canonicalPath);
    if (!currentSnapshot.ok) {
      if (currentSnapshot.reason === "NotFound") {
        results.push({
          canonicalPath: page.canonicalPath,
          status: "MissingRemote",
        });
        continue;
      }
      deps.showErrorMessage(
        mapSnapshotFailureToMessage(currentSnapshot, {
          apiNotSupported: DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
          notFound: DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE,
        }),
      );
      return undefined;
    }

    const remoteChanged =
      currentSnapshot.value.pageId !== page.pageId ||
      currentSnapshot.value.baseRevisionId !== page.baseRevisionId;
    const result: BundleCompareResult = {
      canonicalPath: page.canonicalPath,
      status: localChanged
        ? remoteChanged
          ? "Conflict"
          : "LocalChanged"
        : remoteChanged
          ? "RemoteChanged"
          : "Unchanged",
    };
    results.push(result);

    if (
      result.status === "LocalChanged" ||
      result.status === "RemoteChanged" ||
      result.status === "Conflict"
    ) {
      const localFileUri = {
        scheme: "file",
        path: sourceLocalFilePath,
        fsPath: sourceLocalFilePath,
      } as const;
      diffResources.push([
        localFileUri,
        { scheme: "growi", path: `${page.canonicalPath}.md` },
        localFileUri,
      ]);
    }
  }

  for (const result of results) {
    if (result.status === "MissingLocal" || result.status === "MissingRemote") {
      skippedDiffResults.push(result);
    }
  }

  if (diffResources.length === 0) {
    if (skippedDiffResults.length > 0) {
      deps.showWarningMessage(
        [
          COMPARE_LOCAL_BUNDLE_NO_DIFF_MESSAGE,
          formatBundleCompareSkippedSummary(skippedDiffResults),
        ].join("\n"),
      );
    } else {
      deps.showInformationMessage(COMPARE_LOCAL_BUNDLE_NO_DIFF_MESSAGE);
    }
    return results;
  }

  try {
    await openChangesEditor(deps, buildMirrorDiffTitle(loaded), diffResources);
  } catch {
    deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_OPEN_DIFF_FAILED_MESSAGE);
    return undefined;
  }

  if (skippedDiffResults.length > 0) {
    deps.showWarningMessage(
      formatBundleCompareSkippedSummary(skippedDiffResults),
    );
  }
  return results;
}

async function uploadMirror(
  deps: CommandDeps,
  target?: MirrorCommandTarget,
): Promise<BundleUploadResult[] | undefined> {
  const targetUri = resolveMirrorTargetUri(target) ?? deps.getActiveEditorUri();
  const requestedCanonicalPath = resolveCurrentPageCanonicalPath(targetUri);
  if (!requestedCanonicalPath) {
    deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE);
    return undefined;
  }

  const requestedScope = resolveMirrorRequestScope(target);
  const loaded = await loadMirrorManifest(deps, {
    requestedCanonicalPath,
    requestedScope,
    allowAncestorReuse: true,
    noWorkspaceMessage: UPLOAD_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE,
    readManifestFailedMessage: UPLOAD_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE,
    invalidManifestMessage: UPLOAD_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE,
    invalidBaseUrlMessage: UPLOAD_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE,
    baseUrlMismatchMessage: UPLOAD_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE,
    mirrorNotFoundMessage: UPLOAD_LOCAL_BUNDLE_MIRROR_NOT_FOUND_MESSAGE,
    reusedPrefixSkippedMessage:
      UPLOAD_LOCAL_BUNDLE_REUSED_PREFIX_SKIPPED_MESSAGE,
  });
  if (!loaded) {
    return undefined;
  }

  const results: BundleUploadResult[] = [];
  const postUploadWarnings: string[] = [];
  let manifestRefreshFailed = false;
  let manifestChanged = false;
  const updatedPages = loaded.manifest.pages.map((page) => ({ ...page }));
  const selectedCanonicalPaths = new Set(
    loaded.selectedPages.map((page) => page.canonicalPath),
  );

  for (const page of updatedPages) {
    if (!selectedCanonicalPaths.has(page.canonicalPath)) {
      continue;
    }
    const _localFilePath = buildMirrorLocalFilePath(
      loaded.workspaceRoot,
      loaded.baseUrl,
      loaded.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );
    const sourceLocalFilePath = buildMirrorLocalFilePathWithInstanceKey(
      loaded.workspaceRoot,
      loaded.instanceKey,
      loaded.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );

    let localBody: string;
    try {
      localBody = await deps.readLocalFile(sourceLocalFilePath);
    } catch {
      results.push({
        canonicalPath: page.canonicalPath,
        status: "MissingLocal",
      });
      continue;
    }

    if (hashBody(localBody) === page.contentHash) {
      results.push({ canonicalPath: page.canonicalPath, status: "Unchanged" });
      continue;
    }

    const currentSnapshot = await deps.bootstrapEditSession(page.canonicalPath);
    if (!currentSnapshot.ok) {
      if (currentSnapshot.reason === "NotFound") {
        results.push({
          canonicalPath: page.canonicalPath,
          status: "MissingRemote",
        });
        continue;
      }
      deps.showErrorMessage(
        mapSnapshotFailureToMessage(currentSnapshot, {
          apiNotSupported: UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed:
            UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE,
          notFound: UPLOAD_EXPORTED_LOCAL_FILE_NOT_FOUND_MESSAGE,
        }),
      );
      return undefined;
    }

    if (
      currentSnapshot.value.pageId !== page.pageId ||
      currentSnapshot.value.baseRevisionId !== page.baseRevisionId
    ) {
      results.push({ canonicalPath: page.canonicalPath, status: "Conflict" });
      continue;
    }

    const writeResult = await deps.writePage(page.canonicalPath, localBody, {
      pageId: page.pageId,
      baseRevisionId: page.baseRevisionId,
      baseUpdatedAt: currentSnapshot.value.baseUpdatedAt,
      baseBody: currentSnapshot.value.baseBody,
      enteredAt: page.exportedAt,
      dirty: false,
    });
    if (!writeResult.ok) {
      deps.showErrorMessage(mapUploadWriteFailureToMessage(writeResult));
      return undefined;
    }

    deps.invalidateReadFileCache(page.canonicalPath);
    manifestChanged = true;
    results.push({ canonicalPath: page.canonicalPath, status: "Uploaded" });

    const refreshedSnapshot = await deps.bootstrapEditSession(
      page.canonicalPath,
    );
    if (!refreshedSnapshot.ok) {
      manifestRefreshFailed = true;
    } else {
      page.pageId = refreshedSnapshot.value.pageId;
      page.baseRevisionId = refreshedSnapshot.value.baseRevisionId;
      page.exportedAt = new Date().toISOString();
      page.contentHash = hashBody(localBody);
    }

    const reopenResult = await deps.refreshOpenGrowiPage(page.canonicalPath);
    if (reopenResult === "dirty") {
      postUploadWarnings.push(
        `${page.canonicalPath}: ${UPLOAD_EXPORTED_LOCAL_FILE_DIRTY_GROWI_REOPEN_WARNING_MESSAGE}`,
      );
    }
    if (reopenResult === "failed") {
      postUploadWarnings.push(
        `${page.canonicalPath}: ${UPLOAD_EXPORTED_LOCAL_FILE_REOPEN_FAILED_WARNING_MESSAGE}`,
      );
    }
  }

  if (manifestChanged) {
    try {
      const targetManifestPath = await migrateMirrorRootIfNeeded(deps, {
        workspaceRoot: loaded.workspaceRoot,
        baseUrl: loaded.baseUrl,
        rootCanonicalPath: loaded.manifest.rootCanonicalPath,
        sourceInstanceKey: loaded.instanceKey,
        manifest: {
          ...loaded.manifest,
          exportedAt: new Date().toISOString(),
          pages: updatedPages,
        },
      });
      await deps.writeLocalFile(
        targetManifestPath,
        serializeMirrorManifest({
          ...loaded.manifest,
          exportedAt: new Date().toISOString(),
          pages: updatedPages,
        }),
      );
    } catch {
      manifestRefreshFailed = true;
    }
  }

  if (manifestRefreshFailed) {
    postUploadWarnings.unshift(
      UPLOAD_LOCAL_BUNDLE_METADATA_REFRESH_WARNING_MESSAGE,
    );
  }

  const summary = formatBundleUploadSummary(results);
  if (postUploadWarnings.length > 0) {
    deps.showWarningMessage([summary, ...postUploadWarnings].join("\n"));
    return results;
  }

  deps.showInformationMessage(summary);
  return results;
}

export function createDownloadCurrentPageToLocalFileCommand(deps: CommandDeps) {
  return async function downloadCurrentPageToLocalFile(
    uri?: UriLike,
  ): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (!isPageUri(targetUri)) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_INVALID_TARGET_MESSAGE);
      return;
    }

    const editSession = deps.getEditSession(canonicalPath);
    if (editSession?.dirty) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE);
      return;
    }

    await exportMirror(deps, {
      rootCanonicalPath: canonicalPath,
      mode: "page",
      successMessage: DOWNLOAD_CURRENT_PAGE_SUCCESS_MESSAGE,
      writeFailedMessage: DOWNLOAD_CURRENT_PAGE_WRITE_LOCAL_FILE_FAILED_MESSAGE,
    });
  };
}

export function createCompareLocalWorkFileWithCurrentPageCommand(
  deps: CommandDeps,
) {
  return async function compareLocalWorkFileWithCurrentPage(
    target?: MirrorCommandTarget,
  ): Promise<BundleCompareResult[] | undefined> {
    return await compareMirror(deps, target);
  };
}

export function createUploadExportedLocalFileToGrowiCommand(deps: CommandDeps) {
  return async function uploadExportedLocalFileToGrowi(
    target?: MirrorCommandTarget,
  ): Promise<BundleUploadResult[] | undefined> {
    return await uploadMirror(deps, target);
  };
}

export function createDownloadCurrentPageSetToLocalBundleCommand(
  deps: CommandDeps,
) {
  return async function downloadCurrentPageSetToLocalBundle(
    uri?: UriLike,
  ): Promise<MirrorManifest | undefined> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    if (!isPageUri(targetUri)) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_INVALID_TARGET_MESSAGE);
      return undefined;
    }

    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_INVALID_TARGET_MESSAGE);
      return undefined;
    }

    const editSession = deps.getEditSession(canonicalPath);
    if (editSession?.dirty) {
      deps.showErrorMessage(
        DOWNLOAD_CURRENT_PAGE_SET_DIRTY_EDIT_SESSION_MESSAGE,
      );
      return undefined;
    }

    return await exportMirror(deps, {
      rootCanonicalPath: canonicalPath,
      mode: "prefix",
      successMessage: DOWNLOAD_CURRENT_PAGE_SET_SUCCESS_MESSAGE,
      writeFailedMessage: DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE,
    });
  };
}

export function createRefreshLocalMirrorCommand(deps: CommandDeps) {
  return async function refreshLocalMirror(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    const rootCanonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!rootCanonicalPath) {
      deps.showErrorMessage(REFRESH_LOCAL_MIRROR_INVALID_TARGET_MESSAGE);
      return;
    }

    const loaded = await loadMirrorManifest(deps, {
      requestedCanonicalPath: rootCanonicalPath,
      requestedScope: "page",
      allowAncestorReuse: false,
      noWorkspaceMessage: REFRESH_LOCAL_MIRROR_NO_LOCAL_WORKSPACE_MESSAGE,
      readManifestFailedMessage:
        REFRESH_LOCAL_MIRROR_READ_MANIFEST_FAILED_MESSAGE,
      invalidManifestMessage: REFRESH_LOCAL_MIRROR_INVALID_MANIFEST_MESSAGE,
      invalidBaseUrlMessage: COMPARE_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE,
      baseUrlMismatchMessage: REFRESH_LOCAL_MIRROR_BASE_URL_MISMATCH_MESSAGE,
      mirrorNotFoundMessage: REFRESH_LOCAL_MIRROR_READ_MANIFEST_FAILED_MESSAGE,
      reusedPrefixSkippedMessage:
        REFRESH_LOCAL_MIRROR_READ_MANIFEST_FAILED_MESSAGE,
    });
    if (!loaded) {
      return;
    }

    const compareResults = await compareMirror(deps, targetUri);
    if (!compareResults) {
      return;
    }
    if (
      compareResults.some(
        (result) =>
          result.status === "LocalChanged" ||
          result.status === "Conflict" ||
          result.status === "MissingLocal",
      )
    ) {
      deps.showErrorMessage(REFRESH_LOCAL_MIRROR_LOCAL_CHANGES_MESSAGE);
      return;
    }

    const exported = await exportMirror(deps, {
      rootCanonicalPath: loaded.manifest.rootCanonicalPath,
      mode: loaded.manifest.mode,
      successMessage: REFRESH_LOCAL_MIRROR_SUCCESS_MESSAGE,
      writeFailedMessage:
        loaded.manifest.mode === "page"
          ? DOWNLOAD_CURRENT_PAGE_WRITE_LOCAL_FILE_FAILED_MESSAGE
          : DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE,
    });
    if (!exported) {
      return;
    }
  };
}

export function createCompareLocalBundleWithGrowiCommand(deps: CommandDeps) {
  return async function compareLocalBundleWithGrowi(
    target?: MirrorCommandTarget,
  ): Promise<BundleCompareResult[] | undefined> {
    return await compareMirror(
      deps,
      typeof target === "object" &&
        target !== null &&
        "scope" in target &&
        target.scope !== undefined
        ? target
        : {
            uri: (typeof target === "object" &&
            target !== null &&
            "uri" in target
              ? target.uri
              : target) as UriLike | undefined,
            scope: "subtree",
          },
    );
  };
}

export function createUploadLocalBundleToGrowiCommand(deps: CommandDeps) {
  return async function uploadLocalBundleToGrowi(
    target?: MirrorCommandTarget,
  ): Promise<BundleUploadResult[] | undefined> {
    return await uploadMirror(
      deps,
      typeof target === "object" &&
        target !== null &&
        "scope" in target &&
        target.scope !== undefined
        ? target
        : {
            uri: (typeof target === "object" &&
            target !== null &&
            "uri" in target
              ? target.uri
              : target) as UriLike | undefined,
            scope: "subtree",
          },
    );
  };
}

function mapBacklinksPlaceholder(input: {
  truncatedByLimit: boolean;
  timedOut: boolean;
}): string {
  if (input.truncatedByLimit && input.timedOut) {
    return SHOW_BACKLINKS_PLACEHOLDER_LIMIT_AND_TIMEOUT;
  }
  if (input.truncatedByLimit) {
    return SHOW_BACKLINKS_PLACEHOLDER_LIMIT;
  }
  if (input.timedOut) {
    return SHOW_BACKLINKS_PLACEHOLDER_TIMEOUT;
  }
  return SHOW_BACKLINKS_PLACEHOLDER_NORMAL;
}

export function createShowBacklinksCommand(deps: CommandDeps) {
  return async function showBacklinks(uri?: UriLike): Promise<void> {
    const targetUri = uri ?? deps.getActiveEditorUri();
    const targetCanonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!targetCanonicalPath) {
      deps.showErrorMessage(SHOW_BACKLINKS_INVALID_TARGET_MESSAGE);
      return;
    }

    const prefixes = deps.getRegisteredPrefixes();
    if (prefixes.length === 0) {
      deps.showErrorMessage(SHOW_BACKLINKS_NO_PREFIX_MESSAGE);
      return;
    }

    const result = await findBacklinks({
      targetCanonicalPath,
      targetPageId: deps.getCurrentPageInfo(targetCanonicalPath)?.pageId,
      baseUrl: deps.getBaseUrl(),
      prefixes,
      listPages: deps.listPages,
      readPageBody: deps.readPageBody,
      resolvePageReference: deps.resolvePageReference,
      timeoutMs: 5_000,
      limit: 100,
    });

    if (!result.ok) {
      if (result.reason === "BaseUrlNotConfigured") {
        deps.showErrorMessage(SHOW_BACKLINKS_BASE_URL_NOT_CONFIGURED_MESSAGE);
        return;
      }
      if (result.reason === "ApiTokenNotConfigured") {
        deps.showErrorMessage(SHOW_BACKLINKS_API_TOKEN_NOT_CONFIGURED_MESSAGE);
        return;
      }
      if (result.reason === "InvalidApiToken") {
        deps.showErrorMessage(SHOW_BACKLINKS_INVALID_API_TOKEN_MESSAGE);
        return;
      }
      if (result.reason === "PermissionDenied") {
        deps.showErrorMessage(SHOW_BACKLINKS_PERMISSION_DENIED_MESSAGE);
        return;
      }
      if (result.reason === "ListPagesApiNotSupported") {
        deps.showErrorMessage(SHOW_BACKLINKS_LIST_API_NOT_SUPPORTED_MESSAGE);
        return;
      }
      if (result.reason === "ReadPageApiNotSupported") {
        deps.showErrorMessage(SHOW_BACKLINKS_READ_API_NOT_SUPPORTED_MESSAGE);
        return;
      }
      if (result.reason === "ConnectionFailed") {
        deps.showErrorMessage(SHOW_BACKLINKS_CONNECTION_FAILED_MESSAGE);
        return;
      }

      deps.showErrorMessage(SHOW_BACKLINKS_UNEXPECTED_ERROR_MESSAGE);
      return;
    }

    if (result.backlinks.length === 0) {
      deps.showInformationMessage(SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE);
      return;
    }

    const selected = (await deps.showQuickPick(
      result.backlinks.map((canonicalPath) => ({
        label: canonicalPath,
        canonicalPath,
      })),
      {
        placeHolder: mapBacklinksPlaceholder(result),
      },
    )) as BacklinkQuickPickItem | undefined;

    if (!selected) {
      return;
    }

    await deps.openUri(`growi:${selected.canonicalPath}.md`);
  };
}

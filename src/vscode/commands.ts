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
import type { GrowiEditSession, GrowiPageWriteResult } from "./fsProvider";
import {
  buildLocalWorkFilePath,
  LOCAL_WORK_FILE_NAME,
  parseLocalRoundTripWorkFile,
  serializeLocalRoundTripWorkFile,
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
  clearPrefixes: "growi.clearPrefixes",
  openPage: "growi.openPage",
  openPrefixRootPage: "growi.openPrefixRootPage",
  openDirectoryPage: "growi.openDirectoryPage",
  explorerOpenPageItem: "growi.explorerOpenPageItem",
  explorerRefreshCurrentPage: "growi.explorerRefreshCurrentPage",
  explorerShowBacklinks: "growi.explorerShowBacklinks",
  explorerShowCurrentPageInfo: "growi.explorerShowCurrentPageInfo",
  explorerShowRevisionHistoryDiff: "growi.explorerShowRevisionHistoryDiff",
  explorerDownloadCurrentPageToLocalFile:
    "growi.explorerDownloadCurrentPageToLocalFile",
  explorerDownloadCurrentPageSetToLocalBundle:
    "growi.explorerDownloadCurrentPageSetToLocalBundle",
  explorerCompareLocalWorkFileWithCurrentPage:
    "growi.explorerCompareLocalWorkFileWithCurrentPage",
  explorerUploadExportedLocalFileToGrowi:
    "growi.explorerUploadExportedLocalFileToGrowi",
  explorerCompareLocalBundleWithGrowi:
    "growi.explorerCompareLocalBundleWithGrowi",
  explorerUploadLocalBundleToGrowi: "growi.explorerUploadLocalBundleToGrowi",
  startEdit: "growi.startEdit",
  endEdit: "growi.endEdit",
  showCurrentPageActions: "growi.showCurrentPageActions",
  showLocalRoundTripActions: "growi.showLocalRoundTripActions",
  refreshCurrentPage: "growi.refreshCurrentPage",
  refreshListing: "growi.refreshListing",
  downloadCurrentPageToLocalFile: "growi.downloadCurrentPageToLocalFile",
  compareLocalWorkFileWithCurrentPage:
    "growi.compareLocalWorkFileWithCurrentPage",
  uploadExportedLocalFileToGrowi: "growi.uploadExportedLocalFileToGrowi",
  downloadCurrentPageSetToLocalBundle:
    "growi.downloadCurrentPageSetToLocalBundle",
  compareLocalBundleWithGrowi: "growi.compareLocalBundleWithGrowi",
  uploadLocalBundleToGrowi: "growi.uploadLocalBundleToGrowi",
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
    | { ok: false; reason: "ApiNotSupported" | "ConnectionFailed" }
  >;
  listRevisions(pageId: string): Promise<GrowiRevisionListResult>;
  findOpenTextDocument(path: string): { isDirty: boolean } | undefined;
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
  resolvePageReference(reference: ParsedGrowiReference): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | {
        ok: false;
        reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
      }
  >;
  saveDocument(uri: UriLike): Promise<boolean>;
  readPageBody(canonicalPath: string): Promise<
    | { ok: true; body: string }
    | {
        ok: false;
        reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
      }
  >;
  readRevision(
    pageId: string,
    revisionId: string,
  ): Promise<GrowiRevisionReadResult>;
  readDirectory(uri: string): Promise<void>;
  refreshPrefixTree(): void;
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

interface GrowiCurrentSetManifestPage {
  canonicalPath: string;
  relativeFilePath: string;
  pageId: string;
  baseRevisionId: string;
  exportedAt: string;
  contentHash: string;
}

interface GrowiCurrentSetManifest {
  version: 1;
  kind: "growi-current-set";
  bundleName: "growi-current-set";
  baseUrl: string;
  rootCanonicalPath: string;
  exportedAt: string;
  pages: GrowiCurrentSetManifestPage[];
}

type ParsedGrowiCurrentSetManifest =
  | { ok: true; value: GrowiCurrentSetManifest }
  | { ok: false; reason: "InvalidJson" | "InvalidShape" };

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

interface BundleUploadResult {
  canonicalPath: string;
  status:
    | "Uploaded"
    | "Unchanged"
    | "Conflict"
    | "MissingRemote"
    | "MissingLocal";
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
  | { ok: false; reason: "ApiNotSupported" | "ConnectionFailed" | "NotFound" };

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
  "Download Current Page to Local Work File は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Download Current Page to Local Work File を実行できません。先に file: workspace を開いてください。";
const DOWNLOAD_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Download Current Page to Local Work File を実行できません。先に保存または End Edit を実行してください。";
const DOWNLOAD_CURRENT_PAGE_DIRTY_LOCAL_WORK_FILE_MESSAGE = `${LOCAL_WORK_FILE_NAME} に未保存の変更があるため Download Current Page to Local Work File を実行できません。先に保存、Upload Local Work File to GROWI、または退避してください。`;
const DOWNLOAD_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため Download Current Page to Local Work File を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Download Current Page to Local Work File を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Download Current Page to Local Work File を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_WRITE_LOCAL_FILE_FAILED_MESSAGE =
  "ローカル作業ファイルへの保存に失敗したため Download Current Page to Local Work File を完了できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SUCCESS_MESSAGE = `現在ページを ${LOCAL_WORK_FILE_NAME} へ保存しました。`;
const CURRENT_PAGE_SET_BUNDLE_NAME = "growi-current-set";
const CURRENT_PAGE_SET_MANIFEST_FILE_NAME = "manifest.json";
const CURRENT_PAGE_SET_MAX_PAGES = 50;
const DOWNLOAD_CURRENT_PAGE_SET_INVALID_TARGET_MESSAGE =
  "Download Current Page Set to Local Bundle は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_SET_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Download Current Page Set to Local Bundle を実行できません。先に file: workspace を開いてください。";
const DOWNLOAD_CURRENT_PAGE_SET_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Download Current Page Set to Local Bundle を実行できません。先に保存または End Edit を実行してください。";
const DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE =
  "一覧取得 API または本文取得 API が未対応のため Download Current Page Set to Local Bundle を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Download Current Page Set to Local Bundle を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE =
  "対象ページ配下の export 中にページが見つからなくなったため Download Current Page Set to Local Bundle を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_TOO_MANY_PAGES_MESSAGE =
  "active page 配下が 50 pages を超えるため Download Current Page Set to Local Bundle を実行できません。";
const DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE =
  "ローカル bundle への保存に失敗したため Download Current Page Set to Local Bundle を完了できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_SUCCESS_MESSAGE =
  "現在ページ配下を growi-current-set/ に保存しました。";
const COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE = `${LOCAL_WORK_FILE_NAME} を開いた状態で Compare Local Work File with Current Page を実行してください。`;
const COMPARE_LOCAL_WORK_FILE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Compare Local Work File with Current Page を実行できません。先に file: workspace を開いてください。";
const COMPARE_LOCAL_WORK_FILE_INVALID_METADATA_MESSAGE = `${LOCAL_WORK_FILE_NAME} の GROWI metadata を読み取れないため Compare Local Work File with Current Page を実行できません。再度 download してください。`;
const COMPARE_LOCAL_WORK_FILE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定のため Compare Local Work File with Current Page を実行できません。先に Configure Base URL を実行してください。";
const COMPARE_LOCAL_WORK_FILE_BASE_URL_MISMATCH_MESSAGE =
  "export 元の GROWI base URL が現在設定と一致しないため Compare Local Work File with Current Page を実行できません。接続先を確認してください。";
const COMPARE_LOCAL_WORK_FILE_OPEN_DIFF_FAILED_MESSAGE =
  "差分ビューを開けませんでした。";
const COMPARE_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Compare Local Bundle with GROWI を実行できません。先に file: workspace を開いてください。";
const COMPARE_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE =
  "growi-current-set/manifest.json の読み込みに失敗したため Compare Local Bundle with GROWI を実行できませんでした。先に Download Current Page Set to Local Bundle を実行してください。";
const COMPARE_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE =
  "growi-current-set/manifest.json の GROWI metadata を読み取れないため Compare Local Bundle with GROWI を実行できません。再度 download してください。";
const COMPARE_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定のため Compare Local Bundle with GROWI を実行できません。先に Configure Base URL を実行してください。";
const COMPARE_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE =
  "export 元の GROWI base URL が現在設定と一致しないため Compare Local Bundle with GROWI を実行できません。接続先を確認してください。";
const COMPARE_LOCAL_BUNDLE_NO_DIFF_MESSAGE =
  "Compare Local Bundle with GROWI で changes editor の対象はありませんでした。";
const COMPARE_LOCAL_BUNDLE_OPEN_DIFF_FAILED_MESSAGE =
  "bundle の差分ビューを開けませんでした。";
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
const CLEAR_PREFIXES_NO_TARGET_MESSAGE =
  "現在の接続先に削除対象の Prefix はありません。";
const CLEAR_PREFIXES_SUCCESS_MESSAGE =
  "現在の接続先に登録された GROWI Prefix を削除しました。";
const OPEN_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため GROWI ページを開けませんでした。";
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
  "ローカルファイルに対して実行する操作を選択してください。";
const SHOW_BACKLINKS_INVALID_TARGET_MESSAGE =
  "Show Backlinks は growi: ページでのみ実行できます。";
const SHOW_BACKLINKS_NO_PREFIX_MESSAGE =
  "Backlinks の対象 Prefix がありません。先に Add Prefix を実行してください。";
const SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE =
  "Backlinks は見つかりませんでした。";
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
const UPLOAD_EXPORTED_LOCAL_FILE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Upload Local Work File to GROWI を実行できません。先に file: workspace を開いてください。";
const UPLOAD_EXPORTED_LOCAL_FILE_READ_LOCAL_FILE_FAILED_MESSAGE = `${LOCAL_WORK_FILE_NAME} の読み込みに失敗したため Upload Local Work File to GROWI を実行できませんでした。先に Download Current Page to Local Work File を実行してください。`;
const UPLOAD_EXPORTED_LOCAL_FILE_INVALID_METADATA_MESSAGE = `${LOCAL_WORK_FILE_NAME} の GROWI metadata を読み取れませんでした。再度 download してください。`;
const UPLOAD_EXPORTED_LOCAL_FILE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const UPLOAD_EXPORTED_LOCAL_FILE_BASE_URL_MISMATCH_MESSAGE =
  "export 元の GROWI base URL が現在設定と一致しません。接続先を確認してください。";
const UPLOAD_EXPORTED_LOCAL_FILE_NOT_FOUND_MESSAGE =
  "upload 先のページが見つからないため Upload Local Work File to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE =
  "更新 API または本文取得 API が未対応のため Upload Local Work File to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Upload Local Work File to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_PERMISSION_DENIED_MESSAGE =
  "更新権限がないため Upload Local Work File to GROWI を実行できませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_CONFLICT_MESSAGE =
  "download 後に GROWI 側が更新されたため Upload Local Work File to GROWI を中止しました。再度 download してやり直してください。";
const UPLOAD_EXPORTED_LOCAL_FILE_SUCCESS_MESSAGE = `${LOCAL_WORK_FILE_NAME} の内容を GROWI へ反映しました。`;
const UPLOAD_EXPORTED_LOCAL_FILE_METADATA_REFRESH_WARNING_MESSAGE =
  "GROWI への upload は成功しましたが metadata の更新に失敗しました。次回 upload 前に再度 download してください。";
const UPLOAD_EXPORTED_LOCAL_FILE_DIRTY_GROWI_REOPEN_WARNING_MESSAGE =
  "GROWI への upload は成功しましたが、表示中の growi: ページは未保存変更があるため自動再読込しませんでした。";
const UPLOAD_EXPORTED_LOCAL_FILE_REOPEN_FAILED_WARNING_MESSAGE =
  "GROWI への upload は成功しましたが、表示中の growi: ページ再読込に失敗しました。Refresh Current Page を実行してください。";
const UPLOAD_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル folder が開かれていないため Upload Local Bundle to GROWI を実行できません。先に file: workspace を開いてください。";
const UPLOAD_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE =
  "growi-current-set/manifest.json の読み込みに失敗したため Upload Local Bundle to GROWI を実行できませんでした。先に Download Current Page Set to Local Bundle を実行してください。";
const UPLOAD_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE =
  "growi-current-set/manifest.json の GROWI metadata を読み取れませんでした。再度 download してください。";
const UPLOAD_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const UPLOAD_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE =
  "export 元の GROWI base URL が現在設定と一致しません。接続先を確認してください。";
const UPLOAD_LOCAL_BUNDLE_METADATA_REFRESH_WARNING_MESSAGE =
  "GROWI への bundle upload は成功しましたが manifest の更新に一部失敗しました。次回 upload 前に再度 download してください。";

function joinUploadWarnings(messages: string[]): string {
  return messages.join(" ");
}

function buildCurrentPageSetBundleRootPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CURRENT_PAGE_SET_BUNDLE_NAME);
}

function buildCurrentPageSetManifestPath(workspaceRoot: string): string {
  return path.join(
    buildCurrentPageSetBundleRootPath(workspaceRoot),
    CURRENT_PAGE_SET_MANIFEST_FILE_NAME,
  );
}

function buildCurrentPageSetPageFileRelativePath(
  canonicalPath: string,
): string {
  if (canonicalPath === "/") {
    return "__root__.md";
  }

  const segments = canonicalPath
    .split("/")
    .filter((segment) => segment.length > 0);
  return `${path.posix.join(...segments)}.md`;
}

function buildCurrentPageSetPageFilePath(
  workspaceRoot: string,
  relativeFilePath: string,
): string {
  return path.join(
    buildCurrentPageSetBundleRootPath(workspaceRoot),
    ...relativeFilePath.split("/"),
  );
}

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function serializeGrowiCurrentSetManifest(
  manifest: GrowiCurrentSetManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseGrowiCurrentSetManifest(
  raw: string,
): ParsedGrowiCurrentSetManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "InvalidJson" };
  }

  const candidate = parsed as Partial<GrowiCurrentSetManifest>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    candidate.version !== 1 ||
    candidate.kind !== "growi-current-set" ||
    candidate.bundleName !== "growi-current-set" ||
    typeof candidate.baseUrl !== "string" ||
    typeof candidate.rootCanonicalPath !== "string" ||
    typeof candidate.exportedAt !== "string" ||
    !Array.isArray(candidate.pages)
  ) {
    return { ok: false, reason: "InvalidShape" };
  }

  const pages: GrowiCurrentSetManifestPage[] = [];
  for (const page of candidate.pages) {
    if (
      typeof page !== "object" ||
      page === null ||
      typeof page.canonicalPath !== "string" ||
      typeof page.relativeFilePath !== "string" ||
      typeof page.pageId !== "string" ||
      typeof page.baseRevisionId !== "string" ||
      typeof page.exportedAt !== "string" ||
      typeof page.contentHash !== "string"
    ) {
      return { ok: false, reason: "InvalidShape" };
    }
    pages.push({
      canonicalPath: page.canonicalPath,
      relativeFilePath: page.relativeFilePath,
      pageId: page.pageId,
      baseRevisionId: page.baseRevisionId,
      exportedAt: page.exportedAt,
      contentHash: page.contentHash,
    });
  }

  return {
    ok: true,
    value: {
      version: 1,
      kind: "growi-current-set",
      bundleName: "growi-current-set",
      baseUrl: candidate.baseUrl,
      rootCanonicalPath: candidate.rootCanonicalPath,
      exportedAt: candidate.exportedAt,
      pages,
    },
  };
}

function dedupeAndSortCanonicalPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function mapBundleListFailureToMessage(result: {
  ok: false;
  reason: "ApiNotSupported" | "ConnectionFailed";
}): string {
  if (result.reason === "ApiNotSupported") {
    return DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE;
  }
  return DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE;
}

function mapBundleSnapshotFailureToMessage(
  result: Exclude<StartEditBootstrapResult, { ok: true }>,
): string {
  return mapSnapshotFailureToMessage(result, {
    apiNotSupported: DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
    notFound: DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE,
  });
}

function formatBundleCompareSkippedSummary(
  results: readonly BundleCompareResult[],
): string {
  return [
    "Compare Local Bundle with GROWI では一部ページを changes editor に含めませんでした。",
    ...results.map((result) => `${result.status}: ${result.canonicalPath}`),
  ].join("\n");
}

function formatBundleUploadSummary(
  results: readonly BundleUploadResult[],
): string {
  return [
    "Upload Local Bundle to GROWI を完了しました。",
    ...results.map((result) => `${result.status}: ${result.canonicalPath}`),
  ].join("\n");
}

function resolveCommandInput(
  injected:
    | string
    | {
        input?: string;
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
): Promise<void> {
  const resolved = await deps.resolvePageReference(reference);
  if (!resolved.ok) {
    if (resolved.reason === "NotFound") {
      deps.showErrorMessage(OPEN_PAGE_NOT_FOUND_MESSAGE);
      return;
    }
    if (resolved.reason === "ApiNotSupported") {
      deps.showErrorMessage(OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE);
      return;
    }
    deps.showErrorMessage(OPEN_PAGE_CONNECTION_FAILED_MESSAGE);
    return;
  }

  const page = await deps.readPageBody(resolved.canonicalPath);
  if (!page.ok) {
    if (page.reason === "NotFound") {
      deps.showErrorMessage(OPEN_PAGE_NOT_FOUND_MESSAGE);
      return;
    }
    if (page.reason === "ApiNotSupported") {
      deps.showErrorMessage(OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE);
      return;
    }
    deps.showErrorMessage(OPEN_PAGE_CONNECTION_FAILED_MESSAGE);
    return;
  }

  try {
    await deps.openUri(resolved.uri);
  } catch {
    deps.showErrorMessage(OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE);
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

function createExplorerPassthroughCommand(
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
      if (resolved.reason === "NotFound") {
        deps.showErrorMessage(ADD_PREFIX_NOT_FOUND_MESSAGE);
        return;
      }
      if (resolved.reason === "ApiNotSupported") {
        deps.showErrorMessage(ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE);
        return;
      }
      deps.showErrorMessage(ADD_PREFIX_CONNECTION_FAILED_MESSAGE);
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
    GROWI_COMMANDS.downloadCurrentPageToLocalFile,
  );
}

export function createExplorerDownloadCurrentPageSetToLocalBundleCommand(
  deps: CommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.downloadCurrentPageSetToLocalBundle,
  );
}

export function createExplorerCompareLocalWorkFileWithCurrentPageCommand(
  deps: CommandDeps,
) {
  return createExplorerPassthroughCommand(
    deps,
    GROWI_COMMANDS.compareLocalWorkFileWithCurrentPage,
  );
}

export function createExplorerUploadExportedLocalFileToGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerPassthroughCommand(
    deps,
    GROWI_COMMANDS.uploadExportedLocalFileToGrowi,
  );
}

export function createExplorerCompareLocalBundleWithGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerPassthroughCommand(
    deps,
    GROWI_COMMANDS.compareLocalBundleWithGrowi,
  );
}

export function createExplorerUploadLocalBundleToGrowiCommand(
  deps: CommandDeps,
) {
  return createExplorerPassthroughCommand(
    deps,
    GROWI_COMMANDS.uploadLocalBundleToGrowi,
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

function isLocalWorkFileUri(
  uri: UriLike | undefined,
  expectedLocalWorkFilePath: string,
): uri is UriLike {
  if (!uri || uri.scheme !== "file") {
    return false;
  }

  return (uri.fsPath ?? uri.path) === expectedLocalWorkFilePath;
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
  messages: {
    apiNotSupported: string;
    connectionFailed: string;
    notFound: string;
  },
): string {
  if (result.reason === "ApiNotSupported") {
    return messages.apiNotSupported;
  }
  if (result.reason === "ConnectionFailed") {
    return messages.connectionFailed;
  }
  return messages.notFound;
}

function mapUploadWriteFailureToMessage(
  result: Exclude<GrowiPageWriteResult, { ok: true }>,
): string {
  if (result.reason === "PermissionDenied") {
    return UPLOAD_EXPORTED_LOCAL_FILE_PERMISSION_DENIED_MESSAGE;
  }
  if (result.reason === "ConnectionFailed") {
    return UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE;
  }
  return UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE;
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

function mapRefreshCurrentPageErrorMessage(error: unknown): string {
  const text = getErrorText(error);
  if (text.includes("FileNotFound")) {
    return REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE;
  }
  if (text.includes("read page API is not supported")) {
    return REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE;
  }
  if (text.includes("failed to connect to GROWI")) {
    return REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE;
  }
  return REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE;
}

function mapRefreshListingErrorMessage(error: unknown): string {
  const text = getErrorText(error);
  if (text.includes("list pages API is not supported")) {
    return REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE;
  }
  if (text.includes("failed to connect to GROWI")) {
    return REFRESH_LISTING_CONNECTION_FAILED_MESSAGE;
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
      if (bootstrapResult.reason === "ApiNotSupported") {
        deps.showErrorMessage(START_EDIT_API_NOT_SUPPORTED_MESSAGE);
        return;
      }
      if (bootstrapResult.reason === "ConnectionFailed") {
        deps.showErrorMessage(START_EDIT_CONNECTION_FAILED_MESSAGE);
        return;
      }

      deps.showErrorMessage(START_EDIT_NOT_FOUND_MESSAGE);
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
  if (result.reason === "ConnectionFailed") {
    return SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE;
  }
  return SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE;
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
        revisions.reason === "ConnectionFailed"
          ? SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE
          : SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE,
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
          label: "現在ページをローカルへダウンロード",
          description: "growi-current.md に保存",
          command: GROWI_COMMANDS.downloadCurrentPageToLocalFile,
        },
        {
          label: "配下ページをローカルへダウンロード",
          description: "growi-current-set/ に保存",
          command: GROWI_COMMANDS.downloadCurrentPageSetToLocalBundle,
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
  return async function showLocalRoundTripActions(
    uri?: UriLike,
  ): Promise<void> {
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
          label: "ローカルと現在ページを比較",
          description: "growi-current.md を使用",
          command: GROWI_COMMANDS.compareLocalWorkFileWithCurrentPage,
        },
        {
          label: "ローカルを現在ページへ反映",
          description: "growi-current.md を使用",
          command: GROWI_COMMANDS.uploadExportedLocalFileToGrowi,
        },
        {
          label: "ローカルと配下ページを比較",
          description: "growi-current-set/ を使用",
          command: GROWI_COMMANDS.compareLocalBundleWithGrowi,
        },
        {
          label: "ローカルを配下ページへ反映",
          description: "growi-current-set/ を使用",
          command: GROWI_COMMANDS.uploadLocalBundleToGrowi,
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

    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_NO_LOCAL_WORKSPACE_MESSAGE);
      return;
    }

    const localWorkFilePath = buildLocalWorkFilePath(localWorkspaceRoot);
    const openLocalWorkFile = deps.findOpenTextDocument(localWorkFilePath);
    if (openLocalWorkFile?.isDirty) {
      deps.showErrorMessage(
        DOWNLOAD_CURRENT_PAGE_DIRTY_LOCAL_WORK_FILE_MESSAGE,
      );
      return;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
      return;
    }

    const snapshot = await deps.bootstrapEditSession(canonicalPath);
    if (!snapshot.ok) {
      deps.showErrorMessage(
        mapSnapshotFailureToMessage(snapshot, {
          apiNotSupported: DOWNLOAD_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: DOWNLOAD_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE,
          notFound: DOWNLOAD_CURRENT_PAGE_NOT_FOUND_MESSAGE,
        }),
      );
      return;
    }

    try {
      await deps.writeLocalFile(
        localWorkFilePath,
        serializeLocalRoundTripWorkFile(
          {
            version: 1,
            baseUrl,
            canonicalPath,
            pageId: snapshot.value.pageId,
            baseRevisionId: snapshot.value.baseRevisionId,
            exportedAt: new Date().toISOString(),
          },
          snapshot.value.baseBody,
        ),
      );
      await deps.openLocalFile(localWorkFilePath);
    } catch {
      deps.showErrorMessage(
        DOWNLOAD_CURRENT_PAGE_WRITE_LOCAL_FILE_FAILED_MESSAGE,
      );
      return;
    }

    deps.showInformationMessage(DOWNLOAD_CURRENT_PAGE_SUCCESS_MESSAGE);
  };
}

export function createCompareLocalWorkFileWithCurrentPageCommand(
  deps: CommandDeps,
) {
  return async function compareLocalWorkFileWithCurrentPage(): Promise<void> {
    const targetUri = deps.getActiveEditorUri();
    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_NO_LOCAL_WORKSPACE_MESSAGE);
      return;
    }

    const localWorkFilePath = buildLocalWorkFilePath(localWorkspaceRoot);
    if (!isLocalWorkFileUri(targetUri, localWorkFilePath)) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE);
      return;
    }

    const activeEditorText = deps.getActiveEditorText();
    if (activeEditorText === undefined) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE);
      return;
    }

    const parsedWorkFile = parseLocalRoundTripWorkFile(activeEditorText);
    if (!parsedWorkFile.ok) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_METADATA_MESSAGE);
      return;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_BASE_URL_MESSAGE);
      return;
    }
    if (baseUrl !== parsedWorkFile.value.metadata.baseUrl) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_BASE_URL_MISMATCH_MESSAGE);
      return;
    }

    const growiUri = buildGrowiUriFromInput(
      parsedWorkFile.value.metadata.canonicalPath,
    );
    if (!growiUri.ok) {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_INVALID_METADATA_MESSAGE);
      return;
    }

    try {
      await deps.openDiff(
        { scheme: "growi", path: `${growiUri.value.canonicalPath}.md` },
        targetUri,
        `GROWI Diff: ${parsedWorkFile.value.metadata.canonicalPath} <-> ${LOCAL_WORK_FILE_NAME}`,
      );
    } catch {
      deps.showErrorMessage(COMPARE_LOCAL_WORK_FILE_OPEN_DIFF_FAILED_MESSAGE);
    }
  };
}

export function createUploadExportedLocalFileToGrowiCommand(deps: CommandDeps) {
  return async function uploadExportedLocalFileToGrowi(): Promise<void> {
    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(
        UPLOAD_EXPORTED_LOCAL_FILE_NO_LOCAL_WORKSPACE_MESSAGE,
      );
      return;
    }
    const localWorkFilePath = buildLocalWorkFilePath(localWorkspaceRoot);

    let localWorkFileContent: string;
    try {
      localWorkFileContent = await deps.readLocalFile(localWorkFilePath);
    } catch {
      deps.showErrorMessage(
        UPLOAD_EXPORTED_LOCAL_FILE_READ_LOCAL_FILE_FAILED_MESSAGE,
      );
      return;
    }

    const parsedWorkFile = parseLocalRoundTripWorkFile(localWorkFileContent);
    if (!parsedWorkFile.ok) {
      deps.showErrorMessage(
        UPLOAD_EXPORTED_LOCAL_FILE_INVALID_METADATA_MESSAGE,
      );
      return;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(
        UPLOAD_EXPORTED_LOCAL_FILE_INVALID_BASE_URL_MESSAGE,
      );
      return;
    }
    if (baseUrl !== parsedWorkFile.value.metadata.baseUrl) {
      deps.showErrorMessage(
        UPLOAD_EXPORTED_LOCAL_FILE_BASE_URL_MISMATCH_MESSAGE,
      );
      return;
    }

    const currentSnapshot = await deps.bootstrapEditSession(
      parsedWorkFile.value.metadata.canonicalPath,
    );
    if (!currentSnapshot.ok) {
      deps.showErrorMessage(
        mapSnapshotFailureToMessage(currentSnapshot, {
          apiNotSupported: UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed:
            UPLOAD_EXPORTED_LOCAL_FILE_CONNECTION_FAILED_MESSAGE,
          notFound: UPLOAD_EXPORTED_LOCAL_FILE_NOT_FOUND_MESSAGE,
        }),
      );
      return;
    }
    if (
      currentSnapshot.value.pageId !== parsedWorkFile.value.metadata.pageId ||
      currentSnapshot.value.baseRevisionId !==
        parsedWorkFile.value.metadata.baseRevisionId
    ) {
      deps.showErrorMessage(UPLOAD_EXPORTED_LOCAL_FILE_CONFLICT_MESSAGE);
      return;
    }

    const writeResult = await deps.writePage(
      parsedWorkFile.value.metadata.canonicalPath,
      parsedWorkFile.value.body,
      {
        pageId: parsedWorkFile.value.metadata.pageId,
        baseRevisionId: parsedWorkFile.value.metadata.baseRevisionId,
        baseUpdatedAt: currentSnapshot.value.baseUpdatedAt,
        baseBody: currentSnapshot.value.baseBody,
        enteredAt: parsedWorkFile.value.metadata.exportedAt,
        dirty: false,
      },
    );
    if (!writeResult.ok) {
      deps.showErrorMessage(mapUploadWriteFailureToMessage(writeResult));
      return;
    }

    deps.invalidateReadFileCache(parsedWorkFile.value.metadata.canonicalPath);
    const postUploadWarnings: string[] = [];

    const refreshedSnapshot = await deps.bootstrapEditSession(
      parsedWorkFile.value.metadata.canonicalPath,
    );
    if (!refreshedSnapshot.ok) {
      postUploadWarnings.push(
        UPLOAD_EXPORTED_LOCAL_FILE_METADATA_REFRESH_WARNING_MESSAGE,
      );
    } else {
      try {
        await deps.writeLocalFile(
          localWorkFilePath,
          serializeLocalRoundTripWorkFile(
            {
              version: 1,
              baseUrl,
              canonicalPath: parsedWorkFile.value.metadata.canonicalPath,
              pageId: refreshedSnapshot.value.pageId,
              baseRevisionId: refreshedSnapshot.value.baseRevisionId,
              exportedAt: new Date().toISOString(),
            },
            parsedWorkFile.value.body,
          ),
        );
      } catch {
        postUploadWarnings.push(
          UPLOAD_EXPORTED_LOCAL_FILE_METADATA_REFRESH_WARNING_MESSAGE,
        );
      }
    }

    const reopenResult = await deps.refreshOpenGrowiPage(
      parsedWorkFile.value.metadata.canonicalPath,
    );
    if (reopenResult === "dirty") {
      postUploadWarnings.push(
        UPLOAD_EXPORTED_LOCAL_FILE_DIRTY_GROWI_REOPEN_WARNING_MESSAGE,
      );
    }
    if (reopenResult === "failed") {
      postUploadWarnings.push(
        UPLOAD_EXPORTED_LOCAL_FILE_REOPEN_FAILED_WARNING_MESSAGE,
      );
    }

    if (postUploadWarnings.length > 0) {
      deps.showWarningMessage(joinUploadWarnings(postUploadWarnings));
      return;
    }

    deps.showInformationMessage(UPLOAD_EXPORTED_LOCAL_FILE_SUCCESS_MESSAGE);
  };
}

export function createDownloadCurrentPageSetToLocalBundleCommand(
  deps: CommandDeps,
) {
  return async function downloadCurrentPageSetToLocalBundle(
    uri?: UriLike,
  ): Promise<GrowiCurrentSetManifest | undefined> {
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

    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(
        DOWNLOAD_CURRENT_PAGE_SET_NO_LOCAL_WORKSPACE_MESSAGE,
      );
      return undefined;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
      return undefined;
    }

    const listedPages = await deps.listPages(canonicalPath);
    if (!listedPages.ok) {
      deps.showErrorMessage(mapBundleListFailureToMessage(listedPages));
      return undefined;
    }

    const pagePaths = dedupeAndSortCanonicalPaths([
      canonicalPath,
      ...listedPages.paths,
    ]);
    if (pagePaths.length > CURRENT_PAGE_SET_MAX_PAGES) {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_TOO_MANY_PAGES_MESSAGE);
      return undefined;
    }

    const exportedAt = new Date().toISOString();
    const pages: GrowiCurrentSetManifestPage[] = [];

    try {
      for (const pagePath of pagePaths) {
        const snapshot = await deps.bootstrapEditSession(pagePath);
        if (!snapshot.ok) {
          deps.showErrorMessage(mapBundleSnapshotFailureToMessage(snapshot));
          return undefined;
        }

        const relativeFilePath =
          buildCurrentPageSetPageFileRelativePath(pagePath);
        await deps.writeLocalFile(
          buildCurrentPageSetPageFilePath(localWorkspaceRoot, relativeFilePath),
          snapshot.value.baseBody,
        );
        pages.push({
          canonicalPath: pagePath,
          relativeFilePath,
          pageId: snapshot.value.pageId,
          baseRevisionId: snapshot.value.baseRevisionId,
          exportedAt,
          contentHash: hashBody(snapshot.value.baseBody),
        });
      }

      const manifest: GrowiCurrentSetManifest = {
        version: 1,
        kind: "growi-current-set",
        bundleName: "growi-current-set",
        baseUrl,
        rootCanonicalPath: canonicalPath,
        exportedAt,
        pages,
      };
      const manifestPath = buildCurrentPageSetManifestPath(localWorkspaceRoot);
      await deps.writeLocalFile(
        manifestPath,
        serializeGrowiCurrentSetManifest(manifest),
      );
      await deps.openLocalFile(manifestPath);
      deps.showInformationMessage(DOWNLOAD_CURRENT_PAGE_SET_SUCCESS_MESSAGE);
      return manifest;
    } catch {
      deps.showErrorMessage(DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE);
      return undefined;
    }
  };
}

export function createCompareLocalBundleWithGrowiCommand(deps: CommandDeps) {
  return async function compareLocalBundleWithGrowi(): Promise<
    BundleCompareResult[] | undefined
  > {
    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE);
      return undefined;
    }

    const manifestPath = buildCurrentPageSetManifestPath(localWorkspaceRoot);
    let rawManifest: string;
    try {
      rawManifest = await deps.readLocalFile(manifestPath);
    } catch {
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE);
      return undefined;
    }

    const parsedManifest = parseGrowiCurrentSetManifest(rawManifest);
    if (!parsedManifest.ok) {
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE);
      return undefined;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE);
      return undefined;
    }
    if (baseUrl !== parsedManifest.value.baseUrl) {
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE);
      return undefined;
    }

    const results: BundleCompareResult[] = [];
    const skippedDiffResults: BundleCompareResult[] = [];
    const diffResources: ChangesResourceTuple[] = [];
    for (const page of parsedManifest.value.pages) {
      const localFilePath = buildCurrentPageSetPageFilePath(
        localWorkspaceRoot,
        page.relativeFilePath,
      );

      let localBody: string;
      try {
        localBody = await deps.readLocalFile(localFilePath);
      } catch {
        results.push({
          canonicalPath: page.canonicalPath,
          status: "MissingLocal",
        });
        continue;
      }

      const localChanged = hashBody(localBody) !== page.contentHash;
      const currentSnapshot = await deps.bootstrapEditSession(
        page.canonicalPath,
      );
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
            apiNotSupported:
              DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
            connectionFailed:
              DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
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
          path: localFilePath,
          fsPath: localFilePath,
        } as const;
        diffResources.push([
          localFileUri,
          { scheme: "growi", path: `${page.canonicalPath}.md` },
          localFileUri,
        ]);
      }
    }

    for (const result of results) {
      if (
        result.status === "MissingLocal" ||
        result.status === "MissingRemote"
      ) {
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
      await openChangesEditor(
        deps,
        `GROWI Bundle Diff: ${parsedManifest.value.rootCanonicalPath}`,
        diffResources,
      );
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
  };
}

export function createUploadLocalBundleToGrowiCommand(deps: CommandDeps) {
  return async function uploadLocalBundleToGrowi(): Promise<
    BundleUploadResult[] | undefined
  > {
    const localWorkspaceRoot = deps.getLocalWorkspaceRoot();
    if (!localWorkspaceRoot) {
      deps.showErrorMessage(UPLOAD_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE);
      return undefined;
    }

    const manifestPath = buildCurrentPageSetManifestPath(localWorkspaceRoot);
    let rawManifest: string;
    try {
      rawManifest = await deps.readLocalFile(manifestPath);
    } catch {
      deps.showErrorMessage(UPLOAD_LOCAL_BUNDLE_READ_MANIFEST_FAILED_MESSAGE);
      return undefined;
    }

    const parsedManifest = parseGrowiCurrentSetManifest(rawManifest);
    if (!parsedManifest.ok) {
      deps.showErrorMessage(UPLOAD_LOCAL_BUNDLE_INVALID_MANIFEST_MESSAGE);
      return undefined;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(UPLOAD_LOCAL_BUNDLE_INVALID_BASE_URL_MESSAGE);
      return undefined;
    }
    if (baseUrl !== parsedManifest.value.baseUrl) {
      deps.showErrorMessage(UPLOAD_LOCAL_BUNDLE_BASE_URL_MISMATCH_MESSAGE);
      return undefined;
    }

    const results: BundleUploadResult[] = [];
    const postUploadWarnings: string[] = [];
    let manifestRefreshFailed = false;
    let manifestChanged = false;
    const updatedPages = parsedManifest.value.pages.map((page) => ({
      ...page,
    }));

    for (const page of updatedPages) {
      const localFilePath = buildCurrentPageSetPageFilePath(
        localWorkspaceRoot,
        page.relativeFilePath,
      );

      let localBody: string;
      try {
        localBody = await deps.readLocalFile(localFilePath);
      } catch {
        results.push({
          canonicalPath: page.canonicalPath,
          status: "MissingLocal",
        });
        continue;
      }

      if (hashBody(localBody) === page.contentHash) {
        results.push({
          canonicalPath: page.canonicalPath,
          status: "Unchanged",
        });
        continue;
      }

      const currentSnapshot = await deps.bootstrapEditSession(
        page.canonicalPath,
      );
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
            apiNotSupported:
              UPLOAD_EXPORTED_LOCAL_FILE_API_NOT_SUPPORTED_MESSAGE,
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
        results.push({
          canonicalPath: page.canonicalPath,
          status: "Conflict",
        });
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
      results.push({
        canonicalPath: page.canonicalPath,
        status: "Uploaded",
      });

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
      const updatedManifest: GrowiCurrentSetManifest = {
        ...parsedManifest.value,
        exportedAt: new Date().toISOString(),
        pages: updatedPages,
      };

      try {
        await deps.writeLocalFile(
          manifestPath,
          serializeGrowiCurrentSetManifest(updatedManifest),
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

import { createHash } from "node:crypto";

import { buildGrowiUriFromInput, normalizeCanonicalPath } from "../../core/uri";
import {
  COMPARE_LOCAL_MIRROR_DESCRIPTION,
  GROWI_COMMANDS,
  SHOW_LOCAL_ROUND_TRIP_ACTIONS_PLACEHOLDER,
  SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION,
} from "../commandsConstants";
import type {
  BundleCompareResult,
  ChangesResourceTuple,
  CurrentPageActionQuickPickItem,
  CurrentPageDetailSummary,
  CurrentPageDetailWebviewInput,
  MirrorCommandDeps,
  StartEditBootstrapResult,
  UriLike,
} from "../commandsTypes";
import type {
  GrowiAccessFailureReason,
  GrowiPageWriteResult,
  GrowiReadFailureReason,
} from "../fsProvider";
import {
  buildInstanceKey,
  buildMirrorManifestPath,
  buildMirrorManifestPathWithInstanceKey,
  buildMirrorPageFilePath,
  buildMirrorPageFilePathWithInstanceKey,
  type MirrorManifest,
  type MirrorManifestPage,
  type MirrorManifestSkippedPage,
  parseMirrorManifest,
  planMirrorRelativeFilePaths,
  serializeMirrorManifest,
} from "../localRoundTrip";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./mirrorCompareScm";
import {
  evaluateLoadedMirrorPageStatus,
  type LoadedMirrorSelection,
  lookupMirrorManifestSelection,
  type MirrorRequestScope,
} from "./mirrorCompareStatus";

interface BundleUploadResult {
  canonicalPath: string;
  status:
    | "Uploaded"
    | "Unchanged"
    | "Conflict"
    | "MissingRemote"
    | "MissingLocal";
}

interface TakeRemoteMirrorResult {
  canonicalPath: string;
  status:
    | "TakenRemote"
    | "Unchanged"
    | "LocalChanged"
    | "MissingRemote"
    | "MissingLocal";
}

interface CurrentPageActionsCommandDeps {
  getActiveEditorUri(): UriLike | undefined;
  executeCommand(command: string, ...args: unknown[]): Promise<void>;
  loadPageDetailSummary?(
    canonicalPath: string,
  ): Promise<CurrentPageDetailSummary>;
  openPageDetailWebview?(input: CurrentPageDetailWebviewInput): Promise<void>;
  showErrorMessage(message: string): void;
  showQuickPick(
    items: readonly CurrentPageActionQuickPickItem[],
    options: { placeHolder: string },
  ): Promise<CurrentPageActionQuickPickItem | undefined>;
}

const ADD_PREFIX_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
const DOWNLOAD_CURRENT_PAGE_INVALID_TARGET_MESSAGE =
  "Sync Local Mirror for Current Page は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル file: workspace/folder が開かれていないため Sync Local Mirror for Current Page を実行できません。先に file: workspace/folder を開いてください。";
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
  "現在ページをローカルに同期しました。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SUCCESS_MESSAGE =
  "既存 prefix mirror 内の現在ページをローカルに同期しました。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE =
  "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Page を実行できません。先に保存してください。";
const DOWNLOAD_CURRENT_PAGE_REUSED_PREFIX_SKIPPED_MESSAGE =
  "既存 prefix mirror で対象ページが衝突により skip されているため Sync Local Mirror for Current Page を実行できません。prefix mirror を見直してください。";
const DOWNLOAD_CURRENT_PAGE_SET_INVALID_TARGET_MESSAGE =
  "Sync Local Mirror for Current Prefix は growi: ページでのみ実行できます。";
const DOWNLOAD_CURRENT_PAGE_SET_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル file: workspace/folder が開かれていないため Sync Local Mirror for Current Prefix を実行できません。先に file: workspace/folder を開いてください。";
const DOWNLOAD_CURRENT_PAGE_SET_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Sync Local Mirror for Current Prefix を実行できません。先に保存または End Edit を実行してください。";
const DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE =
  "一覧取得 API または本文取得 API が未対応のため Sync Local Mirror for Current Prefix を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Sync Local Mirror for Current Prefix を実行できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE =
  "対象ページ配下の export 中にページが見つからなくなったため Sync Local Mirror for Current Prefix を実行できませんでした。";
function buildDownloadCurrentPageSetTooManyPagesMessage(maxPages: number) {
  return `active page 配下が ${maxPages} pages を超えるため Sync Local Mirror for Current Prefix を実行できません。`;
}
const DOWNLOAD_CURRENT_PAGE_SET_WRITE_FAILED_MESSAGE =
  "ローカルミラーの同期に失敗したため Sync Local Mirror for Current Prefix を完了できませんでした。";
const DOWNLOAD_CURRENT_PAGE_SET_SUCCESS_MESSAGE =
  "現在ページ配下をローカルに同期しました。";
const DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_SUCCESS_MESSAGE =
  "既存 prefix mirror 内の現在ページ配下をローカルに同期しました。";
const DOWNLOAD_CURRENT_PAGE_SET_REUSED_PREFIX_DIRTY_LOCAL_FILE_MESSAGE =
  "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Prefix を実行できません。先に保存してください。";
const COMPARE_LOCAL_WORK_FILE_INVALID_TARGET_MESSAGE =
  "Compare Local Mirror with GROWI は growi: ページでのみ実行できます。";
const COMPARE_LOCAL_BUNDLE_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル file: workspace/folder が開かれていないため Compare Local Mirror with GROWI を実行できません。先に file: workspace/folder を開いてください。";
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
  "ローカル file: workspace/folder が開かれていないため Upload Local Mirror to GROWI を実行できません。先に file: workspace/folder を開いてください。";
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
const SCM_COMPARE_AGAIN_NO_STATE_MESSAGE =
  "SCM 上に再比較対象の snapshot はありません。先に Compare Local Mirror with GROWI を実行してください。";
const SCM_UPLOAD_LOCAL_CHANGES_NO_STATE_MESSAGE =
  "SCM 上にローカルの変更の compare snapshot はありません。先に Compare Local Mirror with GROWI を実行してください。";
const SCM_UPLOAD_LOCAL_CHANGES_EMPTY_MESSAGE =
  "SCM 上に反映対象のローカルの変更はありません。";
const SCM_TAKE_REMOTE_CHANGES_NO_STATE_MESSAGE =
  "SCM 上に GROWI側の変更の compare snapshot はありません。先に Compare Local Mirror with GROWI を実行してください。";
const SCM_TAKE_REMOTE_CHANGES_EMPTY_MESSAGE =
  "SCM 上に取り込み対象の GROWI側の変更はありません。";
const TAKE_REMOTE_CHANGES_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル file: workspace/folder が開かれていないため、ローカルへの取り込みを実行できません。先に file: workspace/folder を開いてください。";
const TAKE_REMOTE_CHANGES_READ_MANIFEST_FAILED_MESSAGE =
  ".growi-mirror.json の読み込みに失敗したため、ローカルに取り込めませんでした。先に Sync Local Mirror を実行してください。";
const TAKE_REMOTE_CHANGES_INVALID_MANIFEST_MESSAGE =
  ".growi-mirror.json の GROWI metadata を読み取れないため、ローカルへの取り込みを実行できません。再度 Sync Local Mirror を実行してください。";
const TAKE_REMOTE_CHANGES_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定のため、ローカルへの取り込みを実行できません。先に Configure Base URL を実行してください。";
const TAKE_REMOTE_CHANGES_BASE_URL_MISMATCH_MESSAGE =
  "mirror の GROWI base URL が現在設定と一致しないため、ローカルへの取り込みを実行できません。接続先を確認してください。";
const TAKE_REMOTE_CHANGES_MIRROR_NOT_FOUND_MESSAGE =
  "対象の local mirror が見つからないため、ローカルに取り込めませんでした。先に Sync Local Mirror を実行してください。";
const TAKE_REMOTE_CHANGES_REUSED_PREFIX_SKIPPED_MESSAGE =
  "既存 prefix mirror で対象ページまたは配下が衝突により skip されているため、ローカルへの取り込みを実行できません。prefix mirror を見直してください。";
const TAKE_REMOTE_CHANGES_NOT_FOUND_MESSAGE =
  "取り込み対象のページが見つからないため、ローカルに取り込めませんでした。";
const TAKE_REMOTE_CHANGES_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため、ローカルに取り込めませんでした。";
const TAKE_REMOTE_CHANGES_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため、ローカルに取り込めませんでした。";
const TAKE_REMOTE_CHANGES_WRITE_FAILED_MESSAGE =
  "リモート変更の取り込みに失敗しました。";
const REFRESH_LOCAL_MIRROR_INVALID_TARGET_MESSAGE =
  "Refresh Local Mirror は growi: ページでのみ実行できます。";
const REFRESH_LOCAL_MIRROR_NO_LOCAL_WORKSPACE_MESSAGE =
  "ローカル file: workspace/folder が開かれていないため Refresh Local Mirror を実行できません。先に file: workspace/folder を開いてください。";
const REFRESH_LOCAL_MIRROR_READ_MANIFEST_FAILED_MESSAGE =
  ".growi-mirror.json の読み込みに失敗したため Refresh Local Mirror を実行できませんでした。先に Sync Local Mirror を実行してください。";
const REFRESH_LOCAL_MIRROR_INVALID_MANIFEST_MESSAGE =
  ".growi-mirror.json の GROWI metadata を読み取れないため Refresh Local Mirror を実行できません。再度 Sync Local Mirror を実行してください。";
const REFRESH_LOCAL_MIRROR_BASE_URL_MISMATCH_MESSAGE =
  "mirror の GROWI base URL が現在設定と一致しないため Refresh Local Mirror を実行できません。接続先を確認してください。";
const REFRESH_LOCAL_MIRROR_LOCAL_CHANGES_MESSAGE =
  "local changed があるため Refresh Local Mirror を実行できません。Compare Local Mirror with GROWI または Upload Local Mirror to GROWI を先に実行してください。";
const REFRESH_LOCAL_MIRROR_SUCCESS_MESSAGE = "Local Mirror を再取得しました。";
const SHOW_LOCAL_ROUND_TRIP_ACTIONS_INVALID_TARGET_MESSAGE =
  "ローカル操作メニューは growi: ページでのみ実行できます。";

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
  const instanceKey = buildInstanceKey(baseUrl);
  return [
    {
      instanceKey,
      manifestPath: buildMirrorManifestFilePathWithInstanceKey(
        workspaceRoot,
        instanceKey,
        rootCanonicalPath,
      ),
    },
  ];
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
  deps: MirrorCommandDeps,
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
  deps: MirrorCommandDeps,
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
    const targetManifestPath = buildMirrorManifestFilePathWithInstanceKey(
      input.workspaceRoot,
      reusable.instanceKey,
      reusable.manifest.rootCanonicalPath,
    );
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
  deps: MirrorCommandDeps,
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

  const maxPrefixPages = deps.getLocalMirrorMaxPrefixPages();
  const listedPages = await deps.listPages(input.canonicalPath, {
    limit: maxPrefixPages,
  });
  if (!listedPages.ok) {
    deps.showErrorMessage(mapBundleListFailureToMessage(listedPages));
    return { handled: true };
  }

  const subtreePagePaths = dedupeAndSortCanonicalPaths([
    input.canonicalPath,
    ...listedPages.paths,
  ]);
  if (subtreePagePaths.length > maxPrefixPages || listedPages.hasMore) {
    deps.showErrorMessage(
      buildDownloadCurrentPageSetTooManyPagesMessage(maxPrefixPages),
    );
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

    const targetManifestPath = buildMirrorManifestFilePathWithInstanceKey(
      input.workspaceRoot,
      reusable.instanceKey,
      reusable.manifest.rootCanonicalPath,
    );

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

function formatTakeRemoteSummary(
  results: readonly TakeRemoteMirrorResult[],
): string {
  return [
    "GROWI側の変更をローカルに取り込みました。",
    ...results.map((result) => `${result.status}: ${result.canonicalPath}`),
  ].join("\n");
}

function formatScmSelectionSkippedSummary(
  operation: "ローカルの変更" | "GROWI側の変更",
  resources: readonly MirrorCompareScmResource[],
): string {
  return [
    `${operation}では一部選択項目を対象外として skip しました。`,
    ...resources.map(
      (resource) => `${resource.status}: ${resource.canonicalPath}`,
    ),
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
    return messages.baseUrlNotConfigured ?? ADD_PREFIX_INVALID_BASE_URL_MESSAGE;
  }
  if (reason === "ApiTokenNotConfigured") {
    return "GROWI API token が未設定です。先に Configure API Token を実行してください。";
  }
  if (reason === "InvalidApiToken") {
    return "GROWI API token が無効です。Configure API Token を確認してください。";
  }
  if (reason === "PermissionDenied") {
    return (
      messages.permissionDenied ??
      "GROWI へのアクセス権が不足しているか、接続先が認証を拒否しました。権限設定と API Token を確認してください。"
    );
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

async function openChangesEditor(
  deps: MirrorCommandDeps,
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

function resolveCommandUri(
  target:
    | UriLike
    | {
        uri?: UriLike;
      }
    | undefined,
): UriLike | undefined {
  if (!target) {
    return undefined;
  }
  if ("scheme" in target && "path" in target) {
    return target;
  }
  return target.uri;
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

function toGrowiPageUri(canonicalPath: string): UriLike {
  return {
    scheme: "growi",
    path: `${canonicalPath}.md`,
  };
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

function createExplorerMirrorDelegatingCommand(
  deps: MirrorCommandDeps,
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

function createExplorerBundleDelegatingCommand(
  deps: MirrorCommandDeps,
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

export function createExplorerCreateLocalMirrorForCurrentPageCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.createLocalMirrorForCurrentPage,
  );
}

export function createExplorerCreateLocalMirrorForCurrentPrefixCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
  );
}

export function createExplorerCompareLocalMirrorWithGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerMirrorDelegatingCommand(
    deps,
    GROWI_COMMANDS.compareLocalMirrorWithGrowi,
  );
}

export function createExplorerCompareLocalMirrorSubtreeWithGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.compareLocalMirrorWithGrowi,
  );
}

export function createExplorerUploadLocalMirrorToGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerMirrorDelegatingCommand(
    deps,
    GROWI_COMMANDS.uploadLocalMirrorToGrowi,
  );
}

export function createExplorerUploadLocalMirrorSubtreeToGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return createExplorerBundleDelegatingCommand(
    deps,
    GROWI_COMMANDS.uploadLocalMirrorToGrowi,
  );
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

export function createShowLocalMirrorActionsCommand(
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
          label: "現在ページをローカルに同期",
          description: SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION,
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
        },
        {
          label: "GROWIとの差分を確認",
          description: COMPARE_LOCAL_MIRROR_DESCRIPTION,
          command: GROWI_COMMANDS.compareLocalMirrorWithGrowi,
        },
        {
          label: "SCMで確認してGROWIに反映",
          description: "比較結果をSCMで確認してから反映",
          command: GROWI_COMMANDS.compareLocalMirrorWithGrowi,
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
  deps: MirrorCommandDeps,
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
    const maxPrefixPages = deps.getLocalMirrorMaxPrefixPages();
    const listedPages = await deps.listPages(input.rootCanonicalPath, {
      limit: maxPrefixPages,
    });
    if (!listedPages.ok) {
      deps.showErrorMessage(mapBundleListFailureToMessage(listedPages));
      return undefined;
    }
    pagePaths = dedupeAndSortCanonicalPaths([
      input.rootCanonicalPath,
      ...listedPages.paths,
    ]);
    if (pagePaths.length > maxPrefixPages || listedPages.hasMore) {
      deps.showErrorMessage(
        buildDownloadCurrentPageSetTooManyPagesMessage(maxPrefixPages),
      );
      return undefined;
    }
  }

  const exportedAt = new Date().toISOString();
  const pages: MirrorManifestPage[] = [];
  let previousManifest: MirrorManifest | undefined;

  try {
    for (const { manifestPath } of listMirrorManifestCandidates(
      localWorkspaceRoot,
      baseUrl,
      input.rootCanonicalPath,
    )) {
      const rawPreviousManifest = await deps.readLocalFile(manifestPath);
      const parsedPreviousManifest = parseMirrorManifest(rawPreviousManifest);
      if (parsedPreviousManifest.ok) {
        previousManifest = parsedPreviousManifest.value;
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
  deps: MirrorCommandDeps,
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
  const loaded = await lookupMirrorManifestSelection(deps, {
    requestedCanonicalPath: input.requestedCanonicalPath,
    requestedScope: input.requestedScope,
    allowAncestorReuse: input.allowAncestorReuse,
  });
  if (loaded.ok) {
    return loaded.value;
  }

  if (loaded.reason === "NoWorkspace") {
    deps.showErrorMessage(input.noWorkspaceMessage);
    return undefined;
  }
  if (loaded.reason === "BaseUrlNotConfigured") {
    deps.showErrorMessage(input.invalidBaseUrlMessage);
    return undefined;
  }
  if (loaded.reason === "InvalidManifest") {
    deps.showErrorMessage(input.invalidManifestMessage);
    return undefined;
  }
  if (loaded.reason === "BaseUrlMismatch") {
    deps.showErrorMessage(input.baseUrlMismatchMessage);
    return undefined;
  }
  if (loaded.reason === "ReusedPrefixSkipped") {
    deps.showErrorMessage(input.reusedPrefixSkippedMessage);
    return undefined;
  }
  if (!input.allowAncestorReuse) {
    deps.showErrorMessage(input.readManifestFailedMessage);
    return undefined;
  }

  deps.showErrorMessage(input.mirrorNotFoundMessage);
  return undefined;
}

async function compareMirror(
  deps: MirrorCommandDeps,
  target?: MirrorCommandTarget,
  options: {
    openChangesEditor?: boolean;
  } = {},
): Promise<BundleCompareResult[] | undefined> {
  const shouldOpenChangesEditor = options.openChangesEditor ?? true;
  const targetUri = resolveMirrorTargetUri(target) ?? deps.getActiveEditorUri();
  const requestedCanonicalPath = resolveCurrentPageCanonicalPath(targetUri);
  if (!requestedCanonicalPath) {
    deps.clearMirrorCompareSourceControlState?.();
    deps.clearMirrorCompareTreeSnapshotState?.();
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
    deps.clearMirrorCompareSourceControlState?.();
    deps.clearMirrorCompareTreeSnapshotState?.();
    return undefined;
  }

  const results: BundleCompareResult[] = [];
  const skippedDiffResults: BundleCompareResult[] = [];
  const diffResources: ChangesResourceTuple[] = [];
  const scmResources: MirrorCompareScmResource[] = [];
  for (const page of loaded.selectedPages) {
    const evaluated = await evaluateLoadedMirrorPageStatus(deps, loaded, page);
    if (!evaluated.ok) {
      deps.clearMirrorCompareSourceControlState?.();
      deps.clearMirrorCompareTreeSnapshotState?.();
      deps.showErrorMessage(
        mapReadFailureReasonToMessage(evaluated.reason, {
          apiNotSupported: DOWNLOAD_CURRENT_PAGE_SET_API_NOT_SUPPORTED_MESSAGE,
          connectionFailed: DOWNLOAD_CURRENT_PAGE_SET_CONNECTION_FAILED_MESSAGE,
          notFound: DOWNLOAD_CURRENT_PAGE_SET_NOT_FOUND_MESSAGE,
        }),
      );
      return undefined;
    }

    const result = evaluated.value.result;
    const sourceLocalFilePath = evaluated.value.localFilePath;
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
      const remoteUri = {
        scheme: "growi",
        path: `${page.canonicalPath}.md`,
      } as const;
      diffResources.push([localFileUri, remoteUri, localFileUri]);
      scmResources.push({
        canonicalPath: page.canonicalPath,
        status: result.status,
        localFileUri,
        remoteUri,
      });
    }
  }

  for (const result of results) {
    if (result.status === "MissingLocal" || result.status === "MissingRemote") {
      skippedDiffResults.push(result);
    }
  }

  if (diffResources.length === 0) {
    deps.clearMirrorCompareSourceControlState?.();
    deps.clearMirrorCompareTreeSnapshotState?.();
    if (!shouldOpenChangesEditor) {
      return results;
    }
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

  if (shouldOpenChangesEditor) {
    try {
      await openChangesEditor(
        deps,
        buildMirrorDiffTitle(loaded),
        diffResources,
      );
    } catch {
      deps.clearMirrorCompareSourceControlState?.();
      deps.clearMirrorCompareTreeSnapshotState?.();
      deps.showErrorMessage(COMPARE_LOCAL_BUNDLE_OPEN_DIFF_FAILED_MESSAGE);
      return undefined;
    }
  }

  const compareSnapshotState = {
    currentCanonicalPath: requestedCanonicalPath,
    targetScope: requestedScope,
    resources: scmResources,
  } satisfies MirrorCompareScmState;
  deps.setMirrorCompareSourceControlState?.(compareSnapshotState);
  deps.setMirrorCompareTreeSnapshotState?.(compareSnapshotState);

  if (shouldOpenChangesEditor && skippedDiffResults.length > 0) {
    deps.showWarningMessage(
      formatBundleCompareSkippedSummary(skippedDiffResults),
    );
  }
  return results;
}

function dedupeMirrorCompareScmResources(
  resources: readonly MirrorCompareScmResource[],
): MirrorCompareScmResource[] {
  const deduped = new Map<string, MirrorCompareScmResource>();
  for (const resource of resources) {
    deduped.set(`${resource.status}:${resource.canonicalPath}`, resource);
  }
  return [...deduped.values()];
}

async function takeRemoteMirrorPage(
  deps: MirrorCommandDeps,
  canonicalPath: string,
): Promise<TakeRemoteMirrorResult | undefined> {
  const loaded = await loadMirrorManifest(deps, {
    requestedCanonicalPath: canonicalPath,
    requestedScope: "page",
    allowAncestorReuse: true,
    noWorkspaceMessage: TAKE_REMOTE_CHANGES_NO_LOCAL_WORKSPACE_MESSAGE,
    readManifestFailedMessage: TAKE_REMOTE_CHANGES_READ_MANIFEST_FAILED_MESSAGE,
    invalidManifestMessage: TAKE_REMOTE_CHANGES_INVALID_MANIFEST_MESSAGE,
    invalidBaseUrlMessage: TAKE_REMOTE_CHANGES_INVALID_BASE_URL_MESSAGE,
    baseUrlMismatchMessage: TAKE_REMOTE_CHANGES_BASE_URL_MISMATCH_MESSAGE,
    mirrorNotFoundMessage: TAKE_REMOTE_CHANGES_MIRROR_NOT_FOUND_MESSAGE,
    reusedPrefixSkippedMessage:
      TAKE_REMOTE_CHANGES_REUSED_PREFIX_SKIPPED_MESSAGE,
  });
  if (!loaded) {
    return undefined;
  }

  const page = loaded.selectedPages.find(
    (candidate) => candidate.canonicalPath === canonicalPath,
  );
  if (!page) {
    return {
      canonicalPath,
      status: "MissingLocal",
    };
  }

  const sourceLocalFilePath = buildMirrorLocalFilePathWithInstanceKey(
    loaded.workspaceRoot,
    loaded.instanceKey,
    loaded.manifest.rootCanonicalPath,
    page.relativeFilePath,
  );
  if (deps.findOpenTextDocument(sourceLocalFilePath)?.isDirty) {
    return {
      canonicalPath: page.canonicalPath,
      status: "LocalChanged",
    };
  }

  let localBody: string;
  try {
    localBody = await deps.readLocalFile(sourceLocalFilePath);
  } catch {
    return {
      canonicalPath: page.canonicalPath,
      status: "MissingLocal",
    };
  }

  if (hashBody(localBody) !== page.contentHash) {
    return {
      canonicalPath: page.canonicalPath,
      status: "LocalChanged",
    };
  }

  const currentSnapshot = await deps.bootstrapEditSession(page.canonicalPath);
  if (!currentSnapshot.ok) {
    if (currentSnapshot.reason === "NotFound") {
      return {
        canonicalPath: page.canonicalPath,
        status: "MissingRemote",
      };
    }
    deps.showErrorMessage(
      mapSnapshotFailureToMessage(currentSnapshot, {
        apiNotSupported: TAKE_REMOTE_CHANGES_API_NOT_SUPPORTED_MESSAGE,
        connectionFailed: TAKE_REMOTE_CHANGES_CONNECTION_FAILED_MESSAGE,
        notFound: TAKE_REMOTE_CHANGES_NOT_FOUND_MESSAGE,
      }),
    );
    return undefined;
  }

  if (
    currentSnapshot.value.pageId === page.pageId &&
    currentSnapshot.value.baseRevisionId === page.baseRevisionId
  ) {
    return {
      canonicalPath: page.canonicalPath,
      status: "Unchanged",
    };
  }

  const nextExportedAt = new Date().toISOString();
  const updatedPages = loaded.manifest.pages.map((candidate) =>
    candidate.canonicalPath === page.canonicalPath
      ? {
          ...candidate,
          pageId: currentSnapshot.value.pageId,
          baseRevisionId: currentSnapshot.value.baseRevisionId,
          exportedAt: nextExportedAt,
          contentHash: hashBody(currentSnapshot.value.baseBody),
        }
      : candidate,
  );

  try {
    await deps.writeLocalFile(
      sourceLocalFilePath,
      currentSnapshot.value.baseBody,
    );
    await deps.writeLocalFile(
      loaded.manifestPath,
      serializeMirrorManifest({
        ...loaded.manifest,
        exportedAt: nextExportedAt,
        pages: updatedPages,
      }),
    );
  } catch {
    deps.showErrorMessage(TAKE_REMOTE_CHANGES_WRITE_FAILED_MESSAGE);
    return undefined;
  }

  return {
    canonicalPath: page.canonicalPath,
    status: "TakenRemote",
  };
}

async function uploadMirror(
  deps: MirrorCommandDeps,
  target?: MirrorCommandTarget,
  options: { announce?: boolean } = {},
): Promise<BundleUploadResult[] | undefined> {
  const announce = options.announce ?? true;
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
      const targetManifestPath = buildMirrorManifestFilePathWithInstanceKey(
        loaded.workspaceRoot,
        loaded.instanceKey,
        loaded.manifest.rootCanonicalPath,
      );
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
  if (!announce) {
    return results;
  }
  if (postUploadWarnings.length > 0) {
    deps.showWarningMessage([summary, ...postUploadWarnings].join("\n"));
    return results;
  }

  deps.showInformationMessage(summary);
  return results;
}

export function createLocalMirrorForCurrentPageCommand(
  deps: MirrorCommandDeps,
) {
  return async function createLocalMirrorForCurrentPage(
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

export function createCompareLocalMirrorWithGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return async function compareLocalMirrorWithGrowi(
    target?: MirrorCommandTarget,
  ): Promise<BundleCompareResult[] | undefined> {
    return await compareMirror(deps, target);
  };
}

export function createUploadLocalMirrorToGrowiCommand(deps: MirrorCommandDeps) {
  return async function uploadLocalMirrorToGrowi(
    target?: MirrorCommandTarget,
  ): Promise<BundleUploadResult[] | undefined> {
    return await uploadMirror(deps, target);
  };
}

export function createLocalMirrorForCurrentPrefixCommand(
  deps: MirrorCommandDeps,
) {
  return async function createLocalMirrorForCurrentPrefix(
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

export function createRefreshLocalMirrorCommand(deps: MirrorCommandDeps) {
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

export function createCompareLocalMirrorSubtreeWithGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return async function compareLocalMirrorSubtreeWithGrowi(
    target?: MirrorCommandTarget,
    options?: {
      openChangesEditor?: boolean;
    },
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
      options,
    );
  };
}

export function createUploadLocalMirrorSubtreeToGrowiCommand(
  deps: MirrorCommandDeps,
) {
  return async function uploadLocalMirrorSubtreeToGrowi(
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

export function createScmCompareMirrorAgainCommand(deps: MirrorCommandDeps) {
  const compareLocalMirrorSubtreeWithGrowi =
    createCompareLocalMirrorSubtreeWithGrowiCommand(deps);

  return async function scmCompareMirrorAgain(): Promise<
    BundleCompareResult[] | undefined
  > {
    const currentState = deps.getMirrorCompareSourceControlState?.();
    if (!currentState) {
      deps.showInformationMessage(SCM_COMPARE_AGAIN_NO_STATE_MESSAGE);
      return undefined;
    }

    return await compareLocalMirrorSubtreeWithGrowi({
      uri: toGrowiPageUri(currentState.currentCanonicalPath),
      scope: currentState.targetScope,
    });
  };
}

export function createScmUploadMirrorResourcesCommand(deps: MirrorCommandDeps) {
  return async function scmUploadMirrorResources(
    resources?: readonly MirrorCompareScmResource[],
  ): Promise<BundleUploadResult[] | undefined> {
    const currentState = deps.getMirrorCompareSourceControlState?.();
    if (!resources?.length && !currentState) {
      deps.showInformationMessage(SCM_UPLOAD_LOCAL_CHANGES_NO_STATE_MESSAGE);
      return undefined;
    }

    const requestedResources = dedupeMirrorCompareScmResources(
      resources?.length
        ? resources
        : (currentState?.resources.filter(
            (resource) => resource.status === "LocalChanged",
          ) ?? []),
    );
    const skippedResources = requestedResources.filter(
      (resource) => resource.status !== "LocalChanged",
    );
    const targetResources = requestedResources.filter(
      (resource) => resource.status === "LocalChanged",
    );

    if (targetResources.length === 0) {
      if (skippedResources.length > 0) {
        deps.showWarningMessage(
          formatScmSelectionSkippedSummary("ローカルの変更", skippedResources),
        );
      } else {
        deps.showInformationMessage(SCM_UPLOAD_LOCAL_CHANGES_EMPTY_MESSAGE);
      }
      return [];
    }

    const results: BundleUploadResult[] = [];
    let aborted = false;
    for (const resource of targetResources) {
      const pageResults = await uploadMirror(
        deps,
        {
          uri: toGrowiPageUri(resource.canonicalPath),
          scope: "page",
        },
        {
          announce: false,
        },
      );
      if (!pageResults) {
        aborted = true;
        break;
      }
      results.push(...pageResults);
    }

    const summaryLines = [formatBundleUploadSummary(results)];
    if (skippedResources.length > 0) {
      summaryLines.push(
        formatScmSelectionSkippedSummary("ローカルの変更", skippedResources),
      );
    }
    if (aborted) {
      summaryLines.unshift("ローカルの変更は途中で中断しました。");
    }

    if (aborted || skippedResources.length > 0) {
      deps.showWarningMessage(summaryLines.join("\n"));
    } else {
      deps.showInformationMessage(summaryLines.join("\n"));
    }
    return results;
  };
}

export function createScmTakeRemoteMirrorResourcesCommand(
  deps: MirrorCommandDeps,
) {
  return async function scmTakeRemoteMirrorResources(
    resources?: readonly MirrorCompareScmResource[],
  ): Promise<TakeRemoteMirrorResult[] | undefined> {
    const currentState = deps.getMirrorCompareSourceControlState?.();
    if (!resources?.length && !currentState) {
      deps.showInformationMessage(SCM_TAKE_REMOTE_CHANGES_NO_STATE_MESSAGE);
      return undefined;
    }

    const requestedResources = dedupeMirrorCompareScmResources(
      resources?.length
        ? resources
        : (currentState?.resources.filter(
            (resource) => resource.status === "RemoteChanged",
          ) ?? []),
    );
    const skippedResources = requestedResources.filter(
      (resource) => resource.status !== "RemoteChanged",
    );
    const targetResources = requestedResources.filter(
      (resource) => resource.status === "RemoteChanged",
    );

    if (targetResources.length === 0) {
      if (skippedResources.length > 0) {
        deps.showWarningMessage(
          formatScmSelectionSkippedSummary("GROWI側の変更", skippedResources),
        );
      } else {
        deps.showInformationMessage(SCM_TAKE_REMOTE_CHANGES_EMPTY_MESSAGE);
      }
      return [];
    }

    const results: TakeRemoteMirrorResult[] = [];
    let aborted = false;
    for (const resource of targetResources) {
      const pageResult = await takeRemoteMirrorPage(
        deps,
        resource.canonicalPath,
      );
      if (!pageResult) {
        aborted = true;
        break;
      }
      results.push(pageResult);
    }

    const summaryLines = [formatTakeRemoteSummary(results)];
    if (skippedResources.length > 0) {
      summaryLines.push(
        formatScmSelectionSkippedSummary("GROWI側の変更", skippedResources),
      );
    }
    if (aborted) {
      summaryLines.unshift("GROWI側の変更は途中で中断しました。");
    }

    if (aborted || skippedResources.length > 0) {
      deps.showWarningMessage(summaryLines.join("\n"));
    } else {
      deps.showInformationMessage(summaryLines.join("\n"));
    }
    return results;
  };
}

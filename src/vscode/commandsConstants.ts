export const GROWI_COMMANDS = {
  configureBaseUrl: "growi.configureBaseUrl",
  configureApiToken: "growi.configureApiToken",
  openReadme: "growi.openReadme",
  addPrefix: "growi.addPrefix",
  addCurrentPageBookmark: "growi.addCurrentPageBookmark",
  createPage: "growi.createPage",
  deletePage: "growi.deletePage",
  removeCurrentPageBookmark: "growi.removeCurrentPageBookmark",
  renamePage: "growi.renamePage",
  clearPrefixes: "growi.clearPrefixes",
  deletePrefix: "growi.deletePrefix",
  openPage: "growi.openPage",
  openPrefixRootPage: "growi.openPrefixRootPage",
  openDirectoryPage: "growi.openDirectoryPage",
  explorerOpenPageItem: "growi.explorerOpenPageItem",
  explorerOpenPageInBrowser: "growi.explorerOpenPageInBrowser",
  explorerCreatePageHere: "growi.explorerCreatePageHere",
  explorerRenamePage: "growi.explorerRenamePage",
  explorerDeletePage: "growi.explorerDeletePage",
  explorerRefreshCurrentPage: "growi.explorerRefreshCurrentPage",
  explorerShowBacklinks: "growi.explorerShowBacklinks",
  explorerShowCurrentPageInfo: "growi.explorerShowCurrentPageInfo",
  explorerShowCurrentPageAttachments:
    "growi.explorerShowCurrentPageAttachments",
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
  startEdit: "growi.startEdit",
  endEdit: "growi.endEdit",
  showCurrentPageActions: "growi.showCurrentPageActions",
  openCurrentPageHub: "growi.openCurrentPageHub",
  showLocalMirrorActions: "growi.showLocalMirrorActions",
  refreshCurrentPage: "growi.refreshCurrentPage",
  refreshListing: "growi.refreshListing",
  clearRuntimeLogs: "growi.clearRuntimeLogs",
  revealRuntimeLogs: "growi.revealRuntimeLogs",
  showBookmarks: "growi.showBookmarks",
  createLocalMirrorForCurrentPage: "growi.createLocalMirrorForCurrentPage",
  createLocalMirrorForCurrentPrefix: "growi.createLocalMirrorForCurrentPrefix",
  refreshLocalMirror: "growi.refreshLocalMirror",
  compareLocalMirrorWithGrowi: "growi.compareLocalMirrorWithGrowi",
  uploadLocalMirrorToGrowi: "growi.uploadLocalMirrorToGrowi",
  scmCompareMirrorAgain: "growi.scmCompareMirrorAgain",
  scmCheckRemoteMetadata: "growi.scmCheckRemoteMetadata",
  scmUploadMirrorResources: "growi.scmUploadMirrorResources",
  scmTakeRemoteMirrorResources: "growi.scmTakeRemoteMirrorResources",
  showCurrentPageInfo: "growi.showCurrentPageInfo",
  showCurrentPageAttachments: "growi.showCurrentPageAttachments",
  showBacklinks: "growi.showBacklinks",
  showRevisionHistoryDiff: "growi.showRevisionHistoryDiff",
} as const;

export const GROWI_SECRET_KEYS = {
  apiToken: "growi.apiToken",
} as const;

export const GROWI_README_URI = "growi-readme:/README.md";

export const OPEN_CURRENT_PAGE_HUB_PLACEHOLDER =
  "ページ詳細で確認する項目を選択してください。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_PLACEHOLDER =
  "添付一覧からブラウザで表示する添付を選択してください。";
export const SHOW_CURRENT_PAGE_ACTIONS_PLACEHOLDER =
  "現在ページに対して実行する操作を選択してください。";
export const SHOW_REVISION_HISTORY_DIFF_REVISION_PLACEHOLDER =
  "比較したい revision を選択してください。";
export const OPEN_PAGE_QUICK_PICK_PLACEHOLDER =
  "登録済み Prefix 配下からページを絞り込んで選択してください。";
export const OPEN_PAGE_DIRECT_INPUT_LABEL = "URL / path を直接入力";
export const OPEN_PAGE_DIRECT_INPUT_DESCRIPTION =
  "候補に無いページは直接入力で開きます。";
export const OPEN_PAGE_BOUNDED_SEARCH_DETAIL =
  "登録済み Prefix 配下の一部候補です。";
export const SHOW_BOOKMARKS_PLACEHOLDER =
  "ブックマークからページを選択してください。";
export const SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX = "追加日時:";
export const SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX = "状態: prefix未登録";
export const SHOW_BOOKMARKS_STATUS_UNRESOLVABLE = "状態: 開けない";
export const SHOW_LOCAL_ROUND_TRIP_ACTIONS_PLACEHOLDER =
  "ローカルミラーに対して実行する操作を選択してください。";
export const SHOW_BACKLINKS_PLACEHOLDER_NORMAL =
  "登録済み Prefix 配下を検索しました。";
export const SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX =
  "登録済み Prefix 配下の一部のみ走査済みです。";
export const SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION =
  "mirror が無ければ作成、あれば更新";
export const COMPARE_LOCAL_MIRROR_DESCRIPTION = "mirror manifest を使用";

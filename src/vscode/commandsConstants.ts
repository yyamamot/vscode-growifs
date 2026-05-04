import { localize } from "./l10n";

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
  installLlmSkillPack: "growi.installLlmSkillPack",
  startLlmEditSession: "growi.startLlmEditSession",
  createLlmLocalMirrorDiffContext: "growi.createLlmLocalMirrorDiffContext",
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

export const OPEN_CURRENT_PAGE_HUB_PLACEHOLDER = localize(
  "Select an item to inspect in Page Details.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_PLACEHOLDER = localize(
  "Select an attachment to open in the browser.",
);
export const SHOW_CURRENT_PAGE_ACTIONS_PLACEHOLDER = localize(
  "Select an action for the current page.",
);
export const SHOW_REVISION_HISTORY_DIFF_REVISION_PLACEHOLDER = localize(
  "Select a revision to compare.",
);
export const OPEN_PAGE_QUICK_PICK_PLACEHOLDER = localize(
  "Filter and select a page under a registered prefix.",
);
export const OPEN_PAGE_DIRECT_INPUT_LABEL = localize(
  "Enter URL / path directly",
);
export const OPEN_PAGE_DIRECT_INPUT_DESCRIPTION = localize(
  "Open a page not shown in the candidates by direct input.",
);
export const OPEN_PAGE_BOUNDED_SEARCH_DETAIL = localize(
  "Partial candidates under registered prefixes.",
);
export const SHOW_BOOKMARKS_PLACEHOLDER = localize(
  "Select a page from bookmarks.",
);
export const SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX = localize("Added:");
export const SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX = localize(
  "Status: prefix not registered",
);
export const SHOW_BOOKMARKS_STATUS_UNRESOLVABLE = localize(
  "Status: cannot open",
);
export const SHOW_LOCAL_ROUND_TRIP_ACTIONS_PLACEHOLDER = localize(
  "Select an action for the local mirror.",
);
export const SHOW_BACKLINKS_PLACEHOLDER_NORMAL = localize(
  "Searched under registered prefixes.",
);
export const SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX = localize(
  "Only part of the registered prefixes has been scanned.",
);
export const SYNC_LOCAL_MIRROR_SUCCESS_DESCRIPTION = localize(
  "Create the mirror if missing, otherwise update it",
);
export const COMPARE_LOCAL_MIRROR_DESCRIPTION = localize("Use mirror manifest");

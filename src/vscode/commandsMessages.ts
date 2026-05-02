export const REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE =
  "Refresh Current Page は growi: ページでのみ実行できます。";
export const REFRESH_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE =
  "未保存の変更があるため Refresh Current Page を実行できません。先に保存または End Edit を実行してください。";
export const REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Refresh Current Page を実行できませんでした。";
export const REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため Refresh Current Page を実行できませんでした。";
export const REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Refresh Current Page を実行できませんでした。";
export const REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE =
  "Refresh Current Page の再読込に失敗しました。";
export const START_EDIT_INVALID_TARGET_MESSAGE =
  "Start Edit は growi: ページでのみ実行できます。";
export const END_EDIT_INVALID_TARGET_MESSAGE =
  "End Edit は growi: ページでのみ実行できます。";
export const START_EDIT_API_NOT_SUPPORTED_MESSAGE =
  "編集開始 API が未対応のため Start Edit を実行できません。";
export const START_EDIT_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Start Edit を実行できませんでした。";
export const START_EDIT_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Start Edit を実行できませんでした。";
export const REFRESH_LISTING_INVALID_TARGET_MESSAGE =
  "Refresh Listing は growi: ディレクトリでのみ実行できます。";
export const REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE =
  "一覧取得 API が未対応のため Refresh Listing を実行できませんでした。";
export const REFRESH_LISTING_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Refresh Listing を実行できませんでした。";
export const REFRESH_LISTING_UNEXPECTED_ERROR_MESSAGE =
  "Refresh Listing の再読込に失敗しました。";
export const ADD_PREFIX_INVALID_BASE_URL_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
export const ADD_PREFIX_INVALID_PATH_MESSAGE =
  "Prefix には先頭 / 付きのページパスを入力してください。";
export const ADD_PREFIX_INVALID_INPUT_MESSAGE =
  "Prefix には先頭 / 付き canonical path または same-instance idurl を入力してください。";
export const ADD_PREFIX_DUPLICATE_MESSAGE =
  "指定した Prefix は既に登録済みです。Explorer 表示を再同期しました。";
export const ADD_PREFIX_ANCESTOR_CONFLICT_MESSAGE =
  "指定した Prefix は既存 Prefix の祖先です。より具体的な Prefix を指定してください。";
export const ADD_PREFIX_DESCENDANT_CONFLICT_MESSAGE =
  "指定した Prefix は既存 Prefix の子孫です。既存 Prefix と重複しない Prefix を指定してください。";
export const ADD_PREFIX_NOT_FOUND_MESSAGE =
  "指定した idurl に対応するページが見つかりませんでした。";
export const ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE =
  "pageId 解決 API が未対応のため Prefix を追加できませんでした。";
export const ADD_PREFIX_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Prefix を追加できませんでした。";
export const CREATE_PAGE_INVALID_PATH_MESSAGE =
  "Create Page には先頭 / 付きのページパスを入力してください。";
export const CREATE_PAGE_ALREADY_EXISTS_MESSAGE =
  "指定した path のページは既に存在します。";
export const CREATE_PAGE_PARENT_NOT_FOUND_MESSAGE =
  "指定した親ページが見つからないため Create Page を実行できませんでした。";
export const CREATE_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ作成 API が未対応のため Create Page を実行できませんでした。";
export const CREATE_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Create Page を実行できませんでした。";
export const DELETE_PAGE_INVALID_TARGET_MESSAGE =
  "Delete Page は現在開いている growi: ページでのみ実行できます。";
export const DELETE_PAGE_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため Delete Page を実行できません。ページを開き直して再実行してください。";
export const DELETE_PAGE_DIRTY_MESSAGE =
  "未保存の変更があるため Delete Page を実行できません。先に保存してください。";
export const DELETE_PAGE_HAS_CHILDREN_MESSAGE =
  "子ページがあるためこのページのみは削除できません。配下も含めて削除してください。";
export const DELETE_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Delete Page を実行できませんでした。";
export const DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ削除 API が未対応のため Delete Page を実行できませんでした。";
export const DELETE_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Delete Page を実行できませんでした。";
export const DELETE_PAGE_CLOSE_FAILED_WARNING_MESSAGE =
  "Delete Page は成功しましたが、一部ページタブを閉じられませんでした。手動で閉じてください。";
export const RENAME_PAGE_INVALID_TARGET_MESSAGE =
  "Rename Page は現在開いている growi: ページでのみ実行できます。";
export const RENAME_PAGE_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため Rename Page を実行できません。ページを開き直して再実行してください。";
export const RENAME_PAGE_DIRTY_MESSAGE =
  "未保存の変更があるため Rename Page を実行できません。先に保存してください。";
export const RENAME_PAGE_INVALID_PATH_MESSAGE =
  "Rename Page には先頭 / 付きのページパスを入力してください。";
export const RENAME_PAGE_SAME_PATH_MESSAGE =
  "現在の path と同じため Rename Page は実行しませんでした。";
export const RENAME_PAGE_DESCENDANT_PATH_MESSAGE =
  "現在ページ配下の path へは Rename Page を実行できません。別の path を入力してください。";
export const RENAME_PAGE_ALREADY_EXISTS_MESSAGE =
  "同じ path のページが既に存在します。";
export const RENAME_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため Rename Page を実行できませんでした。";
export const RENAME_PAGE_PARENT_NOT_FOUND_MESSAGE =
  "指定した親ページが見つからないため Rename Page を実行できませんでした。";
export const RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "ページ名変更 API が未対応のため Rename Page を実行できませんでした。";
export const RENAME_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Rename Page を実行できませんでした。";
export const RENAME_PAGE_REOPEN_DIRTY_WARNING_MESSAGE =
  "Rename Page は成功しましたが、未保存変更のあるページは自動で開き直しませんでした。新しい path を開き直してください。";
export const RENAME_PAGE_REOPEN_FAILED_WARNING_MESSAGE =
  "Rename Page は成功しましたが、一部ページの開き直しに失敗しました。新しい path を開き直してください。";
export const CLEAR_PREFIXES_NO_TARGET_MESSAGE =
  "現在の接続先に削除対象の Prefix はありません。";
export const CLEAR_PREFIXES_SUCCESS_MESSAGE =
  "現在の接続先に登録された GROWI Prefix を削除しました。";
export const DELETE_PREFIX_INVALID_TARGET_MESSAGE =
  "削除対象の Prefix root ではありません。";
export const DELETE_PREFIX_NO_TARGET_MESSAGE =
  "対象 Prefix は登録されていません。";
export const DELETE_PREFIX_SUCCESS_MESSAGE = "対象 Prefix を削除しました。";
export const GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE =
  "GROWI base URL が未設定です。先に Configure Base URL を実行してください。";
export const GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE =
  "GROWI API token が未設定です。先に Configure API Token を実行してください。";
export const GENERIC_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効です。Configure API Token を確認してください。";
export const GENERIC_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否しました。権限設定と API Token を確認してください。";
export const OPEN_PAGE_NOT_FOUND_MESSAGE =
  "対象ページが見つからないため GROWI ページを開けませんでした。";
export const OPEN_PAGE_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効なため GROWI ページを開けませんでした。Configure API Token を確認してください。";
export const OPEN_PAGE_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため GROWI ページを開けませんでした。権限設定と API Token を確認してください。";
export const OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE =
  "本文取得 API が未対応のため GROWI ページを開けませんでした。";
export const OPEN_PAGE_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため GROWI ページを開けませんでした。";
export const OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE =
  "GROWI ページを開けませんでした。";
export const OPEN_PREFIX_ROOT_PAGE_INVALID_TARGET_MESSAGE =
  "Open Prefix Root Page は登録済み Prefix root でのみ実行できます。";
export const OPEN_DIRECTORY_PAGE_INVALID_TARGET_MESSAGE =
  "Open Directory Page は実ページを持つ growi: ディレクトリでのみ実行できます。";
export const EXPLORER_OPEN_PAGE_IN_BROWSER_INVALID_TARGET_MESSAGE =
  "ブラウザで表示 は growi: ページ、growi: ディレクトリページ、growi: prefix root でのみ実行できます。";
export const SHOW_CURRENT_PAGE_INFO_INVALID_TARGET_MESSAGE =
  "Show Current Page Info は growi: ページでのみ実行できます。";
export const OPEN_CURRENT_PAGE_HUB_INVALID_TARGET_MESSAGE =
  "ページ詳細は growi: ページでのみ開けます。";
export const SHOW_CURRENT_PAGE_INFO_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できませんでした。ページを開き直して再実行してください。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_INVALID_TARGET_MESSAGE =
  "添付一覧は growi: ページまたは growi: ディレクトリページでのみ実行できます。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため添付一覧を表示できません。ページを開き直して再実行してください。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_LIST_API_NOT_SUPPORTED_MESSAGE =
  "添付一覧 API が未対応のため添付一覧を表示できません。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため添付一覧を表示できませんでした。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_NO_ATTACHMENTS_MESSAGE =
  "現在ページに添付はありません。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_NO_OPENABLE_ATTACHMENTS_MESSAGE =
  "ブラウザで表示できる添付はありません。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_CANCELED_MESSAGE =
  "添付一覧の表示をキャンセルしました。";
export const SHOW_CURRENT_PAGE_ATTACHMENTS_OPEN_FAILED_MESSAGE =
  "添付のブラウザ表示に失敗しました。";
export const SHOW_CURRENT_PAGE_ACTIONS_INVALID_TARGET_MESSAGE =
  "現在ページメニューは growi: ページでのみ実行できます。";
export const ADD_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE =
  "Add Current Page to Bookmarks は growi: ページでのみ実行できます。";
export const ADD_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE =
  "現在ページをブックマークに追加しました。";
export const ADD_CURRENT_PAGE_BOOKMARK_DUPLICATE_MESSAGE =
  "現在ページは既にブックマーク済みです。";
export const REMOVE_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE =
  "Remove Current Page from Bookmarks は growi: ページでのみ実行できます。";
export const REMOVE_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE =
  "ブックマークから削除しました。";
export const REMOVE_CURRENT_PAGE_BOOKMARK_NOT_FOUND_MESSAGE =
  "対象ページはブックマークされていません。";
export const SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE =
  "Show Revision History Diff は growi: ページでのみ実行できます。";
export const SHOW_REVISION_HISTORY_DIFF_UNAVAILABLE_MESSAGE =
  "現在ページメタ情報を取得できないため履歴差分を実行できません。ページを開き直して再実行してください。";
export const SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE =
  "revision 一覧 API が未対応のため履歴差分を実行できません。";
export const SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE =
  "revision 本文取得 API が未対応のため履歴差分を実行できません。";
export const SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため履歴差分を実行できませんでした。";
export const SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE =
  "比較可能な revision が不足しているため履歴差分を表示できません。";
export const SHOW_REVISION_HISTORY_DIFF_OPEN_DIFF_FAILED_MESSAGE =
  "履歴差分ビューを開けませんでした。";
export const SHOW_BOOKMARKS_EMPTY_MESSAGE =
  "ブックマークはありません。現在ページで Add Current Page to Bookmarks を実行してください。";
export const SHOW_BACKLINKS_INVALID_TARGET_MESSAGE =
  "Show Backlinks は growi: ページでのみ実行できます。";
export const SHOW_BACKLINKS_NO_PREFIX_MESSAGE =
  "Backlinks の対象 Prefix がありません。先に Add Prefix を実行してください。";
export const SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE =
  "Backlinks は見つかりませんでした。";
export const SHOW_BACKLINKS_PARTIAL_EMPTY_RESULT_PREFIX =
  "Backlinks は見つかりませんでした。一部のみ走査済みです。";
export const SHOW_BACKLINKS_BASE_URL_NOT_CONFIGURED_MESSAGE =
  "GROWI base URL が未設定のため Backlinks を実行できません。先に Configure Base URL を実行してください。";
export const SHOW_BACKLINKS_API_TOKEN_NOT_CONFIGURED_MESSAGE =
  "GROWI API token が未設定のため Backlinks を実行できません。先に Configure API Token を実行してください。";
export const SHOW_BACKLINKS_INVALID_API_TOKEN_MESSAGE =
  "GROWI API token が無効なため Backlinks を実行できません。Configure API Token を確認してください。";
export const SHOW_BACKLINKS_PERMISSION_DENIED_MESSAGE =
  "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため Backlinks を実行できませんでした。権限設定と API Token を確認してください。";
export const SHOW_BACKLINKS_LIST_API_NOT_SUPPORTED_MESSAGE =
  "Backlinks の対象一覧 API が未対応のため実行できません。";
export const SHOW_BACKLINKS_READ_API_NOT_SUPPORTED_MESSAGE =
  "Backlinks の本文取得 API が未対応のため実行できません。";
export const SHOW_BACKLINKS_CONNECTION_FAILED_MESSAGE =
  "GROWI への接続に失敗したため Backlinks を実行できませんでした。";
export const SHOW_BACKLINKS_UNEXPECTED_ERROR_MESSAGE =
  "Backlinks の取得に失敗しました。";

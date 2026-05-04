import { localize } from "./l10n";

export const REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE = localize(
  "Refresh Current Page can only run on growi: pages.",
);
export const REFRESH_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE = localize(
  "Cannot run Refresh Current Page because there are unsaved changes. Save or run End Edit first.",
);
export const REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE = localize(
  "Cannot run Refresh Current Page because the target page was not found.",
);
export const REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Refresh Current Page because the body fetch API is not supported.",
);
export const REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Refresh Current Page because the connection to GROWI failed.",
);
export const REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE = localize(
  "Refresh Current Page reload failed.",
);
export const START_EDIT_INVALID_TARGET_MESSAGE = localize(
  "Start Edit can only run on growi: pages.",
);
export const END_EDIT_INVALID_TARGET_MESSAGE = localize(
  "End Edit can only run on growi: pages.",
);
export const START_EDIT_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Start Edit because the edit start API is not supported.",
);
export const START_EDIT_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Start Edit because the connection to GROWI failed.",
);
export const START_EDIT_NOT_FOUND_MESSAGE = localize(
  "Cannot run Start Edit because the target page was not found.",
);
export const REFRESH_LISTING_INVALID_TARGET_MESSAGE = localize(
  "Refresh Listing can only run on growi: directories.",
);
export const REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Refresh Listing because the list API is not supported.",
);
export const REFRESH_LISTING_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Refresh Listing because the connection to GROWI failed.",
);
export const REFRESH_LISTING_UNEXPECTED_ERROR_MESSAGE = localize(
  "Refresh Listing reload failed.",
);
export const ADD_PREFIX_INVALID_BASE_URL_MESSAGE = localize(
  "GROWI base URL is not configured. Run Configure Base URL first.",
);
export const ADD_PREFIX_INVALID_PATH_MESSAGE = localize(
  "Enter a page path starting with / for Prefix.",
);
export const ADD_PREFIX_INVALID_INPUT_MESSAGE = localize(
  "Enter a canonical path starting with / or a same-instance idurl for Prefix.",
);
export const ADD_PREFIX_DUPLICATE_MESSAGE = localize(
  "The specified prefix is already registered. Synced the Explorer view again.",
);
export const ADD_PREFIX_ANCESTOR_CONFLICT_MESSAGE = localize(
  "The specified prefix is an ancestor of an existing prefix. Specify a more specific prefix.",
);
export const ADD_PREFIX_DESCENDANT_CONFLICT_MESSAGE = localize(
  "The specified prefix is a descendant of an existing prefix. Specify a prefix that does not overlap existing prefixes.",
);
export const ADD_PREFIX_NOT_FOUND_MESSAGE = localize(
  "No page was found for the specified idurl.",
);
export const ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE = localize(
  "Could not add the prefix because the pageId resolution API is not supported.",
);
export const ADD_PREFIX_CONNECTION_FAILED_MESSAGE = localize(
  "Could not add the prefix because the connection to GROWI failed.",
);
export const CREATE_PAGE_INVALID_PATH_MESSAGE = localize(
  "Enter a page path starting with / for Create Page.",
);
export const CREATE_PAGE_ALREADY_EXISTS_MESSAGE = localize(
  "A page with the specified path already exists.",
);
export const CREATE_PAGE_PARENT_NOT_FOUND_MESSAGE = localize(
  "Cannot run Create Page because the specified parent page was not found.",
);
export const CREATE_PAGE_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Create Page because the page creation API is not supported.",
);
export const CREATE_PAGE_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Create Page because the connection to GROWI failed.",
);
export const DELETE_PAGE_INVALID_TARGET_MESSAGE = localize(
  "Delete Page can only run on the currently open growi: page.",
);
export const DELETE_PAGE_UNAVAILABLE_MESSAGE = localize(
  "Cannot run Delete Page because current page metadata could not be retrieved. Reopen the page and try again.",
);
export const DELETE_PAGE_DIRTY_MESSAGE = localize(
  "Cannot run Delete Page because there are unsaved changes. Save first.",
);
export const DELETE_PAGE_HAS_CHILDREN_MESSAGE = localize(
  "This page has child pages, so this page alone cannot be deleted. Delete child pages too.",
);
export const DELETE_PAGE_NOT_FOUND_MESSAGE = localize(
  "Cannot run Delete Page because the target page was not found.",
);
export const DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Delete Page because the page deletion API is not supported.",
);
export const DELETE_PAGE_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Delete Page because the connection to GROWI failed.",
);
export const DELETE_PAGE_CLOSE_FAILED_WARNING_MESSAGE = localize(
  "Delete Page succeeded, but some page tabs could not be closed. Close them manually.",
);
export const RENAME_PAGE_INVALID_TARGET_MESSAGE = localize(
  "Rename Page can only run on the currently open growi: page.",
);
export const RENAME_PAGE_UNAVAILABLE_MESSAGE = localize(
  "Cannot run Rename Page because current page metadata could not be retrieved. Reopen the page and try again.",
);
export const RENAME_PAGE_DIRTY_MESSAGE = localize(
  "Cannot run Rename Page because there are unsaved changes. Save first.",
);
export const RENAME_PAGE_INVALID_PATH_MESSAGE = localize(
  "Enter a page path starting with / for Rename Page.",
);
export const RENAME_PAGE_SAME_PATH_MESSAGE = localize(
  "Rename Page was not run because it is the same as the current path.",
);
export const RENAME_PAGE_DESCENDANT_PATH_MESSAGE = localize(
  "Cannot run Rename Page to a path under the current page. Enter a different path.",
);
export const RENAME_PAGE_ALREADY_EXISTS_MESSAGE = localize(
  "A page with the same path already exists.",
);
export const RENAME_PAGE_NOT_FOUND_MESSAGE = localize(
  "Cannot run Rename Page because the target page was not found.",
);
export const RENAME_PAGE_PARENT_NOT_FOUND_MESSAGE = localize(
  "Cannot run Rename Page because the specified parent page was not found.",
);
export const RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Rename Page because the page rename API is not supported.",
);
export const RENAME_PAGE_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Rename Page because the connection to GROWI failed.",
);
export const RENAME_PAGE_REOPEN_DIRTY_WARNING_MESSAGE = localize(
  "Rename Page succeeded, but pages with unsaved changes were not reopened automatically. Open the new path manually.",
);
export const RENAME_PAGE_REOPEN_FAILED_WARNING_MESSAGE = localize(
  "Rename Page succeeded, but some pages could not be reopened. Open the new path manually.",
);
export const CLEAR_PREFIXES_NO_TARGET_MESSAGE = localize(
  "There are no prefixes to delete on the current target.",
);
export const CLEAR_PREFIXES_SUCCESS_MESSAGE = localize(
  "Deleted the GROWI prefix registered on the current target.",
);
export const DELETE_PREFIX_INVALID_TARGET_MESSAGE = localize(
  "This is not the prefix root to delete.",
);
export const DELETE_PREFIX_NO_TARGET_MESSAGE = localize(
  "The target prefix is not registered.",
);
export const DELETE_PREFIX_SUCCESS_MESSAGE = localize(
  "Deleted the target prefix.",
);
export const GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE = localize(
  "GROWI base URL is not configured. Run Configure Base URL first.",
);
export const GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE = localize(
  "GROWI API token is not configured. Run Configure API Token first.",
);
export const GENERIC_INVALID_API_TOKEN_MESSAGE = localize(
  "GROWI API token is invalid. Check Configure API Token.",
);
export const GENERIC_PERMISSION_DENIED_MESSAGE = localize(
  "GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
);
export const OPEN_PAGE_NOT_FOUND_MESSAGE = localize(
  "Could not open the GROWI page because the target page was not found.",
);
export const OPEN_PAGE_INVALID_API_TOKEN_MESSAGE = localize(
  "Could not open the GROWI page because the GROWI API token is invalid. Check Configure API Token.",
);
export const OPEN_PAGE_PERMISSION_DENIED_MESSAGE = localize(
  "Could not open the GROWI page because GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
);
export const OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE = localize(
  "Could not open the GROWI page because the body fetch API is not supported.",
);
export const OPEN_PAGE_CONNECTION_FAILED_MESSAGE = localize(
  "Could not open the GROWI page because the connection to GROWI failed.",
);
export const OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE = localize(
  "Could not open the GROWI page.",
);
export const OPEN_PREFIX_ROOT_PAGE_INVALID_TARGET_MESSAGE = localize(
  "Open Prefix Root Page can only run on registered prefix roots.",
);
export const OPEN_DIRECTORY_PAGE_INVALID_TARGET_MESSAGE = localize(
  "Open Directory Page can only run on growi: directories with an actual page.",
);
export const EXPLORER_OPEN_PAGE_IN_BROWSER_INVALID_TARGET_MESSAGE = localize(
  "Open in Browser can only run on growi: pages, growi: directory pages, or growi: prefix roots.",
);
export const SHOW_CURRENT_PAGE_INFO_INVALID_TARGET_MESSAGE = localize(
  "Show Current Page Info can only run on growi: pages.",
);
export const OPEN_CURRENT_PAGE_HUB_INVALID_TARGET_MESSAGE = localize(
  "Page Details can only open for growi: pages.",
);
export const SHOW_CURRENT_PAGE_INFO_UNAVAILABLE_MESSAGE = localize(
  "Could not retrieve current page metadata. Reopen the page and try again.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_INVALID_TARGET_MESSAGE = localize(
  "Attachments can only run on growi: pages or growi: directory pages.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_UNAVAILABLE_MESSAGE = localize(
  "Cannot show attachments because current page metadata could not be retrieved. Reopen the page and try again.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_LIST_API_NOT_SUPPORTED_MESSAGE =
  localize(
    "Cannot show attachments because the attachment list API is not supported.",
  );
export const SHOW_CURRENT_PAGE_ATTACHMENTS_CONNECTION_FAILED_MESSAGE = localize(
  "Could not show attachments because the connection to GROWI failed.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_NO_ATTACHMENTS_MESSAGE = localize(
  "No attachments on the current page.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_NO_OPENABLE_ATTACHMENTS_MESSAGE =
  localize("No attachments can be opened in the browser.");
export const SHOW_CURRENT_PAGE_ATTACHMENTS_CANCELED_MESSAGE = localize(
  "Canceled showing attachments.",
);
export const SHOW_CURRENT_PAGE_ATTACHMENTS_OPEN_FAILED_MESSAGE = localize(
  "Failed to open the attachment in the browser.",
);
export const SHOW_CURRENT_PAGE_ACTIONS_INVALID_TARGET_MESSAGE = localize(
  "The current page menu can only run on growi: pages.",
);
export const ADD_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE = localize(
  "Add Current Page to Bookmarks can only run on growi: pages.",
);
export const ADD_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE = localize(
  "Added the current page to bookmarks.",
);
export const ADD_CURRENT_PAGE_BOOKMARK_DUPLICATE_MESSAGE = localize(
  "The current page is already bookmarked.",
);
export const REMOVE_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE = localize(
  "Remove Current Page from Bookmarks can only run on growi: pages.",
);
export const REMOVE_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE = localize(
  "Removed from bookmarks.",
);
export const REMOVE_CURRENT_PAGE_BOOKMARK_NOT_FOUND_MESSAGE = localize(
  "The target page is not bookmarked.",
);
export const SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE = localize(
  "Show Revision History Diff can only run on growi: pages.",
);
export const SHOW_REVISION_HISTORY_DIFF_UNAVAILABLE_MESSAGE = localize(
  "Cannot run revision diff because current page metadata could not be retrieved. Reopen the page and try again.",
);
export const SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE =
  localize(
    "Cannot run revision diff because the revision list API is not supported.",
  );
export const SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE =
  localize(
    "Cannot run revision diff because the revision body API is not supported.",
  );
export const SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE = localize(
  "Could not run revision diff because the connection to GROWI failed.",
);
export const SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE =
  localize(
    "Cannot show revision diff because there are not enough comparable revisions.",
  );
export const SHOW_REVISION_HISTORY_DIFF_OPEN_DIFF_FAILED_MESSAGE = localize(
  "Could not open the revision diff view.",
);
export const SHOW_BOOKMARKS_EMPTY_MESSAGE = localize(
  "No bookmarks. Run Add Current Page to Bookmarks on the current page.",
);
export const SHOW_BACKLINKS_INVALID_TARGET_MESSAGE = localize(
  "Show Backlinks can only run on growi: pages.",
);
export const SHOW_BACKLINKS_NO_PREFIX_MESSAGE = localize(
  "No prefix is available for Backlinks. Run Add Prefix first.",
);
export const SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE = localize(
  "No backlinks found.",
);
export const SHOW_BACKLINKS_PARTIAL_EMPTY_RESULT_PREFIX = localize(
  "No backlinks found. Only part has been scanned.",
);
export const SHOW_BACKLINKS_BASE_URL_NOT_CONFIGURED_MESSAGE = localize(
  "Cannot run Backlinks because the GROWI base URL is not configured. Run Configure Base URL first.",
);
export const SHOW_BACKLINKS_API_TOKEN_NOT_CONFIGURED_MESSAGE = localize(
  "Cannot run Backlinks because the GROWI API token is not configured. Run Configure API Token first.",
);
export const SHOW_BACKLINKS_INVALID_API_TOKEN_MESSAGE = localize(
  "Cannot run Backlinks because the GROWI API token is invalid. Check Configure API Token.",
);
export const SHOW_BACKLINKS_PERMISSION_DENIED_MESSAGE = localize(
  "Cannot run Backlinks because GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
);
export const SHOW_BACKLINKS_LIST_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Backlinks because the list API is not supported.",
);
export const SHOW_BACKLINKS_READ_API_NOT_SUPPORTED_MESSAGE = localize(
  "Cannot run Backlinks because the body fetch API is not supported.",
);
export const SHOW_BACKLINKS_CONNECTION_FAILED_MESSAGE = localize(
  "Cannot run Backlinks because the connection to GROWI failed.",
);
export const SHOW_BACKLINKS_UNEXPECTED_ERROR_MESSAGE = localize(
  "Failed to fetch backlinks.",
);

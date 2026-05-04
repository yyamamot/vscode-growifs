import {
  buildGrowiUri,
  buildGrowiUriFromInput,
  normalizeCanonicalPath,
  type ParsedGrowiReference,
  parseAddPrefixInput,
  parseOpenPageInput,
} from "../core/uri";
import {
  GROWI_COMMANDS,
  GROWI_README_URI,
  GROWI_SECRET_KEYS,
  OPEN_CURRENT_PAGE_HUB_PLACEHOLDER,
  OPEN_PAGE_BOUNDED_SEARCH_DETAIL,
  OPEN_PAGE_DIRECT_INPUT_DESCRIPTION,
  OPEN_PAGE_DIRECT_INPUT_LABEL,
  OPEN_PAGE_QUICK_PICK_PLACEHOLDER,
  SHOW_BACKLINKS_PLACEHOLDER_NORMAL,
  SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX,
  SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX,
  SHOW_BOOKMARKS_PLACEHOLDER,
  SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX,
  SHOW_BOOKMARKS_STATUS_UNRESOLVABLE,
  SHOW_CURRENT_PAGE_ACTIONS_PLACEHOLDER,
  SHOW_CURRENT_PAGE_ATTACHMENTS_PLACEHOLDER,
  SHOW_REVISION_HISTORY_DIFF_REVISION_PLACEHOLDER,
} from "./commandsConstants";
import {
  ADD_CURRENT_PAGE_BOOKMARK_DUPLICATE_MESSAGE,
  ADD_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE,
  ADD_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE,
  ADD_PREFIX_ANCESTOR_CONFLICT_MESSAGE,
  ADD_PREFIX_API_NOT_SUPPORTED_MESSAGE,
  ADD_PREFIX_CONNECTION_FAILED_MESSAGE,
  ADD_PREFIX_DESCENDANT_CONFLICT_MESSAGE,
  ADD_PREFIX_DUPLICATE_MESSAGE,
  ADD_PREFIX_INVALID_BASE_URL_MESSAGE,
  ADD_PREFIX_INVALID_INPUT_MESSAGE,
  ADD_PREFIX_INVALID_PATH_MESSAGE,
  ADD_PREFIX_NOT_FOUND_MESSAGE,
  CLEAR_PREFIXES_NO_TARGET_MESSAGE,
  CLEAR_PREFIXES_SUCCESS_MESSAGE,
  CREATE_PAGE_ALREADY_EXISTS_MESSAGE,
  CREATE_PAGE_API_NOT_SUPPORTED_MESSAGE,
  CREATE_PAGE_CONNECTION_FAILED_MESSAGE,
  CREATE_PAGE_INVALID_PATH_MESSAGE,
  CREATE_PAGE_PARENT_NOT_FOUND_MESSAGE,
  DELETE_PAGE_API_NOT_SUPPORTED_MESSAGE,
  DELETE_PAGE_CLOSE_FAILED_WARNING_MESSAGE,
  DELETE_PAGE_CONNECTION_FAILED_MESSAGE,
  DELETE_PAGE_DIRTY_MESSAGE,
  DELETE_PAGE_HAS_CHILDREN_MESSAGE,
  DELETE_PAGE_INVALID_TARGET_MESSAGE,
  DELETE_PAGE_NOT_FOUND_MESSAGE,
  DELETE_PAGE_UNAVAILABLE_MESSAGE,
  DELETE_PREFIX_INVALID_TARGET_MESSAGE,
  DELETE_PREFIX_NO_TARGET_MESSAGE,
  DELETE_PREFIX_SUCCESS_MESSAGE,
  END_EDIT_INVALID_TARGET_MESSAGE,
  EXPLORER_OPEN_PAGE_IN_BROWSER_INVALID_TARGET_MESSAGE,
  GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
  GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
  GENERIC_INVALID_API_TOKEN_MESSAGE,
  GENERIC_PERMISSION_DENIED_MESSAGE,
  OPEN_CURRENT_PAGE_HUB_INVALID_TARGET_MESSAGE,
  OPEN_DIRECTORY_PAGE_INVALID_TARGET_MESSAGE,
  OPEN_PAGE_API_NOT_SUPPORTED_MESSAGE,
  OPEN_PAGE_CONNECTION_FAILED_MESSAGE,
  OPEN_PAGE_INVALID_API_TOKEN_MESSAGE,
  OPEN_PAGE_NOT_FOUND_MESSAGE,
  OPEN_PAGE_PERMISSION_DENIED_MESSAGE,
  OPEN_PAGE_UNEXPECTED_ERROR_MESSAGE,
  OPEN_PREFIX_ROOT_PAGE_INVALID_TARGET_MESSAGE,
  REFRESH_CURRENT_PAGE_API_NOT_SUPPORTED_MESSAGE,
  REFRESH_CURRENT_PAGE_CONNECTION_FAILED_MESSAGE,
  REFRESH_CURRENT_PAGE_DIRTY_EDIT_SESSION_MESSAGE,
  REFRESH_CURRENT_PAGE_INVALID_TARGET_MESSAGE,
  REFRESH_CURRENT_PAGE_NOT_FOUND_MESSAGE,
  REFRESH_CURRENT_PAGE_UNEXPECTED_ERROR_MESSAGE,
  REFRESH_LISTING_API_NOT_SUPPORTED_MESSAGE,
  REFRESH_LISTING_CONNECTION_FAILED_MESSAGE,
  REFRESH_LISTING_INVALID_TARGET_MESSAGE,
  REFRESH_LISTING_UNEXPECTED_ERROR_MESSAGE,
  REMOVE_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE,
  REMOVE_CURRENT_PAGE_BOOKMARK_NOT_FOUND_MESSAGE,
  REMOVE_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE,
  RENAME_PAGE_ALREADY_EXISTS_MESSAGE,
  RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE,
  RENAME_PAGE_CONNECTION_FAILED_MESSAGE,
  RENAME_PAGE_DESCENDANT_PATH_MESSAGE,
  RENAME_PAGE_DIRTY_MESSAGE,
  RENAME_PAGE_INVALID_PATH_MESSAGE,
  RENAME_PAGE_INVALID_TARGET_MESSAGE,
  RENAME_PAGE_NOT_FOUND_MESSAGE,
  RENAME_PAGE_PARENT_NOT_FOUND_MESSAGE,
  RENAME_PAGE_REOPEN_DIRTY_WARNING_MESSAGE,
  RENAME_PAGE_REOPEN_FAILED_WARNING_MESSAGE,
  RENAME_PAGE_SAME_PATH_MESSAGE,
  RENAME_PAGE_UNAVAILABLE_MESSAGE,
  SHOW_BACKLINKS_API_TOKEN_NOT_CONFIGURED_MESSAGE,
  SHOW_BACKLINKS_BASE_URL_NOT_CONFIGURED_MESSAGE,
  SHOW_BACKLINKS_CONNECTION_FAILED_MESSAGE,
  SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE,
  SHOW_BACKLINKS_INVALID_API_TOKEN_MESSAGE,
  SHOW_BACKLINKS_INVALID_TARGET_MESSAGE,
  SHOW_BACKLINKS_LIST_API_NOT_SUPPORTED_MESSAGE,
  SHOW_BACKLINKS_NO_PREFIX_MESSAGE,
  SHOW_BACKLINKS_PARTIAL_EMPTY_RESULT_PREFIX,
  SHOW_BACKLINKS_PERMISSION_DENIED_MESSAGE,
  SHOW_BACKLINKS_READ_API_NOT_SUPPORTED_MESSAGE,
  SHOW_BACKLINKS_UNEXPECTED_ERROR_MESSAGE,
  SHOW_BOOKMARKS_EMPTY_MESSAGE,
  SHOW_CURRENT_PAGE_ACTIONS_INVALID_TARGET_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_CANCELED_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_CONNECTION_FAILED_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_INVALID_TARGET_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_LIST_API_NOT_SUPPORTED_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_NO_ATTACHMENTS_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_NO_OPENABLE_ATTACHMENTS_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_OPEN_FAILED_MESSAGE,
  SHOW_CURRENT_PAGE_ATTACHMENTS_UNAVAILABLE_MESSAGE,
  SHOW_CURRENT_PAGE_INFO_INVALID_TARGET_MESSAGE,
  SHOW_CURRENT_PAGE_INFO_UNAVAILABLE_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_CONNECTION_FAILED_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_INVALID_TARGET_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_LIST_API_NOT_SUPPORTED_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_NO_COMPARABLE_REVISIONS_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_OPEN_DIFF_FAILED_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_READ_API_NOT_SUPPORTED_MESSAGE,
  SHOW_REVISION_HISTORY_DIFF_UNAVAILABLE_MESSAGE,
  START_EDIT_API_NOT_SUPPORTED_MESSAGE,
  START_EDIT_CONNECTION_FAILED_MESSAGE,
  START_EDIT_INVALID_TARGET_MESSAGE,
  START_EDIT_NOT_FOUND_MESSAGE,
} from "./commandsMessages";

export {
  GROWI_COMMANDS,
  GROWI_SECRET_KEYS,
} from "./commandsConstants";

import type {
  AttachmentQuickPickItem,
  BacklinkQuickPickItem,
  BaseUrlResult,
  BookmarkCommandDeps,
  BookmarkListEntry,
  CommandDeps,
  CurrentPageActionQuickPickItem,
  CurrentPageCommandDeps,
  CurrentPageDetailAction,
  CurrentPageDetailSummary,
  CurrentPageDetailWebviewInput,
  DialogCommandDeps,
  EditCommandDeps,
  NavigationCommandDeps,
  OpenPageQuickPickItem,
  OpenPageSearchEntry,
  PrefixCommandDeps,
  RevisionQuickPickItem,
  StartEditBootstrapResult,
  UriLike,
} from "./commandsTypes";

export type * from "./commandsTypes";

export {
  createCompareLocalMirrorSubtreeWithGrowiCommand,
  createCompareLocalMirrorWithGrowiCommand,
  createExplorerCompareLocalMirrorSubtreeWithGrowiCommand,
  createExplorerCompareLocalMirrorWithGrowiCommand,
  createExplorerCreateLocalMirrorForCurrentPageCommand,
  createExplorerCreateLocalMirrorForCurrentPrefixCommand,
  createExplorerUploadLocalMirrorSubtreeToGrowiCommand,
  createExplorerUploadLocalMirrorToGrowiCommand,
  createLocalMirrorForCurrentPageCommand,
  createLocalMirrorForCurrentPrefixCommand,
  createRefreshLocalMirrorCommand,
  createScmCompareMirrorAgainCommand,
  createScmTakeRemoteMirrorResourcesCommand,
  createScmUploadMirrorResourcesCommand,
  createShowLocalMirrorActionsCommand,
  createUploadLocalMirrorSubtreeToGrowiCommand,
  createUploadLocalMirrorToGrowiCommand,
} from "./mirror/mirrorCommands";

import type {
  GrowiAccessFailureReason,
  GrowiPageCreateResult,
  GrowiPageDeleteResult,
  GrowiPageRenameResult,
  GrowiReadFailureReason,
} from "./fsProvider";
import type { GrowiAttachmentSummary } from "./growiApi";
import { localize } from "./l10n";
import { findBacklinks } from "./pageSearch";
import {
  buildGrowiRevisionUri,
  type GrowiRevisionReadResult,
  type GrowiRevisionSummary,
} from "./revisionModel";

type CurrentPageActionsCommandDeps = Pick<
  CurrentPageCommandDeps,
  "getActiveEditorUri" | "showErrorMessage" | "showQuickPick"
> & {
  isBookmarked?(canonicalPath: string): boolean;
  executeCommand(command: string, ...args: unknown[]): Promise<void>;
  loadPageDetailSummary?(
    canonicalPath: string,
  ): Promise<CurrentPageDetailSummary>;
  openPageDetailWebview?(input: CurrentPageDetailWebviewInput): Promise<void>;
};

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
      localize("The connected GROWI rejected the Delete Page request.")
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
      localize("The connected GROWI rejected the Rename Page request.")
    );
  }
  if (reason === "ApiNotSupported") {
    return result.message ?? RENAME_PAGE_API_NOT_SUPPORTED_MESSAGE;
  }
  return RENAME_PAGE_CONNECTION_FAILED_MESSAGE;
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
async function openResolvedGrowiPage(
  deps: NavigationCommandDeps,
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

function buildBrowserUrl(
  baseUrl: string,
  canonicalPath: string,
): string | undefined {
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return undefined;
  }

  const basePathname =
    parsedBaseUrl.pathname === "/"
      ? "/"
      : parsedBaseUrl.pathname.endsWith("/")
        ? parsedBaseUrl.pathname
        : `${parsedBaseUrl.pathname}/`;
  const canonicalSuffix = canonicalPath === "/" ? "" : canonicalPath.slice(1);
  parsedBaseUrl.pathname =
    canonicalSuffix.length === 0
      ? basePathname
      : `${basePathname}${canonicalSuffix}`;
  return parsedBaseUrl.toString();
}

function resolveAttachmentBrowserUrl(
  downloadUrl: string | undefined,
  baseUrl?: string,
): string | undefined {
  if (!downloadUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(downloadUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return undefined;
  } catch {
    // Fall through and resolve relative URLs against the configured base URL.
  }

  if (!baseUrl) {
    return undefined;
  }

  try {
    const resolved = new URL(downloadUrl, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function formatAttachmentSize(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  return `${size} bytes`;
}

function mapAttachmentSummaryToQuickPickItem(
  attachment: GrowiAttachmentSummary,
  browserUrl: string,
): AttachmentQuickPickItem {
  const details = [
    attachment.fileFormat,
    formatAttachmentSize(attachment.fileSize),
  ].filter((value): value is string => Boolean(value));
  return {
    label: attachment.originalName,
    description: details.length > 0 ? details.join(" ・ ") : undefined,
    detail: browserUrl,
    attachmentId: attachment.attachmentId,
    downloadUrl: browserUrl,
  };
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

function dedupeAndSortCanonicalPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function checkRemoteMetadataForOpenedPage(
  deps: NavigationCommandDeps,
  canonicalPath: string,
): void {
  void deps.checkRemoteMetadataForPage?.(canonicalPath).catch(() => undefined);
}

type ExplorerCommandTarget =
  | string
  | UriLike
  | {
      uri?: UriLike;
      contextValue?: string;
    }
  | undefined;

type PrefixRootCommandTarget =
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

function resolveExplorerBrowserTargetCanonicalPath(
  target: ExplorerCommandTarget,
): string | undefined {
  if (typeof target === "string") {
    const normalized = normalizeCanonicalPath(target);
    return normalized.ok ? normalized.value : undefined;
  }

  const commandUri = resolveCommandUri(target);
  if (!commandUri || commandUri.scheme !== "growi") {
    return undefined;
  }

  if (
    typeof target === "object" &&
    target !== null &&
    "contextValue" in target &&
    target.contextValue === "growi.directory"
  ) {
    return undefined;
  }

  if (
    typeof target === "object" &&
    target !== null &&
    "contextValue" in target &&
    target.contextValue === "growi.prefixRoot"
  ) {
    return resolvePrefixRootCanonicalPath({ uri: commandUri });
  }

  if (commandUri.path.endsWith("/")) {
    return undefined;
  }

  return resolveCurrentPageCanonicalPath(commandUri);
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

export function createConfigureBaseUrlCommand(deps: DialogCommandDeps) {
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
        prompt: localize("Enter the target GROWI base URL"),
        title: localize("GROWI: Configure Base URL"),
        value: deps.getBaseUrl() ?? "",
      }));

    if (input === undefined) {
      return;
    }

    const normalized = normalizeBaseUrl(input);
    if (!normalized.ok) {
      deps.showErrorMessage(
        localize("Enter an http:// or https:// URL for the GROWI base URL."),
      );
      return;
    }

    await deps.updateBaseUrl(normalized.value);
    deps.showInformationMessage(localize("Updated the GROWI base URL."));
  };
}

export function createConfigureApiTokenCommand(deps: DialogCommandDeps) {
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
        prompt: localize("Enter the GROWI API token"),
        title: localize("GROWI: Configure API Token"),
      }));

    if (input === undefined) {
      return;
    }

    const token = input.trim();
    if (token.length === 0) {
      deps.showErrorMessage(localize("GROWI API token cannot be empty."));
      return;
    }

    await deps.storeSecret(GROWI_SECRET_KEYS.apiToken, token);
    deps.showInformationMessage(localize("Saved the GROWI API token."));
  };
}

export function createOpenReadmeCommand(
  deps: Pick<NavigationCommandDeps, "openUri">,
) {
  return async function openReadme(): Promise<void> {
    await deps.openUri(GROWI_README_URI);
  };
}

export function createAddPrefixCommand(deps: PrefixCommandDeps) {
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
        prompt: localize("Enter the prefix or same-instance idurl to register"),
        title: localize("GROWI: Add Prefix"),
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
          ? localize("Added the GROWI prefix.")
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

export function createClearPrefixesCommand(deps: PrefixCommandDeps) {
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

function resolvePrefixRootDeletionCanonicalPath(
  target: PrefixRootCommandTarget,
): string | undefined {
  if (typeof target === "string") {
    const normalized = normalizeCanonicalPath(target);
    return normalized.ok ? normalized.value : undefined;
  }

  if (
    typeof target === "object" &&
    target !== null &&
    "contextValue" in target &&
    target.contextValue !== undefined &&
    target.contextValue !== "growi.prefixRoot"
  ) {
    return undefined;
  }

  const commandUri = resolveCommandUri(target);
  if (
    !commandUri ||
    commandUri.scheme !== "growi" ||
    !commandUri.path.endsWith("/")
  ) {
    return undefined;
  }

  return resolvePrefixRootCanonicalPath({ uri: commandUri });
}

export function createDeletePrefixCommand(deps: PrefixCommandDeps) {
  return async function deletePrefix(
    target?: PrefixRootCommandTarget,
  ): Promise<void> {
    const canonicalPath = resolvePrefixRootDeletionCanonicalPath(target);
    if (!canonicalPath) {
      deps.showErrorMessage(DELETE_PREFIX_INVALID_TARGET_MESSAGE);
      return;
    }

    const result = await deps.deletePrefix(canonicalPath);
    if (!result.ok) {
      if (result.reason === "InvalidBaseUrl") {
        deps.showErrorMessage(ADD_PREFIX_INVALID_BASE_URL_MESSAGE);
        return;
      }
      deps.showErrorMessage(DELETE_PREFIX_INVALID_TARGET_MESSAGE);
      return;
    }

    if (!result.removed) {
      deps.showInformationMessage(DELETE_PREFIX_NO_TARGET_MESSAGE);
      return;
    }

    deps.showInformationMessage(DELETE_PREFIX_SUCCESS_MESSAGE);
  };
}

export function createOpenPageCommand(deps: NavigationCommandDeps) {
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
      (await selectOpenPageCandidateOrPromptDirectInput(deps));

    if (input === undefined) {
      return;
    }

    const parsed = parseOpenPageInput(input, {
      baseUrl: deps.getBaseUrl(),
    });
    if (!parsed.ok) {
      deps.showErrorMessage(
        localize(
          "Enter a GROWI URL, same-instance permalink, or page path starting with /.",
        ),
      );
      return;
    }

    await openResolvedGrowiPage(deps, parsed.value);
  };
}

async function selectOpenPageCandidateOrPromptDirectInput(
  deps: NavigationCommandDeps,
): Promise<string | undefined> {
  const candidateEntries = buildOpenPageInitialSearchEntries(deps);

  const selected = await deps.showOpenPageQuickPick(candidateEntries, {
    placeHolder: OPEN_PAGE_QUICK_PICK_PLACEHOLDER,
    directInputLabel: OPEN_PAGE_DIRECT_INPUT_LABEL,
    directInputDescription: OPEN_PAGE_DIRECT_INPUT_DESCRIPTION,
    search: async (query) => await searchOpenPageEntries(deps, query),
  });

  if (selected === undefined) {
    return undefined;
  }

  if (typeof selected !== "string" && selected.action === "directInput") {
    return await promptOpenPageInput(deps);
  }

  return typeof selected === "string" ? selected : undefined;
}

function buildOpenPageInitialSearchEntries(
  deps: NavigationCommandDeps,
): OpenPageSearchEntry[] {
  return buildOpenPageSearchEntriesFromPaths(
    deps.getOpenPageInitialCandidatePaths(),
  );
}

async function searchOpenPageEntries(
  deps: NavigationCommandDeps,
  query: string,
): Promise<OpenPageSearchEntry[]> {
  if (query.trim().length === 0) {
    return [];
  }

  const prefixes = deps.getRegisteredPrefixes();
  if (prefixes.length === 0) {
    return [];
  }

  const listedPages = await Promise.all(
    prefixes.map(
      async (prefix) =>
        await deps.listPages(prefix, {
          page: 1,
          limit: deps.getOpenPageBoundedSearchLimit(),
        }),
    ),
  );
  const canonicalPaths: string[] = [];

  for (const result of listedPages) {
    if (!result.ok) {
      continue;
    }

    for (const canonicalPath of result.paths) {
      canonicalPaths.push(canonicalPath);
    }
  }

  return buildOpenPageSearchEntriesFromPaths(
    canonicalPaths,
    OPEN_PAGE_BOUNDED_SEARCH_DETAIL,
  );
}

function buildOpenPageSearchEntriesFromPaths(
  canonicalPaths: readonly string[],
  detail?: string,
): OpenPageSearchEntry[] {
  return [...new Set(canonicalPaths)]
    .sort((left, right) => {
      const labelOrder = getOpenPageCandidateLabel(left).localeCompare(
        getOpenPageCandidateLabel(right),
        "ja",
      );
      return labelOrder !== 0 ? labelOrder : left.localeCompare(right, "ja");
    })
    .map((canonicalPath) => buildOpenPageSearchEntry(canonicalPath, detail));
}

function getOpenPageCandidateLabel(canonicalPath: string): string {
  if (canonicalPath === "/") {
    return "/";
  }

  return canonicalPath.split("/").filter(Boolean).at(-1) ?? canonicalPath;
}

export function buildOpenPageSearchEntry(
  canonicalPath: string,
  detail?: string,
): OpenPageSearchEntry {
  const label = getOpenPageCandidateLabel(canonicalPath);

  return {
    label,
    description: canonicalPath,
    ...(detail ? { detail } : {}),
    canonicalPath,
    basenameLower: label.toLocaleLowerCase("ja"),
    canonicalPathLower: canonicalPath.toLocaleLowerCase("ja"),
    pathSegmentsLower: canonicalPath
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.toLocaleLowerCase("ja")),
  };
}

export function rankOpenPageSearchEntries(
  entries: readonly OpenPageSearchEntry[],
  query: string,
): OpenPageQuickPickItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  if (normalizedQuery.length === 0) {
    return entries.map(toOpenPageQuickPickItem);
  }

  return entries
    .map((entry) => ({
      entry,
      rank: getOpenPageSearchRank(entry, normalizedQuery),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: OpenPageSearchEntry;
        rank: number;
      } => candidate.rank !== undefined,
    )
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      const labelOrder = left.entry.label.localeCompare(
        right.entry.label,
        "ja",
      );
      if (labelOrder !== 0) {
        return labelOrder;
      }

      return left.entry.canonicalPath.localeCompare(
        right.entry.canonicalPath,
        "ja",
      );
    })
    .map(({ entry }) => toOpenPageQuickPickItem(entry));
}

function toOpenPageQuickPickItem(
  entry: OpenPageSearchEntry,
): OpenPageQuickPickItem {
  return {
    label: entry.label,
    description: entry.description,
    detail: entry.detail,
    canonicalPath: entry.canonicalPath,
  };
}

function getOpenPageSearchRank(
  entry: OpenPageSearchEntry,
  normalizedQuery: string,
): number | undefined {
  if (entry.basenameLower === normalizedQuery) {
    return 0;
  }

  if (entry.basenameLower.startsWith(normalizedQuery)) {
    return 1;
  }

  if (
    entry.pathSegmentsLower.some((segment) =>
      segment.startsWith(normalizedQuery),
    )
  ) {
    return 2;
  }

  if (entry.basenameLower.includes(normalizedQuery)) {
    return 3;
  }

  if (entry.canonicalPathLower.includes(normalizedQuery)) {
    return 4;
  }

  return undefined;
}

export function isOpenPageDirectInputPreferred(query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  return (
    normalizedQuery.startsWith("/") ||
    normalizedQuery.startsWith("http://") ||
    normalizedQuery.startsWith("https://")
  );
}

async function promptOpenPageInput(
  deps: NavigationCommandDeps,
): Promise<string | undefined> {
  return await deps.showInputBox({
    placeHolder:
      "https://growi.example.com/67ca... or /team/dev/spec or /67ca...",
    prompt: localize("Enter a GROWI URL, permalink, or page path"),
    title: localize("GROWI: Open Page"),
  });
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
        prompt: localize("Enter the GROWI page path to create"),
        title: localize("GROWI: Create Page"),
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
    const createBody = await deps.resolveCreatePageBody(canonicalPath);
    const created = await deps.createPage(canonicalPath, createBody);
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
        prompt: localize("Enter the new GROWI page path"),
        title: localize("GROWI: Rename Page"),
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

export function createOpenPrefixRootPageCommand(deps: NavigationCommandDeps) {
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

    const opened = await openResolvedGrowiPage(deps, {
      kind: "canonicalPath",
      canonicalPath,
      uri: buildGrowiUri(canonicalPath),
      source: "path",
    });
    if (opened) {
      checkRemoteMetadataForOpenedPage(deps, canonicalPath);
    }
  };
}

export function createOpenDirectoryPageCommand(deps: NavigationCommandDeps) {
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

    const opened = await openResolvedGrowiPage(deps, {
      kind: "canonicalPath",
      canonicalPath,
      uri: buildGrowiUri(canonicalPath),
      source: "path",
    });
    if (opened) {
      checkRemoteMetadataForOpenedPage(deps, canonicalPath);
    }
  };
}

export function createExplorerOpenPageItemCommand(deps: NavigationCommandDeps) {
  return async function explorerOpenPageItem(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri = resolveExplorerTargetUri(target);
    if (!targetUri) {
      return;
    }

    await deps.executeCommand?.("vscode.open", targetUri);
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (canonicalPath) {
      checkRemoteMetadataForOpenedPage(deps, canonicalPath);
    }
  };
}

export function createExplorerOpenPageInBrowserCommand(
  deps: NavigationCommandDeps,
) {
  return async function explorerOpenPageInBrowser(
    target?: ExplorerCommandTarget,
  ): Promise<string | undefined> {
    const canonicalPath = resolveExplorerBrowserTargetCanonicalPath(target);
    if (!canonicalPath) {
      deps.showErrorMessage(
        EXPLORER_OPEN_PAGE_IN_BROWSER_INVALID_TARGET_MESSAGE,
      );
      return undefined;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
      return undefined;
    }

    const url = buildBrowserUrl(baseUrl, canonicalPath);
    if (!url) {
      deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
      return undefined;
    }

    await deps.openExternalUri(url);
    return url;
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

export function createExplorerShowCurrentPageAttachmentsCommand(
  deps: CommandDeps,
) {
  return createExplorerDelegatingCommand(
    deps,
    GROWI_COMMANDS.showCurrentPageAttachments,
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

export function createRefreshCurrentPageCommand(deps: EditCommandDeps) {
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

export function createStartEditCommand(deps: EditCommandDeps) {
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

export function createEndEditCommand(deps: EditCommandDeps) {
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

export function createRefreshListingCommand(deps: EditCommandDeps) {
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

export function createShowCurrentPageInfoCommand(
  deps: Pick<
    CurrentPageCommandDeps,
    | "getActiveEditorUri"
    | "getCurrentPageInfo"
    | "showErrorMessage"
    | "showInformationMessage"
  >,
) {
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
        localize("URL: {0}", info.url),
        localize("Path: {0}", info.path),
        localize("Last Updated By: {0}", info.lastUpdatedBy),
        localize("Last Updated At: {0}", info.lastUpdatedAt),
      ].join("\n"),
    );
  };
}

function mapShowCurrentPageAttachmentsFailureToMessage(
  reason: GrowiAccessFailureReason,
): string {
  return mapAccessFailureReasonToMessage(reason, {
    baseUrlNotConfigured: GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE,
    apiTokenNotConfigured: GENERIC_API_TOKEN_NOT_CONFIGURED_MESSAGE,
    invalidApiToken: GENERIC_INVALID_API_TOKEN_MESSAGE,
    permissionDenied: GENERIC_PERMISSION_DENIED_MESSAGE,
    apiNotSupported:
      SHOW_CURRENT_PAGE_ATTACHMENTS_LIST_API_NOT_SUPPORTED_MESSAGE,
    connectionFailed: SHOW_CURRENT_PAGE_ATTACHMENTS_CONNECTION_FAILED_MESSAGE,
  });
}

export function createShowCurrentPageAttachmentsCommand(
  deps: Pick<
    CurrentPageCommandDeps,
    | "getActiveEditorUri"
    | "getBaseUrl"
    | "getCurrentPageInfo"
    | "listAttachments"
    | "openExternalUri"
    | "showErrorMessage"
    | "showInformationMessage"
    | "showQuickPick"
  >,
) {
  return async function showCurrentPageAttachments(
    target?: ExplorerCommandTarget,
  ): Promise<string | undefined> {
    const targetUri = resolveCommandUri(
      typeof target === "string" ? undefined : target,
    );
    const effectiveUri = targetUri ?? deps.getActiveEditorUri();
    const canonicalPath = resolveCurrentPageCanonicalPath(effectiveUri);
    if (!canonicalPath || !effectiveUri) {
      deps.showErrorMessage(
        SHOW_CURRENT_PAGE_ATTACHMENTS_INVALID_TARGET_MESSAGE,
      );
      return undefined;
    }

    const pageInfo = deps.getCurrentPageInfo(canonicalPath);
    if (!pageInfo) {
      deps.showErrorMessage(SHOW_CURRENT_PAGE_ATTACHMENTS_UNAVAILABLE_MESSAGE);
      return undefined;
    }

    const attachments = await deps.listAttachments(pageInfo.pageId);
    if (!attachments.ok) {
      deps.showErrorMessage(
        mapShowCurrentPageAttachmentsFailureToMessage(attachments.reason),
      );
      return undefined;
    }
    if (attachments.attachments.length === 0) {
      deps.showInformationMessage(
        SHOW_CURRENT_PAGE_ATTACHMENTS_NO_ATTACHMENTS_MESSAGE,
      );
      return undefined;
    }

    const baseUrl = deps.getBaseUrl()?.trim();
    const quickPickItems = attachments.attachments
      .slice()
      .sort((left, right) =>
        left.originalName.localeCompare(right.originalName),
      )
      .map((attachment) => {
        const browserUrl = resolveAttachmentBrowserUrl(
          attachment.downloadUrl,
          baseUrl,
        );
        if (!browserUrl) {
          return undefined;
        }
        return mapAttachmentSummaryToQuickPickItem(attachment, browserUrl);
      })
      .filter((item): item is AttachmentQuickPickItem => Boolean(item));

    if (quickPickItems.length === 0) {
      deps.showInformationMessage(
        SHOW_CURRENT_PAGE_ATTACHMENTS_NO_OPENABLE_ATTACHMENTS_MESSAGE,
      );
      return undefined;
    }

    const selected = (await deps.showQuickPick(quickPickItems, {
      placeHolder: SHOW_CURRENT_PAGE_ATTACHMENTS_PLACEHOLDER,
    })) as AttachmentQuickPickItem | undefined;
    if (!selected) {
      deps.showInformationMessage(
        SHOW_CURRENT_PAGE_ATTACHMENTS_CANCELED_MESSAGE,
      );
      return undefined;
    }

    try {
      await deps.openExternalUri(selected.downloadUrl);
      return selected.downloadUrl;
    } catch {
      deps.showErrorMessage(SHOW_CURRENT_PAGE_ATTACHMENTS_OPEN_FAILED_MESSAGE);
      return undefined;
    }
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

export function createShowRevisionHistoryDiffCommand(
  deps: Pick<
    CurrentPageCommandDeps,
    | "getActiveEditorUri"
    | "getCurrentPageInfo"
    | "listRevisions"
    | "openDiff"
    | "readRevision"
    | "seedRevisionContent"
    | "showErrorMessage"
    | "showInformationMessage"
    | "showQuickPick"
  >,
) {
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

    const isBookmarked = deps.isBookmarked?.(canonicalPath) ?? false;
    const selected = (await deps.showQuickPick(
      [
        {
          label: localize("Refresh Page"),
          command: GROWI_COMMANDS.refreshCurrentPage,
        },
        {
          label: localize("Rename Page"),
          command: GROWI_COMMANDS.renamePage,
        },
        {
          label: localize("Delete Page"),
          command: GROWI_COMMANDS.deletePage,
        },
        {
          label: localize("Show Backlinks"),
          command: GROWI_COMMANDS.showBacklinks,
        },
        {
          label: localize("Show Page Info"),
          command: GROWI_COMMANDS.showCurrentPageInfo,
        },
        {
          label: localize("Show Attachments"),
          command: GROWI_COMMANDS.showCurrentPageAttachments,
        },
        {
          label: isBookmarked
            ? localize("Remove Bookmark")
            : localize("Add Bookmark"),
          command: isBookmarked
            ? GROWI_COMMANDS.removeCurrentPageBookmark
            : GROWI_COMMANDS.addCurrentPageBookmark,
        },
        {
          label: localize("Show Revision Diff"),
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        },
        {
          label: localize("Sync Current Page Locally"),
          description: localize(
            "Create or update __<page>__.md and .growi-mirror.json",
          ),
          command: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
        },
        {
          label: localize("Sync Current Page Subtree Locally"),
          description: localize("Create or update the prefix mirror"),
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

export function createAddCurrentPageBookmarkCommand(
  deps: Pick<
    BookmarkCommandDeps,
    | "addBookmark"
    | "getActiveEditorUri"
    | "getCurrentPageInfo"
    | "refreshPrefixTree"
    | "showErrorMessage"
    | "showInformationMessage"
  >,
) {
  return async function addCurrentPageBookmark(
    target?: UriLike | { uri?: UriLike },
  ): Promise<void> {
    const targetUri = resolveCommandUri(target) ?? deps.getActiveEditorUri();
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath || !targetUri) {
      deps.showErrorMessage(ADD_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE);
      return;
    }

    const pageId = deps.getCurrentPageInfo(canonicalPath)?.pageId;
    const result = await deps.addBookmark(canonicalPath, pageId);
    if (!result.ok) {
      deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
      return;
    }

    if (!result.added) {
      deps.showInformationMessage(ADD_CURRENT_PAGE_BOOKMARK_DUPLICATE_MESSAGE);
      return;
    }

    deps.refreshPrefixTree();
    deps.showInformationMessage(ADD_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE);
  };
}

export function createRemoveCurrentPageBookmarkCommand(
  deps: Pick<
    BookmarkCommandDeps,
    | "deleteBookmark"
    | "getActiveEditorUri"
    | "getCurrentPageInfo"
    | "refreshPrefixTree"
    | "showErrorMessage"
    | "showInformationMessage"
  >,
) {
  return async function removeCurrentPageBookmark(
    target?: UriLike | { uri?: UriLike },
  ): Promise<void> {
    const targetUri = resolveCommandUri(target) ?? deps.getActiveEditorUri();
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath || !targetUri) {
      deps.showErrorMessage(
        REMOVE_CURRENT_PAGE_BOOKMARK_INVALID_TARGET_MESSAGE,
      );
      return;
    }

    const pageId = deps.getCurrentPageInfo(canonicalPath)?.pageId;
    const result = await deps.deleteBookmark(canonicalPath, pageId);
    if (!result.ok) {
      deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
      return;
    }

    if (!result.removed) {
      deps.showInformationMessage(
        REMOVE_CURRENT_PAGE_BOOKMARK_NOT_FOUND_MESSAGE,
      );
      return;
    }

    deps.refreshPrefixTree();
    deps.showInformationMessage(REMOVE_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE);
  };
}

export function createShowBookmarksCommand(
  deps: Pick<
    BookmarkCommandDeps,
    | "deleteBookmark"
    | "getBookmarks"
    | "openUri"
    | "refreshPrefixTree"
    | "showBookmarkQuickPick"
    | "showErrorMessage"
    | "showInformationMessage"
  >,
) {
  const formatBookmarkDetail = (bookmark: BookmarkListEntry) => {
    if (bookmark.status === "unresolvable") {
      return `${SHOW_BOOKMARKS_STATUS_UNRESOLVABLE} ・ ${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
    }
    if (bookmark.status === "outsidePrefix") {
      return `${SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX} ・ ${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
    }
    return `${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
  };

  return async function showBookmarks(): Promise<void> {
    const bookmarksResult = await deps.getBookmarks();
    if (!bookmarksResult.ok) {
      deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
      return;
    }

    const bookmarks = bookmarksResult.value;
    if (bookmarks.length === 0) {
      deps.showInformationMessage(SHOW_BOOKMARKS_EMPTY_MESSAGE);
      return;
    }

    const selection = await deps.showBookmarkQuickPick(
      bookmarks.map((bookmark) => ({
        label: getOpenPageCandidateLabel(bookmark.canonicalPath),
        description: bookmark.canonicalPath,
        detail: formatBookmarkDetail(bookmark),
        canonicalPath: bookmark.canonicalPath,
        addedAt: bookmark.addedAt,
        pageId: bookmark.pageId,
        status: bookmark.status,
      })),
      { placeHolder: SHOW_BOOKMARKS_PLACEHOLDER },
    );

    if (!selection) {
      return;
    }

    if (selection.action === "remove") {
      const result = await deps.deleteBookmark(
        selection.canonicalPath,
        selection.pageId,
      );
      if (!result.ok) {
        deps.showErrorMessage(GENERIC_BASE_URL_NOT_CONFIGURED_MESSAGE);
        return;
      }

      if (!result.removed) {
        deps.showInformationMessage(
          REMOVE_CURRENT_PAGE_BOOKMARK_NOT_FOUND_MESSAGE,
        );
        return;
      }

      deps.refreshPrefixTree();
      deps.showInformationMessage(REMOVE_CURRENT_PAGE_BOOKMARK_SUCCESS_MESSAGE);
      return;
    }

    await deps.openUri(buildGrowiUri(selection.canonicalPath));
  };
}

export function createOpenCurrentPageHubCommand(
  deps: CurrentPageActionsCommandDeps,
) {
  return async function openCurrentPageHub(
    target?: ExplorerCommandTarget,
  ): Promise<void> {
    const targetUri =
      target === undefined
        ? deps.getActiveEditorUri()
        : resolveExplorerTargetUri(target);
    const canonicalPath = resolveCurrentPageCanonicalPath(targetUri);
    if (!canonicalPath || !targetUri) {
      deps.showErrorMessage(OPEN_CURRENT_PAGE_HUB_INVALID_TARGET_MESSAGE);
      return;
    }

    const actions = buildCurrentPageDetailActions();
    if (deps.openPageDetailWebview) {
      const summary = await deps.loadPageDetailSummary?.(canonicalPath);
      await deps.openPageDetailWebview({
        canonicalPath,
        targetUri,
        actions,
        summary,
      });
      return;
    }

    const selected = (await deps.showQuickPick(actions, {
      placeHolder: OPEN_CURRENT_PAGE_HUB_PLACEHOLDER,
    })) as CurrentPageActionQuickPickItem | undefined;

    if (!selected) {
      return;
    }

    await deps.executeCommand(selected.command, targetUri);
  };
}

export function buildCurrentPageDetailActions(): readonly CurrentPageDetailAction[] {
  return [
    {
      label: localize("Show Page Info"),
      description: localize("URL, pageId, revision, and updates"),
      command: GROWI_COMMANDS.showCurrentPageInfo,
    },
    {
      label: localize("Show Backlinks"),
      description: localize("Pages linking to the current page"),
      command: GROWI_COMMANDS.showBacklinks,
    },
    {
      label: localize("Show Attachments"),
      description: localize("Attachments for the current page"),
      command: GROWI_COMMANDS.showCurrentPageAttachments,
    },
    {
      label: localize("Show Revision Diff"),
      description: localize("Select a revision and compare it in VS Code diff"),
      command: GROWI_COMMANDS.showRevisionHistoryDiff,
    },
  ];
}

function mapPageDetailAccessFailureReason(
  reason: GrowiAccessFailureReason,
): string {
  if (reason === "BaseUrlNotConfigured") {
    return localize("Base URL not configured");
  }
  if (reason === "ApiTokenNotConfigured") {
    return localize("API token not configured");
  }
  if (reason === "InvalidApiToken") {
    return localize("Invalid API token");
  }
  if (reason === "PermissionDenied") {
    return localize("Permission denied");
  }
  if (reason === "ApiNotSupported") {
    return localize("API not supported");
  }
  return localize("Connection failed");
}

export async function loadCurrentPageDetailSummary(
  deps: Pick<
    CurrentPageCommandDeps,
    | "getBaseUrl"
    | "getCurrentPageInfo"
    | "getRegisteredPrefixes"
    | "listAttachments"
    | "listPages"
    | "listRevisions"
    | "readPageBody"
    | "resolvePageReference"
  >,
  canonicalPath: string,
): Promise<CurrentPageDetailSummary> {
  const pageInfo = deps.getCurrentPageInfo(canonicalPath);
  const summary: CurrentPageDetailSummary = {
    ...(pageInfo ? { pageInfo } : {}),
  };

  if (!pageInfo) {
    return summary;
  }

  const [attachments, revisions, backlinks] = await Promise.all([
    deps.listAttachments(pageInfo.pageId),
    deps.listRevisions(pageInfo.pageId),
    findBacklinks({
      targetCanonicalPath: canonicalPath,
      targetPageId: pageInfo.pageId,
      baseUrl: deps.getBaseUrl(),
      prefixes: deps.getRegisteredPrefixes(),
      listPages: deps.listPages,
      readPageBody: deps.readPageBody,
      resolvePageReference: deps.resolvePageReference,
      timeoutMs: 2_000,
      limit: 5,
    }),
  ]);

  summary.attachments = attachments.ok
    ? {
        items: attachments.attachments
          .slice(0, 5)
          .map((attachment) => attachment.originalName),
        totalCount: attachments.attachments.length,
        partial: attachments.attachments.length > 5,
      }
    : {
        items: [],
        unavailableReason: mapPageDetailAccessFailureReason(attachments.reason),
      };
  summary.revisions = revisions.ok
    ? {
        items: revisions.revisions
          .slice(0, 5)
          .map((revision) => `${revision.createdAt} / ${revision.author}`),
        totalCount: revisions.revisions.length,
        partial: revisions.revisions.length > 5,
      }
    : {
        items: [],
        unavailableReason: mapPageDetailAccessFailureReason(revisions.reason),
      };
  summary.backlinks = backlinks.ok
    ? {
        items: backlinks.backlinks.slice(0, 5),
        totalCount: backlinks.backlinks.length,
        partial: backlinks.truncatedByLimit || backlinks.timedOut,
      }
    : {
        items: [],
        unavailableReason:
          backlinks.reason === "ListPagesApiNotSupported" ||
          backlinks.reason === "ReadPageApiNotSupported"
            ? localize("API not supported")
            : localize("Could not retrieve"),
      };

  return summary;
}
function mapBacklinksPlaceholder(input: {
  truncatedByLimit: boolean;
  timedOut: boolean;
  scannedCount: number;
}): string {
  const scannedSuffix = localize("Scanned: {0} items.", input.scannedCount);
  if (input.truncatedByLimit && input.timedOut) {
    return `${SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX}${scannedSuffix}${localize("Results are limited to 100 items and 5 seconds.")}`;
  }
  if (input.truncatedByLimit) {
    return `${SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX}${scannedSuffix}${localize("Results are limited to 100 items.")}`;
  }
  if (input.timedOut) {
    return `${SHOW_BACKLINKS_PLACEHOLDER_PARTIAL_PREFIX}${scannedSuffix}${localize("Results are limited to 5 seconds.")}`;
  }
  return SHOW_BACKLINKS_PLACEHOLDER_NORMAL;
}

function mapBacklinksEmptyResultMessage(input: {
  truncatedByLimit: boolean;
  timedOut: boolean;
  scannedCount: number;
}): string {
  if (input.truncatedByLimit || input.timedOut) {
    return `${SHOW_BACKLINKS_PARTIAL_EMPTY_RESULT_PREFIX}${localize("Scanned: {0} items.", input.scannedCount)}`;
  }
  return SHOW_BACKLINKS_EMPTY_RESULT_MESSAGE;
}

export function createShowBacklinksCommand(deps: NavigationCommandDeps) {
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
      deps.showInformationMessage(mapBacklinksEmptyResultMessage(result));
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

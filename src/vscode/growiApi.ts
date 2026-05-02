import type { StartEditBootstrapResult } from "./commands";
import type {
  GrowiAccessFailureReason,
  GrowiCurrentPageInfo,
  GrowiCurrentRevisionResult,
  GrowiEditSession,
  GrowiPageCreateResult,
  GrowiPageDeleteMode,
  GrowiPageDeleteResult,
  GrowiPageListOptions,
  GrowiPageListResult,
  GrowiPageReadResult,
  GrowiPageRenameMode,
  GrowiPageRenameResult,
  GrowiPageWriteResult,
  GrowiReadFailureReason,
} from "./fsProvider";
import {
  createGrowiAttachmentApiAdapter,
  type GrowiAttachmentListResult,
} from "./growiApiAttachment";
import {
  createGrowiBookmarkApiAdapter,
  type GrowiBookmarkInfoResult,
  type GrowiBookmarkListResult,
  type GrowiBookmarkUpdateResult,
} from "./growiApiBookmark";
import {
  createGetRequestInit,
  fetchWithTimeout,
  isLoginRedirectResponse,
  isObjectRecord,
  type JsonObject,
  parseJsonObject,
} from "./growiApiHttp";
import { createGrowiPageApiAdapter } from "./growiApiPage";
import { createGrowiRevisionApiAdapter } from "./growiApiRevision";
import type {
  GrowiRevisionListResult,
  GrowiRevisionReadResult,
} from "./revisionModel";

export type {
  GrowiAttachmentListResult,
  GrowiAttachmentSummary,
} from "./growiApiAttachment";
export type {
  GrowiBookmarkEntry,
  GrowiBookmarkInfoResult,
  GrowiBookmarkListResult,
  GrowiBookmarkUpdateResult,
} from "./growiApiBookmark";

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

export type GrowiApiAdapter = {
  getCurrentUser(
    baseUrl: string,
    apiToken: string,
  ): Promise<
    | { ok: true; userId: string }
    | { ok: false; reason: GrowiAccessFailureReason }
  >;
  getPageInfo(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<
    | { ok: true; pageInfo?: GrowiCurrentPageInfo }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
  fetchPageSnapshot(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<StartEditBootstrapResult>;
  readPage(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageReadResult>;
  resolvePageId(
    pageId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<
    | { ok: true; canonicalPath: string; pageInfo?: GrowiCurrentPageInfo }
    | {
        ok: false;
        reason:
          | "NotFound"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed";
      }
  >;
  listPages(
    canonicalPrefixPath: string,
    baseUrl: string,
    apiToken: string,
    options?: GrowiPageListOptions,
  ): Promise<GrowiPageListResult>;
  listAttachments(
    pageId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiAttachmentListResult>;
  listBookmarks(
    userId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiBookmarkListResult>;
  getBookmarkInfo(
    pageId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiBookmarkInfoResult>;
  updateBookmark(
    pageId: string,
    shouldBookmark: boolean,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiBookmarkUpdateResult>;
  createPage(
    canonicalPath: string,
    body: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageCreateResult>;
  resolveCreatePageBody(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<string>;
  deletePage(
    input: {
      pageId: string;
      revisionId: string;
      canonicalPath: string;
      mode: GrowiPageDeleteMode;
    },
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageDeleteResult>;
  renamePage(
    input: {
      pageId: string;
      revisionId: string;
      currentCanonicalPath: string;
      targetCanonicalPath: string;
      mode: GrowiPageRenameMode;
    },
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageRenameResult>;
  listRevisions(
    pageId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiRevisionListResult>;
  readRevision(
    pageId: string,
    revisionId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiRevisionReadResult>;
  getCurrentRevision(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiCurrentRevisionResult>;
  writePage(
    body: string,
    editSession: GrowiEditSession,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageWriteResult>;
};

export interface GrowiApiDiagnosticsLogger {
  log(message: string): void;
  logStructured?(event: {
    level: "debug" | "info" | "warn" | "error";
    event: string;
    operation: string;
    entityType: string;
    entityId: string;
    virtualPath: string;
    outcome: "started" | "succeeded" | "failed";
    errorCode?: string;
    message?: string;
    details?: string;
  }): void;
}

export interface GrowiApiAdapterOptions {
  diagnostics?: GrowiApiDiagnosticsLogger;
}

export function createGrowiApiAdapter(
  options: GrowiApiAdapterOptions = {},
): GrowiApiAdapter {
  const attachmentApi = createGrowiAttachmentApiAdapter(options);
  const bookmarkApi = createGrowiBookmarkApiAdapter();
  const pageApi = createGrowiPageApiAdapter(options);
  const revisionApi = createGrowiRevisionApiAdapter();

  return {
    async getCurrentUser(baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);
      let endpoint: URL;
      try {
        endpoint = new URL("/_api/v3/personal-setting", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      let response: Response;
      try {
        response = await fetchWithTimeout(endpoint, requestInit);
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(response)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (response.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (response.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (!response.ok || response.status === 404 || response.status === 405) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseJsonObject(response);
      if (!payload) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const currentUser = payload.currentUser;
      if (!isObjectRecord(currentUser)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      const userId =
        readStringField(currentUser, "_id") ??
        readStringField(currentUser, "id");
      if (!userId) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return { ok: true, userId } as const;
    },

    getPageInfo: pageApi.getPageInfo,
    fetchPageSnapshot: pageApi.fetchPageSnapshot,
    readPage: pageApi.readPage,
    resolvePageId: pageApi.resolvePageId,
    listPages: pageApi.listPages,

    listAttachments: attachmentApi.listAttachments,
    listBookmarks: bookmarkApi.listBookmarks,
    getBookmarkInfo: bookmarkApi.getBookmarkInfo,
    updateBookmark: bookmarkApi.updateBookmark,

    createPage: pageApi.createPage,
    deletePage: pageApi.deletePage,
    resolveCreatePageBody: pageApi.resolveCreatePageBody,
    renamePage: pageApi.renamePage,

    listRevisions: revisionApi.listRevisions,
    readRevision: revisionApi.readRevision,

    getCurrentRevision: pageApi.getCurrentRevision,
    writePage: pageApi.writePage,
  };
}

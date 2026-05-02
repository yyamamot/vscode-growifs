import type {
  GrowiAccessFailureReason,
  GrowiReadFailureReason,
} from "./fsProvider";
import {
  createGetRequestInit,
  fetchWithTimeout,
  isLoginRedirectResponse,
  isObjectRecord,
  type JsonObject,
  parseJsonObject,
} from "./growiApiHttp";

type GrowiCommonHttpFailureReason =
  | "InvalidApiToken"
  | "PermissionDenied"
  | "ApiNotSupported";

type GrowiCommonHttpReadFailureReason =
  | GrowiCommonHttpFailureReason
  | "NotFound";

export type GrowiBookmarkEntry = {
  canonicalPath: string;
  pageId: string;
  addedAt: string;
};

export type GrowiBookmarkListResult =
  | { ok: true; bookmarks: GrowiBookmarkEntry[] }
  | { ok: false; reason: GrowiAccessFailureReason };

export type GrowiBookmarkInfoResult =
  | { ok: true; isBookmarked: boolean; pageId: string }
  | { ok: false; reason: GrowiReadFailureReason };

export type GrowiBookmarkUpdateResult =
  | { ok: true }
  | { ok: false; reason: GrowiReadFailureReason };

export type GrowiBookmarkApiAdapter = {
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
};

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readBooleanField(
  source: JsonObject,
  key: string,
): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function classifyGrowiApiHttpFailureStatus(
  status: number,
  options: { notFound: "NotFound" },
): { ok: false; reason: GrowiCommonHttpReadFailureReason };
function classifyGrowiApiHttpFailureStatus(
  status: number,
  options: { notFound: "ApiNotSupported" },
): { ok: false; reason: GrowiCommonHttpFailureReason };
function classifyGrowiApiHttpFailureStatus(
  status: number,
  options: { notFound: "NotFound" | "ApiNotSupported" },
): { ok: false; reason: GrowiCommonHttpReadFailureReason } {
  if (status === 401) {
    return { ok: false, reason: "InvalidApiToken" };
  }
  if (status === 403) {
    return { ok: false, reason: "PermissionDenied" };
  }
  if (status === 404) {
    return { ok: false, reason: options.notFound };
  }
  return { ok: false, reason: "ApiNotSupported" };
}

const classifyBookmarkAccessFailureStatus = (status: number) =>
  classifyGrowiApiHttpFailureStatus(status, { notFound: "ApiNotSupported" });

const classifyBookmarkReadFailureStatus = (status: number) =>
  classifyGrowiApiHttpFailureStatus(status, { notFound: "NotFound" });

function extractBookmarkEntries(
  payload: JsonObject,
): GrowiBookmarkEntry[] | undefined {
  const candidates = [
    payload.bookmarks,
    payload.userRootBookmarks,
    isObjectRecord(payload.userRootBookmarks)
      ? payload.userRootBookmarks.bookmarks
      : undefined,
  ];

  const bookmarkArray = candidates.find((value) => Array.isArray(value));
  if (!Array.isArray(bookmarkArray)) {
    return undefined;
  }

  const entries: GrowiBookmarkEntry[] = [];
  for (const bookmark of bookmarkArray) {
    if (!isObjectRecord(bookmark)) {
      return undefined;
    }
    const page = bookmark.page;
    if (!isObjectRecord(page)) {
      return undefined;
    }
    const canonicalPath = readStringField(page, "path");
    const pageId = readStringField(page, "_id") ?? readStringField(page, "id");
    const addedAt =
      readStringField(bookmark, "createdAt") ??
      readStringField(bookmark, "updatedAt") ??
      readStringField(page, "updatedAt") ??
      readStringField(page, "createdAt");
    if (!canonicalPath || !pageId || !addedAt) {
      return undefined;
    }
    entries.push({ canonicalPath, pageId, addedAt });
  }

  return entries;
}

export function createGrowiBookmarkApiAdapter(): GrowiBookmarkApiAdapter {
  return {
    async listBookmarks(userId, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);
      let endpoint: URL;
      try {
        endpoint = new URL(
          `/_api/v3/bookmarks/${encodeURIComponent(userId)}`,
          baseUrl,
        );
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
      if (!response.ok) {
        return classifyBookmarkAccessFailureStatus(response.status);
      }

      const payload = await parseJsonObject(response);
      if (!payload) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const bookmarks = extractBookmarkEntries(payload);
      if (!bookmarks) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return {
        ok: true,
        bookmarks: bookmarks.sort((left, right) =>
          right.addedAt.localeCompare(left.addedAt),
        ),
      } as const;
    },

    async getBookmarkInfo(pageId, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);
      let endpoint: URL;
      try {
        endpoint = new URL("/_api/v3/bookmarks/info", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      endpoint.searchParams.set("pageId", pageId);

      let response: Response;
      try {
        response = await fetchWithTimeout(endpoint, requestInit);
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(response)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (!response.ok) {
        return classifyBookmarkReadFailureStatus(response.status);
      }

      const payload = await parseJsonObject(response);
      if (!payload) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const isBookmarked = readBooleanField(payload, "isBookmarked");
      const responsePageId = readStringField(payload, "pageId") ?? pageId;
      if (isBookmarked === undefined || !responsePageId) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return { ok: true, isBookmarked, pageId: responsePageId } as const;
    },

    async updateBookmark(pageId, shouldBookmark, baseUrl, apiToken) {
      let endpoint: URL;
      try {
        endpoint = new URL("/_api/v3/bookmarks", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      let response: Response;
      try {
        response = await fetchWithTimeout(endpoint, {
          body: JSON.stringify({ pageId, bool: shouldBookmark }),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          method: "PUT",
          redirect: "manual",
        });
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(response)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (!response.ok) {
        return classifyBookmarkReadFailureStatus(response.status);
      }

      return { ok: true } as const;
    },
  };
}

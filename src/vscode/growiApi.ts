import type { StartEditBootstrapResult } from "./commands";
import type {
  GrowiCurrentPageInfo,
  GrowiCurrentRevisionResult,
  GrowiEditSession,
  GrowiPageCreateResult,
  GrowiPageDeleteMode,
  GrowiPageDeleteResult,
  GrowiPageListResult,
  GrowiPageReadResult,
  GrowiPageRenameMode,
  GrowiPageRenameResult,
  GrowiPageWriteResult,
} from "./fsProvider";
import type {
  GrowiRevisionListResult,
  GrowiRevisionReadResult,
  GrowiRevisionSummary,
} from "./revisionModel";

const REQUEST_TIMEOUT_MS = 10_000;
const PAGE_LIST_LIMIT = 100;

type JsonObject = Record<string, unknown>;

function isObjectRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readErrorMessage(
  payload: JsonObject | null | undefined,
): string | undefined {
  if (!payload) {
    return undefined;
  }
  return (
    readStringField(payload, "error") ??
    readStringField(payload, "message") ??
    readStringField(payload, "msg")
  );
}

function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes("application/json");
}

async function parseJsonObject(
  response: Response,
): Promise<JsonObject | undefined> {
  if (!hasJsonContentType(response)) {
    return undefined;
  }
  try {
    const payload: unknown = await response.json();
    return isObjectRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

async function parseOptionalJsonObject(
  response: Response,
): Promise<JsonObject | null | undefined> {
  const contentType = response.headers.get("content-type");
  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return null;
  }
  if (!contentType?.toLowerCase().includes("application/json")) {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(rawBody);
    return isObjectRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

async function parseOptionalErrorResponse(response: Response): Promise<{
  payload: JsonObject | null | undefined;
  rawText?: string;
}> {
  const contentType = response.headers.get("content-type");
  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return { payload: null };
  }
  if (contentType?.toLowerCase().includes("application/json")) {
    try {
      const payload: unknown = JSON.parse(rawBody);
      if (isObjectRecord(payload)) {
        return { payload };
      }
    } catch {
      // Fall through and surface the raw body below.
    }
  }

  return {
    payload: undefined,
    rawText:
      rawBody.length > 200 ? `${rawBody.slice(0, 200).trimEnd()}...` : rawBody,
  };
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

function isLoginRedirectResponse(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) {
    return false;
  }

  const location = response.headers.get("location");
  if (location) {
    if (location.startsWith("/login")) {
      return true;
    }
    try {
      if (isLoginPath(new URL(location).pathname)) {
        return true;
      }
    } catch {
      return location.includes("/login");
    }
  }

  if (response.url) {
    try {
      return isLoginPath(new URL(response.url).pathname);
    } catch {
      return false;
    }
  }

  return false;
}

function classifyPageSnapshotFailureStatus(status: number): {
  ok: false;
  reason:
    | "NotFound"
    | "InvalidApiToken"
    | "PermissionDenied"
    | "ApiNotSupported";
} {
  if (status === 404) {
    return { ok: false, reason: "NotFound" };
  }
  if (status === 401) {
    return { ok: false, reason: "InvalidApiToken" };
  }
  if (status === 403) {
    return { ok: false, reason: "PermissionDenied" };
  }
  return { ok: false, reason: "ApiNotSupported" };
}

function classifyPageLookupFailureStatus(status: number) {
  if (status === 404) {
    return { ok: false, reason: "NotFound" } as const;
  }
  if (status === 401) {
    return { ok: false, reason: "InvalidApiToken" } as const;
  }
  if (status === 403) {
    return { ok: false, reason: "PermissionDenied" } as const;
  }
  return { ok: false, reason: "ApiNotSupported" } as const;
}

async function fetchWithTimeout(
  input: URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function createGetRequestInit(apiToken: string): RequestInit {
  return {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    method: "GET",
    redirect: "manual",
  };
}

function readLastUpdatedBy(page: JsonObject): string | undefined {
  const lastUpdateUser = page.lastUpdateUser;
  if (!isObjectRecord(lastUpdateUser)) {
    return undefined;
  }
  return (
    readStringField(lastUpdateUser, "username") ??
    readStringField(lastUpdateUser, "name")
  );
}

function buildCurrentPageInfo(
  page: JsonObject,
  baseUrl: string,
): GrowiCurrentPageInfo | undefined {
  const pageId = readStringField(page, "_id");
  const path = readStringField(page, "path");
  const lastUpdatedAt = readStringField(page, "updatedAt");
  const lastUpdatedBy = readLastUpdatedBy(page);
  const revision = isObjectRecord(page.revision) ? page.revision : undefined;
  const revisionId =
    readStringField(page, "revision") ??
    (revision ? readStringField(revision, "_id") : undefined);
  if (!pageId || !path || !lastUpdatedAt || !lastUpdatedBy) {
    return undefined;
  }

  let url: string;
  try {
    url = new URL(path, baseUrl).toString();
  } catch {
    return undefined;
  }

  return revisionId
    ? { pageId, revisionId, url, path, lastUpdatedBy, lastUpdatedAt }
    : { pageId, url, path, lastUpdatedBy, lastUpdatedAt };
}

function readRevisionAuthor(revision: JsonObject): string | undefined {
  const author = revision.author;
  if (!isObjectRecord(author)) {
    return undefined;
  }
  return readStringField(author, "username") ?? readStringField(author, "name");
}

function buildRevisionSummary(
  revision: JsonObject,
): GrowiRevisionSummary | undefined {
  const revisionId = readStringField(revision, "_id");
  const createdAt = readStringField(revision, "createdAt");
  const author = readRevisionAuthor(revision);
  if (!revisionId || !createdAt || !author) {
    return undefined;
  }

  return { revisionId, createdAt, author };
}

type PageSnapshotDataResult =
  | {
      ok: true;
      value: {
        pageId: string;
        baseRevisionId: string;
        baseUpdatedAt: string;
        baseBody: string;
        pageInfo?: GrowiCurrentPageInfo;
      };
    }
  | {
      ok: false;
      reason:
        | "InvalidApiToken"
        | "PermissionDenied"
        | "ApiNotSupported"
        | "ConnectionFailed"
        | "NotFound";
    };

export type GrowiApiAdapter = {
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
  ): Promise<GrowiPageListResult>;
  createPage(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageCreateResult>;
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

export function createGrowiApiAdapter(): GrowiApiAdapter {
  async function fetchPageMetadata(
    lookup:
      | { kind: "path"; canonicalPath: string }
      | { kind: "pageId"; pageId: string },
    baseUrl: string,
    apiToken: string,
  ): Promise<
    | { ok: true; page: JsonObject }
    | {
        ok: false;
        reason:
          | "NotFound"
          | "InvalidApiToken"
          | "PermissionDenied"
          | "ApiNotSupported"
          | "ConnectionFailed";
      }
  > {
    const requestInit = createGetRequestInit(apiToken);

    let pageEndpoint: URL;
    try {
      pageEndpoint = new URL("/_api/v3/page", baseUrl);
    } catch {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    if (lookup.kind === "path") {
      pageEndpoint.searchParams.set("path", lookup.canonicalPath);
    } else {
      pageEndpoint.searchParams.set("pageId", lookup.pageId);
    }

    let pageResponse: Response;
    try {
      pageResponse = await fetchWithTimeout(pageEndpoint, requestInit);
    } catch {
      return { ok: false, reason: "ConnectionFailed" } as const;
    }

    if (isLoginRedirectResponse(pageResponse)) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    if (!pageResponse.ok) {
      return classifyPageLookupFailureStatus(pageResponse.status);
    }

    const pagePayload = await parseJsonObject(pageResponse);
    if (!pagePayload) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    const page = pagePayload.page;
    if (!isObjectRecord(page)) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    return { ok: true, page } as const;
  }

  async function fetchPageSnapshotData(
    canonicalPath: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<PageSnapshotDataResult> {
    const requestInit = createGetRequestInit(apiToken);
    const pageResult = await fetchPageMetadata(
      { kind: "path", canonicalPath },
      baseUrl,
      apiToken,
    );
    if (!pageResult.ok) {
      return pageResult;
    }
    const page = pageResult.page;
    const revision = page.revision;
    if (!isObjectRecord(revision)) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    const pageId = readStringField(page, "_id");
    const baseRevisionId = readStringField(revision, "_id");
    const baseUpdatedAt = readStringField(page, "updatedAt");
    if (!pageId || !baseRevisionId || !baseUpdatedAt) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    let revisionEndpoint: URL;
    try {
      revisionEndpoint = new URL(
        `/_api/v3/revisions/${encodeURIComponent(baseRevisionId)}`,
        baseUrl,
      );
    } catch {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    revisionEndpoint.searchParams.set("pageId", pageId);

    let revisionResponse: Response;
    try {
      revisionResponse = await fetchWithTimeout(revisionEndpoint, requestInit);
    } catch {
      return { ok: false, reason: "ConnectionFailed" } as const;
    }

    if (isLoginRedirectResponse(revisionResponse)) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    if (!revisionResponse.ok) {
      return classifyPageSnapshotFailureStatus(revisionResponse.status);
    }

    const revisionPayload = await parseJsonObject(revisionResponse);
    if (!revisionPayload) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    const revisionData = revisionPayload.revision;
    if (!isObjectRecord(revisionData)) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    const baseBody = readStringField(revisionData, "body");
    if (baseBody === undefined) {
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    return {
      ok: true,
      value: {
        pageId,
        baseRevisionId,
        baseUpdatedAt,
        baseBody,
        pageInfo: buildCurrentPageInfo(page, baseUrl),
      },
    } as const;
  }

  return {
    async fetchPageSnapshot(canonicalPath, baseUrl, apiToken) {
      const snapshot = await fetchPageSnapshotData(
        canonicalPath,
        baseUrl,
        apiToken,
      );
      if (!snapshot.ok) {
        return snapshot;
      }
      return {
        ok: true,
        value: {
          pageId: snapshot.value.pageId,
          baseRevisionId: snapshot.value.baseRevisionId,
          baseUpdatedAt: snapshot.value.baseUpdatedAt,
          baseBody: snapshot.value.baseBody,
        },
      } as const;
    },

    async readPage(canonicalPath, baseUrl, apiToken) {
      const snapshot = await fetchPageSnapshotData(
        canonicalPath,
        baseUrl,
        apiToken,
      );
      if (!snapshot.ok) {
        return snapshot;
      }
      return {
        ok: true,
        body: snapshot.value.baseBody,
        pageInfo: snapshot.value.pageInfo,
      } as const;
    },

    async resolvePageId(pageId, baseUrl, apiToken) {
      const pageResult = await fetchPageMetadata(
        { kind: "pageId", pageId },
        baseUrl,
        apiToken,
      );
      if (!pageResult.ok) {
        return pageResult;
      }

      const canonicalPath = readStringField(pageResult.page, "path");
      if (!canonicalPath) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return {
        ok: true,
        canonicalPath,
        pageInfo: buildCurrentPageInfo(pageResult.page, baseUrl),
      } as const;
    },

    async listPages(canonicalPrefixPath, baseUrl, apiToken) {
      const paths: string[] = [];
      const requestInit = createGetRequestInit(apiToken);

      for (let page = 1; ; page += 1) {
        let listEndpoint: URL;
        try {
          listEndpoint = new URL("/_api/v3/pages/list", baseUrl);
        } catch {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        listEndpoint.searchParams.set("path", canonicalPrefixPath);
        listEndpoint.searchParams.set("limit", String(PAGE_LIST_LIMIT));
        listEndpoint.searchParams.set("page", String(page));

        let listResponse: Response;
        try {
          listResponse = await fetchWithTimeout(listEndpoint, requestInit);
        } catch {
          return { ok: false, reason: "ConnectionFailed" } as const;
        }

        if (isLoginRedirectResponse(listResponse)) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        if (listResponse.status === 401) {
          return { ok: false, reason: "InvalidApiToken" } as const;
        }
        if (listResponse.status === 403) {
          return { ok: false, reason: "PermissionDenied" } as const;
        }
        if (
          !listResponse.ok ||
          listResponse.status === 404 ||
          listResponse.status === 405
        ) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        const payload = await parseJsonObject(listResponse);
        if (!payload) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        const pages = payload.pages;
        if (!Array.isArray(pages)) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        for (const pageData of pages) {
          if (!isObjectRecord(pageData)) {
            return { ok: false, reason: "ApiNotSupported" } as const;
          }
          const path = readStringField(pageData, "path");
          if (!path) {
            return { ok: false, reason: "ApiNotSupported" } as const;
          }
          paths.push(path);
        }

        if (pages.length < PAGE_LIST_LIMIT) {
          break;
        }
      }

      return { ok: true, paths } as const;
    },

    async createPage(canonicalPath, baseUrl, apiToken) {
      let pageEndpoint: URL;
      try {
        pageEndpoint = new URL("/_api/v3/page", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      let pageResponse: Response;
      try {
        pageResponse = await fetchWithTimeout(pageEndpoint, {
          body: JSON.stringify({
            body: "",
            path: canonicalPath,
          }),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          redirect: "manual",
        });
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(pageResponse)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (pageResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (pageResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (pageResponse.status === 404) {
        const payload = await parseOptionalJsonObject(pageResponse);
        if (payload?.error === "ParentPageNotFound") {
          return { ok: false, reason: "NotFound" } as const;
        }
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (pageResponse.status === 409) {
        const payload = await parseOptionalJsonObject(pageResponse);
        if (payload?.error === "PageAlreadyExists") {
          return { ok: false, reason: "AlreadyExists" } as const;
        }
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (!pageResponse.ok || pageResponse.status === 405) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseOptionalJsonObject(pageResponse);
      if (payload === undefined) {
        return { ok: true } as const;
      }
      if (payload === null) {
        return { ok: true } as const;
      }

      const page = payload.page;
      if (!isObjectRecord(page)) {
        return { ok: true } as const;
      }
      const pageInfo = buildCurrentPageInfo(page, baseUrl);
      if (!pageInfo) {
        return { ok: true } as const;
      }

      return { ok: true, pageInfo } as const;
    },

    async deletePage(input, baseUrl, apiToken) {
      const requestBody: Record<string, unknown> = {
        pageIdToRevisionIdMap: {
          [input.pageId]: input.revisionId,
        },
      };
      if (input.mode === "subtree") {
        requestBody.isRecursively = true;
      }

      let pageEndpoint: URL;
      try {
        pageEndpoint = new URL("/_api/v3/pages/delete", baseUrl);
      } catch {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message: "Delete Page endpoint URL could not be constructed.",
        } as const;
      }

      let pageResponse: Response;
      try {
        pageResponse = await fetchWithTimeout(pageEndpoint, {
          body: JSON.stringify(requestBody),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          redirect: "manual",
        });
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(pageResponse)) {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message:
            "Delete Page request was redirected to login. The endpoint may require cookie authentication or the API token may not be accepted for this API.",
        } as const;
      }
      if (pageResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (pageResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (pageResponse.status === 404) {
        const { payload, rawText } =
          await parseOptionalErrorResponse(pageResponse);
        if (payload?.error === "PageNotFound") {
          return { ok: false, reason: "NotFound" } as const;
        }
        const detail = readErrorMessage(payload) ?? rawText;
        return {
          ok: false,
          reason: "ApiNotSupported",
          message: detail
            ? `Delete Page endpoint returned HTTP 404: ${detail}.`
            : "Delete Page endpoint returned HTTP 404.",
        } as const;
      }
      if (pageResponse.status === 405) {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message:
            "Delete Page endpoint returned HTTP 405. The connected GROWI may not support POST /_api/v3/pages/delete.",
        } as const;
      }
      if (!pageResponse.ok) {
        const { payload, rawText } =
          await parseOptionalErrorResponse(pageResponse);
        const detail = readErrorMessage(payload) ?? rawText;
        if (
          pageResponse.status === 400 &&
          (payload?.error === "PageHasChildren" ||
            detail?.toLowerCase().includes("child") ||
            detail?.toLowerCase().includes("descendant"))
        ) {
          return { ok: false, reason: "HasChildren" } as const;
        }
        const message = detail
          ? `Delete Page request was rejected (HTTP ${pageResponse.status}: ${detail}).`
          : `Delete Page request was rejected (HTTP ${pageResponse.status}). Sent pageId=${input.pageId}, revisionId=${input.revisionId}, path=${input.canonicalPath}, isRecursively=${requestBody.isRecursively}.`;
        return { ok: false, reason: "Rejected", message } as const;
      }

      return { ok: true } as const;
    },

    async renamePage(input, baseUrl, apiToken) {
      const requestBody = {
        isRecursively: input.mode === "subtree",
        isRenameRedirect: false,
        newPagePath: input.targetCanonicalPath,
        pageId: input.pageId,
        path: input.currentCanonicalPath,
        revisionId: input.revisionId,
        updateMetadata: true,
      };
      let pageEndpoint: URL;
      try {
        pageEndpoint = new URL("/_api/v3/pages/rename", baseUrl);
      } catch {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message: "Rename Page endpoint URL could not be constructed.",
        } as const;
      }

      let pageResponse: Response;
      try {
        pageResponse = await fetchWithTimeout(pageEndpoint, {
          body: JSON.stringify(requestBody),
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

      if (isLoginRedirectResponse(pageResponse)) {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message:
            "Rename Page request was redirected to login. The endpoint may require cookie authentication or the API token may not be accepted for this API.",
        } as const;
      }
      if (pageResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (pageResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (pageResponse.status === 404) {
        const { payload, rawText } =
          await parseOptionalErrorResponse(pageResponse);
        if (payload?.error === "ParentPageNotFound") {
          return { ok: false, reason: "ParentNotFound" } as const;
        }
        if (payload?.error === "PageNotFound") {
          return { ok: false, reason: "NotFound" } as const;
        }
        const detail = readErrorMessage(payload) ?? rawText;
        return {
          ok: false,
          reason: "ApiNotSupported",
          message: detail
            ? `Rename Page endpoint returned HTTP 404: ${detail}.`
            : "Rename Page endpoint returned HTTP 404.",
        } as const;
      }
      if (pageResponse.status === 409) {
        const { payload, rawText } =
          await parseOptionalErrorResponse(pageResponse);
        if (payload?.error === "PageAlreadyExists") {
          return { ok: false, reason: "AlreadyExists" } as const;
        }
        const detail = readErrorMessage(payload) ?? rawText;
        return {
          ok: false,
          reason: "ApiNotSupported",
          message: detail
            ? `Rename Page endpoint returned HTTP 409: ${detail}.`
            : "Rename Page endpoint returned HTTP 409.",
        } as const;
      }
      if (pageResponse.status === 405) {
        return {
          ok: false,
          reason: "ApiNotSupported",
          message:
            "Rename Page endpoint returned HTTP 405. The connected GROWI may not support PUT /_api/v3/pages/rename.",
        } as const;
      }
      if (!pageResponse.ok) {
        const { payload, rawText } =
          await parseOptionalErrorResponse(pageResponse);
        const detail = readErrorMessage(payload) ?? rawText;
        const message = detail
          ? `Rename Page request was rejected (HTTP ${pageResponse.status}: ${detail}).`
          : `Rename Page request was rejected (HTTP ${pageResponse.status}). Sent pageId=${requestBody.pageId}, revisionId=${requestBody.revisionId}, path=${requestBody.path}, newPagePath=${requestBody.newPagePath}, isRecursively=${requestBody.isRecursively}.`;
        return { ok: false, reason: "Rejected", message } as const;
      }

      const payload = await parseOptionalJsonObject(pageResponse);
      if (payload === undefined || payload === null) {
        return {
          ok: true,
          canonicalPath: input.targetCanonicalPath,
        } as const;
      }

      const page = isObjectRecord(payload.page)
        ? payload.page
        : isObjectRecord(payload.renamedPage)
          ? payload.renamedPage
          : undefined;
      if (!page) {
        return {
          ok: true,
          canonicalPath: input.targetCanonicalPath,
        } as const;
      }

      const canonicalPath =
        readStringField(page, "path") ?? input.targetCanonicalPath;
      const pageInfo = buildCurrentPageInfo(page, baseUrl);
      return { ok: true, canonicalPath, pageInfo } as const;
    },

    async listRevisions(pageId, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);

      let revisionsEndpoint: URL;
      try {
        revisionsEndpoint = new URL("/_api/v3/revisions/list", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      revisionsEndpoint.searchParams.set("pageId", pageId);
      revisionsEndpoint.searchParams.set("offset", "0");
      revisionsEndpoint.searchParams.set("limit", "100");

      let revisionsResponse: Response;
      try {
        revisionsResponse = await fetchWithTimeout(
          revisionsEndpoint,
          requestInit,
        );
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(revisionsResponse)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (revisionsResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (revisionsResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (
        !revisionsResponse.ok ||
        revisionsResponse.status === 404 ||
        revisionsResponse.status === 405
      ) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseJsonObject(revisionsResponse);
      if (!payload) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const revisions = payload.revisions;
      if (!Array.isArray(revisions)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const summaries: GrowiRevisionSummary[] = [];
      for (const revision of revisions) {
        if (!isObjectRecord(revision)) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        const summary = buildRevisionSummary(revision);
        if (!summary) {
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        summaries.push(summary);
      }

      return { ok: true, revisions: summaries } as const;
    },

    async readRevision(pageId, revisionId, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);

      let revisionEndpoint: URL;
      try {
        revisionEndpoint = new URL(
          `/_api/v3/revisions/${encodeURIComponent(revisionId)}`,
          baseUrl,
        );
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      revisionEndpoint.searchParams.set("pageId", pageId);

      let revisionResponse: Response;
      try {
        revisionResponse = await fetchWithTimeout(
          revisionEndpoint,
          requestInit,
        );
      } catch {
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      if (isLoginRedirectResponse(revisionResponse)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (revisionResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (revisionResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (revisionResponse.status === 404) {
        return { ok: false, reason: "NotFound" } as const;
      }
      if (!revisionResponse.ok) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseJsonObject(revisionResponse);
      if (!payload) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const revision = payload.revision;
      if (!isObjectRecord(revision)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const body = readStringField(revision, "body");
      if (body === undefined) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return { ok: true, body } as const;
    },

    async getCurrentRevision(canonicalPath, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);

      let pageEndpoint: URL;
      try {
        pageEndpoint = new URL("/_api/v3/page", baseUrl);
      } catch {
        return { ok: false } as const;
      }
      pageEndpoint.searchParams.set("path", canonicalPath);

      let pageResponse: Response;
      try {
        pageResponse = await fetchWithTimeout(pageEndpoint, requestInit);
      } catch {
        return { ok: false } as const;
      }

      if (isLoginRedirectResponse(pageResponse)) {
        return { ok: false } as const;
      }
      if (!pageResponse.ok) {
        return { ok: false } as const;
      }

      const payload = await parseJsonObject(pageResponse);
      if (!payload) {
        return { ok: false } as const;
      }
      const page = payload.page;
      if (!isObjectRecord(page)) {
        return { ok: false } as const;
      }
      const revision = page.revision;
      if (!isObjectRecord(revision)) {
        return { ok: false } as const;
      }

      const revisionId = readStringField(revision, "_id");
      if (!revisionId) {
        return { ok: false } as const;
      }

      return { ok: true, revisionId } as const;
    },
    async writePage(body, editSession, baseUrl, apiToken) {
      let pageEndpoint: URL;
      try {
        pageEndpoint = new URL("/_api/v3/page", baseUrl);
      } catch {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      let pageResponse: Response;
      try {
        pageResponse = await fetchWithTimeout(pageEndpoint, {
          body: JSON.stringify({
            body,
            origin: "view",
            pageId: editSession.pageId,
            revisionId: editSession.baseRevisionId,
          }),
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

      if (isLoginRedirectResponse(pageResponse)) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (pageResponse.status === 401) {
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (pageResponse.status === 403) {
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (
        !pageResponse.ok ||
        pageResponse.status === 404 ||
        pageResponse.status === 405
      ) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseOptionalJsonObject(pageResponse);
      if (payload === undefined) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (payload === null) {
        return { ok: true } as const;
      }

      const page = payload.page;
      if (!isObjectRecord(page)) {
        return { ok: true } as const;
      }

      const pageInfo = buildCurrentPageInfo(page, baseUrl);
      if (!pageInfo) {
        return { ok: true } as const;
      }

      return { ok: true, pageInfo } as const;
    },
  };
}

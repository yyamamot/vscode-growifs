import path from "node:path";

import type { StartEditBootstrapResult } from "./commands";
import type {
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
  createGetRequestInit,
  fetchWithTimeout,
  isLoginRedirectResponse,
  isObjectRecord,
  type JsonObject,
  parseJsonObject,
  parseOptionalErrorResponse,
  parseOptionalJsonObject,
  readErrorMessage,
} from "./growiApiHttp";

const PAGE_LIST_LIMIT = 100;

type GrowiCommonHttpFailureReason =
  | "InvalidApiToken"
  | "PermissionDenied"
  | "ApiNotSupported";

type GrowiCommonHttpReadFailureReason =
  | GrowiCommonHttpFailureReason
  | "NotFound";

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

type GrowiPageMetadataResult =
  | { ok: true; page: JsonObject }
  | {
      ok: false;
      reason:
        | "NotFound"
        | "InvalidApiToken"
        | "PermissionDenied"
        | "ApiNotSupported"
        | "ConnectionFailed";
    };

export type GrowiPageApiAdapter = {
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

export interface GrowiPageApiDiagnosticsLogger {
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

export interface GrowiPageApiAdapterOptions {
  diagnostics?: GrowiPageApiDiagnosticsLogger;
}

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
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

const classifyPageSnapshotFailureStatus = (status: number) =>
  classifyGrowiApiHttpFailureStatus(status, { notFound: "NotFound" });

const classifyPageLookupFailureStatus = (status: number) =>
  classifyGrowiApiHttpFailureStatus(status, { notFound: "NotFound" });

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

function buildHierarchyTemplateCandidatePaths(canonicalPath: string): string[] {
  const parentPath = path.posix.dirname(canonicalPath);
  const candidates = [path.posix.join(parentPath, "_template")];
  const descendantTemplateRoots = [parentPath];

  let currentPath = parentPath;
  while (currentPath !== "/") {
    currentPath = path.posix.dirname(currentPath);
    descendantTemplateRoots.push(currentPath);
  }

  for (const rootPath of descendantTemplateRoots) {
    candidates.push(path.posix.join(rootPath, "__template"));
  }

  return [...new Set(candidates)];
}

function sanitizeContentType(value: string | null): string {
  return value?.split(";")[0]?.trim() || "missing";
}

function sanitizePayloadKeys(payload: JsonObject): string {
  return Object.keys(payload).sort().join(",") || "none";
}

export function createGrowiPageApiAdapter(
  options: GrowiPageApiAdapterOptions = {},
): GrowiPageApiAdapter {
  const logDiagnostic = (
    message: string,
    structured?: Parameters<
      NonNullable<GrowiPageApiDiagnosticsLogger["logStructured"]>
    >[0],
  ): void => {
    options.diagnostics?.log(message);
    if (structured) {
      options.diagnostics?.logStructured?.({
        ...structured,
        message,
      });
    }
  };

  async function fetchPageMetadata(
    lookup:
      | { kind: "path"; canonicalPath: string }
      | { kind: "pageId"; pageId: string },
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiPageMetadataResult> {
    const requestInit = createGetRequestInit(apiToken);
    const eventPrefix = lookup.kind === "pageId" ? "page.lookup" : "page.read";
    const entityId =
      lookup.kind === "pageId" ? lookup.pageId : lookup.canonicalPath;
    const endpointPath = "/_api/v3/page";
    logDiagnostic(`${eventPrefix} requested`, {
      level: "info",
      event: `${eventPrefix}.requested`,
      operation: `api:${endpointPath}`,
      entityType: "page",
      entityId,
      virtualPath: endpointPath,
      outcome: "started",
    });

    let pageEndpoint: URL;
    try {
      pageEndpoint = new URL("/_api/v3/page", baseUrl);
    } catch {
      logDiagnostic(`${eventPrefix} failure=InvalidBaseUrl`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: "InvalidBaseUrl",
      });
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
      logDiagnostic(`${eventPrefix} failure=ConnectionFailed`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: "ConnectionFailed",
      });
      return { ok: false, reason: "ConnectionFailed" } as const;
    }
    const sanitizedContentType = sanitizeContentType(
      pageResponse.headers.get("content-type"),
    );
    logDiagnostic(
      `${eventPrefix} response status=${pageResponse.status} contentType=${sanitizedContentType}`,
      {
        level: "info",
        event: `${eventPrefix}.response`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "succeeded",
        details: `status=${pageResponse.status} contentType=${sanitizedContentType}`,
      },
    );

    if (isLoginRedirectResponse(pageResponse)) {
      logDiagnostic(`${eventPrefix} failure=LoginRedirect`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: "LoginRedirect",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    if (!pageResponse.ok) {
      const result = classifyPageLookupFailureStatus(pageResponse.status);
      logDiagnostic(`${eventPrefix} failure=${result.reason}`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: result.reason,
        details: `status=${pageResponse.status}`,
      });
      return result;
    }

    const pagePayload = await parseJsonObject(pageResponse);
    if (!pagePayload) {
      logDiagnostic(`${eventPrefix} failure=InvalidPayload parse=nonObject`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: "InvalidPayload",
        details: "parse=nonObject",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    logDiagnostic(
      `${eventPrefix} payload keys=${sanitizePayloadKeys(pagePayload)}`,
      {
        level: "info",
        event: `${eventPrefix}.payload`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "succeeded",
        details: `keys=${sanitizePayloadKeys(pagePayload)}`,
      },
    );

    const page = pagePayload.page;
    if (!isObjectRecord(page)) {
      logDiagnostic(`${eventPrefix} failure=InvalidPayload page=missing`, {
        level: "error",
        event: `${eventPrefix}.failed`,
        operation: `api:${endpointPath}`,
        entityType: "page",
        entityId,
        virtualPath: endpointPath,
        outcome: "failed",
        errorCode: "InvalidPayload",
        details: "page=missing",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    logDiagnostic(`${eventPrefix} success`, {
      level: "info",
      event: `${eventPrefix}.succeeded`,
      operation: `api:${endpointPath}`,
      entityType: "page",
      entityId,
      virtualPath: endpointPath,
      outcome: "succeeded",
    });
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
      logDiagnostic("page.read.revision failure=InvalidBaseUrl", {
        level: "error",
        event: "page.read.revision.failed",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "failed",
        errorCode: "InvalidBaseUrl",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    revisionEndpoint.searchParams.set("pageId", pageId);
    logDiagnostic("page.read.revision requested", {
      level: "info",
      event: "page.read.revision.requested",
      operation: "api:/_api/v3/revisions/{id}",
      entityType: "page",
      entityId: pageId,
      virtualPath: "/_api/v3/revisions/{id}",
      outcome: "started",
    });

    let revisionResponse: Response;
    try {
      revisionResponse = await fetchWithTimeout(revisionEndpoint, requestInit);
    } catch {
      logDiagnostic("page.read.revision failure=ConnectionFailed", {
        level: "error",
        event: "page.read.revision.failed",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "failed",
        errorCode: "ConnectionFailed",
      });
      return { ok: false, reason: "ConnectionFailed" } as const;
    }
    const sanitizedRevisionContentType = sanitizeContentType(
      revisionResponse.headers.get("content-type"),
    );
    logDiagnostic(
      `page.read.revision response status=${revisionResponse.status} contentType=${sanitizedRevisionContentType}`,
      {
        level: "info",
        event: "page.read.revision.response",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "succeeded",
        details: `status=${revisionResponse.status} contentType=${sanitizedRevisionContentType}`,
      },
    );

    if (isLoginRedirectResponse(revisionResponse)) {
      logDiagnostic("page.read.revision failure=LoginRedirect", {
        level: "error",
        event: "page.read.revision.failed",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "failed",
        errorCode: "LoginRedirect",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    if (!revisionResponse.ok) {
      const result = classifyPageSnapshotFailureStatus(revisionResponse.status);
      logDiagnostic(`page.read.revision failure=${result.reason}`, {
        level: "error",
        event: "page.read.revision.failed",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "failed",
        errorCode: result.reason,
        details: `status=${revisionResponse.status}`,
      });
      return result;
    }

    const revisionPayload = await parseJsonObject(revisionResponse);
    if (!revisionPayload) {
      logDiagnostic(
        "page.read.revision failure=InvalidPayload parse=nonObject",
        {
          level: "error",
          event: "page.read.revision.failed",
          operation: "api:/_api/v3/revisions/{id}",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/revisions/{id}",
          outcome: "failed",
          errorCode: "InvalidPayload",
          details: "parse=nonObject",
        },
      );
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    logDiagnostic(
      `page.read.revision payload keys=${sanitizePayloadKeys(revisionPayload)}`,
      {
        level: "info",
        event: "page.read.revision.payload",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "succeeded",
        details: `keys=${sanitizePayloadKeys(revisionPayload)}`,
      },
    );
    const revisionData = revisionPayload.revision;
    if (!isObjectRecord(revisionData)) {
      logDiagnostic(
        "page.read.revision failure=InvalidPayload revision=missing",
        {
          level: "error",
          event: "page.read.revision.failed",
          operation: "api:/_api/v3/revisions/{id}",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/revisions/{id}",
          outcome: "failed",
          errorCode: "InvalidPayload",
          details: "revision=missing",
        },
      );
      return { ok: false, reason: "ApiNotSupported" } as const;
    }

    const baseBody = readStringField(revisionData, "body");
    if (baseBody === undefined) {
      logDiagnostic("page.read.revision failure=InvalidPayload body=missing", {
        level: "error",
        event: "page.read.revision.failed",
        operation: "api:/_api/v3/revisions/{id}",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/revisions/{id}",
        outcome: "failed",
        errorCode: "InvalidPayload",
        details: "body=missing",
      });
      return { ok: false, reason: "ApiNotSupported" } as const;
    }
    logDiagnostic("page.read.revision success", {
      level: "info",
      event: "page.read.revision.succeeded",
      operation: "api:/_api/v3/revisions/{id}",
      entityType: "page",
      entityId: pageId,
      virtualPath: "/_api/v3/revisions/{id}",
      outcome: "succeeded",
    });

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
    async getPageInfo(canonicalPath, baseUrl, apiToken) {
      const pageResult = await fetchPageMetadata(
        { kind: "path", canonicalPath },
        baseUrl,
        apiToken,
      );
      if (!pageResult.ok) {
        return pageResult;
      }
      return {
        ok: true,
        pageInfo: buildCurrentPageInfo(pageResult.page, baseUrl),
      } as const;
    },

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

    async listPages(canonicalPrefixPath, baseUrl, apiToken, options) {
      const paths: string[] = [];
      const requestInit = createGetRequestInit(apiToken);
      const listLimit = options?.limit ?? PAGE_LIST_LIMIT;
      const firstPage = options?.page ?? 1;
      const singlePage = options?.page !== undefined;
      logDiagnostic("pages.list requested", {
        level: "info",
        event: "pages.list.requested",
        operation: "api:/_api/v3/pages/list",
        entityType: "prefix",
        entityId: canonicalPrefixPath,
        virtualPath: "/_api/v3/pages/list",
        outcome: "started",
      });

      for (let page = firstPage; ; page += 1) {
        let listEndpoint: URL;
        try {
          listEndpoint = new URL("/_api/v3/pages/list", baseUrl);
        } catch {
          logDiagnostic("pages.list failure=InvalidBaseUrl", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "InvalidBaseUrl",
          });
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        listEndpoint.searchParams.set("path", canonicalPrefixPath);
        listEndpoint.searchParams.set("limit", String(listLimit));
        listEndpoint.searchParams.set("page", String(page));

        let listResponse: Response;
        try {
          listResponse = await fetchWithTimeout(listEndpoint, requestInit);
        } catch {
          logDiagnostic("pages.list failure=ConnectionFailed", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "ConnectionFailed",
          });
          return { ok: false, reason: "ConnectionFailed" } as const;
        }
        logDiagnostic(
          `pages.list response status=${listResponse.status} contentType=${sanitizeContentType(
            listResponse.headers.get("content-type"),
          )} page=${page}`,
          {
            level: "info",
            event: "pages.list.response",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "succeeded",
            details: `status=${listResponse.status} contentType=${sanitizeContentType(
              listResponse.headers.get("content-type"),
            )} page=${page}`,
          },
        );

        if (isLoginRedirectResponse(listResponse)) {
          logDiagnostic("pages.list failure=LoginRedirect", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "LoginRedirect",
          });
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        if (listResponse.status === 401) {
          logDiagnostic("pages.list failure=InvalidApiToken", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "InvalidApiToken",
          });
          return { ok: false, reason: "InvalidApiToken" } as const;
        }
        if (listResponse.status === 403) {
          logDiagnostic("pages.list failure=PermissionDenied", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "PermissionDenied",
          });
          return { ok: false, reason: "PermissionDenied" } as const;
        }
        if (
          !listResponse.ok ||
          listResponse.status === 404 ||
          listResponse.status === 405
        ) {
          logDiagnostic("pages.list failure=ApiNotSupported", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "ApiNotSupported",
            details: `status=${listResponse.status}`,
          });
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        const payload = await parseJsonObject(listResponse);
        if (!payload) {
          logDiagnostic("pages.list failure=InvalidPayload parse=nonObject", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "InvalidPayload",
            details: "parse=nonObject",
          });
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        logDiagnostic(
          `pages.list payload keys=${sanitizePayloadKeys(payload)}`,
          {
            level: "info",
            event: "pages.list.payload",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "succeeded",
            details: `keys=${sanitizePayloadKeys(payload)}`,
          },
        );

        const pages = payload.pages;
        if (!Array.isArray(pages)) {
          logDiagnostic("pages.list failure=InvalidPayload pages=missing", {
            level: "error",
            event: "pages.list.failed",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "failed",
            errorCode: "InvalidPayload",
            details: "pages=missing",
          });
          return { ok: false, reason: "ApiNotSupported" } as const;
        }

        for (const pageData of pages) {
          if (!isObjectRecord(pageData)) {
            logDiagnostic("pages.list failure=InvalidPayload entry=malformed", {
              level: "error",
              event: "pages.list.failed",
              operation: "api:/_api/v3/pages/list",
              entityType: "prefix",
              entityId: canonicalPrefixPath,
              virtualPath: "/_api/v3/pages/list",
              outcome: "failed",
              errorCode: "InvalidPayload",
              details: "entry=malformed",
            });
            return { ok: false, reason: "ApiNotSupported" } as const;
          }
          const path = readStringField(pageData, "path");
          if (!path) {
            logDiagnostic("pages.list failure=InvalidPayload path=missing", {
              level: "error",
              event: "pages.list.failed",
              operation: "api:/_api/v3/pages/list",
              entityType: "prefix",
              entityId: canonicalPrefixPath,
              virtualPath: "/_api/v3/pages/list",
              outcome: "failed",
              errorCode: "InvalidPayload",
              details: "path=missing",
            });
            return { ok: false, reason: "ApiNotSupported" } as const;
          }
          paths.push(path);
        }

        if (singlePage) {
          const hasMore = pages.length >= listLimit;
          logDiagnostic(`pages.list success count=${paths.length}`, {
            level: "info",
            event: "pages.list.succeeded",
            operation: "api:/_api/v3/pages/list",
            entityType: "prefix",
            entityId: canonicalPrefixPath,
            virtualPath: "/_api/v3/pages/list",
            outcome: "succeeded",
            details: `count=${paths.length}`,
          });
          return {
            ok: true,
            paths,
            hasMore,
            nextPage: hasMore ? page + 1 : undefined,
            fetchedCount: paths.length,
          } as const;
        }

        if (pages.length < listLimit) {
          break;
        }
      }

      logDiagnostic(`pages.list success count=${paths.length}`, {
        level: "info",
        event: "pages.list.succeeded",
        operation: "api:/_api/v3/pages/list",
        entityType: "prefix",
        entityId: canonicalPrefixPath,
        virtualPath: "/_api/v3/pages/list",
        outcome: "succeeded",
        details: `count=${paths.length}`,
      });
      return { ok: true, paths } as const;
    },

    async createPage(canonicalPath, body, baseUrl, apiToken) {
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

    async resolveCreatePageBody(canonicalPath, baseUrl, apiToken) {
      for (const templatePath of buildHierarchyTemplateCandidatePaths(
        canonicalPath,
      )) {
        const snapshot = await fetchPageSnapshotData(
          templatePath,
          baseUrl,
          apiToken,
        );
        if (snapshot.ok) {
          return snapshot.value.baseBody;
        }
        if (snapshot.reason !== "NotFound") {
          return "";
        }
      }

      return "";
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

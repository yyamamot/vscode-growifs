import {
  createGetRequestInit,
  fetchWithTimeout,
  isLoginRedirectResponse,
  isObjectRecord,
  type JsonObject,
  parseJsonObject,
} from "./growiApiHttp";
import type {
  GrowiRevisionListResult,
  GrowiRevisionReadResult,
  GrowiRevisionSummary,
} from "./revisionModel";

export type GrowiRevisionApiAdapter = {
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
};

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
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

export function createGrowiRevisionApiAdapter(): GrowiRevisionApiAdapter {
  return {
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
  };
}

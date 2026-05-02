import type { GrowiAccessFailureReason } from "./fsProvider";
import {
  createGetRequestInit,
  fetchWithTimeout,
  isLoginRedirectResponse,
  isObjectRecord,
  type JsonObject,
  parseJsonObject,
} from "./growiApiHttp";

export type GrowiAttachmentSummary = {
  attachmentId: string;
  originalName: string;
  downloadUrl?: string;
  fileFormat?: string;
  fileSize?: number;
};

export type GrowiAttachmentListResult =
  | { ok: true; attachments: GrowiAttachmentSummary[] }
  | { ok: false; reason: GrowiAccessFailureReason };

export type GrowiAttachmentApiAdapter = {
  listAttachments(
    pageId: string,
    baseUrl: string,
    apiToken: string,
  ): Promise<GrowiAttachmentListResult>;
};

export interface GrowiAttachmentApiDiagnosticsLogger {
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

export interface GrowiAttachmentApiAdapterOptions {
  diagnostics?: GrowiAttachmentApiDiagnosticsLogger;
}

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberField(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readAttachmentUrlField(source: JsonObject): string | undefined {
  return (
    readStringField(source, "downloadUrl") ??
    readStringField(source, "url") ??
    readStringField(source, "href") ??
    readStringField(source, "filePath") ??
    readStringField(source, "path")
  );
}

function buildAttachmentSummary(
  attachment: JsonObject,
): GrowiAttachmentSummary | undefined {
  const originalName =
    readStringField(attachment, "originalName") ??
    readStringField(attachment, "fileName") ??
    readStringField(attachment, "filename") ??
    readStringField(attachment, "name");
  if (!originalName) {
    return undefined;
  }

  const attachmentId =
    readStringField(attachment, "_id") ??
    readStringField(attachment, "id") ??
    readStringField(attachment, "attachmentId") ??
    originalName;
  const explicitUrl = readAttachmentUrlField(attachment);
  const fileFormat =
    readStringField(attachment, "fileFormat") ??
    readStringField(attachment, "format") ??
    readStringField(attachment, "mimeType");
  const fileSize =
    readNumberField(attachment, "fileSize") ??
    readNumberField(attachment, "size") ??
    readNumberField(attachment, "bytes");

  return {
    attachmentId,
    originalName,
    downloadUrl:
      explicitUrl ?? `/attachment/${encodeURIComponent(attachmentId)}`,
    fileFormat,
    fileSize,
  };
}

function extractAttachmentArray(payload: JsonObject): JsonObject[] | undefined {
  const candidates = [
    payload.docs,
    payload.attachments,
    payload.files,
    payload.data,
    payload.items,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isObjectRecord);
    }
  }
  const paginateResult = payload.paginateResult;
  if (isObjectRecord(paginateResult) && Array.isArray(paginateResult.docs)) {
    return paginateResult.docs.filter(isObjectRecord);
  }
  return undefined;
}

function formatAttachmentArrayDiagnostics(payload: JsonObject): string {
  const candidates = ["docs", "attachments", "files", "data", "items"];
  const summary = candidates
    .map((key) => {
      const value = payload[key];
      return `${key}=${Array.isArray(value) ? value.length : "missing"}`;
    })
    .join(" ");
  const paginateResult = payload.paginateResult;
  const paginateDocs =
    isObjectRecord(paginateResult) && Array.isArray(paginateResult.docs)
      ? paginateResult.docs.length
      : "missing";
  return `${summary} paginateResult.docs=${paginateDocs}`;
}

function sanitizeContentType(value: string | null): string {
  return value?.split(";")[0]?.trim() || "missing";
}

export function createGrowiAttachmentApiAdapter(
  options: GrowiAttachmentApiAdapterOptions = {},
): GrowiAttachmentApiAdapter {
  const logDiagnostic = (
    message: string,
    structured?: Parameters<
      NonNullable<GrowiAttachmentApiDiagnosticsLogger["logStructured"]>
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

  return {
    async listAttachments(pageId, baseUrl, apiToken) {
      const requestInit = createGetRequestInit(apiToken);
      logDiagnostic("attachment/list requested", {
        level: "info",
        event: "attachment.list.requested",
        operation: "api:/_api/v3/attachment/list",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/attachment/list",
        outcome: "started",
      });

      let attachmentsEndpoint: URL;
      try {
        attachmentsEndpoint = new URL("/_api/v3/attachment/list", baseUrl);
      } catch {
        logDiagnostic("attachment/list failure=InvalidBaseUrl", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "InvalidBaseUrl",
        });
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      attachmentsEndpoint.searchParams.set("pageId", pageId);

      let attachmentsResponse: Response;
      try {
        attachmentsResponse = await fetchWithTimeout(
          attachmentsEndpoint,
          requestInit,
        );
      } catch {
        logDiagnostic("attachment/list failure=ConnectionFailed", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "ConnectionFailed",
        });
        return { ok: false, reason: "ConnectionFailed" } as const;
      }

      const sanitizedContentType = sanitizeContentType(
        attachmentsResponse.headers.get("content-type"),
      );
      logDiagnostic(
        `attachment/list response status=${attachmentsResponse.status} contentType=${sanitizedContentType}`,
        {
          level: "info",
          event: "attachment.list.response",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "succeeded",
          details: `status=${attachmentsResponse.status} contentType=${sanitizedContentType}`,
        },
      );

      if (isLoginRedirectResponse(attachmentsResponse)) {
        logDiagnostic("attachment/list failure=LoginRedirect", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "LoginRedirect",
        });
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      if (attachmentsResponse.status === 401) {
        logDiagnostic("attachment/list failure=InvalidApiToken", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "InvalidApiToken",
        });
        return { ok: false, reason: "InvalidApiToken" } as const;
      }
      if (attachmentsResponse.status === 403) {
        logDiagnostic("attachment/list failure=PermissionDenied", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "PermissionDenied",
        });
        return { ok: false, reason: "PermissionDenied" } as const;
      }
      if (
        !attachmentsResponse.ok ||
        attachmentsResponse.status === 404 ||
        attachmentsResponse.status === 405
      ) {
        logDiagnostic(
          `attachment/list failure=ApiNotSupported status=${attachmentsResponse.status}`,
          {
            level: "error",
            event: "attachment.list.failed",
            operation: "api:/_api/v3/attachment/list",
            entityType: "page",
            entityId: pageId,
            virtualPath: "/_api/v3/attachment/list",
            outcome: "failed",
            errorCode: "ApiNotSupported",
            details: `status=${attachmentsResponse.status}`,
          },
        );
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const payload = await parseJsonObject(attachmentsResponse);
      if (!payload) {
        logDiagnostic(
          "attachment/list failure=InvalidPayload parse=nonObject",
          {
            level: "error",
            event: "attachment.list.failed",
            operation: "api:/_api/v3/attachment/list",
            entityType: "page",
            entityId: pageId,
            virtualPath: "/_api/v3/attachment/list",
            outcome: "failed",
            errorCode: "InvalidPayload",
            details: "parse=nonObject",
          },
        );
        return { ok: false, reason: "ApiNotSupported" } as const;
      }
      const payloadKeys = Object.keys(payload).sort().join(",") || "none";
      const arrayDiagnostics = formatAttachmentArrayDiagnostics(payload);
      logDiagnostic(
        `attachment/list payload keys=${payloadKeys} arrays=${arrayDiagnostics}`,
        {
          level: "info",
          event: "attachment.list.payload",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "succeeded",
          details: `keys=${payloadKeys} arrays=${arrayDiagnostics}`,
        },
      );

      const attachmentEntries = extractAttachmentArray(payload);
      if (!attachmentEntries) {
        logDiagnostic("attachment/list failure=InvalidPayload arrays=missing", {
          level: "error",
          event: "attachment.list.failed",
          operation: "api:/_api/v3/attachment/list",
          entityType: "page",
          entityId: pageId,
          virtualPath: "/_api/v3/attachment/list",
          outcome: "failed",
          errorCode: "InvalidPayload",
          details: "arrays=missing",
        });
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      const attachments: GrowiAttachmentSummary[] = [];
      for (const attachment of attachmentEntries) {
        const summary = buildAttachmentSummary(attachment);
        if (!summary) {
          logDiagnostic(
            "attachment/list failure=InvalidPayload entry=malformed",
            {
              level: "error",
              event: "attachment.list.failed",
              operation: "api:/_api/v3/attachment/list",
              entityType: "page",
              entityId: pageId,
              virtualPath: "/_api/v3/attachment/list",
              outcome: "failed",
              errorCode: "InvalidPayload",
              details: "entry=malformed",
            },
          );
          return { ok: false, reason: "ApiNotSupported" } as const;
        }
        attachments.push(summary);
      }

      logDiagnostic(`attachment/list success count=${attachments.length}`, {
        level: "info",
        event: "attachment.list.succeeded",
        operation: "api:/_api/v3/attachment/list",
        entityType: "page",
        entityId: pageId,
        virtualPath: "/_api/v3/attachment/list",
        outcome: "succeeded",
        details: `count=${attachments.length}`,
      });
      return { ok: true, attachments } as const;
    },
  };
}

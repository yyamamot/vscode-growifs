import * as http from "node:http";

import {
  buildGrowiAssetProxyUrl,
  resolveGrowiAssetUpstreamUrl,
} from "./growiAsset";

interface GrowiAssetProxyDeps {
  getBaseUrl(): string | undefined;
  getApiToken(): Promise<string | undefined>;
  fetch?: typeof fetch;
}

interface GrowiAssetProxyRequest {
  method?: string;
  url?: string;
}

interface GrowiAssetProxyResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

export interface GrowiAssetProxy {
  dispose(): Promise<void>;
  resolveProxyUrl(internalAssetId: string): string | undefined;
}

function trimToUndefined(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseProxyPath(urlValue: string | undefined): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  const requestUrl = new URL(urlValue, "http://127.0.0.1");
  if (!requestUrl.pathname.startsWith("/growi-assets/")) {
    return undefined;
  }

  const encodedId = requestUrl.pathname.slice("/growi-assets/".length);
  if (!encodedId) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isSameHostAbsoluteUrl(target: string, baseUrl: string): boolean {
  if (!isHttpUrl(target)) {
    return false;
  }

  try {
    return new URL(target).host === new URL(baseUrl).host;
  } catch {
    return false;
  }
}

function appendAccessTokenQuery(url: string, apiToken: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("access_token", apiToken);
  return parsed.toString();
}

async function readBody(response: Response): Promise<Uint8Array> {
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function createProxyErrorResponse(
  status: number,
  reason:
    | "MethodNotAllowed"
    | "NotFound"
    | "UnsupportedTarget"
    | "MissingToken"
    | "UpstreamFetchFailed",
): GrowiAssetProxyResponse {
  const body = new TextEncoder().encode(reason);
  return {
    status,
    body,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-growi-asset-proxy-error": reason,
    },
  };
}

export function createGrowiAssetProxyRequestHandler(deps: GrowiAssetProxyDeps) {
  const fetchImpl = deps.fetch ?? fetch;

  return async (
    request: GrowiAssetProxyRequest,
  ): Promise<GrowiAssetProxyResponse> => {
    if ((request.method ?? "GET").toUpperCase() !== "GET") {
      return createProxyErrorResponse(405, "MethodNotAllowed");
    }

    const internalAssetId = parseProxyPath(request.url);
    if (!internalAssetId) {
      return createProxyErrorResponse(404, "NotFound");
    }

    const baseUrl = trimToUndefined(deps.getBaseUrl());
    const upstreamUrl = resolveGrowiAssetUpstreamUrl(internalAssetId, {
      baseUrl,
    });
    if (!upstreamUrl) {
      return createProxyErrorResponse(400, "UnsupportedTarget");
    }

    const apiToken = trimToUndefined(await deps.getApiToken());
    if (!apiToken) {
      return createProxyErrorResponse(401, "MissingToken");
    }

    try {
      const upstreamRequestUrl =
        baseUrl && isSameHostAbsoluteUrl(upstreamUrl, baseUrl)
          ? appendAccessTokenQuery(upstreamUrl, apiToken)
          : upstreamUrl;

      const upstreamResponse = await fetchImpl(upstreamRequestUrl, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        method: "GET",
        redirect: "manual",
      });

      const contentType = upstreamResponse.headers.get("content-type");
      const body = await readBody(upstreamResponse);
      return {
        status: upstreamResponse.status,
        headers: contentType ? { "content-type": contentType } : undefined,
        body,
      };
    } catch {
      return createProxyErrorResponse(502, "UpstreamFetchFailed");
    }
  };
}

export function createGrowiAssetProxy(
  deps: GrowiAssetProxyDeps,
): GrowiAssetProxy {
  const requestHandler = createGrowiAssetProxyRequestHandler(deps);
  let server: http.Server | undefined;
  let started = false;
  let currentPort: number | undefined;

  function ensureStarted() {
    if (started) {
      return;
    }

    started = true;
    server = http.createServer(async (request, response) => {
      const result = await requestHandler(request);
      response.statusCode = result.status;
      for (const [header, value] of Object.entries(result.headers ?? {})) {
        response.setHeader(header, value);
      }

      if (!result.body) {
        response.end();
        return;
      }

      response.end(Buffer.from(result.body));
    });
    server.on("error", () => {
      currentPort = undefined;
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      if (!address || typeof address === "string") {
        currentPort = undefined;
        return;
      }

      currentPort = address.port;
    });
  }

  return {
    async dispose(): Promise<void> {
      if (!server) {
        return;
      }

      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
    },
    resolveProxyUrl(internalAssetId: string): string | undefined {
      ensureStarted();
      if (!currentPort) {
        return undefined;
      }

      return buildGrowiAssetProxyUrl(
        internalAssetId,
        `http://127.0.0.1:${currentPort}`,
      );
    },
  };
}

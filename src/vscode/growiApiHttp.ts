const REQUEST_TIMEOUT_MS = 10_000;

export type JsonObject = Record<string, unknown>;

export function isObjectRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function readStringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

export function readErrorMessage(
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

export async function parseJsonObject(
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

export async function parseOptionalJsonObject(
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

export async function parseOptionalErrorResponse(response: Response): Promise<{
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

export function isLoginRedirectResponse(response: Response): boolean {
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

export async function fetchWithTimeout(
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

export function createGetRequestInit(apiToken: string): RequestInit {
  return {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    method: "GET",
    redirect: "manual",
  };
}

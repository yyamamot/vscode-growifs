export type ParseFailureReason = "InvalidPath" | "InvalidUrl";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ParseFailureReason };

export type GrowiInputSource = "url" | "path";

export type GrowiUriResult = ParseResult<{
  canonicalPath: string;
  uri: string;
  source: GrowiInputSource;
}>;

export interface ResolveGrowiLinkOptions {
  baseUrl?: string;
}

export type AddPrefixReference = Extract<
  ParsedGrowiReference,
  { kind: "canonicalPath" | "pageIdPermalink" }
>;

const URL_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const MONGO_OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export type ParsedGrowiReference =
  | {
      kind: "canonicalPath";
      canonicalPath: string;
      uri: string;
      source: GrowiInputSource;
    }
  | {
      kind: "pageIdPermalink";
      pageId: string;
      source: "url";
    }
  | {
      kind: "ambiguousSingleSegmentHex";
      canonicalPath: string;
      pageId: string;
      source: "path";
    };

function decodePath(rawPath: string): ParseResult<string> {
  try {
    return { ok: true, value: decodeURIComponent(rawPath) };
  } catch {
    return { ok: false, reason: "InvalidPath" };
  }
}

function normalizeDecodedPath(decodedPath: string): ParseResult<string> {
  if (!decodedPath.startsWith("/")) {
    return { ok: false, reason: "InvalidPath" };
  }

  let normalized = decodedPath.replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.length > 1 && normalized.endsWith(".md")) {
    normalized = normalized.slice(0, -3);
  }
  if (normalized.length === 0) {
    normalized = "/";
  }

  return { ok: true, value: normalized };
}

export function normalizeCanonicalPath(rawPath: string): ParseResult<string> {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "InvalidPath" };
  }

  const decoded = decodePath(trimmed);
  if (!decoded.ok) {
    return decoded;
  }

  return normalizeDecodedPath(decoded.value);
}

export function buildGrowiUri(canonicalPath: string): string {
  return `growi:${canonicalPath}.md`;
}

export function buildGrowiUriFromInput(input: string): GrowiUriResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "InvalidPath" };
  }

  if (URL_PATTERN.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { ok: false, reason: "InvalidUrl" };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "InvalidUrl" };
    }

    const decodedPath = decodePath(parsed.pathname);
    if (!decodedPath.ok) {
      return { ok: false, reason: "InvalidUrl" };
    }

    const normalized = normalizeDecodedPath(decodedPath.value);
    if (!normalized.ok) {
      return { ok: false, reason: "InvalidUrl" };
    }

    return {
      ok: true,
      value: {
        canonicalPath: normalized.value,
        uri: buildGrowiUri(normalized.value),
        source: "url",
      },
    };
  }

  const normalized = normalizeCanonicalPath(trimmed);
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    value: {
      canonicalPath: normalized.value,
      uri: buildGrowiUri(normalized.value),
      source: "path",
    },
  };
}

function normalizeBasePathname(pathname: string): string {
  if (pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function parseHttpUrl(rawUrl: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }

  return parsed;
}

export function toPathFromBaseUrl(url: URL, baseUrl: URL): string | undefined {
  if (url.origin !== baseUrl.origin) {
    return undefined;
  }

  const basePathname = normalizeBasePathname(baseUrl.pathname);
  if (!url.pathname.startsWith(basePathname)) {
    return undefined;
  }

  const relativePath = url.pathname.slice(basePathname.length);
  return relativePath.length === 0 ? "/" : `/${relativePath}`;
}

function parseCanonicalPathReference(
  rawPath: string,
  source: GrowiInputSource,
): ParseResult<ParsedGrowiReference> {
  const normalized = normalizeCanonicalPath(rawPath);
  if (!normalized.ok) {
    return normalized;
  }

  const path = normalized.value;
  const singleSegment = path.slice(1);
  if (
    source === "path" &&
    path !== "/" &&
    !singleSegment.includes("/") &&
    MONGO_OBJECT_ID_PATTERN.test(singleSegment)
  ) {
    return {
      ok: true,
      value: {
        kind: "ambiguousSingleSegmentHex",
        canonicalPath: path,
        pageId: singleSegment,
        source,
      },
    };
  }

  return {
    ok: true,
    value: {
      kind: "canonicalPath",
      canonicalPath: path,
      uri: buildGrowiUri(path),
      source,
    },
  };
}

function isSingleSegmentCanonicalPath(path: string): boolean {
  const candidate = path.slice(1);
  return path !== "/" && candidate.length > 0 && !candidate.includes("/");
}

function parseSameBaseUrlReference(
  url: URL,
  baseUrl: URL | undefined,
): ParseResult<ParsedGrowiReference> {
  if (!baseUrl) {
    return { ok: false, reason: "InvalidUrl" };
  }

  const pathFromBaseUrl = toPathFromBaseUrl(url, baseUrl);
  if (!pathFromBaseUrl) {
    return { ok: false, reason: "InvalidUrl" };
  }

  const permalinkCandidate = pathFromBaseUrl.slice(1);
  if (
    permalinkCandidate.length > 0 &&
    !permalinkCandidate.includes("/") &&
    MONGO_OBJECT_ID_PATTERN.test(permalinkCandidate)
  ) {
    return {
      ok: true,
      value: {
        kind: "pageIdPermalink",
        pageId: permalinkCandidate,
        source: "url",
      },
    };
  }

  return parseCanonicalPathReference(pathFromBaseUrl, "url");
}

export function parseOpenPageInput(
  input: string,
  options: ResolveGrowiLinkOptions = {},
): ParseResult<ParsedGrowiReference> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "InvalidPath" };
  }

  if (URL_PATTERN.test(trimmed)) {
    const url = parseHttpUrl(trimmed);
    if (!url) {
      return { ok: false, reason: "InvalidUrl" };
    }

    const parsedBaseUrl = options.baseUrl
      ? parseHttpUrl(options.baseUrl.trim())
      : undefined;
    const sameBaseReference = parseSameBaseUrlReference(url, parsedBaseUrl);
    if (sameBaseReference.ok) {
      return sameBaseReference;
    }

    const pathnameReference = parseCanonicalPathReference(url.pathname, "url");
    if (!pathnameReference.ok) {
      return { ok: false, reason: "InvalidUrl" };
    }
    if (
      pathnameReference.value.kind === "canonicalPath" &&
      isSingleSegmentCanonicalPath(pathnameReference.value.canonicalPath) &&
      MONGO_OBJECT_ID_PATTERN.test(
        pathnameReference.value.canonicalPath.slice(1),
      )
    ) {
      return { ok: false, reason: "InvalidUrl" };
    }
    return pathnameReference;
  }

  return parseCanonicalPathReference(trimmed, "path");
}

export function parseAddPrefixInput(
  input: string,
  options: ResolveGrowiLinkOptions = {},
): ParseResult<AddPrefixReference> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "InvalidPath" };
  }

  if (!URL_PATTERN.test(trimmed)) {
    const normalized = normalizeCanonicalPath(trimmed);
    if (!normalized.ok) {
      return normalized;
    }
    return {
      ok: true,
      value: {
        kind: "canonicalPath",
        canonicalPath: normalized.value,
        uri: buildGrowiUri(normalized.value),
        source: "path",
      },
    };
  }

  const url = parseHttpUrl(trimmed);
  if (!url) {
    return { ok: false, reason: "InvalidUrl" };
  }

  const parsedBaseUrl = options.baseUrl
    ? parseHttpUrl(options.baseUrl.trim())
    : undefined;
  const sameBaseReference = parseSameBaseUrlReference(url, parsedBaseUrl);
  if (!sameBaseReference.ok) {
    return sameBaseReference;
  }
  if (sameBaseReference.value.kind !== "pageIdPermalink") {
    return { ok: false, reason: "InvalidUrl" };
  }

  return {
    ok: true,
    value: sameBaseReference.value,
  };
}

export function parseGrowiLinkReference(
  input: string,
  options: ResolveGrowiLinkOptions = {},
): ParsedGrowiReference | undefined {
  const trimmed = input.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return undefined;
  }

  if (trimmed.startsWith("/")) {
    const parsed = parseCanonicalPathReference(trimmed, "path");
    return parsed.ok ? parsed.value : undefined;
  }

  if (!URL_PATTERN.test(trimmed)) {
    return undefined;
  }

  const url = parseHttpUrl(trimmed);
  if (!url) {
    return undefined;
  }

  const parsedBaseUrl = options.baseUrl
    ? parseHttpUrl(options.baseUrl.trim())
    : undefined;
  if (!parsedBaseUrl) {
    return undefined;
  }

  const parsed = parseSameBaseUrlReference(url, parsedBaseUrl);
  return parsed.ok ? parsed.value : undefined;
}

export function resolveGrowiLinkToUri(
  input: string,
  options: ResolveGrowiLinkOptions = {},
): string | undefined {
  const trimmed = input.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("#") ||
    (!trimmed.startsWith("/") && !URL_PATTERN.test(trimmed))
  ) {
    return undefined;
  }

  if (trimmed.startsWith("/")) {
    const resolved = buildGrowiUriFromInput(trimmed);
    return resolved.ok ? resolved.value.uri : undefined;
  }

  const resolved = parseGrowiLinkReference(trimmed, options);
  if (!resolved || resolved.kind !== "canonicalPath") {
    return undefined;
  }

  return resolved.uri;
}

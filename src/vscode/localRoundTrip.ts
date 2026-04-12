import path from "node:path";

export const MIRROR_ROOT_DIR = ".growi-mirrors";
export const MIRROR_MANIFEST_NAME = ".growi-mirror.json";
export const MIRROR_ROOT_PAGE_NAME = "__root__.md";
export const LOCAL_WORK_FILE_NAME = "growi-current.md";
const ROUND_TRIP_METADATA_PREFIX = "<!-- GROWI-ROUNDTRIP ";
const ROUND_TRIP_METADATA_SUFFIX = " -->";

export interface MirrorManifestPage {
  canonicalPath: string;
  relativeFilePath: string;
  pageId: string;
  baseRevisionId: string;
  exportedAt: string;
  contentHash: string;
}

export interface MirrorManifestSkippedPage {
  canonicalPath: string;
  relativeFilePath: string;
  reason: "ReservedFileNameCollision";
}

export interface MirrorManifest {
  version: 1;
  baseUrl: string;
  rootCanonicalPath: string;
  mode: "page" | "prefix";
  exportedAt: string;
  pages: MirrorManifestPage[];
  skippedPages?: MirrorManifestSkippedPage[];
}

export type ParsedMirrorManifest =
  | { ok: true; value: MirrorManifest }
  | {
      ok: false;
      reason: "InvalidJson" | "InvalidShape";
    };

export interface LocalRoundTripMetadata {
  version: 1;
  baseUrl: string;
  canonicalPath: string;
  pageId: string;
  baseRevisionId: string;
  exportedAt: string;
}

type ParsedLocalRoundTripWorkFile =
  | {
      ok: true;
      value: {
        metadata: LocalRoundTripMetadata;
        body: string;
      };
    }
  | {
      ok: false;
      reason: "MissingMetadata" | "InvalidJson" | "InvalidShape";
    };

function sanitizeInstanceKeySegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeBasePathname(pathname: string): string {
  const normalizedPath = pathname.replace(/\\/g, "/").replace(/\\/g, "/");
  return normalizedPath.endsWith("/")
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
}

function isInvalidPathCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }
  if (codePoint <= 0x1f || codePoint === 0x7f) {
    return true;
  }
  return '<>:"/\\|?*'.includes(character);
}

function sanitizePathSegment(input: string): string {
  const normalized = input.normalize("NFC");
  const replaced = normalized
    .split("")
    .map((character) => (isInvalidPathCharacter(character) ? "_" : character))
    .join("")
    .trim()
    .replace(/[. ]+$/g, "");

  if (replaced === "." || replaced === "..") {
    return replaced.replace(/\./g, "_");
  }

  return replaced.length > 0 ? replaced : "_";
}

export function buildInstanceKey(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const trimmedPath = normalizeBasePathname(url.pathname);
    const raw = `${url.host}${trimmedPath}`;
    return sanitizeInstanceKeySegment(raw);
  } catch {
    return sanitizeInstanceKeySegment(baseUrl);
  }
}

export function buildLegacyInstanceKey(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const trimmedPath = normalizeBasePathname(url.pathname);
    const raw = `${url.origin}${trimmedPath}`;
    return sanitizeInstanceKeySegment(raw);
  } catch {
    return sanitizeInstanceKeySegment(baseUrl);
  }
}

export function canonicalPathToRelativeFilePath(canonicalPath: string): string {
  if (canonicalPath === "/") {
    return MIRROR_ROOT_PAGE_NAME;
  }
  const segments = canonicalPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(sanitizePathSegment);
  return `${path.posix.join(...segments)}.md`;
}

function getCanonicalPathBasename(canonicalPath: string): string | undefined {
  const segments = canonicalPath
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.at(-1);
}

function buildReservedMirrorFileName(canonicalPath: string): string {
  const basename = getCanonicalPathBasename(canonicalPath);
  if (!basename) {
    return MIRROR_ROOT_PAGE_NAME;
  }
  return `__${sanitizePathSegment(basename)}__.md`;
}

function isDirectoryPage(
  canonicalPath: string,
  allCanonicalPaths: readonly string[],
): boolean {
  const normalized = canonicalPath.endsWith("/")
    ? canonicalPath
    : `${canonicalPath}/`;
  return allCanonicalPaths.some(
    (candidate) =>
      candidate !== canonicalPath && candidate.startsWith(normalized),
  );
}

export function buildMirrorRelativeFilePath(
  rootCanonicalPath: string,
  canonicalPath: string,
  allCanonicalPaths: readonly string[] = [],
): string {
  if (canonicalPath === rootCanonicalPath) {
    return buildReservedMirrorFileName(canonicalPath);
  }

  if (rootCanonicalPath === "/") {
    const relativeSegments = canonicalPath
      .split("/")
      .filter((segment) => segment.length > 0)
      .map(sanitizePathSegment);
    if (isDirectoryPage(canonicalPath, allCanonicalPaths)) {
      return path.posix.join(
        ...relativeSegments,
        buildReservedMirrorFileName(canonicalPath),
      );
    }
    return `${path.posix.join(...relativeSegments)}.md`;
  }

  const normalizedRoot = rootCanonicalPath.endsWith("/")
    ? rootCanonicalPath
    : `${rootCanonicalPath}/`;
  const relativePath = canonicalPath.startsWith(normalizedRoot)
    ? canonicalPath.slice(normalizedRoot.length)
    : canonicalPath.replace(/^\/+/, "");
  const segments = relativePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(sanitizePathSegment);

  if (isDirectoryPage(canonicalPath, allCanonicalPaths)) {
    return path.posix.join(
      ...segments,
      buildReservedMirrorFileName(canonicalPath),
    );
  }

  return `${path.posix.join(...segments)}.md`;
}

export function planMirrorRelativeFilePaths(
  rootCanonicalPath: string,
  canonicalPaths: readonly string[],
): {
  pages: Array<{ canonicalPath: string; relativeFilePath: string }>;
  skippedPages: MirrorManifestSkippedPage[];
} {
  const planned = canonicalPaths.map((canonicalPath) => {
    const relativeFilePath = buildMirrorRelativeFilePath(
      rootCanonicalPath,
      canonicalPath,
      canonicalPaths,
    );
    return {
      canonicalPath,
      relativeFilePath,
      isReserved:
        canonicalPath === rootCanonicalPath ||
        isDirectoryPage(canonicalPath, canonicalPaths),
    };
  });

  const pages: Array<{ canonicalPath: string; relativeFilePath: string }> = [];
  const skippedPages: MirrorManifestSkippedPage[] = [];
  const pathGroups = new Map<string, typeof planned>();

  for (const page of planned) {
    const group = pathGroups.get(page.relativeFilePath);
    if (group) {
      group.push(page);
      continue;
    }
    pathGroups.set(page.relativeFilePath, [page]);
  }

  for (const group of pathGroups.values()) {
    if (group.length === 1) {
      pages.push({
        canonicalPath: group[0].canonicalPath,
        relativeFilePath: group[0].relativeFilePath,
      });
      continue;
    }

    const reservedEntries = group.filter((entry) => entry.isReserved);
    if (reservedEntries.length === 0) {
      for (const entry of group) {
        pages.push({
          canonicalPath: entry.canonicalPath,
          relativeFilePath: entry.relativeFilePath,
        });
      }
      continue;
    }

    const kept = reservedEntries[0];
    pages.push({
      canonicalPath: kept.canonicalPath,
      relativeFilePath: kept.relativeFilePath,
    });

    for (const entry of group) {
      if (entry === kept) {
        continue;
      }
      skippedPages.push({
        canonicalPath: entry.canonicalPath,
        relativeFilePath: entry.relativeFilePath,
        reason: "ReservedFileNameCollision",
      });
    }
  }

  return { pages, skippedPages };
}

function canonicalPathToDirectory(canonicalPath: string): string {
  if (canonicalPath === "/") {
    return "";
  }
  return path.posix.join(
    ...canonicalPath
      .split("/")
      .filter((segment) => segment.length > 0)
      .map(sanitizePathSegment),
  );
}

export function buildMirrorRootPath(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
): string {
  const instanceKey = buildInstanceKey(baseUrl);
  return buildMirrorRootPathWithInstanceKey(
    workspaceRoot,
    instanceKey,
    rootCanonicalPath,
  );
}

export function buildMirrorRootPathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
): string {
  const directory = canonicalPathToDirectory(rootCanonicalPath);
  return path.join(workspaceRoot, MIRROR_ROOT_DIR, instanceKey, directory);
}

export function buildMirrorManifestPath(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
): string {
  return buildMirrorManifestPathWithInstanceKey(
    workspaceRoot,
    buildInstanceKey(baseUrl),
    rootCanonicalPath,
  );
}

export function buildMirrorManifestPathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
): string {
  return path.join(
    buildMirrorRootPathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      rootCanonicalPath,
    ),
    MIRROR_MANIFEST_NAME,
  );
}

export function buildMirrorPageFilePath(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
  relativeFilePath: string,
): string {
  return buildMirrorPageFilePathWithInstanceKey(
    workspaceRoot,
    buildInstanceKey(baseUrl),
    rootCanonicalPath,
    relativeFilePath,
  );
}

export function buildMirrorPageFilePathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
  relativeFilePath: string,
): string {
  return path.join(
    buildMirrorRootPathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      rootCanonicalPath,
    ),
    ...relativeFilePath.split("/"),
  );
}

export function serializeMirrorManifest(manifest: MirrorManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseMirrorManifest(raw: string): ParsedMirrorManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "InvalidJson" };
  }

  const candidate = parsed as Partial<MirrorManifest>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    candidate.version !== 1 ||
    typeof candidate.baseUrl !== "string" ||
    typeof candidate.rootCanonicalPath !== "string" ||
    (candidate.mode !== "page" && candidate.mode !== "prefix") ||
    typeof candidate.exportedAt !== "string" ||
    !Array.isArray(candidate.pages)
  ) {
    return { ok: false, reason: "InvalidShape" };
  }

  const pages: MirrorManifestPage[] = [];
  const skippedPages: MirrorManifestSkippedPage[] = [];
  for (const page of candidate.pages) {
    if (
      typeof page !== "object" ||
      page === null ||
      typeof page.canonicalPath !== "string" ||
      typeof page.relativeFilePath !== "string" ||
      typeof page.pageId !== "string" ||
      typeof page.baseRevisionId !== "string" ||
      typeof page.exportedAt !== "string" ||
      typeof page.contentHash !== "string"
    ) {
      return { ok: false, reason: "InvalidShape" };
    }
    pages.push({
      canonicalPath: page.canonicalPath,
      relativeFilePath: page.relativeFilePath,
      pageId: page.pageId,
      baseRevisionId: page.baseRevisionId,
      exportedAt: page.exportedAt,
      contentHash: page.contentHash,
    });
  }

  if (candidate.skippedPages !== undefined) {
    if (!Array.isArray(candidate.skippedPages)) {
      return { ok: false, reason: "InvalidShape" };
    }
    for (const page of candidate.skippedPages) {
      if (
        typeof page !== "object" ||
        page === null ||
        typeof page.canonicalPath !== "string" ||
        typeof page.relativeFilePath !== "string" ||
        page.reason !== "ReservedFileNameCollision"
      ) {
        return { ok: false, reason: "InvalidShape" };
      }
      skippedPages.push({
        canonicalPath: page.canonicalPath,
        relativeFilePath: page.relativeFilePath,
        reason: "ReservedFileNameCollision",
      });
    }
  }

  return {
    ok: true,
    value: {
      version: 1,
      baseUrl: candidate.baseUrl,
      rootCanonicalPath: candidate.rootCanonicalPath,
      mode: candidate.mode as "page" | "prefix",
      exportedAt: candidate.exportedAt,
      pages,
      ...(skippedPages.length > 0 ? { skippedPages } : {}),
    },
  };
}

// Compatibility exports for call sites that still use the legacy local round-trip model.
export function buildLocalWorkFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, LOCAL_WORK_FILE_NAME);
}

export function serializeLocalRoundTripWorkFile(
  metadata: LocalRoundTripMetadata,
  body: string,
): string {
  return `${ROUND_TRIP_METADATA_PREFIX}${JSON.stringify(metadata)}${ROUND_TRIP_METADATA_SUFFIX}\n\n${body}`;
}

export function parseLocalRoundTripWorkFile(
  raw: string,
): ParsedLocalRoundTripWorkFile {
  const match =
    /^(<!-- GROWI-ROUNDTRIP (\{.*\}) -->)(?:\r?\n)(?:\r?\n)([\s\S]*)$/u.exec(
      raw,
    );
  if (!match) {
    return { ok: false, reason: "MissingMetadata" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[2]);
  } catch {
    return { ok: false, reason: "InvalidJson" };
  }

  const candidate = parsed as {
    version?: unknown;
    baseUrl?: unknown;
    canonicalPath?: unknown;
    pageId?: unknown;
    baseRevisionId?: unknown;
    exportedAt?: unknown;
  };

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    candidate.version !== 1 ||
    typeof candidate.baseUrl !== "string" ||
    typeof candidate.canonicalPath !== "string" ||
    typeof candidate.pageId !== "string" ||
    typeof candidate.baseRevisionId !== "string" ||
    typeof candidate.exportedAt !== "string"
  ) {
    return { ok: false, reason: "InvalidShape" };
  }

  return {
    ok: true,
    value: {
      metadata: {
        version: 1,
        baseUrl: candidate.baseUrl,
        canonicalPath: candidate.canonicalPath,
        pageId: candidate.pageId,
        baseRevisionId: candidate.baseRevisionId,
        exportedAt: candidate.exportedAt,
      },
      body: match[3],
    },
  };
}

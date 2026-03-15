import type {
  GrowiAccessFailureReason,
  GrowiReadFailureReason,
} from "./fsProvider";

export const GROWI_REVISION_SCHEME = "growi-revision";

export type GrowiRevisionSummary = {
  revisionId: string;
  createdAt: string;
  author: string;
};

export type GrowiRevisionListResult =
  | { ok: true; revisions: readonly GrowiRevisionSummary[] }
  | { ok: false; reason: GrowiAccessFailureReason };

export type GrowiRevisionReadResult =
  | { ok: true; body: string }
  | { ok: false; reason: GrowiReadFailureReason };

export type GrowiRevisionUriLike = {
  scheme: string;
  path: string;
};

export type GrowiRevisionReader = {
  readRevision(
    pageId: string,
    revisionId: string,
  ): Promise<GrowiRevisionReadResult>;
};

type ParsedGrowiRevisionUri =
  | {
      ok: true;
      pageId: string;
      revisionId: string;
      canonicalPath: string;
    }
  | { ok: false };

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function decodePathPart(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function buildGrowiRevisionUri(input: {
  pageId: string;
  revisionId: string;
  canonicalPath: string;
}): GrowiRevisionUriLike {
  const canonicalPath =
    input.canonicalPath === "/" ? "/__root__" : input.canonicalPath;

  return {
    scheme: GROWI_REVISION_SCHEME,
    path: `/${encodePathPart(input.pageId)}/${encodePathPart(
      input.revisionId,
    )}${canonicalPath}.md`,
  };
}

export function parseGrowiRevisionUri(input: {
  scheme: string;
  path: string;
}): ParsedGrowiRevisionUri {
  if (input.scheme !== GROWI_REVISION_SCHEME) {
    return { ok: false };
  }

  const segments = input.path.split("/");
  if (segments.length < 4) {
    return { ok: false };
  }

  const pageId = decodePathPart(segments[1] ?? "");
  const revisionId = decodePathPart(segments[2] ?? "");
  if (!pageId || !revisionId) {
    return { ok: false };
  }

  const remainder = `/${segments.slice(3).join("/")}`;
  if (!remainder.endsWith(".md")) {
    return { ok: false };
  }

  const rawCanonicalPath = remainder.slice(0, -3);
  const canonicalPath =
    rawCanonicalPath === "/__root__" ? "/" : rawCanonicalPath;
  if (!canonicalPath.startsWith("/")) {
    return { ok: false };
  }

  return {
    ok: true,
    pageId,
    revisionId,
    canonicalPath,
  };
}

import { buildGrowiUri, type ParsedGrowiReference } from "../core/uri";
import type {
  GrowiAccessFailureReason,
  GrowiReadFailureReason,
} from "./fsProvider";

export type ResolvePageIdResult =
  | { ok: true; canonicalPath: string }
  | { ok: false; reason: GrowiReadFailureReason };

export interface PageReferenceResolverDeps {
  resolvePageId(pageId: string): Promise<ResolvePageIdResult>;
}

export type ResolveParsedGrowiReferenceResult =
  | { ok: true; canonicalPath: string; uri: string }
  | { ok: false; reason: GrowiReadFailureReason };

const CACHE_TTL_MS = 60_000;

export function createPageReferenceResolver(deps: PageReferenceResolverDeps) {
  const cache = new Map<
    string,
    { canonicalPath: string; expiresAtMs: number }
  >();
  const inFlight = new Map<string, Promise<ResolvePageIdResult>>();

  async function resolvePageId(pageId: string): Promise<ResolvePageIdResult> {
    const cached = cache.get(pageId);
    if (cached && cached.expiresAtMs > Date.now()) {
      return { ok: true, canonicalPath: cached.canonicalPath };
    }
    if (cached) {
      cache.delete(pageId);
    }

    const existing = inFlight.get(pageId);
    if (existing) {
      return existing;
    }

    const request = deps.resolvePageId(pageId).then((result) => {
      if (result.ok) {
        cache.set(pageId, {
          canonicalPath: result.canonicalPath,
          expiresAtMs: Date.now() + CACHE_TTL_MS,
        });
      }
      return result;
    });
    inFlight.set(pageId, request);

    try {
      return await request;
    } finally {
      if (inFlight.get(pageId) === request) {
        inFlight.delete(pageId);
      }
    }
  }

  async function resolveReference(
    reference: ParsedGrowiReference,
  ): Promise<ResolveParsedGrowiReferenceResult> {
    if (reference.kind === "canonicalPath") {
      return {
        ok: true,
        canonicalPath: reference.canonicalPath,
        uri: reference.uri,
      };
    }

    if (reference.kind === "pageIdPermalink") {
      const resolved = await resolvePageId(reference.pageId);
      if (!resolved.ok) {
        return resolved;
      }
      return {
        ok: true,
        canonicalPath: resolved.canonicalPath,
        uri: buildGrowiUri(resolved.canonicalPath),
      };
    }

    const resolved = await resolvePageId(reference.pageId);
    if (resolved.ok) {
      return {
        ok: true,
        canonicalPath: resolved.canonicalPath,
        uri: buildGrowiUri(resolved.canonicalPath),
      };
    }
    if (resolved.reason === "NotFound") {
      return {
        ok: true,
        canonicalPath: reference.canonicalPath,
        uri: buildGrowiUri(reference.canonicalPath),
      };
    }
    return resolved;
  }

  return {
    resolvePageId,
    resolveReference,
  };
}

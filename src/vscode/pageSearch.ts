import {
  type ParsedGrowiReference,
  parseGrowiLinkReference,
} from "../core/uri";
import { collectMarkdownLinkCandidates } from "./markdownLinks";

export type ListPagesResult =
  | { ok: true; paths: string[] }
  | { ok: false; reason: "ApiNotSupported" | "ConnectionFailed" };

export type ReadPageBodyResult =
  | { ok: true; body: string }
  | {
      ok: false;
      reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
    };

export interface FindBacklinksInput {
  targetCanonicalPath: string;
  targetPageId?: string;
  baseUrl: string | undefined;
  prefixes: string[];
  listPages(canonicalPrefixPath: string): Promise<ListPagesResult>;
  readPageBody(canonicalPath: string): Promise<ReadPageBodyResult>;
  resolvePageReference(reference: ParsedGrowiReference): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | {
        ok: false;
        reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
      }
  >;
  timeoutMs: number;
  limit: number;
}

export type FindBacklinksResult =
  | {
      ok: true;
      backlinks: string[];
      truncatedByLimit: boolean;
      timedOut: boolean;
    }
  | {
      ok: false;
      reason:
        | "ListPagesApiNotSupported"
        | "ReadPageApiNotSupported"
        | "ConnectionFailed"
        | "Unexpected";
    };

async function includesTargetLink(
  body: string,
  targetCanonicalPath: string,
  targetPageId: string | undefined,
  baseUrl: string | undefined,
  resolvePageReference: FindBacklinksInput["resolvePageReference"],
): Promise<boolean> {
  for (const candidate of collectMarkdownLinkCandidates(body)) {
    if (candidate.isImage) {
      continue;
    }

    const parsed = parseGrowiLinkReference(candidate.normalizedTarget, {
      baseUrl,
    });
    if (!parsed) {
      continue;
    }

    if (
      targetPageId &&
      (parsed.kind === "pageIdPermalink" ||
        parsed.kind === "ambiguousSingleSegmentHex") &&
      parsed.pageId === targetPageId
    ) {
      return true;
    }

    const resolved = await resolvePageReference(parsed);
    if (!resolved.ok) {
      continue;
    }
    if (resolved.canonicalPath === targetCanonicalPath) {
      return true;
    }
  }

  return false;
}

export async function findBacklinks(
  input: FindBacklinksInput,
): Promise<FindBacklinksResult> {
  const deadlineMs = Date.now() + input.timeoutMs;
  const orderedCandidates: string[] = [];
  const seenCandidates = new Set<string>();
  let timedOut = false;

  for (const prefix of input.prefixes) {
    if (Date.now() >= deadlineMs) {
      timedOut = true;
      break;
    }

    let listResult: ListPagesResult;
    try {
      listResult = await input.listPages(prefix);
    } catch {
      return { ok: false, reason: "Unexpected" };
    }

    if (!listResult.ok) {
      if (listResult.reason === "ApiNotSupported") {
        return { ok: false, reason: "ListPagesApiNotSupported" };
      }
      return { ok: false, reason: "ConnectionFailed" };
    }

    for (const canonicalPath of listResult.paths) {
      if (seenCandidates.has(canonicalPath)) {
        continue;
      }
      seenCandidates.add(canonicalPath);

      if (canonicalPath === input.targetCanonicalPath) {
        continue;
      }

      orderedCandidates.push(canonicalPath);
    }
  }

  const backlinks: string[] = [];
  let truncatedByLimit = false;

  for (const candidatePath of orderedCandidates) {
    if (backlinks.length >= input.limit) {
      truncatedByLimit = true;
      break;
    }

    if (Date.now() >= deadlineMs) {
      timedOut = true;
      break;
    }

    let readResult: ReadPageBodyResult;
    try {
      readResult = await input.readPageBody(candidatePath);
    } catch {
      return { ok: false, reason: "Unexpected" };
    }

    if (!readResult.ok) {
      if (readResult.reason === "ApiNotSupported") {
        return { ok: false, reason: "ReadPageApiNotSupported" };
      }
      if (readResult.reason === "ConnectionFailed") {
        return { ok: false, reason: "ConnectionFailed" };
      }
      return { ok: false, reason: "Unexpected" };
    }

    if (
      await includesTargetLink(
        readResult.body,
        input.targetCanonicalPath,
        input.targetPageId,
        input.baseUrl,
        input.resolvePageReference,
      )
    ) {
      backlinks.push(candidatePath);
    }
  }

  return {
    ok: true,
    backlinks,
    truncatedByLimit,
    timedOut,
  };
}

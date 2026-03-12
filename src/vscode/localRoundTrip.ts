import path from "node:path";

export const LOCAL_WORK_FILE_NAME = "growi-current.md";
const ROUND_TRIP_METADATA_PREFIX = "<!-- GROWI-ROUNDTRIP ";
const ROUND_TRIP_METADATA_SUFFIX = " -->";

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

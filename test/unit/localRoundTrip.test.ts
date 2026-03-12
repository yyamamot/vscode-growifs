import { describe, expect, it } from "vitest";

import {
  buildLocalWorkFilePath,
  LOCAL_WORK_FILE_NAME,
  parseLocalRoundTripWorkFile,
  serializeLocalRoundTripWorkFile,
} from "../../src/vscode/localRoundTrip";

describe("localRoundTrip", () => {
  it("builds the fixed local work file path from workspace root", () => {
    expect(buildLocalWorkFilePath("/tmp/workspace")).toBe(
      `/tmp/workspace/${LOCAL_WORK_FILE_NAME}`,
    );
  });

  it("serializes and parses metadata embedded in the work file", () => {
    const serialized = serializeLocalRoundTripWorkFile(
      {
        version: 1,
        baseUrl: "https://growi.example.com/",
        canonicalPath: "/team/dev/spec",
        pageId: "page-123",
        baseRevisionId: "revision-001",
        exportedAt: "2026-03-09T00:00:00.000Z",
      },
      "# sample\n",
    );

    expect(serialized).toContain("<!-- GROWI-ROUNDTRIP ");
    expect(parseLocalRoundTripWorkFile(serialized)).toEqual({
      ok: true,
      value: {
        metadata: {
          version: 1,
          baseUrl: "https://growi.example.com/",
          canonicalPath: "/team/dev/spec",
          pageId: "page-123",
          baseRevisionId: "revision-001",
          exportedAt: "2026-03-09T00:00:00.000Z",
        },
        body: "# sample\n",
      },
    });
  });

  it("rejects files without metadata comment", () => {
    expect(parseLocalRoundTripWorkFile("# sample\n")).toEqual({
      ok: false,
      reason: "MissingMetadata",
    });
  });

  it("rejects malformed metadata JSON", () => {
    expect(
      parseLocalRoundTripWorkFile(
        "<!-- GROWI-ROUNDTRIP {invalid json} -->\n\n# sample\n",
      ),
    ).toEqual({
      ok: false,
      reason: "InvalidJson",
    });
  });

  it("rejects metadata with missing required fields", () => {
    expect(
      parseLocalRoundTripWorkFile(
        '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/"} -->\n\n# sample\n',
      ),
    ).toEqual({
      ok: false,
      reason: "InvalidShape",
    });
  });
});

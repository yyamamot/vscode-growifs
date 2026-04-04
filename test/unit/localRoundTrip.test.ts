import { describe, expect, it } from "vitest";

import {
  buildInstanceKey,
  buildLegacyInstanceKey,
  buildLocalWorkFilePath,
  buildMirrorRelativeFilePath,
  LOCAL_WORK_FILE_NAME,
  parseLocalRoundTripWorkFile,
  parseMirrorManifest,
  planMirrorRelativeFilePaths,
  serializeLocalRoundTripWorkFile,
  serializeMirrorManifest,
} from "../../src/vscode/localRoundTrip";

describe("localRoundTrip", () => {
  it("builds the fixed local work file path from workspace root", () => {
    expect(buildLocalWorkFilePath("/tmp/workspace")).toBe(
      `/tmp/workspace/${LOCAL_WORK_FILE_NAME}`,
    );
  });

  it("builds scheme-less instance keys while keeping host, port, and basePath", () => {
    expect(buildInstanceKey("http://localhost:3000/")).toBe("localhost_3000");
    expect(buildInstanceKey("https://growi.example.com/")).toBe(
      "growi.example.com",
    );
    expect(buildInstanceKey("https://growi.example.com/app/")).toBe(
      "growi.example.com_app",
    );
    expect(buildInstanceKey("http://localhost:3000/growi/dev/")).toBe(
      "localhost_3000_growi_dev",
    );
  });

  it("keeps the legacy instance key generator available for compatibility", () => {
    expect(buildLegacyInstanceKey("http://localhost:3000/")).toBe(
      "http___localhost_3000",
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

  it("builds reserved filenames for root and directory pages", () => {
    expect(buildMirrorRelativeFilePath("/sample", "/sample")).toBe(
      "__sample__.md",
    );
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/test", [
        "/sample",
        "/sample/test",
        "/sample/test/page",
      ]),
    ).toBe("test/__test__.md");
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/test/page", [
        "/sample",
        "/sample/test",
        "/sample/test/page",
      ]),
    ).toBe("test/page.md");
    expect(buildMirrorRelativeFilePath("/", "/")).toBe("__root__.md");
  });

  it("keeps Japanese page names readable in mirror filenames", () => {
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/無題のページ-1", [
        "/sample",
        "/sample/無題のページ-1",
      ]),
    ).toBe("無題のページ-1.md");
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/無題のページ", [
        "/sample",
        "/sample/無題のページ",
        "/sample/無題のページ/子ページ",
      ]),
    ).toBe("無題のページ/__無題のページ__.md");
  });

  it("replaces only filesystem-unsafe characters in mirror filenames", () => {
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/a:b?c", [
        "/sample",
        "/sample/a:b?c",
      ]),
    ).toBe("a_b_c.md");
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/..", [
        "/sample",
        "/sample/..",
      ]),
    ).toBe("_.md");
    expect(
      buildMirrorRelativeFilePath("/sample", "/sample/末尾ドット.", [
        "/sample",
        "/sample/末尾ドット.",
      ]),
    ).toBe("末尾ドット.md");
  });

  it("plans skipped pages when reserved filenames collide", () => {
    expect(
      planMirrorRelativeFilePaths("/sample", [
        "/sample",
        "/sample/test",
        "/sample/test/__test__",
      ]),
    ).toEqual({
      pages: [
        { canonicalPath: "/sample", relativeFilePath: "__sample__.md" },
        { canonicalPath: "/sample/test", relativeFilePath: "test/__test__.md" },
      ],
      skippedPages: [
        {
          canonicalPath: "/sample/test/__test__",
          relativeFilePath: "test/__test__.md",
          reason: "ReservedFileNameCollision",
        },
      ],
    });
  });

  it("round-trips manifests with skipped pages", () => {
    const raw = serializeMirrorManifest({
      version: 1,
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/sample",
      mode: "prefix",
      exportedAt: "2026-03-09T00:00:00.000Z",
      pages: [
        {
          canonicalPath: "/sample",
          relativeFilePath: "__sample__.md",
          pageId: "page:/sample",
          baseRevisionId: "revision:/sample:001",
          exportedAt: "2026-03-09T00:00:00.000Z",
          contentHash: "hash-001",
        },
      ],
      skippedPages: [
        {
          canonicalPath: "/sample/test/__test__",
          relativeFilePath: "test/__test__.md",
          reason: "ReservedFileNameCollision",
        },
      ],
    });

    expect(parseMirrorManifest(raw)).toEqual({
      ok: true,
      value: {
        version: 1,
        baseUrl: "https://growi.example.com/",
        rootCanonicalPath: "/sample",
        mode: "prefix",
        exportedAt: "2026-03-09T00:00:00.000Z",
        pages: [
          {
            canonicalPath: "/sample",
            relativeFilePath: "__sample__.md",
            pageId: "page:/sample",
            baseRevisionId: "revision:/sample:001",
            exportedAt: "2026-03-09T00:00:00.000Z",
            contentHash: "hash-001",
          },
        ],
        skippedPages: [
          {
            canonicalPath: "/sample/test/__test__",
            relativeFilePath: "test/__test__.md",
            reason: "ReservedFileNameCollision",
          },
        ],
      },
    });
  });
});

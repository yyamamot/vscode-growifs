import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { serializeMirrorManifest } from "../../src/vscode/localRoundTrip";
import { createPageFreshnessService } from "../../src/vscode/pageFreshnessService";

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

describe("pageFreshnessService", () => {
  it("returns localChanges when mirror manifest reports local-only changes", async () => {
    const service = createPageFreshnessService({
      getLocalWorkspaceRoot: vi.fn(() => "/workspace"),
      getBaseUrl: vi.fn(() => "https://growi.example.com/"),
      readLocalFile: vi.fn(async (filePath: string) => {
        if (
          filePath ===
          "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/.growi-mirror.json"
        ) {
          return serializeMirrorManifest({
            version: 1,
            baseUrl: "https://growi.example.com/",
            rootCanonicalPath: "/team/dev/spec",
            mode: "page",
            exportedAt: "2026-03-08T09:00:00.000Z",
            pages: [
              {
                canonicalPath: "/team/dev/spec",
                relativeFilePath: "__spec__.md",
                pageId: "page-1",
                baseRevisionId: "rev-1",
                exportedAt: "2026-03-08T09:00:00.000Z",
                contentHash: hashBody("# server body\n"),
              },
            ],
          });
        }
        if (
          filePath ===
          "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md"
        ) {
          return "# local changed\n";
        }
        throw new Error(`Unexpected file path: ${filePath}`);
      }),
      bootstrapEditSession: vi.fn(async () => ({
        ok: true as const,
        value: {
          pageId: "page-1",
          baseRevisionId: "rev-1",
          baseBody: "# server body\n",
        },
      })),
      getEditSession: vi.fn(() => undefined),
      getCurrentPageInfo: vi.fn(() => undefined),
      getCurrentRevision: vi.fn(async () => ({
        ok: true as const,
        revisionId: "rev-1",
      })),
    });

    await expect(
      service.checkOpenedPageDecorationStatus("/team/dev/spec"),
    ).resolves.toBe("localChanges");
  });

  it("returns remoteChanges and conflicts from mirror compare status", async () => {
    const createService = (localBody: string, remoteRevisionId: string) =>
      createPageFreshnessService({
        getLocalWorkspaceRoot: vi.fn(() => "/workspace"),
        getBaseUrl: vi.fn(() => "https://growi.example.com/"),
        readLocalFile: vi.fn(async (filePath: string) => {
          if (
            filePath ===
            "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/.growi-mirror.json"
          ) {
            return serializeMirrorManifest({
              version: 1,
              baseUrl: "https://growi.example.com/",
              rootCanonicalPath: "/team/dev/spec",
              mode: "page",
              exportedAt: "2026-03-08T09:00:00.000Z",
              pages: [
                {
                  canonicalPath: "/team/dev/spec",
                  relativeFilePath: "__spec__.md",
                  pageId: "page-1",
                  baseRevisionId: "rev-1",
                  exportedAt: "2026-03-08T09:00:00.000Z",
                  contentHash: hashBody("# server body\n"),
                },
              ],
            });
          }
          if (
            filePath ===
            "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md"
          ) {
            return localBody;
          }
          throw new Error(`Unexpected file path: ${filePath}`);
        }),
        bootstrapEditSession: vi.fn(async () => ({
          ok: true as const,
          value: {
            pageId: "page-1",
            baseRevisionId: remoteRevisionId,
            baseBody: "# server body\n",
          },
        })),
        getEditSession: vi.fn(() => undefined),
        getCurrentPageInfo: vi.fn(() => undefined),
        getCurrentRevision: vi.fn(async () => ({
          ok: true as const,
          revisionId: remoteRevisionId,
        })),
      });

    await expect(
      createService("# server body\n", "rev-2").getOpenedPageLiveState(
        "/team/dev/spec",
      ),
    ).resolves.toEqual({
      decorationStatus: "remoteChanges",
      scmResource: {
        canonicalPath: "/team/dev/spec",
        status: "RemoteChanged",
        localFileUri: {
          scheme: "file",
          path: "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md",
          fsPath:
            "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md",
        },
        remoteUri: {
          scheme: "growi",
          path: "/team/dev/spec.md",
        },
      },
    });

    await expect(
      createService("# local changed\n", "rev-2").getOpenedPageLiveState(
        "/team/dev/spec",
      ),
    ).resolves.toEqual({
      decorationStatus: "conflicts",
      scmResource: {
        canonicalPath: "/team/dev/spec",
        status: "Conflict",
        localFileUri: {
          scheme: "file",
          path: "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md",
          fsPath:
            "/workspace/.growi-mirrors/growi.example.com/team/dev/spec/__spec__.md",
        },
        remoteUri: {
          scheme: "growi",
          path: "/team/dev/spec.md",
        },
      },
    });
  });

  it("falls back to remoteNewer only when mirror status is unavailable", async () => {
    const getCurrentRevision = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        revisionId: "rev-2",
      })
      .mockResolvedValueOnce({
        ok: true as const,
        revisionId: "rev-1",
      });

    const service = createPageFreshnessService({
      getLocalWorkspaceRoot: vi.fn(() => "/workspace"),
      getBaseUrl: vi.fn(() => "https://growi.example.com/"),
      readLocalFile: vi.fn(async () => {
        throw new Error("manifest missing");
      }),
      bootstrapEditSession: vi.fn(),
      getEditSession: vi.fn(() => undefined),
      getCurrentPageInfo: vi.fn(() => ({
        pageId: "page-1",
        revisionId: "rev-1",
        url: "growi:/team/dev/spec.md",
        path: "/team/dev/spec",
        lastUpdatedBy: "alice",
        lastUpdatedAt: "2026-03-08T09:00:00.000Z",
      })),
      getCurrentRevision,
    });

    await expect(
      service.getOpenedPageLiveState("/team/dev/spec"),
    ).resolves.toEqual({
      decorationStatus: "remoteNewer",
    });
    await expect(
      service.getOpenedPageLiveState("/team/dev/spec"),
    ).resolves.toEqual({
      decorationStatus: "none",
    });
    expect(getCurrentRevision).toHaveBeenCalledTimes(2);
  });

  it("does not show fallback when mirror reports unchanged or missing states", async () => {
    const createService = (
      readLocalFile: (filePath: string) => Promise<string>,
      bootstrapEditSession: () => Promise<
        | {
            ok: true;
            value: {
              pageId: string;
              baseRevisionId: string;
              baseBody: string;
            };
          }
        | {
            ok: false;
            reason: "NotFound";
          }
      >,
    ) =>
      createPageFreshnessService({
        getLocalWorkspaceRoot: vi.fn(() => "/workspace"),
        getBaseUrl: vi.fn(() => "https://growi.example.com/"),
        readLocalFile: vi.fn(readLocalFile),
        bootstrapEditSession: vi.fn(bootstrapEditSession),
        getEditSession: vi.fn(() => undefined),
        getCurrentPageInfo: vi.fn(() => ({
          pageId: "page-1",
          revisionId: "rev-1",
          url: "growi:/team/dev/spec.md",
          path: "/team/dev/spec",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T09:00:00.000Z",
        })),
        getCurrentRevision: vi.fn(async () => ({
          ok: true as const,
          revisionId: "rev-2",
        })),
      });

    const unchangedManifest = serializeMirrorManifest({
      version: 1,
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/team/dev/spec",
      mode: "page",
      exportedAt: "2026-03-08T09:00:00.000Z",
      pages: [
        {
          canonicalPath: "/team/dev/spec",
          relativeFilePath: "__spec__.md",
          pageId: "page-1",
          baseRevisionId: "rev-1",
          exportedAt: "2026-03-08T09:00:00.000Z",
          contentHash: hashBody("# server body\n"),
        },
      ],
    });

    await expect(
      createService(
        async (filePath: string) => {
          if (filePath.endsWith(".growi-mirror.json")) {
            return unchangedManifest;
          }
          return "# server body\n";
        },
        async () => ({
          ok: true as const,
          value: {
            pageId: "page-1",
            baseRevisionId: "rev-1",
            baseBody: "# server body\n",
          },
        }),
      ).checkOpenedPageDecorationStatus("/team/dev/spec"),
    ).resolves.toBe("none");

    await expect(
      createService(
        async (filePath: string) => {
          if (filePath.endsWith(".growi-mirror.json")) {
            return unchangedManifest;
          }
          throw new Error("missing local");
        },
        async () => ({
          ok: true as const,
          value: {
            pageId: "page-1",
            baseRevisionId: "rev-1",
            baseBody: "# server body\n",
          },
        }),
      ).checkOpenedPageDecorationStatus("/team/dev/spec"),
    ).resolves.toBe("none");

    await expect(
      createService(
        async (filePath: string) => {
          if (filePath.endsWith(".growi-mirror.json")) {
            return unchangedManifest;
          }
          return "# server body\n";
        },
        async () => ({
          ok: false as const,
          reason: "NotFound",
        }),
      ).checkOpenedPageDecorationStatus("/team/dev/spec"),
    ).resolves.toBe("none");
  });
});

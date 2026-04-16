import { describe, expect, it, vi } from "vitest";
import { createPageFreshnessService } from "../../src/vscode/pageFreshnessService";

describe("pageFreshnessService", () => {
  it("re-checks the remote revision on subsequent calls for the same local revision", async () => {
    const getEditSession = vi.fn(() => undefined);
    const getCurrentPageInfo = vi.fn(() => ({
      pageId: "page-1",
      revisionId: "rev-1",
      url: "growi:/team/dev/spec.md",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    }));
    const getCurrentRevision = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        revisionId: "rev-1",
      })
      .mockResolvedValueOnce({
        ok: true as const,
        revisionId: "rev-2",
      });

    const service = createPageFreshnessService({
      getEditSession,
      getCurrentPageInfo,
      getCurrentRevision,
    });

    await expect(service.checkPageFreshness("/team/dev/spec")).resolves.toBe(
      "fresh",
    );
    await expect(service.checkPageFreshness("/team/dev/spec.md")).resolves.toBe(
      "stale",
    );
    expect(getCurrentRevision).toHaveBeenCalledTimes(2);
  });

  it("returns stale when the remote revision differs from the edit session base revision", async () => {
    const getEditSession = vi.fn(() => ({
      pageId: "page-1",
      baseRevisionId: "rev-1",
      baseUpdatedAt: "2026-03-08T09:00:00.000Z",
      baseBody: "# body",
      enteredAt: "2026-03-08T09:00:00.000Z",
      dirty: false,
    }));
    const getCurrentPageInfo = vi.fn(() => undefined);
    const getCurrentRevision = vi.fn(async () => ({
      ok: true as const,
      revisionId: "rev-2",
    }));

    const service = createPageFreshnessService({
      getEditSession,
      getCurrentPageInfo,
      getCurrentRevision,
    });

    await expect(service.checkPageFreshness("/team/dev/spec")).resolves.toBe(
      "stale",
    );
    expect(getCurrentRevision).toHaveBeenCalledTimes(1);
  });

  it("returns unknown when the local revision is unavailable or the remote lookup fails", async () => {
    const missingLocalService = createPageFreshnessService({
      getEditSession: vi.fn(() => undefined),
      getCurrentPageInfo: vi.fn(() => undefined),
      getCurrentRevision: vi.fn(),
    });

    await expect(
      missingLocalService.checkPageFreshness("/team/dev/spec"),
    ).resolves.toBe("unknown");

    const getCurrentRevision = vi.fn(async () => ({ ok: false as const }));
    const failingRemoteService = createPageFreshnessService({
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
      failingRemoteService.checkPageFreshness("/team/dev/spec"),
    ).resolves.toBe("unknown");
    expect(getCurrentRevision).toHaveBeenCalledTimes(1);
  });
});

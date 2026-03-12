import { describe, expect, it, vi } from "vitest";

import { findBacklinks } from "../../src/vscode/pageSearch";

describe("findBacklinks", () => {
  const resolvePageReference = vi.fn(async (reference) => {
    if (reference.kind === "canonicalPath") {
      return {
        ok: true,
        canonicalPath: reference.canonicalPath,
        uri: reference.uri,
      } as const;
    }
    return {
      ok: true,
      canonicalPath: `/resolved/${reference.pageId}`,
      uri: `growi:/resolved/${reference.pageId}.md`,
    } as const;
  });

  it("keeps prefix order and listPages order with dedup + self exclusion", async () => {
    resolvePageReference.mockClear();
    const listPages = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        paths: [
          "/team/dev/current",
          "/team/dev/a",
          "/team/dev/shared",
          "/team/dev/b",
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        paths: ["/team/docs/shared", "/team/dev/shared", "/team/docs/c"],
      });
    const readPageBody = vi.fn(async (canonicalPath: string) => {
      if (canonicalPath === "/team/dev/a") {
        return { ok: true, body: "[to](/team/dev/current)" } as const;
      }
      if (canonicalPath === "/team/dev/shared") {
        return { ok: true, body: "[to](/team/dev/current)" } as const;
      }
      if (canonicalPath === "/team/docs/c") {
        return {
          ok: true,
          body: "[to](https://growi.example.com/team/dev/current)",
        } as const;
      }
      return { ok: true, body: "no links" } as const;
    });

    const result = await findBacklinks({
      targetCanonicalPath: "/team/dev/current",
      baseUrl: "https://growi.example.com/",
      prefixes: ["/team/dev", "/team/docs"],
      listPages,
      readPageBody,
      resolvePageReference,
      timeoutMs: 5_000,
      limit: 100,
    });

    expect(result).toEqual({
      ok: true,
      backlinks: ["/team/dev/a", "/team/dev/shared", "/team/docs/c"],
      truncatedByLimit: false,
      timedOut: false,
    });
    expect(listPages).toHaveBeenNthCalledWith(1, "/team/dev");
    expect(listPages).toHaveBeenNthCalledWith(2, "/team/docs");
    expect(readPageBody.mock.calls.map((call) => call[0])).toEqual([
      "/team/dev/a",
      "/team/dev/shared",
      "/team/dev/b",
      "/team/docs/shared",
      "/team/docs/c",
    ]);
  });

  it("sets truncatedByLimit=true when backlinks reach limit", async () => {
    resolvePageReference.mockClear();
    const result = await findBacklinks({
      targetCanonicalPath: "/team/dev/current",
      baseUrl: undefined,
      prefixes: ["/team/dev"],
      listPages: async () => ({
        ok: true,
        paths: ["/team/dev/a", "/team/dev/b", "/team/dev/c"],
      }),
      readPageBody: async () => ({
        ok: true,
        body: "[to](/team/dev/current)",
      }),
      resolvePageReference,
      timeoutMs: 5_000,
      limit: 2,
    });

    expect(result).toEqual({
      ok: true,
      backlinks: ["/team/dev/a", "/team/dev/b"],
      truncatedByLimit: true,
      timedOut: false,
    });
  });

  it("matches permalink backlinks by pageId", async () => {
    resolvePageReference.mockClear();
    const result = await findBacklinks({
      targetCanonicalPath: "/team/dev/current",
      targetPageId: "0123456789abcdefabcdef01",
      baseUrl: "https://growi.example.com/wiki/",
      prefixes: ["/team/dev"],
      listPages: async () => ({
        ok: true,
        paths: ["/team/dev/a", "/team/dev/b"],
      }),
      readPageBody: async (canonicalPath) => ({
        ok: true,
        body:
          canonicalPath === "/team/dev/a"
            ? "[to](https://growi.example.com/wiki/0123456789abcdefabcdef01)"
            : "no links",
      }),
      resolvePageReference,
      timeoutMs: 5_000,
      limit: 100,
    });

    expect(result).toEqual({
      ok: true,
      backlinks: ["/team/dev/a"],
      truncatedByLimit: false,
      timedOut: false,
    });
  });

  it("sets timedOut=true when timeout is reached", async () => {
    resolvePageReference.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00.000Z"));

    const resultPromise = findBacklinks({
      targetCanonicalPath: "/team/dev/current",
      baseUrl: undefined,
      prefixes: ["/team/dev"],
      listPages: async () => ({
        ok: true,
        paths: ["/team/dev/a", "/team/dev/b"],
      }),
      readPageBody: async () => {
        vi.setSystemTime(new Date("2026-03-08T00:00:06.000Z"));
        return {
          ok: true,
          body: "[to](/team/dev/current)",
        } as const;
      },
      resolvePageReference,
      timeoutMs: 5_000,
      limit: 100,
    });

    const result = await resultPromise;
    expect(result).toEqual({
      ok: true,
      backlinks: ["/team/dev/a"],
      truncatedByLimit: false,
      timedOut: true,
    });

    vi.useRealTimers();
  });

  it("maps list/read/connection failures", async () => {
    resolvePageReference.mockClear();
    await expect(
      findBacklinks({
        targetCanonicalPath: "/team/dev/current",
        baseUrl: undefined,
        prefixes: ["/team/dev"],
        listPages: async () => ({ ok: false, reason: "ApiNotSupported" }),
        readPageBody: async () => ({ ok: true, body: "" }),
        resolvePageReference,
        timeoutMs: 5_000,
        limit: 100,
      }),
    ).resolves.toEqual({ ok: false, reason: "ListPagesApiNotSupported" });

    await expect(
      findBacklinks({
        targetCanonicalPath: "/team/dev/current",
        baseUrl: undefined,
        prefixes: ["/team/dev"],
        listPages: async () => ({ ok: true, paths: ["/team/dev/a"] }),
        readPageBody: async () => ({ ok: false, reason: "ApiNotSupported" }),
        resolvePageReference,
        timeoutMs: 5_000,
        limit: 100,
      }),
    ).resolves.toEqual({ ok: false, reason: "ReadPageApiNotSupported" });

    await expect(
      findBacklinks({
        targetCanonicalPath: "/team/dev/current",
        baseUrl: undefined,
        prefixes: ["/team/dev"],
        listPages: async () => ({ ok: false, reason: "ConnectionFailed" }),
        readPageBody: async () => ({ ok: true, body: "" }),
        resolvePageReference,
        timeoutMs: 5_000,
        limit: 100,
      }),
    ).resolves.toEqual({ ok: false, reason: "ConnectionFailed" });
  });
});

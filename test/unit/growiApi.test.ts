import { afterEach, describe, expect, it, vi } from "vitest";

import { createGrowiApiAdapter } from "../../src/vscode/growiApi";

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const testEditSession = {
  pageId: "page-1",
  baseRevisionId: "rev-1",
  baseUpdatedAt: "2026-03-08T00:00:00.000Z",
  baseBody: "# old",
  dirty: true,
  enteredAt: "2026-03-08T00:00:00.000Z",
} as const;

describe("createGrowiApiAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fetches page snapshot successfully", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      value: {
        pageId: "page-1",
        baseRevisionId: "rev-1",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# body",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [pageUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [revisionUrl] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(pageUrl.pathname).toBe("/_api/v3/page");
    expect(pageUrl.searchParams.get("path")).toBe("/team/dev");
    expect(revisionUrl.pathname).toBe("/_api/v3/revisions/rev-1");
    expect(revisionUrl.searchParams.get("pageId")).toBe("page-1");
  });

  it("returns NotFound only for page snapshot 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { "content-type": "application/json" },
        status: 404,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const snapshot = await adapter.fetchPageSnapshot(
      "/missing",
      "https://growi.example.com/",
      "token-1",
    );
    const read = await adapter.readPage(
      "/missing",
      "https://growi.example.com/",
      "token-1",
    );

    expect(snapshot).toEqual({ ok: false, reason: "NotFound" });
    expect(read).toEqual({ ok: false, reason: "NotFound" });
  });

  it("returns page info from readPage when page metadata is available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
            lastUpdateUser: { username: "alice" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const read = await adapter.readPage(
      "/team/dev/spec",
      "https://growi.example.com/",
      "token-1",
    );

    expect(read).toEqual({
      ok: true,
      body: "# body",
      pageInfo: {
        pageId: "page-1",
        url: "https://growi.example.com/team/dev/spec",
        path: "/team/dev/spec",
        lastUpdatedBy: "alice",
        lastUpdatedAt: "2026-03-08T09:00:00.000Z",
      },
    });
  });

  it("resolves pageId to canonical path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        page: {
          _id: "0123456789abcdefabcdef01",
          path: "/team/dev/spec",
          revision: { _id: "rev-1" },
          updatedAt: "2026-03-08T09:00:00.000Z",
          lastUpdateUser: { username: "alice" },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const resolved = await adapter.resolvePageId(
      "0123456789abcdefabcdef01",
      "https://growi.example.com/",
      "token-1",
    );

    expect(resolved).toEqual({
      ok: true,
      canonicalPath: "/team/dev/spec",
      pageInfo: {
        pageId: "0123456789abcdefabcdef01",
        url: "https://growi.example.com/team/dev/spec",
        path: "/team/dev/spec",
        lastUpdatedBy: "alice",
        lastUpdatedAt: "2026-03-08T09:00:00.000Z",
      },
    });
    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.searchParams.get("pageId")).toBe(
      "0123456789abcdefabcdef01",
    );
  });

  it("keeps readPage success without page info when metadata is incomplete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          page: {
            _id: "page-1",
            path: "/team/dev/spec",
            revision: { _id: "rev-1" },
            updatedAt: "2026-03-08T09:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          revision: {
            body: "# body",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const read = await adapter.readPage(
      "/team/dev/spec",
      "https://growi.example.com/",
      "token-1",
    );

    expect(read).toEqual({
      ok: true,
      body: "# body",
      pageInfo: undefined,
    });
  });

  it("lists revisions successfully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        revisions: [
          {
            _id: "rev-2",
            createdAt: "2026-03-08T10:00:00.000Z",
            author: { username: "bob" },
          },
          {
            _id: "rev-1",
            createdAt: "2026-03-08T09:00:00.000Z",
            author: { username: "alice" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listRevisions(
      "page-1",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      revisions: [
        {
          revisionId: "rev-2",
          createdAt: "2026-03-08T10:00:00.000Z",
          author: "bob",
        },
        {
          revisionId: "rev-1",
          createdAt: "2026-03-08T09:00:00.000Z",
          author: "alice",
        },
      ],
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe("/_api/v3/revisions/list");
    expect(requestUrl.searchParams.get("pageId")).toBe("page-1");
    expect(requestUrl.searchParams.get("offset")).toBe("0");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
  });

  it("reads revision body successfully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        revision: {
          _id: "rev-2",
          body: "# body from revision",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.readRevision(
      "page-1",
      "rev-2",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      body: "# body from revision",
    });
    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe("/_api/v3/revisions/rev-2");
    expect(requestUrl.searchParams.get("pageId")).toBe("page-1");
  });

  it("returns ApiNotSupported for page snapshot login redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: "/login" },
        status: 302,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ApiNotSupported for page snapshot non-json response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        headers: { "content-type": "text/plain" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ApiNotSupported for malformed page snapshot payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        page: {
          _id: "page-1",
          updatedAt: "2026-03-08T00:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ConnectionFailed when page snapshot fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
  });

  it("lists pages with pagination (limit=100)", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => ({
      path: `/team/dev/page-${index + 1}`,
    }));
    const secondPageItems = [
      { path: "/team/dev/page-101" },
      { path: "/team/dev/page-102" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ pages: firstPageItems }))
      .mockResolvedValueOnce(createJsonResponse({ pages: secondPageItems }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      paths: [...firstPageItems, ...secondPageItems].map((page) => page.path),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [secondUrl] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(firstUrl.pathname).toBe("/_api/v3/pages/list");
    expect(firstUrl.searchParams.get("limit")).toBe("100");
    expect(firstUrl.searchParams.get("page")).toBe("1");
    expect(secondUrl.searchParams.get("limit")).toBe("100");
    expect(secondUrl.searchParams.get("page")).toBe("2");
  });

  it("returns ApiNotSupported for malformed page list payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        pages: [{ path: 1 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ApiNotSupported when page list API redirects to login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: "/login" },
        status: 302,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ConnectionFailed when page list fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
  });

  it("lists revisions for a page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        revisions: [
          {
            _id: "revision-002",
            createdAt: "2026-03-08T10:00:00.000Z",
            author: { username: "bob" },
          },
          {
            _id: "revision-001",
            createdAt: "2026-03-08T09:00:00.000Z",
            author: { name: "alice" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.listRevisions(
      "page-123",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      revisions: [
        {
          revisionId: "revision-002",
          createdAt: "2026-03-08T10:00:00.000Z",
          author: "bob",
        },
        {
          revisionId: "revision-001",
          createdAt: "2026-03-08T09:00:00.000Z",
          author: "alice",
        },
      ],
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe("/_api/v3/revisions/list");
    expect(requestUrl.searchParams.get("pageId")).toBe("page-123");
    expect(requestUrl.searchParams.get("offset")).toBe("0");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
  });

  it("reads a revision body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        revision: {
          _id: "revision-001",
          body: "# revision body",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.readRevision(
      "page-123",
      "revision-001",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true, body: "# revision body" });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe("/_api/v3/revisions/revision-001");
    expect(requestUrl.searchParams.get("pageId")).toBe("page-123");
  });

  it("returns ok false for current revision errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.getCurrentRevision(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false });
  });

  it("returns ok false for current revision login redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: "/login" },
        status: 302,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.getCurrentRevision(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false });
  });

  it("returns ok false for current revision malformed payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ page: { revision: {} } }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.getCurrentRevision(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false });
  });

  it("writes a page successfully with minimal response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        page: {
          _id: "page-1",
          revision: {
            _id: "rev-2",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.pathname).toBe("/_api/v3/page");
    expect(requestInit.method).toBe("PUT");
  });

  it("treats 2xx JSON responses without page metadata as write success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        ok: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true });
  });

  it("treats 204 write responses as success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true });
  });

  it("returns page info from writePage when page metadata is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        page: {
          _id: "page-1",
          path: "/team/dev/spec",
          updatedAt: "2026-03-08T10:00:00.000Z",
          lastUpdateUser: { username: "bob" },
          revision: {
            _id: "rev-2",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      pageInfo: {
        pageId: "page-1",
        url: "https://growi.example.com/team/dev/spec",
        path: "/team/dev/spec",
        lastUpdatedBy: "bob",
        lastUpdatedAt: "2026-03-08T10:00:00.000Z",
      },
    });
  });

  it("returns PermissionDenied when write API responds 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "PermissionDenied" });
  });

  it("returns ApiNotSupported for write page non-json response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        headers: { "content-type": "text/plain" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ApiNotSupported for write page login redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: "/login" },
        status: 302,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ConnectionFailed when write page fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# updated",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
  });
});

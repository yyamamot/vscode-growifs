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
        revisionId: "rev-1",
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
        revisionId: "rev-1",
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

  it("returns PermissionDenied for page snapshot 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const snapshot = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );
    const read = await adapter.readPage(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(snapshot).toEqual({ ok: false, reason: "PermissionDenied" });
    expect(read).toEqual({ ok: false, reason: "PermissionDenied" });
  });

  it("returns InvalidApiToken for page snapshot 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const snapshot = await adapter.fetchPageSnapshot(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );
    const read = await adapter.readPage(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );

    expect(snapshot).toEqual({ ok: false, reason: "InvalidApiToken" });
    expect(read).toEqual({ ok: false, reason: "InvalidApiToken" });
  });

  it("returns PermissionDenied for page lookup 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const resolved = await adapter.resolvePageId(
      "0123456789abcdefabcdef01",
      "https://growi.example.com/",
      "token-1",
    );

    expect(resolved).toEqual({ ok: false, reason: "PermissionDenied" });
  });

  it("returns InvalidApiToken for page lookup 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const resolved = await adapter.resolvePageId(
      "0123456789abcdefabcdef01",
      "https://growi.example.com/",
      "token-1",
    );

    expect(resolved).toEqual({ ok: false, reason: "InvalidApiToken" });
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

  it("returns InvalidApiToken and PermissionDenied for page list auth failures", async () => {
    const invalidTokenFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", invalidTokenFetch);

    const adapter = createGrowiApiAdapter();
    const invalidToken = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );
    expect(invalidToken).toEqual({ ok: false, reason: "InvalidApiToken" });

    const permissionDeniedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", permissionDeniedFetch);
    const permissionDenied = await adapter.listPages(
      "/team/dev",
      "https://growi.example.com/",
      "token-1",
    );
    expect(permissionDenied).toEqual({ ok: false, reason: "PermissionDenied" });
  });

  it("returns InvalidApiToken and PermissionDenied for revision auth failures", async () => {
    const invalidTokenFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", invalidTokenFetch);

    const adapter = createGrowiApiAdapter();
    const invalidList = await adapter.listRevisions(
      "page-123",
      "https://growi.example.com/",
      "token-1",
    );
    expect(invalidList).toEqual({ ok: false, reason: "InvalidApiToken" });

    const permissionDeniedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", permissionDeniedFetch);
    const deniedList = await adapter.listRevisions(
      "page-123",
      "https://growi.example.com/",
      "token-1",
    );
    expect(deniedList).toEqual({ ok: false, reason: "PermissionDenied" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const invalidRead = await adapter.readRevision(
      "page-123",
      "revision-001",
      "https://growi.example.com/",
      "token-1",
    );
    expect(invalidRead).toEqual({ ok: false, reason: "InvalidApiToken" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    const deniedRead = await adapter.readRevision(
      "page-123",
      "revision-001",
      "https://growi.example.com/",
      "token-1",
    );
    expect(deniedRead).toEqual({ ok: false, reason: "PermissionDenied" });
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

  it("creates a page successfully with minimal response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          page: {
            _id: "page-1",
            path: "/team/dev/new-page",
            updatedAt: "2026-03-08T10:00:00.000Z",
            lastUpdateUser: { username: "alice" },
            revision: {
              _id: "rev-1",
            },
          },
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.createPage(
      "/team/dev/new-page",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      pageInfo: {
        pageId: "page-1",
        revisionId: "rev-1",
        url: "https://growi.example.com/team/dev/new-page",
        path: "/team/dev/new-page",
        lastUpdatedBy: "alice",
        lastUpdatedAt: "2026-03-08T10:00:00.000Z",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.pathname).toBe("/_api/v3/page");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      body: "",
      path: "/team/dev/new-page",
    });
  });

  it.each([
    [
      401,
      createJsonResponse({ error: "Unauthorized" }, 401),
      "InvalidApiToken",
    ],
    [403, createJsonResponse({ error: "Forbidden" }, 403), "PermissionDenied"],
    [404, createJsonResponse({ error: "ParentPageNotFound" }, 404), "NotFound"],
    [
      409,
      createJsonResponse({ error: "PageAlreadyExists" }, 409),
      "AlreadyExists",
    ],
    [405, new Response(null, { status: 405 }), "ApiNotSupported"],
  ] as const)("classifies create page %s responses as %s", async (_status, response, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.createPage(
      "/team/dev/new-page",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toMatchObject({ ok: false, reason });
  });

  it("classifies create page 404 without parent-missing payload as ApiNotSupported", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "NotFound" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.createPage(
      "/team/dev/new-page",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ApiNotSupported for create page login redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: "/login" },
        status: 302,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.createPage(
      "/team/dev/new-page",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ApiNotSupported" });
  });

  it("returns ConnectionFailed when create page fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.createPage(
      "/team/dev/new-page",
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
  });

  it("deletes a subtree page successfully with minimal payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "subtree",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.pathname).toBe("/_api/v3/pages/delete");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      isRecursively: true,
      pageIdToRevisionIdMap: {
        "page-1": "revision-1",
      },
    });
  });

  it("omits false delete flags for single-page delete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: true });
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(requestInit.body as string)).toEqual({
      pageIdToRevisionIdMap: {
        "page-1": "revision-1",
      },
    });
  });

  it.each([
    [
      401,
      createJsonResponse({ error: "Unauthorized" }, 401),
      "InvalidApiToken",
    ],
    [403, createJsonResponse({ error: "Forbidden" }, 403), "PermissionDenied"],
    [404, createJsonResponse({ error: "PageNotFound" }, 404), "NotFound"],
    [405, new Response(null, { status: 405 }), "ApiNotSupported"],
  ] as const)("classifies delete page %s responses as %s", async (_status, response, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toMatchObject({ ok: false, reason });
  });

  it("maps child-page rejection to HasChildren", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "PageHasChildren" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "HasChildren" });
  });

  it("returns rejection detail for unexpected delete failure status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "Invalid state" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: false,
      reason: "Rejected",
      message: "Delete Page request was rejected (HTTP 400: Invalid state).",
    });
  });

  it("returns ConnectionFailed when delete page fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.deletePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        canonicalPath: "/team/dev/spec",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
  });

  it("renames a page successfully with minimal response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          page: {
            _id: "page-1",
            path: "/team/dev/renamed-page",
            updatedAt: "2026-03-08T10:00:00.000Z",
            lastUpdateUser: { username: "alice" },
            revision: {
              _id: "revision-1",
            },
          },
        },
        200,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.renamePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        currentCanonicalPath: "/team/dev/spec",
        targetCanonicalPath: "/team/dev/renamed-page",
        mode: "subtree",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: true,
      canonicalPath: "/team/dev/renamed-page",
      pageInfo: {
        pageId: "page-1",
        revisionId: "revision-1",
        url: "https://growi.example.com/team/dev/renamed-page",
        path: "/team/dev/renamed-page",
        lastUpdatedBy: "alice",
        lastUpdatedAt: "2026-03-08T10:00:00.000Z",
      },
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.pathname).toBe("/_api/v3/pages/rename");
    expect(requestInit.method).toBe("PUT");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      isRecursively: true,
      isRenameRedirect: false,
      newPagePath: "/team/dev/renamed-page",
      pageId: "page-1",
      path: "/team/dev/spec",
      revisionId: "revision-1",
      updateMetadata: true,
    });
  });

  it.each([
    [
      401,
      createJsonResponse({ error: "Unauthorized" }, 401),
      "InvalidApiToken",
    ],
    [403, createJsonResponse({ error: "Forbidden" }, 403), "PermissionDenied"],
    [
      404,
      createJsonResponse({ error: "ParentPageNotFound" }, 404),
      "ParentNotFound",
    ],
    [
      409,
      createJsonResponse({ error: "PageAlreadyExists" }, 409),
      "AlreadyExists",
    ],
    [405, new Response(null, { status: 405 }), "ApiNotSupported"],
  ] as const)("classifies rename page %s responses as %s", async (_status, response, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.renamePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        currentCanonicalPath: "/team/dev/spec",
        targetCanonicalPath: "/team/dev/renamed-page",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toMatchObject({ ok: false, reason });
  });

  it("returns rejection detail for unexpected rename failure status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ error: "Invalid path" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.renamePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        currentCanonicalPath: "/team/dev/spec",
        targetCanonicalPath: "/team/dev/renamed-page",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: false,
      reason: "Rejected",
      message: "Rename Page request was rejected (HTTP 400: Invalid path).",
    });
  });

  it("returns detailed unsupported message for rename page 405", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 405 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.renamePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        currentCanonicalPath: "/team/dev/spec",
        targetCanonicalPath: "/team/dev/renamed-page",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({
      ok: false,
      reason: "ApiNotSupported",
      message:
        "Rename Page endpoint returned HTTP 405. The connected GROWI may not support PUT /_api/v3/pages/rename.",
    });
  });

  it("returns ConnectionFailed when rename page fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.renamePage(
      {
        pageId: "page-1",
        revisionId: "revision-1",
        currentCanonicalPath: "/team/dev/spec",
        targetCanonicalPath: "/team/dev/renamed-page",
        mode: "page",
      },
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "ConnectionFailed" });
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
        revisionId: "rev-2",
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

  it("returns InvalidApiToken when write API responds 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGrowiApiAdapter();
    const result = await adapter.writePage(
      "# body",
      testEditSession,
      "https://growi.example.com/",
      "token-1",
    );

    expect(result).toEqual({ ok: false, reason: "InvalidApiToken" });
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

import http from "node:http";

const DEFAULT_TOKEN = "host-test-token";

const DEFAULT_PAGES = [
  {
    path: "/team/dev",
    body: "# team dev page",
    updatedAt: "2026-03-08T00:00:00.000Z",
    updatedBy: "system",
  },
  {
    path: "/team/dev/spec",
    body: "# spec page",
    updatedAt: "2026-03-08T00:01:00.000Z",
    updatedBy: "spec-owner",
  },
  {
    path: "/team/dev/guide",
    body: "# guide page",
    updatedAt: "2026-03-08T00:02:00.000Z",
    updatedBy: "guide-owner",
  },
  {
    path: "/team/dev/url-open",
    body: "# opened from url",
    updatedAt: "2026-03-08T00:03:00.000Z",
    updatedBy: "url-owner",
  },
  {
    path: "/team/dev/path-open",
    body: "# opened from path",
    updatedAt: "2026-03-08T00:04:00.000Z",
    updatedBy: "path-owner",
  },
  {
    path: "/cache/page",
    body: "# cache target",
    updatedAt: "2026-03-08T00:05:00.000Z",
    updatedBy: "cache-owner",
  },
];

function normalizeCanonicalPath(input) {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  let normalized = trimmed.replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.length > 1 && normalized.endsWith(".md")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

function writeJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function buildNextRevisionId(revisionId) {
  return revisionId.includes("-saved")
    ? `${revisionId}-next`
    : `${revisionId}-saved`;
}

function toFixture(pages = DEFAULT_PAGES) {
  const pageByPath = new Map();
  const pageById = new Map();
  const revisionById = new Map();
  const orderedPaths = [];

  pages.forEach((page, index) => {
    const canonicalPath = normalizeCanonicalPath(page.path);
    if (!canonicalPath) {
      return;
    }
    const pageId =
      typeof page.pageId === "string" ? page.pageId : `page-${index + 1}`;
    const revisionId = `revision-${index + 1}`;
    const revisions = [
      {
        revisionId,
        body: page.body,
        updatedAt: page.updatedAt,
        updatedBy: page.updatedBy,
      },
    ];
    const entry = {
      path: canonicalPath,
      pageId,
      revisionId,
      body: page.body,
      updatedAt: page.updatedAt,
      updatedBy: page.updatedBy,
      revisions,
    };
    pageByPath.set(canonicalPath, entry);
    pageById.set(pageId, entry);
    revisionById.set(revisionId, {
      pageId,
      revisionId,
      body: page.body,
      updatedAt: page.updatedAt,
      updatedBy: page.updatedBy,
    });
    orderedPaths.push(canonicalPath);
  });

  orderedPaths.sort((a, b) => a.localeCompare(b));
  return { orderedPaths, pageByPath, pageById, revisionById };
}

export async function startMockGrowiServer(options = {}) {
  const token = options.token ?? DEFAULT_TOKEN;
  let fixture = toFixture(options.pages);
  let authMode = "normal";
  const requestStats = {
    page: 0,
    revision: 0,
    revisionList: 0,
    list: 0,
    write: 0,
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname.startsWith("/_api/")) {
      if (authMode === "invalidToken") {
        writeJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      if (authMode === "permissionDenied") {
        writeJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const authorization = req.headers.authorization;
      if (authorization !== `Bearer ${token}`) {
        writeJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
    }

    if (method === "GET" && url.pathname === "/_api/v3/page") {
      requestStats.page += 1;
      const pageId = url.searchParams.get("pageId");
      const canonicalPath = normalizeCanonicalPath(
        url.searchParams.get("path"),
      );
      const page =
        typeof pageId === "string" && pageId.length > 0
          ? fixture.pageById.get(pageId)
          : canonicalPath
            ? fixture.pageByPath.get(canonicalPath)
            : undefined;
      if (!pageId && !canonicalPath) {
        writeJson(res, 400, { ok: false, error: "InvalidPath" });
        return;
      }
      if (!page) {
        writeJson(res, 404, { ok: false, error: "NotFound" });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        page: {
          _id: page.pageId,
          path: page.path,
          updatedAt: page.updatedAt,
          lastUpdateUser: {
            username: page.updatedBy,
          },
          revision: {
            _id: page.revisionId,
          },
        },
      });
      return;
    }

    if (method === "GET" && url.pathname === "/_api/v3/revisions/list") {
      requestStats.revisionList += 1;
      const pageId = url.searchParams.get("pageId");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      if (!pageId || Number.isNaN(limit) || Number.isNaN(offset)) {
        writeJson(res, 400, { ok: false, error: "InvalidQuery" });
        return;
      }
      const page = fixture.pageById.get(pageId);
      if (!page) {
        writeJson(res, 404, { ok: false, error: "NotFound" });
        return;
      }

      const selected = page.revisions
        .slice(offset, offset + limit)
        .map((revision) => ({
          _id: revision.revisionId,
          createdAt: revision.updatedAt,
          author: {
            username: revision.updatedBy,
          },
        }));
      writeJson(res, 200, {
        ok: true,
        revisions: selected,
        totalCount: page.revisions.length,
        offset,
      });
      return;
    }

    if (method === "GET" && url.pathname.startsWith("/_api/v3/revisions/")) {
      requestStats.revision += 1;
      const revisionId = decodeURIComponent(
        url.pathname.replace("/_api/v3/revisions/", ""),
      );
      const pageId = url.searchParams.get("pageId");
      const revision = fixture.revisionById.get(revisionId);
      if (!revision || revision.pageId !== pageId) {
        writeJson(res, 404, { ok: false, error: "NotFound" });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        revision: {
          _id: revisionId,
          body: revision.body,
        },
      });
      return;
    }

    if (method === "GET" && url.pathname === "/_api/v3/pages/list") {
      requestStats.list += 1;
      const canonicalPath = normalizeCanonicalPath(
        url.searchParams.get("path"),
      );
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const page = Number(url.searchParams.get("page") ?? "1");
      if (!canonicalPath || Number.isNaN(limit) || Number.isNaN(page)) {
        writeJson(res, 400, { ok: false, error: "InvalidQuery" });
        return;
      }

      const paths = fixture.orderedPaths.filter((path) => {
        if (canonicalPath === "/") {
          return path !== "/";
        }
        return path.startsWith(`${canonicalPath}/`) || path === canonicalPath;
      });
      const start = (page - 1) * limit;
      const selected = paths.slice(start, start + limit).map((path) => ({
        path,
      }));
      writeJson(res, 200, {
        ok: true,
        pages: selected,
      });
      return;
    }

    if (method === "PUT" && url.pathname === "/_api/v3/page") {
      requestStats.write += 1;
      const bodyChunks = [];
      req.on("data", (chunk) => {
        bodyChunks.push(chunk);
      });
      req.on("end", () => {
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(bodyChunks).toString("utf8"));
        } catch {
          writeJson(res, 400, { ok: false, error: "InvalidPayload" });
          return;
        }

        const pageId =
          typeof payload.pageId === "string" ? payload.pageId : undefined;
        const revisionId =
          typeof payload.revisionId === "string"
            ? payload.revisionId
            : undefined;
        const nextBody =
          typeof payload.body === "string" ? payload.body : undefined;
        if (!pageId || !revisionId || nextBody === undefined) {
          writeJson(res, 400, { ok: false, error: "InvalidPayload" });
          return;
        }

        const page = fixture.pageById.get(pageId);
        if (!page || page.revisionId !== revisionId) {
          writeJson(res, 409, { ok: false, error: "RevisionConflict" });
          return;
        }

        const nextRevisionId = buildNextRevisionId(page.revisionId);
        const nextUpdatedAt = new Date().toISOString();
        page.body = nextBody;
        page.revisionId = nextRevisionId;
        page.updatedAt = nextUpdatedAt;
        page.updatedBy = "host-test-user";
        page.revisions.unshift({
          revisionId: nextRevisionId,
          body: nextBody,
          updatedAt: nextUpdatedAt,
          updatedBy: page.updatedBy,
        });
        fixture.revisionById.set(nextRevisionId, {
          pageId: page.pageId,
          revisionId: nextRevisionId,
          body: nextBody,
          updatedAt: nextUpdatedAt,
          updatedBy: page.updatedBy,
        });

        writeJson(res, 200, { ok: true });
      });
      return;
    }

    if (method === "GET" && url.pathname === "/__admin/stats") {
      writeJson(res, 200, {
        ok: true,
        requests: requestStats,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/__admin/page") {
      const canonicalPath = normalizeCanonicalPath(
        url.searchParams.get("path"),
      );
      if (!canonicalPath) {
        writeJson(res, 400, { ok: false, error: "InvalidPath" });
        return;
      }
      const page = fixture.pageByPath.get(canonicalPath);
      if (!page) {
        writeJson(res, 404, { ok: false, error: "NotFound" });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        page: {
          path: page.path,
          body: page.body,
          revisionId: page.revisionId,
          updatedAt: page.updatedAt,
          updatedBy: page.updatedBy,
        },
      });
      return;
    }

    if (method === "POST" && url.pathname === "/__admin/reset") {
      requestStats.page = 0;
      requestStats.revision = 0;
      requestStats.revisionList = 0;
      requestStats.list = 0;
      requestStats.write = 0;
      authMode = "normal";
      writeJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/__admin/auth") {
      const bodyChunks = [];
      req.on("data", (chunk) => {
        bodyChunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(
            Buffer.concat(bodyChunks).toString("utf8"),
          );
          const nextMode =
            payload?.mode === "invalidToken" ||
            payload?.mode === "permissionDenied"
              ? payload.mode
              : "normal";
          authMode = nextMode;
          writeJson(res, 200, { ok: true, mode: authMode });
        } catch {
          writeJson(res, 400, { ok: false, error: "InvalidPayload" });
        }
      });
      return;
    }

    if (method === "POST" && url.pathname === "/__admin/fixture") {
      const bodyChunks = [];
      req.on("data", (chunk) => {
        bodyChunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(
            Buffer.concat(bodyChunks).toString("utf8"),
          );
          fixture = toFixture(payload.pages);
          requestStats.page = 0;
          requestStats.revision = 0;
          requestStats.revisionList = 0;
          requestStats.list = 0;
          requestStats.write = 0;
          writeJson(res, 200, { ok: true });
        } catch {
          writeJson(res, 400, { ok: false, error: "InvalidPayload" });
        }
      });
      return;
    }

    if (method === "POST" && url.pathname === "/__admin/update-page") {
      const bodyChunks = [];
      req.on("data", (chunk) => {
        bodyChunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(
            Buffer.concat(bodyChunks).toString("utf8"),
          );
          const canonicalPath = normalizeCanonicalPath(payload.path);
          const nextBody =
            typeof payload.body === "string" ? payload.body : undefined;
          const updatedBy =
            typeof payload.updatedBy === "string"
              ? payload.updatedBy
              : "admin-user";
          if (!canonicalPath || nextBody === undefined) {
            writeJson(res, 400, { ok: false, error: "InvalidPayload" });
            return;
          }
          const page = fixture.pageByPath.get(canonicalPath);
          if (!page) {
            writeJson(res, 404, { ok: false, error: "NotFound" });
            return;
          }

          const previousRevisionId = page.revisionId;
          const updatedRevisionId = buildNextRevisionId(previousRevisionId);
          const nextUpdatedAt = new Date().toISOString();
          page.body = nextBody;
          page.revisionId = updatedRevisionId;
          page.updatedAt = nextUpdatedAt;
          page.updatedBy = updatedBy;
          page.revisions.unshift({
            revisionId: updatedRevisionId,
            body: nextBody,
            updatedAt: nextUpdatedAt,
            updatedBy,
          });
          fixture.revisionById.set(updatedRevisionId, {
            pageId: page.pageId,
            revisionId: updatedRevisionId,
            body: nextBody,
            updatedAt: nextUpdatedAt,
            updatedBy,
          });

          writeJson(res, 200, {
            ok: true,
            page: {
              path: page.path,
              body: page.body,
              revisionId: page.revisionId,
              updatedAt: page.updatedAt,
              updatedBy: page.updatedBy,
            },
          });
        } catch {
          writeJson(res, 400, { ok: false, error: "InvalidPayload" });
        }
      });
      return;
    }

    writeJson(res, 404, { ok: false, error: "UnknownRoute" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server failed to bind to a TCP port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}/`;

  return {
    token,
    baseUrl,
    adminUrl: baseUrl,
    async stop() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

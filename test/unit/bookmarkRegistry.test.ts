import { describe, expect, it } from "vitest";

import {
  BOOKMARK_REGISTRY_STATE_KEY,
  createBookmarkRegistry,
} from "../../src/vscode/bookmarkRegistry";
import type { WorkspaceStateLike } from "../../src/vscode/prefixRegistry";

class InMemoryWorkspaceState implements WorkspaceStateLike {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T {
    if (!this.store.has(key)) {
      return defaultValue as T;
    }
    return this.store.get(key) as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

describe("bookmarkRegistry", () => {
  it("stores and restores bookmarks per baseUrl in most-recent-first order", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createBookmarkRegistry(workspaceState);

    await registry.addBookmark(
      "https://growi.example.com/",
      "/team/dev/guide",
      "2026-04-17T00:00:00.000Z",
    );
    await registry.addBookmark(
      "https://growi.example.com/",
      "/team/dev/spec",
      "2026-04-17T01:00:00.000Z",
    );

    expect(registry.getBookmarks("https://growi.example.com/")).toEqual([
      {
        canonicalPath: "/team/dev/spec",
        addedAt: "2026-04-17T01:00:00.000Z",
      },
      {
        canonicalPath: "/team/dev/guide",
        addedAt: "2026-04-17T00:00:00.000Z",
      },
    ]);

    const restoredRegistry = createBookmarkRegistry(workspaceState);
    expect(restoredRegistry.getBookmarks("https://growi.example.com/")).toEqual(
      [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T01:00:00.000Z",
        },
        {
          canonicalPath: "/team/dev/guide",
          addedAt: "2026-04-17T00:00:00.000Z",
        },
      ],
    );
  });

  it("keeps bookmark lists isolated by baseUrl", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createBookmarkRegistry(workspaceState);

    await registry.addBookmark("https://a.example.com/", "/team/a");
    await registry.addBookmark("https://b.example.com/", "/team/b");

    expect(registry.getBookmarks("https://a.example.com/")).toEqual([
      expect.objectContaining({ canonicalPath: "/team/a" }),
    ]);
    expect(registry.getBookmarks("https://b.example.com/")).toEqual([
      expect.objectContaining({ canonicalPath: "/team/b" }),
    ]);
  });

  it("returns no-op for duplicate bookmarks and supports deletion", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createBookmarkRegistry(workspaceState);

    await registry.addBookmark("https://growi.example.com/", "/team/dev/spec");

    const duplicated = await registry.addBookmark(
      "https://growi.example.com/",
      "/team//dev/spec/",
    );
    expect(duplicated).toEqual({
      ok: true,
      value: expect.any(Array),
      added: false,
    });

    expect(
      registry.isBookmarked("https://growi.example.com/", "/team/dev/spec"),
    ).toBe(true);

    const deleted = await registry.deleteBookmark(
      "https://growi.example.com/",
      "/team/dev/spec",
    );
    expect(deleted).toEqual({
      ok: true,
      value: [],
      removed: true,
    });
    expect(
      registry.isBookmarked("https://growi.example.com/", "/team/dev/spec"),
    ).toBe(false);
  });

  it("uses a stable workspaceState key", () => {
    expect(BOOKMARK_REGISTRY_STATE_KEY).toBe("growi.bookmarkRegistry.v1");
  });
});

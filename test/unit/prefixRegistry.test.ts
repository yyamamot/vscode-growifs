import { describe, expect, it } from "vitest";

import {
  createPrefixRegistry,
  type WorkspaceStateLike,
} from "../../src/vscode/prefixRegistry";

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

describe("prefixRegistry", () => {
  it("stores and restores prefixes per baseUrl", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    const added = await registry.addPrefix(
      "https://growi.example.com/",
      "/team//dev/",
    );

    expect(added).toEqual({ ok: true, value: ["/team/dev"], added: true });
    expect(registry.getPrefixes("https://growi.example.com/")).toEqual([
      "/team/dev",
    ]);

    const restoredRegistry = createPrefixRegistry(workspaceState);
    expect(restoredRegistry.getPrefixes("https://growi.example.com/")).toEqual([
      "/team/dev",
    ]);
  });

  it("keeps prefix lists isolated by baseUrl", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    await registry.addPrefix("https://a.example.com/", "/team/a");
    await registry.addPrefix("https://b.example.com/", "/team/b");

    expect(registry.getPrefixes("https://a.example.com/")).toEqual(["/team/a"]);
    expect(registry.getPrefixes("https://b.example.com/")).toEqual(["/team/b"]);
  });

  it("returns existing prefixes for duplicate prefix without adding", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    await registry.addPrefix("https://growi.example.com/", "/team/dev");
    const duplicated = await registry.addPrefix(
      "https://growi.example.com/",
      "/team//dev/",
    );

    expect(duplicated).toEqual({
      ok: true,
      value: ["/team/dev"],
      added: false,
    });
    expect(registry.getPrefixes("https://growi.example.com/")).toEqual([
      "/team/dev",
    ]);
  });

  it("rejects adding ancestor prefix", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    await registry.addPrefix("https://growi.example.com/", "/team/dev");
    const conflicted = await registry.addPrefix(
      "https://growi.example.com/",
      "/team",
    );

    expect(conflicted).toEqual({ ok: false, reason: "AncestorConflict" });
  });

  it("rejects adding descendant prefix", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    await registry.addPrefix("https://growi.example.com/", "/team");
    const conflicted = await registry.addPrefix(
      "https://growi.example.com/",
      "/team/dev",
    );

    expect(conflicted).toEqual({ ok: false, reason: "DescendantConflict" });
  });

  it("clears prefixes only for the current baseUrl", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    await registry.addPrefix("https://a.example.com/", "/team/a");
    await registry.addPrefix("https://b.example.com/", "/team/b");

    const cleared = await registry.clearPrefixes("https://a.example.com/");

    expect(cleared).toEqual({
      ok: true,
      value: [],
      cleared: true,
      removed: ["/team/a"],
    });
    expect(registry.getPrefixes("https://a.example.com/")).toEqual([]);
    expect(registry.getPrefixes("https://b.example.com/")).toEqual(["/team/b"]);
  });

  it("returns no-op when there are no prefixes to clear", async () => {
    const workspaceState = new InMemoryWorkspaceState();
    const registry = createPrefixRegistry(workspaceState);

    const cleared = await registry.clearPrefixes("https://growi.example.com/");

    expect(cleared).toEqual({
      ok: true,
      value: [],
      cleared: false,
      removed: [],
    });
  });
});

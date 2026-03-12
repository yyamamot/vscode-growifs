import { describe, expect, it, vi } from "vitest";

import { createEditSessionRegistry } from "../../src/vscode/editSessionRegistry";
import type { GrowiEditSession } from "../../src/vscode/fsProvider";

function createSession(
  overrides?: Partial<GrowiEditSession>,
): GrowiEditSession {
  return {
    pageId: "page-id",
    baseRevisionId: "revision-id",
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    baseBody: "base body",
    enteredAt: "2026-01-01T00:00:00.000Z",
    dirty: false,
    ...overrides,
  };
}

describe("editSessionRegistry", () => {
  it("stores and restores edit sessions by canonical page path", () => {
    const registry = createEditSessionRegistry();
    const session = createSession();

    registry.setEditSession("/team//dev/設計/", session);

    expect(registry.getEditSession("/team/dev/設計")).toBe(session);
  });

  it("overwrites edit session for the same canonical page path", () => {
    const registry = createEditSessionRegistry();
    const first = createSession({ pageId: "page-id-1" });
    const second = createSession({ pageId: "page-id-2" });

    registry.setEditSession("/team/dev/設計", first);
    registry.setEditSession("/team//dev/設計/", second);

    expect(registry.getEditSession("/team/dev/設計")).toBe(second);
  });

  it("closes edit sessions by canonical page path", () => {
    const registry = createEditSessionRegistry();
    const session = createSession();

    registry.setEditSession("/team/dev/設計", session);
    registry.closeEditSession("/team//dev/設計/");

    expect(registry.getEditSession("/team/dev/設計")).toBeUndefined();
  });

  it("returns undefined for invalid canonical path", () => {
    const registry = createEditSessionRegistry();

    expect(registry.getEditSession("not-canonical")).toBeUndefined();
  });

  it("emits change events for set, update, and close", () => {
    const registry = createEditSessionRegistry();
    const listener = vi.fn();
    registry.onDidChange(listener);

    registry.setEditSession("/team/dev/設計", createSession());
    registry.updateEditSession("/team//dev/設計/", (session) => ({
      ...session,
      dirty: true,
    }));
    registry.closeEditSession("/team/dev/設計");

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenNthCalledWith(1, {
      canonicalPath: "/team/dev/設計",
      kind: "set",
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      canonicalPath: "/team/dev/設計",
      kind: "update",
    });
    expect(listener).toHaveBeenNthCalledWith(3, {
      canonicalPath: "/team/dev/設計",
      kind: "close",
    });
  });

  it("stops emitting events after listener is disposed", () => {
    const registry = createEditSessionRegistry();
    const listener = vi.fn();
    const disposable = registry.onDidChange(listener);

    disposable.dispose();
    registry.setEditSession("/team/dev/設計", createSession());

    expect(listener).not.toHaveBeenCalled();
  });
});

import { normalizeCanonicalPath } from "../core/uri";
import type { GrowiEditSession, GrowiEditSessionReference } from "./fsProvider";

type EditSessionChangeKind = "set" | "update" | "close";

export type GrowiEditSessionRegistryChangeEvent = {
  canonicalPath: string;
  kind: EditSessionChangeKind;
};

type Listener = (event: GrowiEditSessionRegistryChangeEvent) => void;
type Disposable = { dispose(): void };

export interface GrowiEditSessionRegistry extends GrowiEditSessionReference {
  setEditSession(canonicalPath: string, editSession: GrowiEditSession): void;
  updateEditSession(
    canonicalPath: string,
    updater: (editSession: GrowiEditSession) => GrowiEditSession,
  ): void;
  onDidChange(listener: Listener): Disposable;
}

export function createEditSessionRegistry(): GrowiEditSessionRegistry {
  const sessions = new Map<string, GrowiEditSession>();
  const listeners = new Set<Listener>();

  function emit(event: GrowiEditSessionRegistryChangeEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    setEditSession(canonicalPath: string, editSession: GrowiEditSession): void {
      const normalized = normalizeCanonicalPath(canonicalPath);
      if (!normalized.ok) {
        return;
      }

      sessions.set(normalized.value, editSession);
      emit({ canonicalPath: normalized.value, kind: "set" });
    },

    updateEditSession(
      canonicalPath: string,
      updater: (editSession: GrowiEditSession) => GrowiEditSession,
    ): void {
      const normalized = normalizeCanonicalPath(canonicalPath);
      if (!normalized.ok) {
        return;
      }

      const editSession = sessions.get(normalized.value);
      if (!editSession) {
        return;
      }

      sessions.set(normalized.value, updater(editSession));
      emit({ canonicalPath: normalized.value, kind: "update" });
    },

    getEditSession(canonicalPath: string): GrowiEditSession | undefined {
      const normalized = normalizeCanonicalPath(canonicalPath);
      if (!normalized.ok) {
        return undefined;
      }

      return sessions.get(normalized.value);
    },

    closeEditSession(canonicalPath: string): void {
      const normalized = normalizeCanonicalPath(canonicalPath);
      if (!normalized.ok) {
        return;
      }

      if (!sessions.delete(normalized.value)) {
        return;
      }

      emit({ canonicalPath: normalized.value, kind: "close" });
    },

    onDidChange(listener: Listener): Disposable {
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        },
      };
    },
  };
}

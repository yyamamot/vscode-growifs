import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPathOutsideExtensionRootForMutation,
  isPathWithinOrEqual,
  resolveRealPathForMutationGuard,
} from "../../src/core/mutationGuard";

describe("mutationGuard", () => {
  it("detects extension root child paths for local mutation guards", () => {
    expect(isPathWithinOrEqual("/extension", "/extension")).toBe(true);
    expect(isPathWithinOrEqual("/extension", "/extension/README.md")).toBe(
      true,
    );
    expect(isPathWithinOrEqual("/extension", "/extension-pack/README.md")).toBe(
      false,
    );
  });

  it("resolves real existing ancestors while preserving missing suffixes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-guard-"));
    try {
      const realRoot = path.join(tempRoot, "real-root");
      const linkedRoot = path.join(tempRoot, "linked-root");
      const missingTarget = path.join(linkedRoot, "missing", "note.md");
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      await mkdir(realRoot);
      await symlink(realRoot, linkedRoot, symlinkType);
      const realRootPath = await realpath(realRoot);

      await expect(
        resolveRealPathForMutationGuard(missingTarget),
      ).resolves.toBe(path.join(realRootPath, "missing", "note.md"));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects direct extension-root mutation targets with realpath-aware checks", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "growifs-guard-"));
    try {
      const extensionRoot = path.join(tempRoot, "extension");
      const normalWorkspaceRoot = path.join(tempRoot, "workspace");
      const symlinkedWorkspaceRoot = path.join(tempRoot, "linked-workspace");
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      await mkdir(extensionRoot);
      await mkdir(normalWorkspaceRoot);
      await symlink(extensionRoot, symlinkedWorkspaceRoot, symlinkType);

      await expect(
        assertPathOutsideExtensionRootForMutation(extensionRoot, extensionRoot),
      ).rejects.toThrow("Refusing to mutate extension install root path");
      await expect(
        assertPathOutsideExtensionRootForMutation(
          extensionRoot,
          path.join(extensionRoot, "README.md"),
        ),
      ).rejects.toThrow("Refusing to mutate extension install root path");
      await expect(
        assertPathOutsideExtensionRootForMutation(
          extensionRoot,
          path.join(
            symlinkedWorkspaceRoot,
            ".growi-mirrors",
            "growi.example.com",
            "team",
            "dev",
            "spec",
            "__spec__.md",
          ),
        ),
      ).rejects.toThrow("Refusing to mutate extension install root path");
      await expect(
        assertPathOutsideExtensionRootForMutation(
          extensionRoot,
          path.join(
            normalWorkspaceRoot,
            ".growi-mirrors",
            "growi.example.com",
            "team",
            "dev",
            "spec",
            "__spec__.md",
          ),
        ),
      ).resolves.toBeUndefined();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

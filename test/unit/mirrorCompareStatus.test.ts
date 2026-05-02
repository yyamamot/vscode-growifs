import { describe, expect, it, vi } from "vitest";
import {
  buildInstanceKey,
  buildMirrorManifestPathWithInstanceKey,
  serializeMirrorManifest,
} from "../../src/vscode/localRoundTrip";
import { lookupMirrorManifestSelection } from "../../src/vscode/mirror/mirrorCompareStatus";

function createManifest(
  rootCanonicalPath: string,
  mode: "page" | "prefix",
  canonicalPaths: readonly string[],
) {
  return serializeMirrorManifest({
    version: 1,
    baseUrl: "https://growi.example.com/",
    rootCanonicalPath,
    mode,
    exportedAt: "2026-04-19T00:00:00.000Z",
    pages: canonicalPaths.map((canonicalPath) => ({
      canonicalPath,
      relativeFilePath:
        canonicalPath === rootCanonicalPath
          ? "__sample__.md"
          : `${canonicalPath.slice(rootCanonicalPath.length + 1)}.md`,
      pageId: `page:${canonicalPath}`,
      baseRevisionId: `revision:${canonicalPath}:001`,
      exportedAt: "2026-04-19T00:00:00.000Z",
      contentHash: `hash:${canonicalPath}`,
    })),
  });
}

describe("mirror compare status", () => {
  it("limits exact prefix manifests to the requested page for page scope", async () => {
    const workspaceRoot = "/workspace";
    const baseUrl = "https://growi.example.com/";
    const instanceKey = buildInstanceKey(baseUrl);
    const manifestPath = buildMirrorManifestPathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      "/sample",
    );
    const readLocalFile = vi.fn(async (localPath: string) => {
      if (localPath === manifestPath) {
        return createManifest("/sample", "prefix", [
          "/sample",
          "/sample/child",
        ]);
      }
      throw new Error(`unexpected file: ${localPath}`);
    });

    const result = await lookupMirrorManifestSelection(
      {
        getLocalWorkspaceRoot: () => workspaceRoot,
        getBaseUrl: () => baseUrl,
        readLocalFile,
        bootstrapEditSession: vi.fn(),
      },
      {
        requestedCanonicalPath: "/sample",
        requestedScope: "page",
        allowAncestorReuse: true,
      },
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }
    expect(result.value.selectedPages).toEqual([
      expect.objectContaining({ canonicalPath: "/sample" }),
    ]);
  });

  it("keeps subtree scope for exact prefix manifests", async () => {
    const workspaceRoot = "/workspace";
    const baseUrl = "https://growi.example.com/";
    const instanceKey = buildInstanceKey(baseUrl);
    const manifestPath = buildMirrorManifestPathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      "/sample",
    );
    const readLocalFile = vi.fn(async (localPath: string) => {
      if (localPath === manifestPath) {
        return createManifest("/sample", "prefix", [
          "/sample",
          "/sample/child",
        ]);
      }
      throw new Error(`unexpected file: ${localPath}`);
    });

    const result = await lookupMirrorManifestSelection(
      {
        getLocalWorkspaceRoot: () => workspaceRoot,
        getBaseUrl: () => baseUrl,
        readLocalFile,
        bootstrapEditSession: vi.fn(),
      },
      {
        requestedCanonicalPath: "/sample",
        requestedScope: "subtree",
        allowAncestorReuse: true,
      },
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }
    expect(result.value.selectedPages).toEqual([
      expect.objectContaining({ canonicalPath: "/sample" }),
      expect.objectContaining({ canonicalPath: "/sample/child" }),
    ]);
  });
});

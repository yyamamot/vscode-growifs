import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  Uri: {
    file: vi.fn((value: string) => ({
      fsPath: value,
      path: value,
      scheme: "file",
      toString: () => `file:${value}`,
    })),
    parse: vi.fn((value: string) => {
      const separator = value.indexOf(":");
      const scheme = separator >= 0 ? value.slice(0, separator) : "";
      const path = separator >= 0 ? value.slice(separator + 1) : value;
      return {
        scheme,
        path,
        toString: () => value,
      };
    }),
  },
}));

import {
  createGrowiMirrorCompareSourceControl,
  GROWI_MIRROR_COMPARE_SOURCE_CONTROL_ID,
  GROWI_MIRROR_COMPARE_SOURCE_CONTROL_LABEL,
} from "../../src/vscode/mirror/mirrorCompareSourceControl";

function createFakeScmNamespace() {
  const groups = new Map<
    string,
    { id: string; label: string; resourceStates: unknown[] }
  >();
  const sourceControl = {
    id: "",
    label: "",
    count: 0,
    inputBox: {
      visible: true,
    },
    createResourceGroup(id: string, label: string) {
      const group = { id, label, resourceStates: [] as unknown[] };
      groups.set(id, group);
      return group;
    },
    dispose: vi.fn(),
  };

  const scm = {
    createSourceControl: vi.fn((id: string, label: string) => {
      sourceControl.id = id;
      sourceControl.label = label;
      return sourceControl;
    }),
  };

  return { scm, sourceControl, groups };
}

describe("mirror compare source control", () => {
  it("registers a stable SCM source control and groups compare resources by status", () => {
    const { scm, sourceControl, groups } = createFakeScmNamespace();
    const provider = createGrowiMirrorCompareSourceControl(scm);

    provider.setState({
      currentCanonicalPath: "/team/dev/spec",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/team/dev/spec/local-only",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/local-only.md",
            fsPath: "/tmp/local-only.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/local-only.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/remote-only",
          status: "RemoteChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/remote-only.md",
            fsPath: "/tmp/remote-only.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/remote-only.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/conflict",
          status: "Conflict",
          localFileUri: {
            scheme: "file",
            path: "/tmp/conflict.md",
            fsPath: "/tmp/conflict.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/conflict.md",
          },
        },
      ],
    });

    expect(scm.createSourceControl).toHaveBeenCalledWith(
      GROWI_MIRROR_COMPARE_SOURCE_CONTROL_ID,
      GROWI_MIRROR_COMPARE_SOURCE_CONTROL_LABEL,
    );
    expect(sourceControl.inputBox.visible).toBe(false);
    expect(sourceControl.count).toBe(3);
    expect(groups.get("changes")?.label).toBe("Local Changes");
    expect(groups.get("remoteChanged")?.label).toBe("GROWI Changes");
    expect(groups.get("conflicts")?.label).toBe("Conflicts");
    expect(groups.get("changes")?.resourceStates).toHaveLength(1);
    expect(groups.get("remoteChanged")?.resourceStates).toHaveLength(1);
    expect(groups.get("conflicts")?.resourceStates).toHaveLength(1);
    expect(groups.get("changes")?.resourceStates[0]).toMatchObject({
      contextValue: "growifs.localChanged",
      resourceUri: {
        scheme: "file",
        path: "/tmp/local-only.md",
      },
      command: {
        command: "vscode.diff",
        title: "GROWI Mirror Diff: /team/dev/spec/local-only",
        arguments: [
          {
            scheme: "growi",
            path: "/team/dev/spec/local-only.md",
          },
          {
            scheme: "file",
            path: "/tmp/local-only.md",
          },
          "GROWI Mirror Diff: /team/dev/spec/local-only",
        ],
      },
    });
    expect(groups.get("remoteChanged")?.resourceStates[0]).toMatchObject({
      contextValue: "growifs.remoteChanged",
    });
    expect(groups.get("conflicts")?.resourceStates[0]).toMatchObject({
      contextValue: "growifs.conflict",
    });
    expect(provider.getState()).toEqual({
      currentCanonicalPath: "/team/dev/spec",
      targetScope: "subtree",
      resources: expect.any(Array),
    });
    expect(
      provider.getResourcesFromCommandArgs([
        groups.get("changes")?.resourceStates[0],
        groups.get("remoteChanged")?.resourceStates[0],
      ]),
    ).toEqual([
      expect.objectContaining({
        canonicalPath: "/team/dev/spec/local-only",
        status: "LocalChanged",
      }),
      expect.objectContaining({
        canonicalPath: "/team/dev/spec/remote-only",
        status: "RemoteChanged",
      }),
    ]);
  });

  it("clears and overwrites SCM compare resources", () => {
    const { scm, sourceControl, groups } = createFakeScmNamespace();
    const provider = createGrowiMirrorCompareSourceControl(scm);

    provider.setState({
      currentCanonicalPath: "/sample",
      targetScope: "page",
      resources: [
        {
          canonicalPath: "/sample/one",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/one.md",
            fsPath: "/tmp/one.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/one.md",
          },
        },
      ],
    });
    provider.setState({
      currentCanonicalPath: "/sample/two",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/sample/two",
          status: "Conflict",
          localFileUri: {
            scheme: "file",
            path: "/tmp/two.md",
            fsPath: "/tmp/two.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/two.md",
          },
        },
      ],
    });

    expect(sourceControl.count).toBe(1);
    expect(groups.get("changes")?.resourceStates).toHaveLength(0);
    expect(groups.get("remoteChanged")?.resourceStates).toHaveLength(0);
    expect(groups.get("conflicts")?.resourceStates).toHaveLength(1);

    provider.clear();

    expect(sourceControl.count).toBe(0);
    expect(groups.get("changes")?.resourceStates).toHaveLength(0);
    expect(groups.get("remoteChanged")?.resourceStates).toHaveLength(0);
    expect(groups.get("conflicts")?.resourceStates).toHaveLength(0);
    expect(provider.getState()).toBeUndefined();
  });

  it("prefers explicit resource-state arguments over group arguments", () => {
    const { scm, groups } = createFakeScmNamespace();
    const provider = createGrowiMirrorCompareSourceControl(scm);

    provider.setState({
      currentCanonicalPath: "/sample",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/sample/one",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/one.md",
            fsPath: "/tmp/one.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/one.md",
          },
        },
        {
          canonicalPath: "/sample/two",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/two.md",
            fsPath: "/tmp/two.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/two.md",
          },
        },
      ],
    });

    expect(
      provider.getResourcesFromCommandArgs([
        groups.get("changes")?.resourceStates[0],
        groups.get("changes"),
      ]),
    ).toEqual([
      expect.objectContaining({
        canonicalPath: "/sample/one",
        status: "LocalChanged",
      }),
    ]);
  });

  it("prefers direct resource-state args over selected-resource arrays", () => {
    const { scm, groups } = createFakeScmNamespace();
    const provider = createGrowiMirrorCompareSourceControl(scm);

    provider.setState({
      currentCanonicalPath: "/sample",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/sample/one",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/one.md",
            fsPath: "/tmp/one.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/one.md",
          },
        },
        {
          canonicalPath: "/sample/two",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/two.md",
            fsPath: "/tmp/two.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/two.md",
          },
        },
      ],
    });

    const selectedResourceStates = groups.get("changes")?.resourceStates ?? [];
    expect(
      provider.getResourcesFromCommandArgs([
        selectedResourceStates,
        selectedResourceStates[0],
      ]),
    ).toEqual([
      expect.objectContaining({
        canonicalPath: "/sample/one",
        status: "LocalChanged",
      }),
    ]);
  });
});

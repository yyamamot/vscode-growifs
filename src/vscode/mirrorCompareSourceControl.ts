import * as vscode from "vscode";
import type { UriLike } from "./commands";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./mirrorCompareScm";

export const GROWI_MIRROR_COMPARE_SOURCE_CONTROL_ID = "growifs-mirror-compare";
export const GROWI_MIRROR_COMPARE_SOURCE_CONTROL_LABEL = "GROWI Mirror Compare";
export const GROWI_MIRROR_COMPARE_LOCAL_CHANGES_CONTEXT =
  "growifs.localChanged";
export const GROWI_MIRROR_COMPARE_REMOTE_CHANGES_CONTEXT =
  "growifs.remoteChanged";
export const GROWI_MIRROR_COMPARE_CONFLICT_CONTEXT = "growifs.conflict";

type MirrorCompareScmGroupId = "changes" | "remoteChanged" | "conflicts";

interface MirrorCompareScmResourceState
  extends vscode.SourceControlResourceState {
  contextValue: string;
  mirrorCompareResource: MirrorCompareScmResource;
}

interface SourceControlResourceGroupLike {
  id?: string;
  label?: string;
  resourceStates: unknown[];
}

interface SourceControlLike {
  count: number;
  inputBox: {
    visible: boolean;
  };
  createResourceGroup(
    id: string,
    label: string,
  ): SourceControlResourceGroupLike;
  dispose(): void;
}

interface ScmNamespaceLike {
  createSourceControl(id: string, label: string): SourceControlLike;
}

function isMirrorCompareResourceState(
  value: unknown,
): value is MirrorCompareScmResourceState {
  const candidate = value as { mirrorCompareResource?: unknown } | null;
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    "mirrorCompareResource" in candidate &&
    Boolean(candidate?.mirrorCompareResource) &&
    typeof candidate?.mirrorCompareResource === "object"
  );
}

function createNoopSourceControl(): SourceControlLike {
  return {
    count: 0,
    inputBox: {
      visible: false,
    },
    createResourceGroup(id: string, label: string) {
      return {
        id,
        label,
        resourceStates: [],
      };
    },
    dispose() {},
  };
}

function toVscodeUri(uri: UriLike): vscode.Uri {
  return uri.scheme === "file"
    ? vscode.Uri.file(uri.fsPath ?? uri.path)
    : vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
}

function buildMirrorCompareDiffTitle(canonicalPath: string): string {
  return `GROWI Mirror Diff: ${canonicalPath}`;
}

function buildResourceState(
  resource: MirrorCompareScmResource,
): MirrorCompareScmResourceState {
  const remoteUri = toVscodeUri(resource.remoteUri);
  const localFileUri = toVscodeUri(resource.localFileUri);
  const statusLabel =
    resource.status === "LocalChanged"
      ? "modified locally"
      : resource.status === "RemoteChanged"
        ? "remote changed"
        : "conflict";

  return {
    resourceUri: localFileUri,
    contextValue:
      resource.status === "LocalChanged"
        ? GROWI_MIRROR_COMPARE_LOCAL_CHANGES_CONTEXT
        : resource.status === "RemoteChanged"
          ? GROWI_MIRROR_COMPARE_REMOTE_CHANGES_CONTEXT
          : GROWI_MIRROR_COMPARE_CONFLICT_CONTEXT,
    mirrorCompareResource: resource,
    command: {
      command: "vscode.diff",
      title: buildMirrorCompareDiffTitle(resource.canonicalPath),
      arguments: [
        remoteUri,
        localFileUri,
        buildMirrorCompareDiffTitle(resource.canonicalPath),
      ],
    },
    decorations: {
      tooltip: `${statusLabel}: ${resource.canonicalPath}`,
    },
  };
}

export function createGrowiMirrorCompareSourceControl(
  scmNamespace?: ScmNamespaceLike,
) {
  let currentState: MirrorCompareScmState | undefined;
  const resolvedScmNamespace =
    scmNamespace ??
    ("scm" in vscode
      ? ((vscode as { scm?: ScmNamespaceLike }).scm ?? undefined)
      : undefined);
  const sourceControl =
    resolvedScmNamespace?.createSourceControl(
      GROWI_MIRROR_COMPARE_SOURCE_CONTROL_ID,
      GROWI_MIRROR_COMPARE_SOURCE_CONTROL_LABEL,
    ) ?? createNoopSourceControl();
  sourceControl.inputBox.visible = false;

  const changesGroup = sourceControl.createResourceGroup(
    "changes",
    "Local Changes",
  );
  const remoteChangedGroup = sourceControl.createResourceGroup(
    "remoteChanged",
    "Remote Changes",
  );
  const conflictsGroup = sourceControl.createResourceGroup(
    "conflicts",
    "Conflicts",
  );

  const getResourcesForGroup = (
    groupId: MirrorCompareScmGroupId,
  ): MirrorCompareScmResource[] => {
    const resources = currentState?.resources ?? [];
    return resources.filter((resource) =>
      groupId === "changes"
        ? resource.status === "LocalChanged"
        : groupId === "remoteChanged"
          ? resource.status === "RemoteChanged"
          : resource.status === "Conflict",
    );
  };

  const collectResourceStatesFromUnknown = (
    value: unknown,
    collected: Map<string, MirrorCompareScmResource>,
  ) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        collectResourceStatesFromUnknown(entry, collected);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }

    if (isMirrorCompareResourceState(value)) {
      const resource = value.mirrorCompareResource;
      collected.set(`${resource.status}:${resource.canonicalPath}`, resource);
    }
  };

  const collectTopLevelResourceStates = (
    args: readonly unknown[],
    collected: Map<string, MirrorCompareScmResource>,
  ) => {
    for (const arg of args) {
      if (!isMirrorCompareResourceState(arg)) {
        continue;
      }
      const resource = arg.mirrorCompareResource;
      collected.set(`${resource.status}:${resource.canonicalPath}`, resource);
    }
  };

  const collectTopLevelGroupResources = (
    args: readonly unknown[],
    collected: Map<string, MirrorCompareScmResource>,
  ) => {
    for (const arg of args) {
      if (!arg || typeof arg !== "object") {
        continue;
      }
      if (!("id" in arg) || typeof arg.id !== "string") {
        continue;
      }
      const groupId = arg.id as MirrorCompareScmGroupId;
      if (
        groupId !== "changes" &&
        groupId !== "remoteChanged" &&
        groupId !== "conflicts"
      ) {
        continue;
      }
      for (const resource of getResourcesForGroup(groupId)) {
        collected.set(`${resource.status}:${resource.canonicalPath}`, resource);
      }
    }
  };

  const collectResourcesFromUnknown = (
    value: unknown,
    collected: Map<string, MirrorCompareScmResource>,
  ) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        collectResourcesFromUnknown(entry, collected);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }

    if ("id" in value && typeof value.id === "string") {
      const groupId = value.id as MirrorCompareScmGroupId;
      if (
        groupId === "changes" ||
        groupId === "remoteChanged" ||
        groupId === "conflicts"
      ) {
        for (const resource of getResourcesForGroup(groupId)) {
          collected.set(
            `${resource.status}:${resource.canonicalPath}`,
            resource,
          );
        }
      }
    }
  };

  const clear = () => {
    currentState = undefined;
    changesGroup.resourceStates = [];
    remoteChangedGroup.resourceStates = [];
    conflictsGroup.resourceStates = [];
    sourceControl.count = 0;
  };

  const setState = (state: MirrorCompareScmState) => {
    currentState = {
      currentCanonicalPath: state.currentCanonicalPath,
      targetScope: state.targetScope,
      resources: [...state.resources],
    };
    changesGroup.resourceStates = state.resources
      .filter((resource) => resource.status === "LocalChanged")
      .map(buildResourceState);
    remoteChangedGroup.resourceStates = state.resources
      .filter((resource) => resource.status === "RemoteChanged")
      .map(buildResourceState);
    conflictsGroup.resourceStates = state.resources
      .filter((resource) => resource.status === "Conflict")
      .map(buildResourceState);
    sourceControl.count = state.resources.length;
  };

  clear();

  return {
    sourceControl,
    clear,
    getState() {
      return currentState
        ? {
            currentCanonicalPath: currentState.currentCanonicalPath,
            targetScope: currentState.targetScope,
            resources: [...currentState.resources],
          }
        : undefined;
    },
    getResourcesFromCommandArgs(args: readonly unknown[]) {
      const topLevelResources = new Map<string, MirrorCompareScmResource>();
      collectTopLevelResourceStates(args, topLevelResources);
      if (topLevelResources.size > 0) {
        return [...topLevelResources.values()];
      }

      const topLevelGroupResources = new Map<string, MirrorCompareScmResource>();
      collectTopLevelGroupResources(args, topLevelGroupResources);
      if (topLevelGroupResources.size > 0) {
        return [...topLevelGroupResources.values()];
      }

      const explicitResources = new Map<string, MirrorCompareScmResource>();
      collectResourceStatesFromUnknown(args, explicitResources);
      if (explicitResources.size > 0) {
        return [...explicitResources.values()];
      }

      const collected = new Map<string, MirrorCompareScmResource>();
      collectResourcesFromUnknown(args, collected);
      return collected.size > 0 ? [...collected.values()] : undefined;
    },
    setState,
  };
}

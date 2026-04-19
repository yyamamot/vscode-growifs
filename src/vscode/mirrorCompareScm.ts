export type MirrorCompareScmResourceStatus =
  | "LocalChanged"
  | "RemoteChanged"
  | "Conflict";

export interface MirrorCompareScmResource {
  canonicalPath: string;
  status: MirrorCompareScmResourceStatus;
  localFileUri: {
    scheme: string;
    path: string;
    fsPath?: string;
  };
  remoteUri: {
    scheme: string;
    path: string;
    fsPath?: string;
  };
}

export interface MirrorCompareScmState {
  currentCanonicalPath: string;
  targetScope: "page" | "subtree";
  resources: readonly MirrorCompareScmResource[];
}

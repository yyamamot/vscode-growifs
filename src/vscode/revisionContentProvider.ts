import type * as vscode from "vscode";

import {
  type GrowiRevisionReader,
  parseGrowiRevisionUri,
} from "./revisionModel";

type RevisionContentProviderDeps = GrowiRevisionReader;

export class GrowiRevisionContentProvider
  implements vscode.TextDocumentContentProvider
{
  private readonly seededBodies = new Map<string, string>();

  constructor(private readonly deps: RevisionContentProviderDeps) {}

  seedRevisionContent(
    uri: Pick<vscode.Uri, "scheme" | "path" | "toString">,
    body: string,
  ): void {
    this.seededBodies.set(uri.toString(), body);
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const seeded = this.seededBodies.get(uri.toString());
    if (seeded !== undefined) {
      return seeded;
    }

    const parsed = parseGrowiRevisionUri(uri);
    if (!parsed.ok) {
      throw new Error("Invalid growi revision URI");
    }

    const result = await this.deps.readRevision(
      parsed.pageId,
      parsed.revisionId,
    );
    if (!result.ok) {
      throw new Error(`Failed to load revision: ${result.reason}`);
    }

    return result.body;
  }
}

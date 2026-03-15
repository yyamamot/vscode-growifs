import * as vscode from "vscode";

import {
  type ParsedGrowiReference,
  parseGrowiLinkReference,
} from "../core/uri";
import type { GrowiReadFailureReason } from "./fsProvider";
import { collectMarkdownLinkCandidates as collectMarkdownLinks } from "./markdownLinks";

export interface GrowiLinkNavigationDeps {
  getBaseUrl(): string | undefined;
  resolvePageReference(reference: ParsedGrowiReference): Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | { ok: false; reason: GrowiReadFailureReason }
  >;
}

interface MarkdownLinkCandidate {
  isImage: boolean;
  normalizedTarget: string;
  range: vscode.Range;
}

function collectDocumentMarkdownLinkCandidates(
  document: vscode.TextDocument,
): MarkdownLinkCandidate[] {
  return collectMarkdownLinks(document.getText()).map((candidate) => ({
    isImage: candidate.isImage,
    normalizedTarget: candidate.normalizedTarget,
    range: new vscode.Range(
      document.positionAt(candidate.targetStartOffset),
      document.positionAt(candidate.targetEndOffset),
    ),
  }));
}

async function resolveCandidateToUri(
  candidate: MarkdownLinkCandidate,
  deps: GrowiLinkNavigationDeps,
): Promise<string | undefined> {
  const attachmentUri = resolveAttachmentWebUri(
    candidate.normalizedTarget,
    deps.getBaseUrl(),
  );
  if (attachmentUri) {
    return attachmentUri;
  }

  const parsed = parseGrowiLinkReference(candidate.normalizedTarget, {
    baseUrl: deps.getBaseUrl(),
  });
  if (!parsed) {
    return undefined;
  }

  const resolved = await deps.resolvePageReference(parsed);
  return resolved.ok ? resolved.uri : undefined;
}

function isRootRelativeAttachmentPath(target: string): boolean {
  return (
    target.startsWith("/attachment/") &&
    !target.startsWith("//") &&
    target.length > "/attachment/".length
  );
}

function resolveAttachmentWebUri(
  target: string,
  baseUrl: string | undefined,
): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  if (isRootRelativeAttachmentPath(target)) {
    try {
      return new URL(target, baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  if (!isSameOriginUrl(target, baseUrl)) {
    return undefined;
  }

  try {
    const parsed = new URL(target);
    return isRootRelativeAttachmentPath(parsed.pathname)
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function isKnownDrawioEmbedTarget(target: string): boolean {
  if (!isHttpUrl(target)) {
    return false;
  }

  try {
    const host = new URL(target).host.toLowerCase();
    return (
      host === "draw.io" ||
      host.endsWith(".draw.io") ||
      host === "diagrams.net" ||
      host.endsWith(".diagrams.net")
    );
  } catch {
    return false;
  }
}

function isDifferentHostUrl(
  target: string,
  baseUrl: string | undefined,
): boolean {
  if (!isHttpUrl(target)) {
    return false;
  }

  if (!baseUrl) {
    return true;
  }

  try {
    return new URL(target).host !== new URL(baseUrl).host;
  } catch {
    return true;
  }
}

function isSameOriginUrl(target: string, baseUrl: string | undefined): boolean {
  if (!isHttpUrl(target) || !baseUrl) {
    return false;
  }

  try {
    return new URL(target).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isUnresolvableInternalLinkCandidate(
  target: string,
  baseUrl: string | undefined,
): boolean {
  if (target.startsWith("./") || target.startsWith("../")) {
    return true;
  }

  if (target.startsWith("#")) {
    return true;
  }

  if (target.startsWith("/")) {
    return true;
  }

  if (isSameOriginUrl(target, baseUrl)) {
    return true;
  }

  if (isDifferentHostUrl(target, baseUrl)) {
    return true;
  }

  return false;
}

export function collectUnresolvableGrowiLinkDiagnostics(
  document: vscode.TextDocument,
  deps: GrowiLinkNavigationDeps,
): Promise<vscode.Diagnostic[]> {
  const baseUrl = deps.getBaseUrl();
  const diagnostics: vscode.Diagnostic[] = [];

  return (async () => {
    for (const candidate of collectDocumentMarkdownLinkCandidates(document)) {
      if (candidate.isImage) {
        continue;
      }

      if (resolveAttachmentWebUri(candidate.normalizedTarget, baseUrl)) {
        continue;
      }

      const parsed = parseGrowiLinkReference(candidate.normalizedTarget, {
        baseUrl,
      });
      if (parsed) {
        const resolved = await deps.resolvePageReference(parsed);
        if (resolved.ok) {
          continue;
        }
      } else if (
        !isUnresolvableInternalLinkCandidate(
          candidate.normalizedTarget,
          baseUrl,
        )
      ) {
        continue;
      }

      diagnostics.push(
        new vscode.Diagnostic(
          candidate.range,
          `Could not resolve GROWI internal link target: ${candidate.normalizedTarget}`,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    }

    return diagnostics;
  })();
}

function collectUnfetchedGrowiImageDiagnostics(
  document: vscode.TextDocument,
): vscode.Diagnostic[] {
  return collectDocumentMarkdownLinkCandidates(document)
    .map((candidate) => {
      if (!candidate.isImage) {
        return undefined;
      }

      if (
        !isHttpUrl(candidate.normalizedTarget) ||
        isKnownDrawioEmbedTarget(candidate.normalizedTarget)
      ) {
        return undefined;
      }

      return new vscode.Diagnostic(
        candidate.range,
        `Could not fetch image asset: ${candidate.normalizedTarget}`,
        vscode.DiagnosticSeverity.Warning,
      );
    })
    .filter(
      (diagnostic): diagnostic is vscode.Diagnostic => diagnostic !== undefined,
    );
}

function collectDrawioEmbedDiagnostics(
  document: vscode.TextDocument,
): vscode.Diagnostic[] {
  return collectDocumentMarkdownLinkCandidates(document)
    .map((candidate) => {
      if (!candidate.isImage) {
        return undefined;
      }

      if (!isKnownDrawioEmbedTarget(candidate.normalizedTarget)) {
        return undefined;
      }

      return new vscode.Diagnostic(
        candidate.range,
        `draw.io embed is not supported: ${candidate.normalizedTarget}`,
        vscode.DiagnosticSeverity.Information,
      );
    })
    .filter(
      (diagnostic): diagnostic is vscode.Diagnostic => diagnostic !== undefined,
    );
}

export function collectGrowiLinkDiagnostics(
  document: vscode.TextDocument,
  deps: GrowiLinkNavigationDeps,
): Promise<vscode.Diagnostic[]> {
  return collectUnresolvableGrowiLinkDiagnostics(document, deps).then(
    (linkDiagnostics) => [
      ...linkDiagnostics,
      ...collectUnfetchedGrowiImageDiagnostics(document),
      ...collectDrawioEmbedDiagnostics(document),
    ],
  );
}

export function createGrowiDocumentLinkProvider(
  deps: GrowiLinkNavigationDeps,
): vscode.DocumentLinkProvider {
  return {
    async provideDocumentLinks(
      document: vscode.TextDocument,
    ): Promise<vscode.DocumentLink[]> {
      const links: vscode.DocumentLink[] = [];

      for (const candidate of collectDocumentMarkdownLinkCandidates(document)) {
        if (candidate.isImage) {
          continue;
        }

        const targetUri = await resolveCandidateToUri(candidate, deps);
        if (!targetUri) {
          continue;
        }

        links.push(
          new vscode.DocumentLink(candidate.range, vscode.Uri.parse(targetUri)),
        );
      }

      return links;
    },
  };
}

export function createGrowiDefinitionProvider(
  deps: GrowiLinkNavigationDeps,
): vscode.DefinitionProvider {
  return {
    async provideDefinition(
      document: vscode.TextDocument,
      position: vscode.Position,
    ): Promise<vscode.Definition | undefined> {
      for (const candidate of collectDocumentMarkdownLinkCandidates(document)) {
        if (!candidate.range.contains(position)) {
          continue;
        }

        if (candidate.isImage) {
          return undefined;
        }

        if (
          resolveAttachmentWebUri(candidate.normalizedTarget, deps.getBaseUrl())
        ) {
          return undefined;
        }

        const targetUri = await resolveCandidateToUri(candidate, deps);
        if (!targetUri) {
          return undefined;
        }

        return new vscode.Location(
          vscode.Uri.parse(targetUri),
          new vscode.Position(0, 0),
        );
      }

      return undefined;
    },
  };
}

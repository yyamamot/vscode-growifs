import * as vscode from "vscode";

import { normalizeGrowiAssetTarget } from "./growiAsset";
import { isKnownDrawioEmbedTarget } from "./linkNavigation";

export const DRAWIO_DIAGRAM_HIDDEN_PLACEHOLDER = "[draw.io diagram hidden]";

interface MarkdownImageTokenLike {
  attrGet(name: string): string | null;
  attrSet?(name: string, value: string): void;
}

type ImageRenderer = (
  tokens: readonly MarkdownImageTokenLike[],
  index: number,
  options: unknown,
  env: unknown,
  self: { renderToken(...args: unknown[]): string },
) => string;

interface MarkdownItLike {
  renderer: {
    rules: {
      image?: ImageRenderer;
    };
  };
}

type GrowiAssetProxyUrlResolver = (
  internalAssetId: string,
) => string | undefined;

let resolveGrowiAssetProxyUrl: GrowiAssetProxyUrlResolver | undefined;

export function setGrowiAssetProxyUrlResolver(
  resolver: GrowiAssetProxyUrlResolver | undefined,
): void {
  resolveGrowiAssetProxyUrl = resolver;
}

function getConfiguredBaseUrl(): string | undefined {
  try {
    const configured = vscode.workspace
      ?.getConfiguration("growi")
      .get<string>("baseUrl");
    if (!configured) {
      return undefined;
    }

    const trimmed = configured.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function extendMarkdownPreviewIt<T extends MarkdownItLike>(md: T): T {
  const defaultImageRenderer: ImageRenderer =
    md.renderer.rules.image ??
    ((tokens, index, options, env, self) =>
      self.renderToken(tokens, index, options, env, self));

  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const src = tokens[index]?.attrGet("src");
    if (src && isKnownDrawioEmbedTarget(src)) {
      return DRAWIO_DIAGRAM_HIDDEN_PLACEHOLDER;
    }

    if (src) {
      const normalizedAsset = normalizeGrowiAssetTarget(src, {
        baseUrl: getConfiguredBaseUrl(),
      });
      if (normalizedAsset && resolveGrowiAssetProxyUrl) {
        const proxyUrl = resolveGrowiAssetProxyUrl(
          normalizedAsset.internalAssetId,
        );
        if (proxyUrl) {
          tokens[index]?.attrSet?.("src", proxyUrl);
        }
      }
    }

    return defaultImageRenderer(tokens, index, options, env, self);
  };

  return md;
}

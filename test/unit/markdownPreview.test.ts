import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVscodeState = vi.hoisted(() => ({
  baseUrl: "",
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) =>
        key === "baseUrl" ? mockVscodeState.baseUrl : undefined,
    }),
  },
}));

import { normalizeGrowiAssetTarget } from "../../src/vscode/growiAsset";
import {
  DRAWIO_DIAGRAM_HIDDEN_PLACEHOLDER,
  extendMarkdownPreviewIt,
  setGrowiAssetProxyUrlResolver,
} from "../../src/vscode/markdownPreview";

interface MarkdownImageTokenLike {
  attrGet(name: string): string | null;
  attrSet?(name: string, value: string): void;
}

interface MarkdownRendererSelfLike {
  renderToken(...args: unknown[]): string;
}

type MarkdownImageRenderer = (
  tokens: readonly MarkdownImageTokenLike[],
  index: number,
  options: unknown,
  env: unknown,
  self: MarkdownRendererSelfLike,
) => string;

interface MarkdownPreviewLike {
  renderer: {
    rules: {
      image?: MarkdownImageRenderer;
    };
  };
}

function createMarkdownImageToken(source: string) {
  let currentSrc = source;

  return {
    attrGet(name: string): string | null {
      if (name === "src") {
        return currentSrc;
      }
      return null;
    },
    attrSet(name: string, value: string) {
      if (name === "src") {
        currentSrc = value;
      }
    },
  };
}

describe("normalizeGrowiAssetTarget", () => {
  it("accepts same-host absolute URL", () => {
    const result = normalizeGrowiAssetTarget(
      "https://growi.example.com/files/image.png?size=large",
      { baseUrl: "https://growi.example.com" },
    );

    expect(result).toEqual({
      internalAssetId: "growi-asset:%2Ffiles%2Fimage.png%3Fsize%3Dlarge",
      proxyUrl:
        "http://127.0.0.1:0/growi-assets/growi-asset%3A%252Ffiles%252Fimage.png%253Fsize%253Dlarge",
    });
  });

  it("accepts root-relative path", () => {
    const result = normalizeGrowiAssetTarget("/_api/attachments/12345");

    expect(result).toEqual({
      internalAssetId: "growi-asset:%2F_api%2Fattachments%2F12345",
      proxyUrl:
        "http://127.0.0.1:0/growi-assets/growi-asset%3A%252F_api%252Fattachments%252F12345",
    });
  });

  it("rejects relative paths", () => {
    expect(normalizeGrowiAssetTarget("./assets/image.png")).toBeUndefined();
    expect(normalizeGrowiAssetTarget("../assets/image.png")).toBeUndefined();
  });

  it("rejects scheme-relative URL", () => {
    expect(
      normalizeGrowiAssetTarget("//growi.example.com/files/image.png"),
    ).toBeUndefined();
  });

  it("rejects different-host external URL", () => {
    expect(
      normalizeGrowiAssetTarget("https://assets.example.com/image.png", {
        baseUrl: "https://growi.example.com",
      }),
    ).toBeUndefined();
  });
});

describe("extendMarkdownPreviewIt", () => {
  const proxyOrigin = "http://127.0.0.1:43111";

  beforeEach(() => {
    setGrowiAssetProxyUrlResolver(undefined);
  });

  it("rewrites same-host absolute URL images to proxy URL", () => {
    setGrowiAssetProxyUrlResolver(
      (internalAssetId) =>
        `${proxyOrigin}/growi-assets/${encodeURIComponent(internalAssetId)}`,
    );
    mockVscodeState.baseUrl = "https://growi.example.com";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      (tokens, index) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };
    const token = createMarkdownImageToken(
      "https://growi.example.com/files/image.png?size=large",
    );

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.([token], 0, {}, {}, { renderToken: vi.fn() }) ??
      "";

    expect(output).toContain(`${proxyOrigin}/growi-assets/`);
    expect(output).toContain(
      encodeURIComponent(
        `growi-asset:${encodeURIComponent("/files/image.png?size=large")}`,
      ),
    );
    expect(fallbackRenderer).toHaveBeenCalledTimes(1);
  });

  it("rewrites root-relative image paths to proxy URL", () => {
    setGrowiAssetProxyUrlResolver(
      (internalAssetId) =>
        `${proxyOrigin}/growi-assets/${encodeURIComponent(internalAssetId)}`,
    );
    mockVscodeState.baseUrl = "";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      (tokens, index) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };
    const token = createMarkdownImageToken("/_api/attachments/12345");

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.([token], 0, {}, {}, { renderToken: vi.fn() }) ??
      "";

    expect(output).toContain(`${proxyOrigin}/growi-assets/`);
    expect(output).toContain(
      encodeURIComponent(
        `growi-asset:${encodeURIComponent("/_api/attachments/12345")}`,
      ),
    );
    expect(fallbackRenderer).toHaveBeenCalledTimes(1);
  });

  it("replaces draw.io images with placeholder text", () => {
    mockVscodeState.baseUrl = "https://growi.example.com";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      () => "<img src='fallback'>",
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.(
        [createMarkdownImageToken("https://embed.diagrams.net/?lightbox=1")],
        0,
        {},
        {},
        {
          renderToken: vi.fn(() => ""),
        },
      ) ?? "";

    expect(output).toBe(DRAWIO_DIAGRAM_HIDDEN_PLACEHOLDER);
    expect(fallbackRenderer).not.toHaveBeenCalled();
  });

  it("keeps different-host image URLs unchanged", () => {
    mockVscodeState.baseUrl = "https://growi.example.com";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      (tokens, index) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };
    const token = createMarkdownImageToken(
      "https://assets.example.com/image.png",
    );

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.(
        [token],
        0,
        {},
        {},
        {
          renderToken: vi.fn(() => ""),
        },
      ) ?? "";

    expect(output).toBe("<img src='https://assets.example.com/image.png'>");
    expect(fallbackRenderer).toHaveBeenCalledTimes(1);
  });

  it("keeps relative image paths unchanged", () => {
    mockVscodeState.baseUrl = "https://growi.example.com";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      (tokens, index) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.(
        [createMarkdownImageToken("./assets/image.png")],
        0,
        {},
        {},
        {
          renderToken: vi.fn(() => ""),
        },
      ) ?? "";

    expect(output).toBe("<img src='./assets/image.png'>");
    expect(fallbackRenderer).toHaveBeenCalledTimes(1);
  });

  it("falls back to default image renderer when image rule is missing", () => {
    setGrowiAssetProxyUrlResolver(
      (internalAssetId) =>
        `${proxyOrigin}/growi-assets/${encodeURIComponent(internalAssetId)}`,
    );
    mockVscodeState.baseUrl = "";
    const renderToken = vi.fn((tokens: readonly MarkdownImageTokenLike[]) => {
      const src = tokens[0]?.attrGet("src") ?? "";
      return `<img src='${src}'>`;
    });
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {},
      },
    };

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.(
        [createMarkdownImageToken("/files/default.png")],
        0,
        {},
        {},
        {
          renderToken,
        },
      ) ?? "";

    expect(output).toContain(`${proxyOrigin}/growi-assets/`);
    expect(renderToken).toHaveBeenCalledTimes(1);
  });

  it("keeps source unchanged when resolver returns undefined", () => {
    setGrowiAssetProxyUrlResolver(() => undefined);
    mockVscodeState.baseUrl = "";
    const fallbackRenderer: MarkdownImageRenderer = vi.fn(
      (tokens, index) => `<img src='${tokens[index]?.attrGet("src") ?? ""}'>`,
    );
    const md: MarkdownPreviewLike = {
      renderer: {
        rules: {
          image: fallbackRenderer,
        },
      },
    };

    extendMarkdownPreviewIt(md);

    const output =
      md.renderer.rules.image?.(
        [createMarkdownImageToken("/files/default.png")],
        0,
        {},
        {},
        {
          renderToken: vi.fn(),
        },
      ) ?? "";

    expect(output).toBe("<img src='/files/default.png'>");
    expect(output).not.toContain("http://127.0.0.1:0/growi-assets/");
    expect(fallbackRenderer).toHaveBeenCalledTimes(1);
  });
});

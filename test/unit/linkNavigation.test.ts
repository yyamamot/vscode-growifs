import { beforeEach, describe, expect, it, vi } from "vitest";

function createDisposable() {
  return { dispose: vi.fn() };
}

const vscodeSpies = vi.hoisted(() => ({
  createDiagnosticCollection: vi.fn(() => ({
    delete: vi.fn(),
    dispose: vi.fn(),
    set: vi.fn(),
  })),
  executeCommand: vi.fn(async () => {}),
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
  onDidChangeTextDocument: vi.fn(createDisposable),
  onDidCloseTextDocument: vi.fn(createDisposable),
  onDidOpenTextDocument: vi.fn(createDisposable),
  registerCommand: vi.fn(createDisposable),
  registerDefinitionProvider: vi.fn(createDisposable),
  registerDocumentLinkProvider: vi.fn(createDisposable),
  registerFileSystemProvider: vi.fn(createDisposable),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(),
}));

vi.mock("vscode", () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  }

  class Range {
    constructor(
      public readonly start: Position,
      public readonly end: Position,
    ) {}

    contains(position: Position): boolean {
      return (
        position.line === this.start.line &&
        position.line === this.end.line &&
        position.character >= this.start.character &&
        position.character <= this.end.character
      );
    }
  }

  class DocumentLink {
    constructor(
      public readonly range: Range,
      public readonly target?: { toString(): string },
    ) {}
  }

  class Location {
    constructor(
      public readonly uri: { toString(): string },
      public readonly position: Position,
    ) {}
  }

  class Diagnostic {
    constructor(
      public readonly range: Range,
      public readonly message: string,
      public readonly severity: number,
    ) {}
  }

  class EventEmitter<T> {
    readonly event = vi.fn();
    fire(_event: T): void {}
    dispose(): void {}
  }

  return {
    commands: {
      executeCommand: vscodeSpies.executeCommand,
      registerCommand: vscodeSpies.registerCommand,
    },
    ConfigurationTarget: {
      Global: "Global",
    },
    Diagnostic,
    DiagnosticSeverity: {
      Information: 2,
      Warning: 1,
    },
    DocumentLink,
    EventEmitter,
    FileChangeType: {
      Changed: 1,
    },
    FileSystemError: {
      FileNotFound: vi.fn((value) => value),
      NoPermissions: vi.fn((value) => value),
      Unavailable: vi.fn((value) => value),
    },
    FileType: {
      Directory: 2,
      File: 1,
    },
    languages: {
      createDiagnosticCollection: vscodeSpies.createDiagnosticCollection,
      registerDefinitionProvider: vscodeSpies.registerDefinitionProvider,
      registerDocumentLinkProvider: vscodeSpies.registerDocumentLinkProvider,
    },
    Location,
    Position,
    Range,
    Uri: {
      from: vi.fn((value: { scheme: string; path: string }) => ({
        ...value,
        toString: () => `${value.scheme}:${value.path}`,
      })),
      parse: vi.fn((value: string) => ({
        value,
        toString: () => value,
      })),
    },
    window: {
      showErrorMessage: vscodeSpies.showErrorMessage,
      showInformationMessage: vscodeSpies.showInformationMessage,
      showInputBox: vscodeSpies.showInputBox,
    },
    workspace: {
      getConfiguration: vscodeSpies.getConfiguration,
      onDidChangeTextDocument: vscodeSpies.onDidChangeTextDocument,
      onDidCloseTextDocument: vscodeSpies.onDidCloseTextDocument,
      onDidOpenTextDocument: vscodeSpies.onDidOpenTextDocument,
      registerFileSystemProvider: vscodeSpies.registerFileSystemProvider,
      textDocuments: [],
    },
  };
});

import { resolveGrowiLinkToUri } from "../../src/core/uri";
import { activate, extendMarkdownIt } from "../../src/extension";
import {
  collectGrowiLinkDiagnostics,
  collectUnresolvableGrowiLinkDiagnostics,
  createGrowiDefinitionProvider,
  createGrowiDocumentLinkProvider,
  isKnownDrawioEmbedTarget,
} from "../../src/vscode/linkNavigation";

function createDocument(text: string) {
  return {
    getText() {
      return text;
    },
    languageId: "markdown",
    positionAt(offset: number) {
      return { line: 0, character: offset };
    },
    uri: {
      scheme: "growi",
      toString: () => "growi:/team/dev/current.md",
    },
  };
}

function createLinkNavigationDeps(overrides?: {
  getBaseUrl?: () => string | undefined;
  resolvePageReference?: (reference: {
    kind: "canonicalPath" | "pageIdPermalink" | "ambiguousSingleSegmentHex";
    canonicalPath?: string;
    uri?: string;
    pageId?: string;
  }) => Promise<
    | { ok: true; canonicalPath: string; uri: string }
    | {
        ok: false;
        reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
      }
  >;
}) {
  return {
    getBaseUrl: overrides?.getBaseUrl ?? (() => "https://growi.example.com/"),
    resolvePageReference:
      overrides?.resolvePageReference ??
      (async (reference) => {
        if (reference.kind === "canonicalPath") {
          return {
            ok: true,
            canonicalPath: reference.canonicalPath ?? "/missing",
            uri: reference.uri ?? "growi:/missing.md",
          } as const;
        }
        if (reference.kind === "pageIdPermalink") {
          return {
            ok: true,
            canonicalPath: `/resolved/${reference.pageId}`,
            uri: `growi:/resolved/${reference.pageId}.md`,
          } as const;
        }
        return {
          ok: true,
          canonicalPath: reference.canonicalPath ?? "/missing",
          uri: `growi:${reference.canonicalPath ?? "/missing"}.md`,
        } as const;
      }),
  };
}

describe("resolveGrowiLinkToUri", () => {
  it("resolves absolute path links", () => {
    expect(resolveGrowiLinkToUri("/team/dev/spec")).toBe(
      "growi:/team/dev/spec.md",
    );
  });

  it("resolves absolute URLs with the same baseUrl", () => {
    expect(
      resolveGrowiLinkToUri("https://growi.example.com/team/dev/spec", {
        baseUrl: "https://growi.example.com/",
      }),
    ).toBe("growi:/team/dev/spec.md");
  });

  it("resolves only URLs under the configured base path", () => {
    expect(
      resolveGrowiLinkToUri(
        "https://growi.example.com/wiki/team/dev/spec#overview",
        {
          baseUrl: "https://growi.example.com/wiki/",
        },
      ),
    ).toBe("growi:/team/dev/spec.md");
    expect(
      resolveGrowiLinkToUri("https://growi.example.com/other/team/dev/spec", {
        baseUrl: "https://growi.example.com/wiki/",
      }),
    ).toBeUndefined();
  });

  it("does not resolve relative, anchor-only, or different-host links", () => {
    expect(resolveGrowiLinkToUri("./team/dev/spec")).toBeUndefined();
    expect(resolveGrowiLinkToUri("#overview")).toBeUndefined();
    expect(
      resolveGrowiLinkToUri("https://other.example.com/team/dev/spec", {
        baseUrl: "https://growi.example.com/",
      }),
    ).toBeUndefined();
  });
});

describe("link navigation providers", () => {
  beforeEach(() => {
    vscodeSpies.createDiagnosticCollection.mockClear();
    vscodeSpies.onDidOpenTextDocument.mockClear();
    vscodeSpies.onDidChangeTextDocument.mockClear();
    vscodeSpies.onDidCloseTextDocument.mockClear();
    vscodeSpies.registerCommand.mockClear();
    vscodeSpies.registerFileSystemProvider.mockClear();
    vscodeSpies.registerDocumentLinkProvider.mockClear();
    vscodeSpies.registerDefinitionProvider.mockClear();
  });

  it("registers document link and definition providers for growi markdown", () => {
    const context = {
      secrets: { store: vi.fn(async () => {}) },
      subscriptions: [],
    };

    activate(context as never);

    expect(vscodeSpies.registerDocumentLinkProvider).toHaveBeenCalledWith(
      { language: "markdown", scheme: "growi" },
      expect.any(Object),
    );
    expect(vscodeSpies.registerDefinitionProvider).toHaveBeenCalledWith(
      { language: "markdown", scheme: "growi" },
      expect.any(Object),
    );
    expect(vscodeSpies.createDiagnosticCollection).toHaveBeenCalledWith(
      "growi-link-navigation",
    );
    expect(vscodeSpies.onDidOpenTextDocument).toHaveBeenCalledTimes(1);
    expect(vscodeSpies.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
    expect(vscodeSpies.onDidCloseTextDocument).toHaveBeenCalledTimes(1);
  });

  it("resolves only supported links in growi documents", async () => {
    const document = createDocument(
      "[p](/team/dev/spec) [u](https://growi.example.com/wiki/team/dev/url#top) [attachment](/attachment/69ae3fab9bb449092d0d3f66) [r](./rel) [a](#anchor) [h](https://other.example.com/team/dev/other) [o](https://growi.example.com/other/path)",
    );
    const provider = createGrowiDocumentLinkProvider({
      ...createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
      }),
    });

    const links =
      (await Promise.resolve(
        provider.provideDocumentLinks(document as never, {} as never),
      )) ?? [];

    expect(links).toHaveLength(3);
    expect(links[0]?.target?.toString()).toBe("growi:/team/dev/spec.md");
    expect(links[1]?.target?.toString()).toBe("growi:/team/dev/url.md");
    expect(links[2]?.target?.toString()).toBe(
      "https://growi.example.com/attachment/69ae3fab9bb449092d0d3f66",
    );
  });

  it("does not include image links in document links", async () => {
    const document = createDocument(
      "![img](/team/dev/image-target) [p](/team/dev/spec)",
    );
    const provider = createGrowiDocumentLinkProvider({
      ...createLinkNavigationDeps(),
    });

    const links =
      (await Promise.resolve(
        provider.provideDocumentLinks(document as never, {} as never),
      )) ?? [];

    expect(links).toHaveLength(1);
    expect(links[0]?.target?.toString()).toBe("growi:/team/dev/spec.md");
  });

  it("returns a definition target for a supported link under cursor", async () => {
    const text = "[p](https://growi.example.com/wiki/team/dev/spec#overview)";
    const document = createDocument(text);
    const targetOffset = text.indexOf("team/dev/spec") + 2;
    const provider = createGrowiDefinitionProvider({
      ...createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
      }),
    });

    const definition = await Promise.resolve(
      provider.provideDefinition(
        document as never,
        { line: 0, character: targetOffset } as never,
        {} as never,
      ),
    );

    expect(definition).toBeDefined();
    expect((definition as { uri: { toString(): string } }).uri.toString()).toBe(
      "growi:/team/dev/spec.md",
    );
  });

  it("does not return a definition target for attachment web links", async () => {
    const text = "[attachment](/attachment/69ae3fab9bb449092d0d3f66)";
    const document = createDocument(text);
    const targetOffset =
      text.indexOf("/attachment/69ae3fab9bb449092d0d3f66") + 2;
    const provider = createGrowiDefinitionProvider({
      ...createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
      }),
    });

    const definition = await Promise.resolve(
      provider.provideDefinition(
        document as never,
        { line: 0, character: targetOffset } as never,
        {} as never,
      ),
    );

    expect(definition).toBeUndefined();
  });

  it("resolves same-instance permalink URLs in document links", async () => {
    const document = createDocument(
      "[id](https://growi.example.com/wiki/0123456789abcdefabcdef01)",
    );
    const provider = createGrowiDocumentLinkProvider(
      createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
        resolvePageReference: async (reference) => {
          expect(reference.kind).toBe("pageIdPermalink");
          return {
            ok: true,
            canonicalPath: "/team/dev/spec",
            uri: "growi:/team/dev/spec.md",
          };
        },
      }),
    );

    const links =
      (await Promise.resolve(
        provider.provideDocumentLinks(document as never, {} as never),
      )) ?? [];

    expect(links).toHaveLength(1);
    expect(links[0]?.target?.toString()).toBe("growi:/team/dev/spec.md");
  });

  it("does not return a definition target for an image link under cursor", async () => {
    const text = "![img](/team/dev/image-target)";
    const document = createDocument(text);
    const targetOffset = text.indexOf("/team/dev/image-target") + 2;
    const provider = createGrowiDefinitionProvider({
      ...createLinkNavigationDeps(),
    });

    const definition = await Promise.resolve(
      provider.provideDefinition(
        document as never,
        { line: 0, character: targetOffset } as never,
        {} as never,
      ),
    );

    expect(definition).toBeUndefined();
  });

  it("leaves relative and anchor links unresolved so builtin markdown can handle them", async () => {
    const text = "[rel](./guide) [anchor](#overview) [page](/team/dev/spec)";
    const document = createDocument(text);
    const provider = createGrowiDocumentLinkProvider({
      ...createLinkNavigationDeps(),
    });

    const links =
      (await Promise.resolve(
        provider.provideDocumentLinks(document as never, {} as never),
      )) ?? [];

    expect(links).toHaveLength(1);
    expect(links[0]?.target?.toString()).toBe("growi:/team/dev/spec.md");

    const relativeOffset = text.indexOf("./guide") + 2;
    const anchorOffset = text.indexOf("#overview") + 2;
    const definitionProvider = createGrowiDefinitionProvider({
      ...createLinkNavigationDeps(),
    });

    const relativeDefinition = await Promise.resolve(
      definitionProvider.provideDefinition(
        document as never,
        { line: 0, character: relativeOffset } as never,
        {} as never,
      ),
    );
    const anchorDefinition = await Promise.resolve(
      definitionProvider.provideDefinition(
        document as never,
        { line: 0, character: anchorOffset } as never,
        {} as never,
      ),
    );

    expect(relativeDefinition).toBeUndefined();
    expect(anchorDefinition).toBeUndefined();
  });
  it("collects warnings for unresolvable internal link candidates", async () => {
    const document = createDocument(
      "[a](./rel) [b](#anchor) [c](https://other.example.com/team/dev/other) [d](https://growi.example.com/other/team/dev/spec) [e](/team/dev/spec)",
    );

    const diagnostics = await collectUnresolvableGrowiLinkDiagnostics(
      document as never,
      createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
      }),
    );

    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === 1)).toBe(
      true,
    );
  });

  it("treats absolute URL links as warnings when baseUrl is missing", async () => {
    const document = createDocument(
      "[a](https://growi.example.com/team/dev/spec) [b](/team/dev/ok)",
    );

    const diagnostics = await collectUnresolvableGrowiLinkDiagnostics(
      document as never,
      createLinkNavigationDeps({
        getBaseUrl: () => undefined,
      }),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain(
      "https://growi.example.com/team/dev/spec",
    );
  });

  it("does not warn for resolvable same-instance permalink URLs", async () => {
    const document = createDocument(
      "[id](https://growi.example.com/wiki/0123456789abcdefabcdef01)",
    );

    const diagnostics = await collectUnresolvableGrowiLinkDiagnostics(
      document as never,
      createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
        resolvePageReference: async () => ({
          ok: true,
          canonicalPath: "/team/dev/spec",
          uri: "growi:/team/dev/spec.md",
        }),
      }),
    );

    expect(diagnostics).toHaveLength(0);
  });

  it("does not warn for resolvable root-relative attachment web links", async () => {
    const document = createDocument(
      "[attachment](/attachment/69ae3fab9bb449092d0d3f66)",
    );

    const diagnostics = await collectUnresolvableGrowiLinkDiagnostics(
      document as never,
      createLinkNavigationDeps({
        getBaseUrl: () => "https://growi.example.com/wiki/",
      }),
    );

    expect(diagnostics).toHaveLength(0);
  });
  it("collects warnings for unfetched absolute image URLs", async () => {
    const document = createDocument(
      "![remote](https://assets.example.com/image.png) ![local](/attachment/image.png)",
    );

    const diagnostics = await collectGrowiLinkDiagnostics(document as never, {
      ...createLinkNavigationDeps(),
    });

    const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === 1,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain(
      "https://assets.example.com/image.png",
    );
  });

  it("collects information for known draw.io embeds only", async () => {
    const document = createDocument(
      "![drawio](https://embed.diagrams.net/?lightbox=1) ![mermaid](https://mermaid.ink/img/abc) ![plantuml](https://www.plantuml.com/plantuml/svg/xyz)",
    );

    const diagnostics = await collectGrowiLinkDiagnostics(document as never, {
      ...createLinkNavigationDeps(),
    });

    const information = diagnostics.filter(
      (diagnostic) => diagnostic.severity === 2,
    );
    expect(information).toHaveLength(1);
    expect(information[0]?.message).toContain("embed.diagrams.net");
  });

  it("does not emit diagnostics for Mermaid or PlantUML text while keeping draw.io info", async () => {
    const document = createDocument(`
\`\`\`mermaid
graph TD
A-->B
\`\`\`

\`\`\`plantuml
@startuml
Alice -> Bob : hello
@enduml
\`\`\`

![drawio](https://embed.diagrams.net/?lightbox=1)
`);

    const diagnostics = await collectGrowiLinkDiagnostics(document as never, {
      ...createLinkNavigationDeps(),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe(2);
    expect(diagnostics[0]?.message).toContain("draw.io embed is not supported");
  });

  it("shares draw.io host detection for diagnostics and preview", () => {
    expect(
      isKnownDrawioEmbedTarget("https://embed.diagrams.net/?lightbox=1"),
    ).toBe(true);
    expect(isKnownDrawioEmbedTarget("https://www.draw.io/?lightbox=1")).toBe(
      true,
    );
    expect(isKnownDrawioEmbedTarget("https://mermaid.ink/img/abc")).toBe(false);
    expect(
      isKnownDrawioEmbedTarget("https://www.plantuml.com/plantuml/svg/xyz"),
    ).toBe(false);
  });

  it("exposes extendMarkdownIt from extension entrypoint", () => {
    const rendered = "<img>";
    const markdownItLike = {
      renderer: {
        rules: {
          image: vi.fn(() => rendered),
        },
      },
    };

    const result = extendMarkdownIt(markdownItLike);

    expect(result).toBe(markdownItLike);
    expect(typeof result.renderer.rules.image).toBe("function");
  });
});

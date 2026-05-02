import { describe, expect, it, vi } from "vitest";

import {
  buildOpenPageSearchEntry,
  createExplorerOpenPageInBrowserCommand,
  createExplorerOpenPageItemCommand,
  createExplorerShowBacklinksCommand,
  createOpenDirectoryPageCommand,
  createOpenPageCommand,
  createOpenPrefixRootPageCommand,
  createShowBacklinksCommand,
  isOpenPageDirectInputPreferred,
  rankOpenPageSearchEntries,
} from "../../src/vscode/commands";
import { createDeps, createUri } from "./commandsTestUtils";

describe("createOpenPageCommand", () => {
  it("opens a normalized growi URI for valid input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team//dev/設計.md/");

    await createOpenPageCommand(deps)();

    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
  });

  it("resolves same-instance permalink URL before opening", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/team/dev/spec",
      uri: "growi:/team/dev/spec.md",
    });

    await createOpenPageCommand(deps)();

    expect(deps.resolvePageReference).toHaveBeenCalled();
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("falls back to canonical path when ambiguous root-relative permalink is not found", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/0123456789abcdefabcdef01");
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/0123456789abcdefabcdef01",
      uri: "growi:/0123456789abcdefabcdef01.md",
    });

    await createOpenPageCommand(deps)();

    expect(deps.readPageBody).toHaveBeenCalledWith("/0123456789abcdefabcdef01");
    expect(deps.openUri).toHaveBeenCalledWith(
      "growi:/0123456789abcdefabcdef01.md",
    );
  });

  it("shows an error for invalid input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("team/dev");

    await createOpenPageCommand(deps)();

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI の URL、same-instance permalink、または先頭 / 付きのページパスを入力してください。",
    );
  });

  it("rejects foreign-host permalink URLs", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.showInputBox.mockResolvedValue(
      "https://other.example.com/0123456789abcdefabcdef01",
    );

    await createOpenPageCommand(deps)();

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI の URL、same-instance permalink、または先頭 / 付きのページパスを入力してください。",
    );
  });

  it.each([
    [
      "NotFound",
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    ],
    [
      "BaseUrlNotConfigured",
      "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
    ],
    [
      "ApiTokenNotConfigured",
      "GROWI API token が未設定です。先に Configure API Token を実行してください。",
    ],
    [
      "InvalidApiToken",
      "GROWI API token が無効なため GROWI ページを開けませんでした。Configure API Token を確認してください。",
    ],
    [
      "PermissionDenied",
      "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため GROWI ページを開けませんでした。権限設定と API Token を確認してください。",
    ],
    [
      "ApiNotSupported",
      "本文取得 API が未対応のため GROWI ページを開けませんでした。",
    ],
    [
      "ConnectionFailed",
      "GROWI への接続に失敗したため GROWI ページを開けませんでした。",
    ],
  ] as const)("shows an error when page preflight fails: %s", async (reason, message) => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/spec");
    deps.readPageBody.mockResolvedValue({ ok: false, reason });

    await createOpenPageCommand(deps)();

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });

  it("shows initial candidates without listing registered prefixes and opens the selected page", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.getOpenPageInitialCandidatePaths.mockReturnValue([
      "/team/dev/guide",
      "/team/dev/spec",
    ]);
    deps.showOpenPageQuickPick.mockResolvedValue("/team/dev/spec");

    await createOpenPageCommand(deps)();

    expect(deps.listPages).not.toHaveBeenCalled();
    expect(deps.showOpenPageQuickPick).toHaveBeenCalledWith(
      [
        {
          label: "guide",
          description: "/team/dev/guide",
          canonicalPath: "/team/dev/guide",
          basenameLower: "guide",
          canonicalPathLower: "/team/dev/guide",
          pathSegmentsLower: ["team", "dev", "guide"],
        },
        {
          label: "spec",
          description: "/team/dev/spec",
          canonicalPath: "/team/dev/spec",
          basenameLower: "spec",
          canonicalPathLower: "/team/dev/spec",
          pathSegmentsLower: ["team", "dev", "spec"],
        },
      ],
      {
        placeHolder:
          "登録済み Prefix 配下からページを絞り込んで選択してください。",
        directInputLabel: "URL / path を直接入力",
        directInputDescription: "候補に無いページは直接入力で開きます。",
        search: expect.any(Function),
      },
    );
    expect(deps.showInputBox).not.toHaveBeenCalled();
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("searches registered prefixes with bounded page options only after user input", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/guide", "/team/dev/spec"],
    });
    deps.showOpenPageQuickPick.mockImplementation(async (_items, options) => {
      expect(deps.listPages).not.toHaveBeenCalled();
      const searchedItems = await options.search("spec");
      expect(searchedItems).toEqual([
        {
          label: "guide",
          description: "/team/dev/guide",
          detail: "登録済み Prefix 配下の一部候補です。",
          canonicalPath: "/team/dev/guide",
          basenameLower: "guide",
          canonicalPathLower: "/team/dev/guide",
          pathSegmentsLower: ["team", "dev", "guide"],
        },
        {
          label: "spec",
          description: "/team/dev/spec",
          detail: "登録済み Prefix 配下の一部候補です。",
          canonicalPath: "/team/dev/spec",
          basenameLower: "spec",
          canonicalPathLower: "/team/dev/spec",
          pathSegmentsLower: ["team", "dev", "spec"],
        },
      ]);
      return "/team/dev/spec";
    });

    await createOpenPageCommand(deps)();

    expect(deps.listPages).toHaveBeenCalledTimes(1);
    expect(deps.listPages).toHaveBeenCalledWith("/team/dev", {
      page: 1,
      limit: 300,
    });
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("uses the configured bounded page limit when searching registered prefixes", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.getOpenPageBoundedSearchLimit.mockReturnValue(42);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec"],
    });
    deps.showOpenPageQuickPick.mockImplementation(async (_items, options) => {
      await options.search("spec");
      return undefined;
    });

    await createOpenPageCommand(deps)();

    expect(deps.listPages).toHaveBeenCalledWith("/team/dev", {
      page: 1,
      limit: 42,
    });
    expect(deps.openUri).not.toHaveBeenCalled();
  });

  it("falls back to direct input after selecting the direct-input quick pick item", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.showOpenPageQuickPick.mockResolvedValue({ action: "directInput" });
    deps.showInputBox.mockResolvedValue("/team/dev/spec");

    await createOpenPageCommand(deps)();

    expect(deps.listPages).not.toHaveBeenCalled();
    expect(deps.showInputBox).toHaveBeenCalledWith({
      placeHolder:
        "https://growi.example.com/67ca... or /team/dev/spec or /67ca...",
      prompt: "GROWI の URL、permalink、またはページパスを入力してください",
      title: "GROWI: Open Page",
    });
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("shows direct input in quick pick when initial candidates are empty", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.showOpenPageQuickPick.mockResolvedValue({ action: "directInput" });
    deps.showInputBox.mockResolvedValue("/team/dev/spec");

    await createOpenPageCommand(deps)();

    expect(deps.listPages).not.toHaveBeenCalled();
    expect(deps.showOpenPageQuickPick).toHaveBeenCalledWith([], {
      placeHolder:
        "登録済み Prefix 配下からページを絞り込んで選択してください。",
      directInputLabel: "URL / path を直接入力",
      directInputDescription: "候補に無いページは直接入力で開きます。",
      search: expect.any(Function),
    });
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });
});

describe("rankOpenPageSearchEntries", () => {
  it("keeps basename then canonicalPath ordering when query is empty", () => {
    const ranked = rankOpenPageSearchEntries(
      [
        buildOpenPageSearchEntry("/team/dev/spec"),
        buildOpenPageSearchEntry("/team/dev/docs"),
        buildOpenPageSearchEntry("/team/dev/guide"),
      ],
      "",
    );

    expect(ranked.map((item) => item.canonicalPath)).toEqual([
      "/team/dev/spec",
      "/team/dev/docs",
      "/team/dev/guide",
    ]);
  });

  it("prioritizes basename exact match over prefix and path matches", () => {
    const ranked = rankOpenPageSearchEntries(
      [
        buildOpenPageSearchEntry("/team/dev/spec"),
        buildOpenPageSearchEntry("/team/dev/spec-guide"),
        buildOpenPageSearchEntry("/team/specs/overview"),
      ],
      "spec",
    );

    expect(ranked.map((item) => item.canonicalPath)).toEqual([
      "/team/dev/spec",
      "/team/dev/spec-guide",
      "/team/specs/overview",
    ]);
  });

  it("matches path segment prefixes before basename substring matches", () => {
    const ranked = rankOpenPageSearchEntries(
      [
        buildOpenPageSearchEntry("/team/dev/spec"),
        buildOpenPageSearchEntry("/team/notes/guide-devlog"),
      ],
      "dev",
    );

    expect(ranked.map((item) => item.canonicalPath)).toEqual([
      "/team/dev/spec",
      "/team/notes/guide-devlog",
    ]);
  });

  it("matches queries case-insensitively", () => {
    const ranked = rankOpenPageSearchEntries(
      [buildOpenPageSearchEntry("/team/dev/SpecGuide")],
      "spec",
    );

    expect(ranked.map((item) => item.canonicalPath)).toEqual([
      "/team/dev/SpecGuide",
    ]);
  });

  it("returns no candidates when nothing matches", () => {
    const ranked = rankOpenPageSearchEntries(
      [buildOpenPageSearchEntry("/team/dev/spec")],
      "zzz",
    );

    expect(ranked).toEqual([]);
  });
});

describe("isOpenPageDirectInputPreferred", () => {
  it("returns false for empty input and basename-like queries", () => {
    expect(isOpenPageDirectInputPreferred("")).toBe(false);
    expect(isOpenPageDirectInputPreferred("spec")).toBe(false);
  });

  it("returns true for root-relative path input", () => {
    expect(isOpenPageDirectInputPreferred("/team/dev/spec")).toBe(true);
  });

  it("returns true for absolute http and https URLs", () => {
    expect(
      isOpenPageDirectInputPreferred("https://growi.example.com/team/dev/spec"),
    ).toBe(true);
    expect(
      isOpenPageDirectInputPreferred("http://growi.example.com/team/dev/spec"),
    ).toBe(true);
  });
});

describe("createOpenPrefixRootPageCommand", () => {
  it("opens the canonical page for a registered prefix root item", async () => {
    const deps = createDeps();

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.readPageBody).toHaveBeenCalledWith("/team/dev");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev.md");
    expect(deps.checkRemoteMetadataForPage).toHaveBeenCalledWith("/team/dev");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows not found when the prefix root page does not exist", async () => {
    const deps = createDeps();
    deps.readPageBody.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    });

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.checkRemoteMetadataForPage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    );
  });

  it("rejects invalid command targets", async () => {
    const deps = createDeps();

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("file", "/tmp/README.md"),
    });

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Open Prefix Root Page は登録済み Prefix root でのみ実行できます。",
    );
  });
});

describe("createOpenDirectoryPageCommand", () => {
  it("opens the canonical page for a directory item with a paired page", async () => {
    const deps = createDeps();

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.readPageBody).toHaveBeenCalledWith("/team/dev");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev.md");
    expect(deps.checkRemoteMetadataForPage).toHaveBeenCalledWith("/team/dev");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows not found when the paired directory page does not exist", async () => {
    const deps = createDeps();
    deps.readPageBody.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    });

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.checkRemoteMetadataForPage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    );
  });

  it("rejects invalid command targets", async () => {
    const deps = createDeps();

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
    });

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Open Directory Page は実ページを持つ growi: ディレクトリでのみ実行できます。",
    );
  });
});

describe("Explorer navigation wrapper commands", () => {
  it("opens page items through vscode.open", async () => {
    const deps = createDeps();

    await createExplorerOpenPageItemCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith("vscode.open", {
      scheme: "growi",
      path: "/team/dev/spec.md",
      fsPath: "/team/dev/spec.md",
    });
    expect(deps.checkRemoteMetadataForPage).toHaveBeenCalledWith(
      "/team/dev/spec",
    );
  });

  it("opens browser URLs for page, directory page and prefix root items", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");

    const pageUrl = await createExplorerOpenPageInBrowserCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });
    const directoryPageUrl = await createExplorerOpenPageInBrowserCommand(deps)(
      {
        uri: createUri("growi", "/team/dev/docs.md"),
        contextValue: "growi.directoryPage",
      },
    );
    const prefixRootUrl = await createExplorerOpenPageInBrowserCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.prefixRoot",
    });

    expect(pageUrl).toBe("https://growi.example.com/wiki/team/dev/spec");
    expect(directoryPageUrl).toBe(
      "https://growi.example.com/wiki/team/dev/docs",
    );
    expect(prefixRootUrl).toBe("https://growi.example.com/wiki/team/dev");
    expect(deps.openExternalUri).toHaveBeenNthCalledWith(
      1,
      "https://growi.example.com/wiki/team/dev/spec",
    );
    expect(deps.openExternalUri).toHaveBeenNthCalledWith(
      2,
      "https://growi.example.com/wiki/team/dev/docs",
    );
    expect(deps.openExternalUri).toHaveBeenNthCalledWith(
      3,
      "https://growi.example.com/wiki/team/dev",
    );
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid explorer targets for browser open", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");

    const result = await createExplorerOpenPageInBrowserCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.directory",
    });

    expect(result).toBeUndefined();
    expect(deps.openExternalUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ブラウザで表示 は growi: ページ、growi: ディレクトリページ、growi: prefix root でのみ実行できます。",
    );
  });

  it("rejects browser open without a configured base URL", async () => {
    const deps = createDeps();

    const result = await createExplorerOpenPageInBrowserCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(result).toBeUndefined();
    expect(deps.openExternalUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
    );
  });

  it("opens synthetic directory page items through vscode.open", async () => {
    const deps = createDeps();

    await createExplorerOpenPageItemCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
      contextValue: "growi.directoryPage",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith("vscode.open", {
      scheme: "growi",
      path: "/team/dev.md",
      fsPath: "/team/dev.md",
    });
    expect(deps.checkRemoteMetadataForPage).toHaveBeenCalledWith("/team/dev");
  });

  it("ignores invalid Explorer targets for current-page wrappers", async () => {
    const deps = createDeps();

    await createExplorerShowBacklinksCommand(deps)({
      uri: createUri("file", "/tmp/current.md"),
    });

    expect(deps.executeCommand).not.toHaveBeenCalled();
  });
});

describe("createShowBacklinksCommand", () => {
  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/readme.md"),
    );

    await createShowBacklinksCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Show Backlinks は growi: ページでのみ実行できます。",
    );
    expect(deps.listPages).not.toHaveBeenCalled();
    expect(deps.readPageBody).not.toHaveBeenCalled();
  });

  it("shows an error when no prefixes are registered", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue([]);

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Backlinks の対象 Prefix がありません。先に Add Prefix を実行してください。",
    );
    expect(deps.listPages).not.toHaveBeenCalled();
  });

  it("shows information when no backlinks are found", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({ ok: true, paths: ["/team/dev/other"] });
    deps.readPageBody.mockResolvedValue({ ok: true, body: "no links" });

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Backlinks は見つかりませんでした。",
    );
    expect(deps.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows quick pick and opens selected backlink page", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/current", "/team/dev/backlink"],
    });
    deps.readPageBody.mockResolvedValue({
      ok: true,
      body: "[to](/team/dev/current)",
    });
    deps.showQuickPick.mockResolvedValue({
      label: "/team/dev/backlink",
      canonicalPath: "/team/dev/backlink",
    });

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showQuickPick).toHaveBeenCalledWith(
      [{ label: "/team/dev/backlink", canonicalPath: "/team/dev/backlink" }],
      { placeHolder: "登録済み Prefix 配下を検索しました。" },
    );
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/backlink.md");
  });

  it("shows partial scan details in quick pick when backlinks hit the limit", async () => {
    const deps = createDeps();
    const paths = Array.from(
      { length: 101 },
      (_, index) => `/team/dev/backlink-${index + 1}`,
    );
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/current", ...paths],
    });
    deps.readPageBody.mockResolvedValue({
      ok: true,
      body: "[to](/team/dev/current)",
    });

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showQuickPick).toHaveBeenCalledWith(expect.any(Array), {
      placeHolder:
        "登録済み Prefix 配下の一部のみ走査済みです。走査済み: 100件。結果は最大100件で打ち切られています。",
    });
    expect(deps.showQuickPick.mock.calls[0]?.[0]).toHaveLength(100);
  });

  it("shows partial scan details when no backlinks are found before timeout", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-08T00:00:00.000Z"));
      const deps = createDeps();
      deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
      deps.listPages.mockResolvedValue({
        ok: true,
        paths: ["/team/dev/current", "/team/dev/a", "/team/dev/b"],
      });
      deps.readPageBody.mockImplementation(async () => {
        vi.setSystemTime(new Date("2026-03-08T00:00:06.000Z"));
        return { ok: true, body: "no links" };
      });

      await createShowBacklinksCommand(deps)(
        createUri("growi", "/team/dev/current.md"),
      );

      expect(deps.showInformationMessage).toHaveBeenCalledWith(
        "Backlinks は見つかりませんでした。一部のみ走査済みです。走査済み: 1件。",
      );
      expect(deps.showQuickPick).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps list/read/connection failures to fixed messages", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);

    deps.listPages.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "Backlinks の対象一覧 API が未対応のため実行できません。",
    );

    deps.listPages.mockResolvedValueOnce({
      ok: true,
      paths: ["/team/dev/backlink"],
    });
    deps.readPageBody.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "Backlinks の本文取得 API が未対応のため実行できません。",
    );

    deps.listPages.mockResolvedValueOnce({
      ok: false,
      reason: "ConnectionFailed",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "GROWI への接続に失敗したため Backlinks を実行できませんでした。",
    );
  });
});

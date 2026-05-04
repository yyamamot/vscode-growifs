import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readText(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolvePackageNlsPlaceholder(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const key = /^%(.+)%$/.exec(value)?.[1];
  if (!key) {
    return value;
  }
  const nls = JSON.parse(readText("package.nls.json")) as Record<
    string,
    string
  >;
  return nls[key] ?? value;
}

function resolvePackageNlsPlaceholders(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolvePackageNlsPlaceholders);
  }
  if (!value || typeof value !== "object") {
    return resolvePackageNlsPlaceholder(value);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      resolvePackageNlsPlaceholders(entry),
    ]),
  );
}

function readPackageJson() {
  return resolvePackageNlsPlaceholders(
    JSON.parse(readText("package.json")),
  ) as {
    activationEvents?: string[];
    contributes?: {
      commands?: Array<{
        command?: string;
        icon?: string;
        shortTitle?: string;
        title?: string;
      }>;
      keybindings?: Array<{
        command?: string;
        key?: string;
        mac?: string;
        when?: string;
      }>;
      menus?: {
        commandPalette?: Array<{
          command?: string;
          when?: string;
        }>;
        "view/title"?: Array<{
          command?: string;
          group?: string;
          when?: string;
        }>;
        "view/item/context"?: Array<{
          command?: string;
          group?: string;
          when?: string;
        }>;
      };
      viewsWelcome?: Array<{
        contents?: string;
        view?: string;
        when?: string;
      }>;
      configuration?: {
        properties?: Record<
          string,
          {
            default?: unknown;
            maximum?: number;
            minimum?: number;
            type?: string;
          }
        >;
      };
    };
    devDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    scripts?: Record<string, string>;
  };
}

describe("project configuration", () => {
  it("keeps the documented tech stack available in package.json", () => {
    const packageJson = readPackageJson();

    expect(packageJson.engines?.node).toBe(">=22.0.0");
    expect(packageJson.engines?.vscode).toBe("^1.105.0");
    expect(packageJson.devDependencies).toMatchObject({
      "@biomejs/biome": expect.any(String),
      "@vscode/test-cli": expect.any(String),
      "@vscode/test-electron": expect.any(String),
      "@vscode/vsce": expect.any(String),
      esbuild: expect.any(String),
      typescript: expect.any(String),
      vitest: expect.any(String),
    });
    expect(packageJson.scripts).toMatchObject({
      build: expect.stringContaining("esbuild"),
      "install:vsix": "node ./scripts/vsix.mjs install",
      lint: expect.stringContaining("biome check"),
      "package:vsix": "node ./scripts/vsix.mjs package",
      "test:integration": "node ./scripts/run-integration.mjs",
      "test:integration:host":
        "pnpm run build && node ./test/integration/extension-host/launch.mjs",
      "test:unit": "vitest run test/unit",
      typecheck: "tsc --noEmit",
      "uninstall:vsix": "node ./scripts/vsix.mjs uninstall",
      "review:ui:scenario":
        "pnpm run build && node ./scripts/review-ui-scenario.mjs",
      "review:ui:feature":
        "pnpm run build && node ./scripts/review-ui-feature.mjs",
      "verify:ui-change": "node ./scripts/verify-ui-change.mjs",
    });
    expect(packageJson).not.toHaveProperty("files");
    const vscodeignore = readText(".vscodeignore");
    expect(vscodeignore).not.toContain("README.md");
    expect(vscodeignore).not.toContain("README.ja.md");
    expect(vscodeignore).not.toContain("CHANGELOG.md");
    expect(vscodeignore).not.toContain("CHANGELOG.ja.md");
    expect(vscodeignore).not.toContain("l10n/**");
    expect(vscodeignore).not.toContain("package.nls.json");
    expect(vscodeignore).not.toContain("package.nls.ja.json");
    expect(vscodeignore).toContain("archive/**");
    expect(vscodeignore).toContain("docs/**");
    expect(vscodeignore).toContain("dist/harness/**");
    expect(vscodeignore).toContain("fixtures/**");
    expect(vscodeignore).toContain("test/**");
  });

  it("exposes bounded GROWI listing and local mirror settings", () => {
    const packageJson = readPackageJson();

    expect(packageJson.contributes?.configuration?.properties).toMatchObject({
      "growi.pageListing.initialPageSize": {
        type: "number",
        default: 100,
        minimum: 1,
      },
      "growi.pageListing.maxAutoPagesPerPrefix": {
        type: "number",
        default: 300,
        minimum: 1,
      },
      "growi.localMirror.maxPrefixPages": {
        type: "number",
        default: 50,
        minimum: 1,
        maximum: 200,
      },
    });
  });

  it("separates typecheck and bundle responsibilities", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.build).toContain("esbuild");
    expect(packageJson.scripts?.build).not.toContain("tsc");
  });

  it("keeps UI review script aliases aligned with fixture manifest", () => {
    const packageJson = readPackageJson();
    const manifest = JSON.parse(readText("fixtures/harness/manifest.json")) as {
      scenarios?: Array<{ aliases?: string[]; id?: string; path?: string }>;
    };
    const scenario = JSON.parse(
      readText("fixtures/harness/explorer-quickpick-smoke/scenario.json"),
    ) as { id?: string; checks?: { requiredCommandSequence?: string[] } };

    expect(packageJson.scripts?.["review:ui:scenario"]).toBe(
      "pnpm run build && node ./scripts/review-ui-scenario.mjs",
    );
    expect(packageJson.scripts?.["review:ui:feature"]).toBe(
      "pnpm run build && node ./scripts/review-ui-feature.mjs",
    );
    expect(packageJson.scripts?.["verify:ui-change"]).toBe(
      "node ./scripts/verify-ui-change.mjs",
    );
    expect(manifest.scenarios).toContainEqual(
      expect.objectContaining({
        aliases: ["explorer-quickpick", "smoke"],
        id: "explorer-quickpick-smoke",
        path: "explorer-quickpick-smoke/scenario.json",
      }),
    );
    expect(scenario.id).toBe("explorer-quickpick-smoke");
    expect(scenario.checks?.requiredCommandSequence).toEqual([
      "growi.addPrefix",
      "growi.openPage",
      "growi.addCurrentPageBookmark",
      "growi.openPage",
      "growi.showBookmarks",
    ]);
  });

  it("registers representative UI review scenarios with aliases and change selectors", () => {
    const manifest = JSON.parse(readText("fixtures/harness/manifest.json")) as {
      scenarios?: Array<{
        aliases?: string[];
        changedFileGlobs?: string[];
        id?: string;
        path?: string;
        uiAreas?: string[];
      }>;
    };
    const scenarios = manifest.scenarios ?? [];
    const expectedScenarios = [
      {
        id: "explorer-quickpick-smoke",
        aliases: ["explorer-quickpick", "smoke"],
        uiAreas: ["explorer", "quickPick"],
      },
      {
        id: "open-page-search",
        aliases: ["open-page", "page-search"],
        uiAreas: ["quickPick", "openPage"],
      },
      {
        id: "bookmarks-states",
        aliases: ["bookmarks", "bookmark-states"],
        uiAreas: ["quickPick", "bookmarks", "explorer"],
      },
      {
        id: "current-page-actions",
        aliases: ["current-page", "page-actions"],
        uiAreas: ["quickPick", "currentPage"],
      },
      {
        id: "page-detail-actions",
        aliases: ["page-detail", "current-page-hub"],
        uiAreas: ["quickPick", "currentPage"],
      },
      {
        id: "local-mirror-actions",
        aliases: ["local-mirror", "mirror-actions"],
        uiAreas: ["quickPick", "localMirror"],
      },
      {
        id: "explorer-menu-surface",
        aliases: ["explorer-menu", "menus"],
        uiAreas: ["explorer", "menus"],
      },
      {
        id: "explorer-partial-listing",
        aliases: ["explorer-partial", "load-more"],
        uiAreas: ["explorer", "partialListing"],
      },
      {
        id: "treeview-daily-ops",
        aliases: ["treeview-ux", "daily-ops"],
        uiAreas: [
          "explorer",
          "menus",
          "quickPick",
          "localMirror",
          "currentPage",
        ],
      },
      {
        id: "tree-item-actions-page-preview",
        aliases: ["tree-actions-page", "page-actions-preview"],
        uiAreas: ["explorer", "quickPick", "menus"],
      },
      {
        id: "tree-item-actions-directory-preview",
        aliases: ["tree-actions-directory", "directory-actions-preview"],
        uiAreas: ["explorer", "quickPick", "menus"],
      },
      {
        id: "treeview-context-menu-evidence",
        aliases: [
          "treeview-context-menu",
          "context-menu-evidence",
          "right-click-evidence",
        ],
        uiAreas: ["explorer", "menus", "quickPick"],
      },
    ];

    expect(scenarios.map((scenario) => scenario.id)).toEqual(
      expectedScenarios.map((scenario) => scenario.id),
    );
    for (const expectedScenario of expectedScenarios) {
      const scenario = scenarios.find(
        (entry) => entry.id === expectedScenario.id,
      );

      expect(scenario).toMatchObject({
        aliases: expectedScenario.aliases,
        id: expectedScenario.id,
        path: `${expectedScenario.id}/scenario.json`,
        uiAreas: expectedScenario.uiAreas,
      });
      expect(scenario?.changedFileGlobs).toContain("src/harness/uiReview.ts");
      expect(scenario?.changedFileGlobs?.length).toBeGreaterThan(0);
    }
  });

  it("isolates the extension host from marketplace extensions", () => {
    const launcher = readText("test/integration/extension-host/launch.mjs");
    const hostRunner = readText(
      "test/integration/extension-host/run-tests.mjs",
    );

    expect(launcher).not.toContain("--disable-extensions");
    expect(launcher).toContain("--extensions-dir");
    expect(launcher).toContain("--user-data-dir");
    expect(launcher).toContain("GitHub.copilot");
    expect(launcher).toContain("GitHub.copilot-chat");
    expect(launcher).toContain("github.copilot-chat");
    expect(launcher).toContain('"chat.agentsControl.enabled": "hidden"');
    expect(launcher).toContain('"chat.commandCenter.enabled": false');
    expect(launcher).toContain('"chat.disableAIFeatures": true');
    expect(launcher).toContain('"extensions.autoUpdate": false');
    expect(launcher).toContain('"github.copilot.enable": { "*": false }');
    expect(launcher).toContain('"window.commandCenter": false');
    expect(launcher).toContain('"workbench.disableAICustomizations": true');
    expect(hostRunner).toContain("workbench.action.closeAuxiliaryBar");
  });

  it("keeps the GROWI explorer welcome and command palette contracts aligned with the manifest", () => {
    const packageJson = readPackageJson();
    const commands = packageJson.contributes?.commands ?? [];
    const viewsWelcome = packageJson.contributes?.viewsWelcome ?? [];
    const viewTitleMenu = packageJson.contributes?.menus?.["view/title"] ?? [];
    const commandPaletteMenu =
      packageJson.contributes?.menus?.commandPalette ?? [];
    const scmRepositoryMenu =
      (
        packageJson.contributes?.menus as Record<string, unknown[]> | undefined
      )?.["scm/repository"] ?? [];
    const viewItemContextMenu =
      packageJson.contributes?.menus?.["view/item/context"] ?? [];
    const configureBaseUrlCommand = commands.find(
      (command) => command.command === "growi.configureBaseUrl",
    );
    const explorerPrimaryCommands = commands.filter((command) =>
      [
        "growi.openPage",
        "growi.createPage",
        "growi.addPrefix",
        "growi.refreshListing",
        "growi.clearPrefixes",
        "growi.deletePrefix",
      ].includes(command.command ?? ""),
    );

    expect(viewsWelcome).toEqual([
      {
        view: "growi.explorer",
        contents:
          "Configure the connection to GROWI.\n[Configure Base URL](command:growi.configureBaseUrl)",
        when: "config.growi.baseUrl == ''",
      },
      {
        view: "growi.explorer",
        contents:
          "Start exploring pages.\n[Open Page](command:growi.openPage)\n[Add Prefix](command:growi.addPrefix)\nSet the target URL and API token before use.\n[Configure Base URL](command:growi.configureBaseUrl)\n[Configure API Token](command:growi.configureApiToken)\n[Open README](command:growi.openReadme)",
        when: "config.growi.baseUrl != ''",
      },
    ]);
    expect(viewsWelcome[0]).toMatchObject({
      view: "growi.explorer",
      when: "config.growi.baseUrl == ''",
    });
    expect(viewsWelcome[0]?.contents).toContain(
      "[Configure Base URL](command:growi.configureBaseUrl)",
    );
    expect(viewsWelcome[1]).toMatchObject({
      view: "growi.explorer",
      when: "config.growi.baseUrl != ''",
    });
    expect(viewsWelcome[1]?.contents).toContain(
      "[Open Page](command:growi.openPage)",
    );
    expect(viewsWelcome[1]?.contents).toContain(
      "[Add Prefix](command:growi.addPrefix)\nSet the target URL and API token before use.",
    );
    expect(viewsWelcome[1]?.contents).toContain(
      "[Configure Base URL](command:growi.configureBaseUrl)",
    );
    expect(viewsWelcome[1]?.contents).toContain(
      "[Configure API Token](command:growi.configureApiToken)",
    );
    expect(viewsWelcome[1]?.contents).toContain(
      "[Open README](command:growi.openReadme)",
    );
    expect(configureBaseUrlCommand).toEqual({
      command: "growi.configureBaseUrl",
      title: "GROWI: Configure Base URL",
    });
    expect(
      commands.find((command) => command.command === "growi.configureApiToken"),
    ).toEqual({
      command: "growi.configureApiToken",
      title: "GROWI: Configure API Token",
    });
    expect(
      commands.find((command) => command.command === "growi.openReadme"),
    ).toEqual({
      command: "growi.openReadme",
      title: "GROWI: Open README",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.openPrefixRootPage",
      ),
    ).toEqual({
      command: "growi.openPrefixRootPage",
      title: "Open Prefix Page",
    });
    expect(
      commands.find((command) => command.command === "growi.openDirectoryPage"),
    ).toEqual({
      command: "growi.openDirectoryPage",
      title: "GROWI: Open Directory Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showExplorerItemActions",
      ),
    ).toEqual({
      command: "growi.showExplorerItemActions",
      title: "GROWI: Show Tree Item Actions",
    });
    expect(packageJson.contributes?.keybindings).toContainEqual({
      command: "growi.showExplorerItemActions",
      key: "ctrl+alt+g",
      mac: "cmd+alt+g",
      when: "focusedView == 'growi.explorer'",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerOpenPageItem",
      ),
    ).toEqual({
      command: "growi.explorerOpenPageItem",
      title: "Open Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerOpenPageInBrowser",
      ),
    ).toEqual({
      command: "growi.explorerOpenPageInBrowser",
      title: "Open in Browser",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerCreatePageHere",
      ),
    ).toEqual({
      command: "growi.explorerCreatePageHere",
      title: "Create Here",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerRenamePage",
      ),
    ).toEqual({
      command: "growi.explorerRenamePage",
      title: "Rename Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerDeletePage",
      ),
    ).toEqual({
      command: "growi.explorerDeletePage",
      title: "Delete Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerRefreshCurrentPage",
      ),
    ).toEqual({
      command: "growi.explorerRefreshCurrentPage",
      title: "Refresh Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerShowBacklinks",
      ),
    ).toEqual({
      command: "growi.explorerShowBacklinks",
      title: "Show Backlinks",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerShowCurrentPageInfo",
      ),
    ).toEqual({
      command: "growi.explorerShowCurrentPageInfo",
      title: "Show Page Info",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerShowCurrentPageAttachments",
      ),
    ).toEqual({
      command: "growi.explorerShowCurrentPageAttachments",
      title: "Show Attachments",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerShowRevisionHistoryDiff",
      ),
    ).toEqual({
      command: "growi.explorerShowRevisionHistoryDiff",
      title: "Show Revision Diff",
    });
    expect(
      commands.find(
        (command) =>
          command.command ===
          ["growi.", "explorerDownloadCurrent", "PageToLocalFile"].join(""),
      ),
    ).toBeUndefined();
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCreateLocalMirrorForCurrentPage",
      ),
    ).toEqual({
      command: "growi.explorerCreateLocalMirrorForCurrentPage",
      title: "Sync This Page Locally",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCreateLocalMirrorForCurrentPrefix",
      ),
    ).toEqual({
      command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
      title: "Sync Child Pages Locally",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCompareLocalMirrorWithGrowi",
      ),
    ).toEqual({
      command: "growi.explorerCompareLocalMirrorWithGrowi",
      title: "Check This Page Diff",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerUploadLocalMirrorToGrowi",
      ),
    ).toEqual({
      command: "growi.explorerUploadLocalMirrorToGrowi",
      title: "Apply Local Mirror",
    });
    expect(
      commands.find(
        (command) =>
          command.command ===
          "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
      ),
    ).toEqual({
      command: "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
      title: "Check Child Page Diffs",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerUploadLocalMirrorSubtreeToGrowi",
      ),
    ).toEqual({
      command: "growi.explorerUploadLocalMirrorSubtreeToGrowi",
      title: "Apply Child Local Mirrors",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.addCurrentPageBookmark",
      ),
    ).toEqual({
      command: "growi.addCurrentPageBookmark",
      title: "Add Bookmark",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showCurrentPageActions",
      ),
    ).toEqual({
      command: "growi.showCurrentPageActions",
      title: "GROWI: Show Current Page Actions",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.openCurrentPageHub",
      ),
    ).toEqual({
      command: "growi.openCurrentPageHub",
      title: "Open Page Details",
      category: "GROWI",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showLocalMirrorActions",
      ),
    ).toEqual({
      command: "growi.showLocalMirrorActions",
      title: "GROWI: Show Local Mirror Actions",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.refreshCurrentPage",
      ),
    ).toEqual({
      command: "growi.refreshCurrentPage",
      title: "GROWI: Refresh Current Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showCurrentPageInfo",
      ),
    ).toEqual({
      command: "growi.showCurrentPageInfo",
      title: "GROWI: Show Current Page Info",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.removeCurrentPageBookmark",
      ),
    ).toEqual({
      command: "growi.removeCurrentPageBookmark",
      title: "Remove Bookmark",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showCurrentPageAttachments",
      ),
    ).toEqual({
      command: "growi.showCurrentPageAttachments",
      title: "GROWI: Show Current Page Attachments",
    });
    expect(
      commands.find((command) => command.command === "growi.showBookmarks"),
    ).toEqual({
      command: "growi.showBookmarks",
      title: "GROWI: Show Bookmarks",
      icon: "$(bookmark)",
    });
    expect(
      commands.find((command) => command.command === "growi.showBacklinks"),
    ).toEqual({
      command: "growi.showBacklinks",
      title: "GROWI: Show Backlinks",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.showRevisionHistoryDiff",
      ),
    ).toEqual({
      command: "growi.showRevisionHistoryDiff",
      title: "GROWI: Show Revision History Diff",
    });
    expect(
      commands.find((command) => command.command === "growi.clearRuntimeLogs"),
    ).toEqual({
      command: "growi.clearRuntimeLogs",
      title: "GROWI: Clear Runtime Logs",
      icon: "$(trash)",
    });
    expect(
      commands.find((command) => command.command === "growi.revealRuntimeLogs"),
    ).toEqual({
      command: "growi.revealRuntimeLogs",
      title: "GROWI: Reveal Runtime Logs",
      icon: "$(folder-opened)",
    });
    expect(
      commands.find((command) => command.command === "growi.createPage"),
    ).toEqual({
      command: "growi.createPage",
      title: "GROWI: Create Page",
      shortTitle: "Create Page",
    });
    expect(
      commands.find((command) => command.command === "growi.renamePage"),
    ).toEqual({
      command: "growi.renamePage",
      title: "GROWI: Rename Page",
    });
    expect(
      commands.find((command) => command.command === "growi.deletePage"),
    ).toEqual({
      command: "growi.deletePage",
      title: "GROWI: Delete Page",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.createLocalMirrorForCurrentPage",
      ),
    ).toEqual({
      command: "growi.createLocalMirrorForCurrentPage",
      title: "GROWI: Sync Local Mirror for Current Page",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.createLocalMirrorForCurrentPrefix",
      ),
    ).toEqual({
      command: "growi.createLocalMirrorForCurrentPrefix",
      title: "GROWI: Sync Local Mirror for Current Prefix",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.compareLocalMirrorWithGrowi",
      ),
    ).toEqual({
      command: "growi.compareLocalMirrorWithGrowi",
      title: "GROWI: Compare Local Mirror with GROWI",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.uploadLocalMirrorToGrowi",
      ),
    ).toEqual({
      command: "growi.uploadLocalMirrorToGrowi",
      title: "GROWI: Upload Local Mirror to GROWI",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.installLlmSkillPack",
      ),
    ).toEqual({
      command: "growi.installLlmSkillPack",
      title: "GROWI: Install LLM Local Mirror Skills",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.startLlmEditSession",
      ),
    ).toEqual({
      command: "growi.startLlmEditSession",
      title: "GROWI: Prepare LLM Local Mirror Prompt",
      icon: "$(sparkle)",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.createLlmLocalMirrorDiffContext",
      ),
    ).toEqual({
      command: "growi.createLlmLocalMirrorDiffContext",
      title: "GROWI: Prepare LLM Local Mirror Diff",
      icon: "$(comment-discussion)",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.scmCompareMirrorAgain",
      ),
    ).toEqual({
      command: "growi.scmCompareMirrorAgain",
      title: "Compare Again",
      icon: "$(refresh)",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.scmCheckRemoteMetadata",
      ),
    ).toEqual({
      command: "growi.scmCheckRemoteMetadata",
      title: "Check GROWI Updates",
      icon: "$(sync)",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.scmUploadMirrorResources",
      ),
    ).toEqual({
      command: "growi.scmUploadMirrorResources",
      title: "Apply to GROWI",
      icon: "$(cloud-upload)",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.scmTakeRemoteMirrorResources",
      ),
    ).toEqual({
      command: "growi.scmTakeRemoteMirrorResources",
      title: "Take Remote Changes",
      icon: "$(cloud-download)",
    });

    expect(viewTitleMenu).toEqual([
      {
        command: "growi.openPage",
        when: "view == growi.explorer",
        group: "navigation@1",
      },
      {
        command: "growi.addPrefix",
        when: "view == growi.explorer",
        group: "navigation@2",
      },
      {
        command: "growi.refreshListing",
        when: "view == growi.explorer",
        group: "navigation@3",
      },
      {
        command: "growi.showBookmarks",
        when: "view == growi.explorer",
        group: "navigation@4",
      },
      {
        command: "growi.clearPrefixes",
        when: "view == growi.explorer",
        group: "navigation@5",
      },
      {
        command: "growi.clearRuntimeLogs",
        when: "view == growi.explorer && growi.runtimeLogsEnabled",
        group: "navigation@6",
      },
      {
        command: "growi.revealRuntimeLogs",
        when: "view == growi.explorer && growi.runtimeLogsEnabled",
        group: "navigation@7",
      },
    ]);
    expect(commandPaletteMenu).toEqual([
      {
        command: "growi.openCurrentPageHub",
      },
      {
        command: "growi.clearRuntimeLogs",
        when: "growi.runtimeLogsEnabled",
      },
      {
        command: "growi.revealRuntimeLogs",
        when: "growi.runtimeLogsEnabled",
      },
      {
        command: "growi.uploadLocalMirrorToGrowi",
        when: "false",
      },
      {
        command: "growi.explorerUploadLocalMirrorToGrowi",
        when: "false",
      },
      {
        command: "growi.explorerUploadLocalMirrorSubtreeToGrowi",
        when: "false",
      },
      {
        command: "growi.scmUploadMirrorResources",
        when: "false",
      },
      {
        command: "growi.scmCompareMirrorAgain",
        when: "false",
      },
      {
        command: "growi.scmCheckRemoteMetadata",
        when: "false",
      },
      {
        command: "growi.scmTakeRemoteMirrorResources",
        when: "false",
      },
    ]);
    expect(scmRepositoryMenu).toEqual([
      {
        command: "growi.scmCompareMirrorAgain",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@1",
      },
      {
        command: "growi.scmCheckRemoteMetadata",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@2",
      },
      {
        command: "growi.scmUploadMirrorResources",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@3",
      },
      {
        command: "growi.scmTakeRemoteMirrorResources",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@4",
      },
      {
        command: "growi.startLlmEditSession",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@5",
      },
      {
        command: "growi.createLlmLocalMirrorDiffContext",
        when: "scmProvider == growifs-mirror-compare",
        group: "inline@6",
      },
    ]);
    expect(viewItemContextMenu).toEqual([
      {
        command: "growi.openPrefixRootPage",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "inline",
      },
      {
        command: "growi.openPrefixRootPage",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "01_open@2",
      },
      {
        command: "growi.explorerOpenPageInBrowser",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "01_open@3",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "03_structureEdit@1",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "04_localMirror@2",
      },
      {
        command: "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "04_localMirror@4",
      },
      {
        command: "growi.deletePrefix",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "06_danger@2",
      },
      {
        command: "growi.explorerOpenPageInBrowser",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "01_open@3",
      },
      {
        command: "growi.explorerRefreshCurrentPage",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "02_inspect@1",
      },
      {
        command: "growi.openCurrentPageHub",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "02_inspect@2",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "03_structureEdit@1",
      },
      {
        command: "growi.explorerRenamePage",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "03_structureEdit@2",
      },
      {
        command: "growi.addCurrentPageBookmark",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "03_structureEdit@3",
      },
      {
        command: "growi.removeCurrentPageBookmark",
        when: "view == growi.explorer && viewItem == growi.pageBookmarked",
        group: "03_structureEdit@3",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPage",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "04_localMirror@1",
      },
      {
        command: "growi.explorerCompareLocalMirrorWithGrowi",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "04_localMirror@3",
      },
      {
        command: "growi.explorerDeletePage",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.pageBookmarked)",
        group: "06_danger@1",
      },
      {
        command: "growi.explorerOpenPageInBrowser",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "01_open@3",
      },
      {
        command: "growi.explorerRefreshCurrentPage",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "02_inspect@1",
      },
      {
        command: "growi.openCurrentPageHub",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "02_inspect@2",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "03_structureEdit@1",
      },
      {
        command: "growi.explorerRenamePage",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "03_structureEdit@2",
      },
      {
        command: "growi.addCurrentPageBookmark",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "03_structureEdit@3",
      },
      {
        command: "growi.removeCurrentPageBookmark",
        when: "view == growi.explorer && viewItem == growi.directoryPageBookmarked",
        group: "03_structureEdit@3",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPage",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "04_localMirror@1",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "04_localMirror@2",
      },
      {
        command: "growi.explorerCompareLocalMirrorWithGrowi",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "04_localMirror@3",
      },
      {
        command: "growi.explorerDeletePage",
        when: "view == growi.explorer && (viewItem == growi.directoryPage || viewItem == growi.directoryPageBookmarked)",
        group: "06_danger@1",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.directory",
        group: "03_structureEdit@1",
      },
      {
        command: "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
        when: "view == growi.explorer && (viewItem == growi.directory || viewItem == growi.prefixRoot)",
        group: "04_localMirror@4",
      },
    ]);
    expect(
      viewItemContextMenu.find(
        (entry) =>
          entry.command === "growi.explorerOpenPageInBrowser" &&
          entry.when ===
            "view == growi.explorer && viewItem == growi.directory",
      ),
    ).toBeUndefined();

    const serializedViewTitleMenu = JSON.stringify(viewTitleMenu);

    expect(serializedViewTitleMenu).not.toContain("growi.configureBaseUrl");
    expect(serializedViewTitleMenu).not.toContain(
      "growi.createLocalMirrorForCurrentPage",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.compareLocalMirrorWithGrowi",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.uploadLocalMirrorToGrowi",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.showCurrentPageActions",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.showLocalMirrorActions",
    );
    expect(serializedViewTitleMenu).not.toContain("GROWI:");
    expect(JSON.stringify(commandPaletteMenu)).not.toContain(
      "Configure Base URL",
    );

    expect(explorerPrimaryCommands).toEqual([
      {
        command: "growi.createPage",
        title: "GROWI: Create Page",
        shortTitle: "Create Page",
      },
      {
        command: "growi.addPrefix",
        title: "GROWI: Add Prefix",
        shortTitle: "Add Prefix",
        icon: "$(add)",
      },
      {
        command: "growi.clearPrefixes",
        title: "GROWI: Clear Prefixes",
        shortTitle: "Clear Prefixes",
        icon: "$(clear-all)",
      },
      {
        command: "growi.deletePrefix",
        title: "Delete Prefix",
        shortTitle: "Delete Prefix",
        icon: "$(trash)",
      },
      {
        command: "growi.openPage",
        title: "GROWI: Open Page",
        shortTitle: "Open Page",
        icon: "$(search)",
      },
      {
        command: "growi.refreshListing",
        title: "GROWI: Refresh Listing",
        shortTitle: "Refresh Listing",
        icon: "$(refresh)",
      },
    ]);
    expect(explorerPrimaryCommands.map((command) => command.title)).toEqual([
      "GROWI: Create Page",
      "GROWI: Add Prefix",
      "GROWI: Clear Prefixes",
      "Delete Prefix",
      "GROWI: Open Page",
      "GROWI: Refresh Listing",
    ]);
  });

  it("keeps activation events aligned for local round trip actions", () => {
    const packageJson = readPackageJson();

    expect(packageJson.activationEvents).not.toContain("*");
    expect(packageJson.activationEvents).toContain("onFileSystem:growi");
    expect(packageJson.activationEvents).toContain("onStartupFinished");
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.addCurrentPageBookmark",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showCurrentPageActions",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.openCurrentPageHub",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.createPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.renamePage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.deletePage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.openPrefixRootPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.deletePrefix",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.openDirectoryPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showExplorerItemActions",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerOpenPageItem",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerOpenPageInBrowser",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerCreatePageHere",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerRefreshCurrentPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerShowBacklinks",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerShowCurrentPageInfo",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerShowCurrentPageAttachments",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.removeCurrentPageBookmark",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showCurrentPageAttachments",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showBookmarks",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerShowRevisionHistoryDiff",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerCreateLocalMirrorForCurrentPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerCreateLocalMirrorForCurrentPrefix",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerCompareLocalMirrorWithGrowi",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerUploadLocalMirrorToGrowi",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerCompareLocalMirrorSubtreeWithGrowi",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerUploadLocalMirrorSubtreeToGrowi",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showLocalMirrorActions",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.installLlmSkillPack",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.startLlmEditSession",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.createLlmLocalMirrorDiffContext",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.showRevisionHistoryDiff",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.clearRuntimeLogs",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.revealRuntimeLogs",
    );
  });

  it("documents desktop target and integration bootstrap prerequisites", () => {
    const readme = readText("README.md");
    const japaneseReadme = readText("README.ja.md");
    const envExample = readText(".env.example");

    expect(readme).toContain("desktop VS Code extension");
    expect(readme).toContain("designed for VS Code Desktop");
    expect(japaneseReadme).toContain("VS Code 拡張です");
    expect(japaneseReadme).toContain(
      "Desktop 版 VS Code 拡張として使う前提です",
    );
    expect(readme).toContain("| GROWI | GROWI `7.x` |");
    expect(readme).toContain("http://localhost:3000/");
    expect(readme).toContain("GROWI API token");
    expect(readme).toContain("VS Code Secret Storage");
    expect(readme).toContain("dedicated `GROWI` view under Explorer");
    expect(readme).toContain("not added to the VS Code workspace");
    expect(readme).toContain("the Command Palette");
    expect(readme).not.toContain("workspace root");
    expect(readme).not.toContain("workspace folder");
    expect(readme).toContain(
      ".growi-mirrors/<instanceKey>/<rootCanonicalPath>/",
    );
    expect(readme).toContain("http://localhost:3000/");

    expect(envExample).toContain("GROWI_BASE_URL=http://localhost:3000/");
    expect(envExample).toContain("GROWI_API_TOKEN=");

    expect(readme).not.toContain("axios");
    expect(readme).toContain("GROWI_RUNTIME_MODE=debug-f5");
    expect(readme).toContain("GROWI_JSONL_PATH");
    expect(readme).toContain(".growi-logs/runtime/*.jsonl");
    expect(readme).toContain("`GROWI: Reveal Runtime Logs`");
    expect(readme).toContain("`GROWI: Clear Runtime Logs`");
  });

  it("documents the fixed engines.vscode baseline", () => {
    const readme = readText("README.md");
    const packageJson = readPackageJson();

    expect(packageJson.engines?.vscode).toBe("^1.105.0");
    expect(packageJson.engines?.node).toBe(">=22.0.0");
    expect(readme).toContain("desktop VS Code extension");
  });

  it("documents the recommended manual test flow", () => {
    const readme = readText("README.md");

    expect(readme).toContain("## Commands");
    expect(readme).toContain("`GROWI: Configure Base URL`");
    expect(readme).toContain("`GROWI: Configure API Token`");
    expect(readme).toContain("`GROWI: Add Prefix`");
    expect(readme).toContain("`GROWI: Create Page`");
    expect(readme).toContain("`GROWI: Delete Page`");
    expect(readme).toContain("`GROWI: Rename Page`");
    expect(readme).toContain("`GROWI: Open Page`");
    expect(readme).toContain("`GROWI: Start Edit`");
    expect(readme).toContain("`GROWI: End Edit`");
    expect(readme).toContain("`GROWI: Refresh Current Page`");
    expect(readme).toContain("`GROWI: Refresh Listing`");
    expect(readme).toContain("`GROWI: Sync Local Mirror for Current Page`");
    expect(readme).toContain("`GROWI: Sync Local Mirror for Current Prefix`");
    expect(readme).toContain("`GROWI: Compare Local Mirror with GROWI`");
    expect(readme).toContain("`Apply to GROWI`");
    expect(readme).toContain("`GROWI: Show Current Page Info`");
    expect(readme).toContain("`GROWI: Show Backlinks`");
    expect(readme).toContain("run `GROWI: End Edit`");
    expect(readme).toContain("Wiki link navigation");
    expect(readme).toContain("<!-- screenshot: overview-explorer");
    expect(readme).toContain("<!-- screenshot: explorer-prefix-root");
    expect(readme).toContain("<!-- screenshot: local-mirror");
    expect(readme).toContain("`Sync This Page Locally`");
    expect(readme).toContain("`Check This Page Diff`");
    expect(readme).toContain("`Sync Child Pages Locally`");
    expect(readme).toContain("`Check Child Page Diffs`");
    expect(readme).toContain("page tree is not added to the VS Code workspace");
  });

  it("tracks the recommended code-workspace entrypoint", () => {
    const readme = readText("README.md");
    const workspaceFile = JSON.parse(
      readText("vscode-growifs.code-workspace"),
    ) as {
      folders?: Array<{ path?: string }>;
    };

    expect(readme).toContain("dedicated `GROWI` view under Explorer");
    expect(workspaceFile.folders).toEqual([{ path: "." }]);
  });

  it("documents provisional API contract and status mapping", () => {
    const readme = readText("README.md");

    expect(readme).toContain("| GROWI | GROWI `7.x` |");
    expect(readme).toContain("| Authentication | GROWI API token |");
    expect(readme).toContain(
      "GROWI 7.x APIs for page read, listing, save, create, rename, delete, revisions, bookmarks, and attachments",
    );
    expect(readme).toContain(
      "If some APIs are not available in your GROWI environment, only the corresponding features may be unavailable.",
    );
  });

  it("documents the current attachment scope and draw.io boundary", () => {
    const readme = readText("README.md");

    expect(readme).toContain("Attachment images do not show in Preview");
    expect(readme).toContain("Non-image attachment preview");
    expect(readme).toContain(
      "draw.io / diagrams.net / PlantUML / Mermaid rendering",
    );
    expect(readme).toContain(
      "Diagrams are not rendered in the current version",
    );
    expect(readme).toContain("same-host URL");
    expect(readme).toContain("open the item in GROWI Web");
  });

  it("documents non-image attachments as unsupported without breaking reading", () => {
    const readme = readText("README.md");

    expect(readme).toContain("Non-image attachment preview");
    expect(readme).toContain("open the item in GROWI Web");
    expect(readme).toContain(
      "Diagrams are not rendered in the current version",
    );
  });
});

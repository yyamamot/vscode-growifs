import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readText(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readPackageJson() {
  return JSON.parse(readText("package.json")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: Array<{
        command?: string;
        shortTitle?: string;
        title?: string;
      }>;
      menus?: {
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
    });
  });

  it("separates typecheck and bundle responsibilities", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.build).toContain("esbuild");
    expect(packageJson.scripts?.build).not.toContain("tsc");
  });

  it("keeps the GROWI explorer welcome and command palette contracts aligned with the manifest", () => {
    const packageJson = readPackageJson();
    const commands = packageJson.contributes?.commands ?? [];
    const viewsWelcome = packageJson.contributes?.viewsWelcome ?? [];
    const viewTitleMenu = packageJson.contributes?.menus?.["view/title"] ?? [];
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
      ].includes(command.command ?? ""),
    );

    expect(viewsWelcome).toEqual([
      {
        view: "growi.explorer",
        contents:
          "GROWI への接続を設定します。\n[Configure Base URL](command:growi.configureBaseUrl)",
        when: "config.growi.baseUrl == ''",
      },
      {
        view: "growi.explorer",
        contents:
          "最初のページ探索を始めます。\n[Open Page](command:growi.openPage)\n[Add Prefix](command:growi.addPrefix)\n接続先 URL と API token を設定してから利用してください。\n[Configure Base URL](command:growi.configureBaseUrl)\n[Configure API Token](command:growi.configureApiToken)\n[Open README](command:growi.openReadme)",
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
      "[Add Prefix](command:growi.addPrefix)\n接続先 URL と API token を設定してから利用してください。",
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
      title: "GROWI: Open Prefix Root Page",
    });
    expect(
      commands.find((command) => command.command === "growi.openDirectoryPage"),
    ).toEqual({
      command: "growi.openDirectoryPage",
      title: "GROWI: Open Directory Page",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerOpenPageItem",
      ),
    ).toEqual({
      command: "growi.explorerOpenPageItem",
      title: "ページを開く",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerCreatePageHere",
      ),
    ).toEqual({
      command: "growi.explorerCreatePageHere",
      title: "ここに作成",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerRenamePage",
      ),
    ).toEqual({
      command: "growi.explorerRenamePage",
      title: "ページ名を変更",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerDeletePage",
      ),
    ).toEqual({
      command: "growi.explorerDeletePage",
      title: "ページを削除",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerRefreshCurrentPage",
      ),
    ).toEqual({
      command: "growi.explorerRefreshCurrentPage",
      title: "ページを更新",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerShowBacklinks",
      ),
    ).toEqual({
      command: "growi.explorerShowBacklinks",
      title: "被リンクを表示",
    });
    expect(
      commands.find(
        (command) => command.command === "growi.explorerShowCurrentPageInfo",
      ),
    ).toEqual({
      command: "growi.explorerShowCurrentPageInfo",
      title: "ページ情報を表示",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerShowRevisionHistoryDiff",
      ),
    ).toEqual({
      command: "growi.explorerShowRevisionHistoryDiff",
      title: "履歴差分を表示",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerDownloadCurrentPageToLocalFile",
      ),
    ).toBeUndefined();
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCreateLocalMirrorForCurrentPage",
      ),
    ).toEqual({
      command: "growi.explorerCreateLocalMirrorForCurrentPage",
      title: "ローカルミラーを同期",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCreateLocalMirrorForCurrentPrefix",
      ),
    ).toEqual({
      command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
      title: "配下をローカルミラーに同期",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerCompareLocalMirrorWithGrowi",
      ),
    ).toEqual({
      command: "growi.explorerCompareLocalMirrorWithGrowi",
      title: "ローカルミラーを比較",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerUploadLocalMirrorToGrowi",
      ),
    ).toEqual({
      command: "growi.explorerUploadLocalMirrorToGrowi",
      title: "ローカルミラーを反映",
    });
    expect(
      commands.find(
        (command) =>
          command.command ===
          "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
      ),
    ).toEqual({
      command: "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
      title: "配下のローカルミラーを比較",
    });
    expect(
      commands.find(
        (command) =>
          command.command === "growi.explorerUploadLocalMirrorSubtreeToGrowi",
      ),
    ).toEqual({
      command: "growi.explorerUploadLocalMirrorSubtreeToGrowi",
      title: "配下のローカルミラーを反映",
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

    expect(viewTitleMenu).toEqual([
      {
        command: "growi.addPrefix",
        when: "view == growi.explorer",
        group: "navigation",
      },
      {
        command: "growi.refreshListing",
        when: "view == growi.explorer",
        group: "navigation",
      },
      {
        command: "growi.clearPrefixes",
        when: "view == growi.explorer",
        group: "navigation",
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
        group: "navigation@1",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.prefixRoot",
        group: "navigation@2",
      },
      {
        command: "growi.explorerOpenPageItem",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "navigation@3",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "navigation@4",
      },
      {
        command: "growi.explorerOpenPageItem",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "navigation@2",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "navigation@3",
      },
      {
        command: "growi.explorerCreatePageHere",
        when: "view == growi.explorer && viewItem == growi.directory",
        group: "navigation@2",
      },
      {
        command: "growi.explorerRenamePage",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageMutate@1",
      },
      {
        command: "growi.explorerRefreshCurrentPage",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageView@1",
      },
      {
        command: "growi.explorerShowBacklinks",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageInspect@1",
      },
      {
        command: "growi.explorerShowCurrentPageInfo",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageInspect@2",
      },
      {
        command: "growi.explorerShowRevisionHistoryDiff",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageInspect@3",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPage",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "localOpsSync@1",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "localOpsSync@2",
      },
      {
        command: "growi.explorerDeletePage",
        when: "view == growi.explorer && viewItem == growi.page",
        group: "currentPageDanger@1",
      },
      {
        command: "growi.explorerRenamePage",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageMutate@1",
      },
      {
        command: "growi.explorerRefreshCurrentPage",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageView@1",
      },
      {
        command: "growi.explorerShowBacklinks",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageInspect@1",
      },
      {
        command: "growi.explorerShowCurrentPageInfo",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageInspect@2",
      },
      {
        command: "growi.explorerShowRevisionHistoryDiff",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageInspect@3",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPage",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "localOpsSync@1",
      },
      {
        command: "growi.explorerCreateLocalMirrorForCurrentPrefix",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "localOpsSync@2",
      },
      {
        command: "growi.explorerDeletePage",
        when: "view == growi.explorer && viewItem == growi.directoryPage",
        group: "currentPageDanger@1",
      },
      {
        command: "growi.explorerCompareLocalMirrorWithGrowi",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.directoryPage)",
        group: "localOpsCompare@1",
      },
      {
        command: "growi.explorerUploadLocalMirrorToGrowi",
        when: "view == growi.explorer && (viewItem == growi.page || viewItem == growi.directoryPage)",
        group: "localOpsUpload@1",
      },
      {
        command: "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
        when: "view == growi.explorer && (viewItem == growi.directory || viewItem == growi.prefixRoot)",
        group: "localOpsCompare@1",
      },
      {
        command: "growi.explorerUploadLocalMirrorSubtreeToGrowi",
        when: "view == growi.explorer && (viewItem == growi.directory || viewItem == growi.prefixRoot)",
        group: "localOpsUpload@1",
      },
    ]);

    const serializedViewTitleMenu = JSON.stringify(viewTitleMenu);

    expect(serializedViewTitleMenu).not.toContain("growi.configureBaseUrl");
    expect(serializedViewTitleMenu).not.toContain(
      "growi.downloadCurrentPageToLocalFile",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.compareLocalWorkFileWithCurrentPage",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.uploadExportedLocalFileToGrowi",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.showCurrentPageActions",
    );
    expect(serializedViewTitleMenu).not.toContain(
      "growi.showLocalRoundTripActions",
    );
    expect(serializedViewTitleMenu).not.toContain("GROWI:");

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
      },
      {
        command: "growi.clearPrefixes",
        title: "GROWI: Clear Prefixes",
        shortTitle: "Clear Prefixes",
      },
      {
        command: "growi.openPage",
        title: "GROWI: Open Page",
        shortTitle: "Open Page",
      },
      {
        command: "growi.refreshListing",
        title: "GROWI: Refresh Listing",
        shortTitle: "Refresh Listing",
      },
    ]);
    expect(explorerPrimaryCommands.map((command) => command.title)).toEqual([
      "GROWI: Create Page",
      "GROWI: Add Prefix",
      "GROWI: Clear Prefixes",
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
      "onCommand:growi.showCurrentPageActions",
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
      "onCommand:growi.openDirectoryPage",
    );
    expect(packageJson.activationEvents).toContain(
      "onCommand:growi.explorerOpenPageItem",
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
      "onCommand:growi.showRevisionHistoryDiff",
    );
  });

  it("documents desktop target and integration bootstrap prerequisites", () => {
    const readme = readText("README.md");
    const envExample = readText(".env.example");

    expect(readme).toContain("VS Code 拡張です");
    expect(readme).toContain("Desktop 版 VS Code 拡張として使う前提です");
    expect(readme).toContain("GROWI 6 系以下は非サポートです");
    expect(readme).toContain("| 対象 GROWI | GROWI `7.x` |");
    expect(readme).toContain("http://localhost:3000/");
    expect(readme).toContain("GROWI の API token");
    expect(readme).toContain("VS Code の Secret Storage");
    expect(readme).toContain("Explorer 配下の `GROWI` view");
    expect(readme).toContain(
      ".growi-workspaces/<instanceKey>/<rootCanonicalPath>/",
    );
    expect(readme).toContain(".growi-mirror.json");
    expect(readme).toContain("http://localhost:3000/");

    expect(envExample).toContain("GROWI_BASE_URL=http://localhost:3000/");
    expect(envExample).toContain("GROWI_API_TOKEN=");

    expect(readme).not.toContain("axios");
  });

  it("documents the fixed engines.vscode baseline", () => {
    const readme = readText("README.md");
    const packageJson = readPackageJson();

    expect(packageJson.engines?.vscode).toBe("^1.105.0");
    expect(packageJson.engines?.node).toBe(">=22.0.0");
    expect(readme).toContain("VS Code 拡張です");
  });

  it("documents the recommended manual test flow", () => {
    const readme = readText("README.md");

    expect(readme).toContain("## Commands / Main Workflows");
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
    expect(readme).toContain("`GROWI: Upload Local Mirror to GROWI`");
    expect(readme).toContain("`GROWI: Show Current Page Info`");
    expect(readme).toContain("`GROWI: Show Backlinks`");
    expect(readme).toContain("保存後は `GROWI: End Edit` で通常状態へ戻します");
    expect(readme).toContain("wiki 内リンク移動は");
    expect(readme).toContain("<!-- screenshot: overview-explorer");
    expect(readme).toContain("<!-- screenshot: explorer-prefix-root");
    expect(readme).toContain("<!-- screenshot: workspace-mirror");
    expect(readme).toContain("ローカルミラーを同期 / 比較 / 反映");
    expect(readme).toContain(
      "配下をローカルミラーに同期 / 配下のローカルミラーを比較 / 配下のローカルミラーを反映",
    );
  });

  it("tracks the recommended code-workspace entrypoint", () => {
    const readme = readText("README.md");
    const workspaceFile = JSON.parse(
      readText("vscode-growifs.code-workspace"),
    ) as {
      folders?: Array<{ path?: string }>;
    };

    expect(readme).toContain("Explorer 配下の `GROWI` view");
    expect(workspaceFile.folders).toEqual([{ path: "." }]);
  });

  it("documents provisional API contract and status mapping", () => {
    const readme = readText("README.md");

    expect(readme).toContain("GROWI 6 系以下は非サポートです");
    expect(readme).toContain("| 対象 GROWI | GROWI `7.x` |");
    expect(readme).toContain("GROWI API token で接続できること");
    expect(readme).toContain(
      "GROWI 7.x のページ取得、一覧取得、保存、作成、名前変更、削除 API が利用できること",
    );
    expect(readme).toContain("GROWI API token で接続できること");
    expect(readme).toContain(
      "一部 API が使えない環境では、対応する機能が利用できません",
    );
  });

  it("documents the current attachment scope and draw.io boundary", () => {
    const readme = readText("README.md");

    expect(readme).toContain("Markdown Preview 上で画像添付を表示する");
    expect(readme).toContain("画像以外の添付は現行版対象外です");
    expect(readme).toContain(
      "draw.io / diagrams.net / PlantUML / Mermaid の図描画",
    );
    expect(readme).toContain("本文や Preview で図レンダリングは行いません");
    expect(readme).toContain("same-host absolute URL と root-relative path");
    expect(readme).toContain(
      "一部の添付 URL はブラウザで GROWI Web を開いて確認してください",
    );
  });

  it("documents non-image attachments as unsupported without breaking reading", () => {
    const readme = readText("README.md");

    expect(readme).toContain("画像以外の添付は現行版対象外です");
    expect(readme).toContain("画像以外の添付プレビュー");
    expect(readme).toContain("高度なプレビューは扱いません");
    expect(readme).toContain("本文や Preview で図レンダリングは行いません");
  });
});

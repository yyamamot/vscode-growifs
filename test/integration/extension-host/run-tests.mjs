import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

const BACKLINK_FIXTURE_PAGES = [
  {
    path: "/team/dev",
    body: "# team dev page",
    updatedAt: "2026-03-08T00:00:00.000Z",
    updatedBy: "system",
  },
  {
    path: "/team/dev/spec",
    body: "# spec page",
    updatedAt: "2026-03-08T00:01:00.000Z",
    updatedBy: "spec-owner",
  },
  {
    path: "/team/dev/guide",
    body: "# guide page\n\n[to spec](/team/dev/spec)",
    updatedAt: "2026-03-08T00:02:00.000Z",
    updatedBy: "guide-owner",
  },
  {
    path: "/team/dev/url-open",
    body: "# opened from url",
    updatedAt: "2026-03-08T00:03:00.000Z",
    updatedBy: "url-owner",
  },
  {
    path: "/team/dev/path-open",
    body: "# opened from path",
    updatedAt: "2026-03-08T00:04:00.000Z",
    updatedBy: "path-owner",
  },
  {
    path: "/cache/page",
    body: "# cache target",
    updatedAt: "2026-03-08T00:05:00.000Z",
    updatedBy: "cache-owner",
  },
];

const PERMALINK_PAGE_ID = "0123456789abcdefabcdef01";
const AMBIGUOUS_PATH_ONLY_PAGE = "/0123456789abcdefabcdef10";

const PERMALINK_FIXTURE_PAGES = [
  {
    pageId: PERMALINK_PAGE_ID,
    path: "/team/dev/spec",
    body: "# spec page",
    updatedAt: "2026-03-08T00:01:00.000Z",
    updatedBy: "spec-owner",
  },
  {
    path: "/team/dev/permalink-guide",
    body: `# permalink guide\n\n[to spec](${baseUrlPlaceholder()})`,
    updatedAt: "2026-03-08T00:02:00.000Z",
    updatedBy: "guide-owner",
  },
  {
    path: AMBIGUOUS_PATH_ONLY_PAGE,
    body: "# ambiguous path page",
    updatedAt: "2026-03-08T00:03:00.000Z",
    updatedBy: "path-owner",
  },
];

function baseUrlPlaceholder() {
  return "__PERMALINK_BASE_URL__";
}

const NESTED_TREE_FIXTURE_PAGES = [
  {
    path: "/team/dev",
    body: "# team dev page",
    updatedAt: "2026-03-08T01:00:00.000Z",
    updatedBy: "system",
  },
  {
    path: "/team/dev/spec",
    body: "# spec page",
    updatedAt: "2026-03-08T01:01:00.000Z",
    updatedBy: "spec-owner",
  },
  {
    path: "/team/dev/docs",
    body: "# docs page",
    updatedAt: "2026-03-08T01:02:00.000Z",
    updatedBy: "docs-owner",
  },
  {
    path: "/team/dev/docs/guide",
    body: "# guide page",
    updatedAt: "2026-03-08T01:03:00.000Z",
    updatedBy: "guide-owner",
  },
  {
    path: "/team/dev/docs/guide/advanced",
    body: "# advanced page",
    updatedAt: "2026-03-08T01:04:00.000Z",
    updatedBy: "advanced-owner",
  },
  {
    path: "/team/dev/notes",
    body: "# notes page",
    updatedAt: "2026-03-08T01:05:00.000Z",
    updatedBy: "notes-owner",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function toJsonString(value) {
  return JSON.stringify(value, null, 2);
}

async function activateGrowiExtension() {
  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON?.name === "vscode-growifs",
  );
  if (!extension) {
    const installed = vscode.extensions.all.map(
      (candidate) => candidate.packageJSON?.name ?? candidate.id,
    );
    throw new Error(
      `vscode-growifs extension is not installed. Available extensions: ${installed.join(", ")}`,
    );
  }

  await extension.activate();
}

async function waitForCommand(commandId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes(commandId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for command: ${commandId}`);
}

async function fetchAdmin(adminBaseUrl, path, init = {}) {
  const response = await fetch(new URL(path, adminBaseUrl), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Admin request failed: ${path} (${response.status})`);
  }
  return await response.json();
}

async function getStats(adminBaseUrl) {
  const payload = await fetchAdmin(adminBaseUrl, "/__admin/stats");
  return payload.requests;
}

async function resetStats(adminBaseUrl) {
  await fetchAdmin(adminBaseUrl, "/__admin/reset", { method: "POST" });
}

async function updateFixture(adminBaseUrl, pages) {
  await fetchAdmin(adminBaseUrl, "/__admin/fixture", {
    method: "POST",
    body: JSON.stringify({ pages }),
  });
}

async function updateAuthMode(adminBaseUrl, mode) {
  await fetchAdmin(adminBaseUrl, "/__admin/auth", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

async function getPageFixture(adminBaseUrl, path) {
  const payload = await fetchAdmin(
    adminBaseUrl,
    `/__admin/page?path=${encodeURIComponent(path)}`,
  );
  return payload.page;
}

async function adminUpdatePage(adminBaseUrl, { path, body, updatedBy }) {
  const payload = await fetchAdmin(adminBaseUrl, "/__admin/update-page", {
    method: "POST",
    body: JSON.stringify({ path, body, updatedBy }),
  });
  return payload.page;
}

async function configureExtension({ baseUrl, token }) {
  await activateGrowiExtension();
  await waitForCommand("growi.configureBaseUrl");
  await vscode.commands.executeCommand("growi.configureBaseUrl", baseUrl);
  await vscode.commands.executeCommand("growi.configureApiToken", token);
}

async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function getActivePath() {
  return vscode.window.activeTextEditor?.document.uri.path;
}

async function pause(ms = 50) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withWindowOverrides(overrides, fn) {
  const originalDescriptors = new Map();

  try {
    for (const [key, value] of Object.entries(overrides)) {
      originalDescriptors.set(
        key,
        Object.getOwnPropertyDescriptor(vscode.window, key),
      );
      Object.defineProperty(vscode.window, key, {
        configurable: true,
        writable: true,
        value,
      });
    }

    return await fn();
  } finally {
    for (const [key, descriptor] of originalDescriptors.entries()) {
      if (descriptor) {
        Object.defineProperty(vscode.window, key, descriptor);
        continue;
      }

      delete vscode.window[key];
    }
  }
}

async function withCommandExecuteOverride(override, fn) {
  const originalExecuteCommand = vscode.commands.executeCommand;

  try {
    Object.defineProperty(vscode.commands, "executeCommand", {
      configurable: true,
      writable: true,
      value: async (command, ...args) =>
        await override(
          originalExecuteCommand.bind(vscode.commands),
          command,
          args,
        ),
    });

    return await fn();
  } finally {
    Object.defineProperty(vscode.commands, "executeCommand", {
      configurable: true,
      writable: true,
      value: originalExecuteCommand,
    });
  }
}

function assertCommandsAvailable(commands, expected) {
  for (const commandId of expected) {
    assert(
      commands.includes(commandId),
      `Expected command to be registered: ${commandId}`,
    );
  }
}

function getLocalWorkFilePath() {
  const localWorkspaceFolder = (vscode.workspace.workspaceFolders ?? []).find(
    (folder) => folder.uri.scheme === "file",
  );
  assert(Boolean(localWorkspaceFolder), "Expected a file: workspace folder.");
  return path.join(localWorkspaceFolder.uri.fsPath, "growi-current.md");
}

function getLocalWorkspaceRoot() {
  const localWorkspaceFolder = (vscode.workspace.workspaceFolders ?? []).find(
    (folder) => folder.uri.scheme === "file",
  );
  assert(Boolean(localWorkspaceFolder), "Expected a file: workspace folder.");
  return localWorkspaceFolder.uri.fsPath;
}

function getBundleRootPath() {
  return path.join(getLocalWorkspaceRoot(), "growi-current-set");
}

function getBundleManifestPath() {
  return path.join(getBundleRootPath(), "manifest.json");
}

function getBundlePageFilePath(canonicalPath) {
  return `${path.join(getBundleRootPath(), ...canonicalPath.slice(1).split("/"))}.md`;
}

function buildHostInstanceKey(baseUrl) {
  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname.endsWith("/")
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;
  return `${parsed.host}${pathname}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildLegacyHostInstanceKey(baseUrl) {
  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname.endsWith("/")
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;
  return `${parsed.origin}${pathname}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getWorkspaceMirrorRootPath(baseUrl, rootCanonicalPath) {
  const trimmedRoot = rootCanonicalPath.replace(/^\/+/, "");
  return path.join(
    getLocalWorkspaceRoot(),
    ".growi-workspaces",
    buildHostInstanceKey(baseUrl),
    trimmedRoot,
  );
}

function getLegacyWorkspaceMirrorRootPath(baseUrl, rootCanonicalPath) {
  const trimmedRoot = rootCanonicalPath.replace(/^\/+/, "");
  return path.join(
    getLocalWorkspaceRoot(),
    ".growi-workspaces",
    buildLegacyHostInstanceKey(baseUrl),
    trimmedRoot,
  );
}

function hashBody(body) {
  return createHash("sha256").update(body).digest("hex");
}

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[FAIL] ${name}\n${detail}`);
    throw error;
  }
}

export async function run() {
  const baseUrl = requireEnv("GROWI_HOST_TEST_BASE_URL");
  const token = requireEnv("GROWI_HOST_TEST_TOKEN");
  const adminUrl = requireEnv("GROWI_HOST_TEST_ADMIN_URL");

  await configureExtension({ baseUrl, token });
  await closeAllEditors();

  await runCase("command palette commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assertCommandsAvailable(commands, [
      "growi.configureBaseUrl",
      "growi.configureApiToken",
      "growi.addPrefix",
      "growi.clearPrefixes",
      "growi.openPage",
      "growi.startEdit",
      "growi.endEdit",
      "growi.showCurrentPageActions",
      "growi.showLocalRoundTripActions",
      "growi.refreshCurrentPage",
      "growi.refreshListing",
      "growi.downloadCurrentPageToLocalFile",
      "growi.compareLocalWorkFileWithCurrentPage",
      "growi.uploadExportedLocalFileToGrowi",
      "growi.downloadCurrentPageSetToLocalBundle",
      "growi.compareLocalBundleWithGrowi",
      "growi.uploadLocalBundleToGrowi",
      "growi.showCurrentPageInfo",
      "growi.showBacklinks",
      "growi.explorerOpenPageItem",
      "growi.explorerRefreshCurrentPage",
      "growi.explorerShowBacklinks",
      "growi.explorerShowCurrentPageInfo",
      "growi.explorerShowRevisionHistoryDiff",
      "growi.explorerDownloadCurrentPageToLocalFile",
      "growi.explorerDownloadCurrentPageSetToLocalBundle",
      "growi.explorerCompareLocalWorkFileWithCurrentPage",
      "growi.explorerUploadExportedLocalFileToGrowi",
      "growi.explorerCompareLocalBundleWithGrowi",
      "growi.explorerUploadLocalBundleToGrowi",
    ]);
  });

  await runCase("open page success", async () => {
    await resetStats(adminUrl);
    await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
    const activePath = await getActivePath();
    assert(
      activePath === "/team/dev/spec.md",
      `Unexpected active path: ${activePath}`,
    );

    const doc = vscode.window.activeTextEditor?.document;
    assert(Boolean(doc), "Active document is missing.");
    assert(
      doc.getText().includes("spec page"),
      "Expected page body was not opened.",
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page >= 1 && stats.revision >= 1,
      `Expected page/revision requests, got ${toJsonString(stats)}`,
    );
  });

  await runCase("open page not found", async () => {
    await resetStats(adminUrl);
    const beforePath = await getActivePath();
    await vscode.commands.executeCommand("growi.openPage", "/missing/page");
    const afterPath = await getActivePath();
    assert(
      beforePath === afterPath,
      "Not found open should not replace active editor.",
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page === 1,
      `Expected single page lookup, got ${toJsonString(stats)}`,
    );
    assert(
      stats.revision === 0,
      `Unexpected revision lookup on not-found: ${toJsonString(stats)}`,
    );
  });

  await runCase("open page connection failure", async () => {
    await resetStats(adminUrl);
    await vscode.commands.executeCommand(
      "growi.configureBaseUrl",
      "http://127.0.0.1:9/",
    );
    const beforePath = await getActivePath();
    await vscode.commands.executeCommand("growi.openPage", "/team/dev/guide");
    const afterPath = await getActivePath();
    assert(
      beforePath === afterPath,
      "Connection failure should not replace active editor.",
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page === 0 && stats.revision === 0 && stats.list === 0,
      `Connection failure should not reach mock server: ${toJsonString(stats)}`,
    );

    await vscode.commands.executeCommand("growi.configureBaseUrl", baseUrl);
  });

  await runCase("open page reports missing base URL", async () => {
    const beforePath = await getActivePath();
    const errorMessages = [];

    await withWindowOverrides(
      {
        showErrorMessage: async (message) => {
          errorMessages.push(message);
          return undefined;
        },
      },
      async () => {
        await vscode.workspace
          .getConfiguration("growi")
          .update("baseUrl", undefined, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      },
    );

    assert(
      errorMessages.at(-1) ===
        "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
      `Unexpected missing base URL error: ${errorMessages.at(-1)}`,
    );
    assert(
      (await getActivePath()) === beforePath,
      "Missing base URL should not replace active editor.",
    );

    await vscode.commands.executeCommand("growi.configureBaseUrl", baseUrl);
  });

  await runCase("open page reports invalid token", async () => {
    await resetStats(adminUrl);
    await updateAuthMode(adminUrl, "invalidToken");
    const beforePath = await getActivePath();
    const errorMessages = [];

    await withWindowOverrides(
      {
        showErrorMessage: async (message) => {
          errorMessages.push(message);
          return undefined;
        },
      },
      async () => {
        await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      },
    );

    assert(
      errorMessages.at(-1) ===
        "GROWI API token が無効なため GROWI ページを開けませんでした。Configure API Token を確認してください。",
      `Unexpected invalid token error: ${errorMessages.at(-1)}`,
    );
    assert(
      (await getActivePath()) === beforePath,
      "Invalid token should not replace active editor.",
    );

    await updateAuthMode(adminUrl, "normal");
  });

  await runCase("open page reports permission denied", async () => {
    await resetStats(adminUrl);
    await updateAuthMode(adminUrl, "permissionDenied");
    const beforePath = await getActivePath();
    const errorMessages = [];

    await withWindowOverrides(
      {
        showErrorMessage: async (message) => {
          errorMessages.push(message);
          return undefined;
        },
      },
      async () => {
        await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      },
    );

    assert(
      errorMessages.at(-1) ===
        "GROWI へのアクセス権が不足しているか、接続先が認証を拒否したため GROWI ページを開けませんでした。権限設定と API Token を確認してください。",
      `Unexpected permission denied error: ${errorMessages.at(-1)}`,
    );
    assert(
      (await getActivePath()) === beforePath,
      "Permission denied should not replace active editor.",
    );

    await updateAuthMode(adminUrl, "normal");
  });

  await runCase(
    "add prefix and list tree with page-directory coexistence",
    async () => {
      await resetStats(adminUrl);
      await vscode.commands.executeCommand("growi.addPrefix", "/team");
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      assert(
        !workspaceFolders.some((folder) => folder.uri.scheme === "growi"),
        `growi: workspace folder should not be added: ${toJsonString(
          workspaceFolders.map((folder) => folder.uri.toString()),
        )}`,
      );

      const entries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.parse("growi:/team/"),
      );

      const entryMap = new Map(entries.map(([name, type]) => [name, type]));
      assert(
        entryMap.get("dev.md") === vscode.FileType.File,
        "Expected /team/dev page as dev.md.",
      );
      assert(
        entryMap.get("dev") === vscode.FileType.Directory,
        "Expected /team/dev directory.",
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.list >= 1,
        `Expected list request, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "directory page command opens the paired canonical page",
    async () => {
      await vscode.commands.executeCommand(
        "growi.openDirectoryPage",
        vscode.Uri.parse("growi:/team/dev/"),
      );

      const activeEditor = vscode.window.activeTextEditor;
      assert(
        activeEditor,
        "Expected active editor after opening directory page.",
      );
      assert(
        activeEditor.document.uri.toString() === "growi:/team/dev.md",
        `Expected paired directory page to open: ${activeEditor.document.uri.toString()}`,
      );
    },
  );

  await runCase(
    "duplicate add prefix keeps workspace folders unchanged",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      assert(
        !workspaceFolders.some((folder) => folder.uri.scheme === "growi"),
        `growi: workspace folder should stay absent: ${toJsonString(
          workspaceFolders.map((folder) => folder.uri.toString()),
        )}`,
      );

      await vscode.commands.executeCommand("growi.addPrefix", "/team");

      const afterResync = vscode.workspace.workspaceFolders ?? [];
      assert(
        !afterResync.some((folder) => folder.uri.scheme === "growi"),
        `Duplicate addPrefix should not create growi workspace folders: ${toJsonString(
          afterResync.map((folder) => folder.uri.toString()),
        )}`,
      );
    },
  );

  await runCase(
    "clear prefixes keeps workspace folders free of growi entries",
    async () => {
      await withWindowOverrides(
        {
          showWarningMessage: async () => "削除する",
        },
        async () => {
          await vscode.commands.executeCommand("growi.clearPrefixes");
        },
      );

      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      assert(
        !workspaceFolders.some((folder) => folder.uri.scheme === "growi"),
        `Expected growi workspace folders to be removed: ${toJsonString(
          workspaceFolders.map((folder) => folder.uri.toString()),
        )}`,
      );
    },
  );

  await runCase(
    "nested directory listing can traverse deeper levels",
    async () => {
      await updateFixture(adminUrl, NESTED_TREE_FIXTURE_PAGES);
      await resetStats(adminUrl);

      const devEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.parse("growi:/team/dev/"),
      );
      const devEntryMap = new Map(
        devEntries.map(([name, type]) => [name, type]),
      );
      assert(
        devEntryMap.get("docs.md") === vscode.FileType.File,
        `Expected /team/dev/docs page as docs.md: ${toJsonString(devEntries)}`,
      );
      assert(
        devEntryMap.get("docs") === vscode.FileType.Directory,
        `Expected /team/dev/docs directory: ${toJsonString(devEntries)}`,
      );
      assert(
        devEntryMap.get("notes.md") === vscode.FileType.File,
        `Expected /team/dev/notes page: ${toJsonString(devEntries)}`,
      );
      assert(
        devEntryMap.get("spec.md") === vscode.FileType.File,
        `Expected /team/dev/spec page: ${toJsonString(devEntries)}`,
      );

      const docsEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.parse("growi:/team/dev/docs/"),
      );
      const docsEntryMap = new Map(
        docsEntries.map(([name, type]) => [name, type]),
      );
      assert(
        docsEntryMap.get("guide.md") === vscode.FileType.File,
        `Expected /team/dev/docs/guide page as guide.md: ${toJsonString(docsEntries)}`,
      );
      assert(
        docsEntryMap.get("guide") === vscode.FileType.Directory,
        `Expected /team/dev/docs/guide directory: ${toJsonString(docsEntries)}`,
      );

      const guideEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.parse("growi:/team/dev/docs/guide/"),
      );
      assert(
        guideEntries.some(
          ([name, type]) =>
            name === "advanced.md" && type === vscode.FileType.File,
        ),
        `Expected /team/dev/docs/guide/advanced page: ${toJsonString(guideEntries)}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.list >= 3,
        `Expected nested traversal to trigger list requests, got ${toJsonString(stats)}`,
      );

      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
    },
  );

  await runCase(
    "refresh current page command reloads the active page",
    async () => {
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/spec",
        body: "# refreshed from server\n",
        updatedBy: "refresh-owner",
      });
      await resetStats(adminUrl);

      await vscode.commands.executeCommand("growi.refreshCurrentPage");

      const activePath = await getActivePath();
      assert(
        activePath === "/team/dev/spec.md",
        `Refresh Current Page changed active path: ${activePath}`,
      );
      assert(
        vscode.window.activeTextEditor?.document.getText() ===
          "# refreshed from server\n",
        `Refresh Current Page should update active document text: ${vscode.window.activeTextEditor?.document.getText()}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.page >= 1 && stats.revision >= 1,
        `Expected page/revision reload on refresh, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "refresh current page command reports retryable connection failure",
    async () => {
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      const errorMessages = [];

      await withWindowOverrides(
        {
          showErrorMessage: async (message) => {
            errorMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.configureBaseUrl",
            "http://127.0.0.1:9/",
          );
          await resetStats(adminUrl);
          await vscode.commands.executeCommand("growi.refreshCurrentPage");
        },
      );

      const refreshError = errorMessages.at(-1);
      assert(
        refreshError ===
          "GROWI への接続に失敗したため Refresh Current Page を実行できませんでした。",
        `Unexpected refresh current page failure: ${refreshError}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.page === 0 && stats.revision === 0 && stats.list === 0,
        `Refresh Current Page failure should not hit mock server: ${toJsonString(stats)}`,
      );

      await vscode.commands.executeCommand("growi.configureBaseUrl", baseUrl);
    },
  );

  await runCase(
    "refresh listing command reloads the registered prefix",
    async () => {
      await resetStats(adminUrl);

      await vscode.commands.executeCommand(
        "growi.refreshListing",
        vscode.Uri.parse("growi:/team/"),
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.list >= 1,
        `Expected list request on refresh listing, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "refresh listing command reports retryable connection failure",
    async () => {
      const errorMessages = [];

      await withWindowOverrides(
        {
          showErrorMessage: async (message) => {
            errorMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.configureBaseUrl",
            "http://127.0.0.1:9/",
          );
          await resetStats(adminUrl);
          await vscode.commands.executeCommand(
            "growi.refreshListing",
            vscode.Uri.parse("growi:/team/"),
          );
        },
      );

      const refreshError = errorMessages.at(-1);
      assert(
        refreshError ===
          "GROWI への接続に失敗したため Refresh Listing を実行できませんでした。",
        `Unexpected refresh listing failure: ${refreshError}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.page === 0 && stats.revision === 0 && stats.list === 0,
        `Refresh Listing failure should not hit mock server: ${toJsonString(stats)}`,
      );

      await vscode.commands.executeCommand("growi.configureBaseUrl", baseUrl);
    },
  );

  await runCase("show current page info command reports metadata", async () => {
    await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");

    const infoMessages = [];
    await withWindowOverrides(
      {
        showInformationMessage: async (message) => {
          infoMessages.push(message);
          return undefined;
        },
      },
      async () => {
        await vscode.commands.executeCommand("growi.showCurrentPageInfo");
      },
    );

    const message = infoMessages.at(-1);
    assert(typeof message === "string", "Page info message was not shown.");
    assert(
      message.includes("Path: /team/dev/spec"),
      `Page info message is missing path: ${message}`,
    );
    assert(
      message.includes("Last Updated By: spec-owner"),
      `Page info message is missing updater: ${message}`,
    );
    assert(
      message.includes("URL: "),
      `Page info message is missing URL: ${message}`,
    );
  });

  await runCase(
    "show revision history diff opens diff for current page and selected revision",
    async () => {
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/spec",
        body: "# spec page updated from history\n",
        updatedBy: "history-owner",
      });

      const quickPickCalls = [];
      await withWindowOverrides(
        {
          showQuickPick: async (items, options) => {
            quickPickCalls.push({
              items: items.map((item) => ({
                label: item.label,
                description: item.description,
                detail: item.detail,
              })),
              options,
            });
            return items[0];
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.showRevisionHistoryDiff");
        },
      );

      assert(
        quickPickCalls.length === 1,
        `Expected one revision selection prompt, got ${toJsonString(quickPickCalls)}`,
      );
      assert(
        quickPickCalls[0].options.placeHolder ===
          "比較したい revision を選択してください。",
        `Unexpected revision placeholder: ${toJsonString(quickPickCalls)}`,
      );
      assert(
        quickPickCalls[0].items.length >= 1,
        `Expected at least one comparable revision in the picker: ${toJsonString(quickPickCalls)}`,
      );
      assert(
        vscode.window.activeTextEditor?.document.uri.scheme ===
          "growi-revision",
        `Expected revision diff document to be active, got ${vscode.window.activeTextEditor?.document.uri.toString()}`,
      );
    },
  );

  await runCase(
    "show revision history diff reports when there are not enough revisions",
    async () => {
      await vscode.commands.executeCommand(
        "growi.openPage",
        "/team/dev/path-open",
      );

      const infoMessages = [];
      await withWindowOverrides(
        {
          showInformationMessage: async (message) => {
            infoMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.showRevisionHistoryDiff");
        },
      );

      const message = infoMessages.at(-1);
      assert(
        message ===
          "比較可能な revision が不足しているため履歴差分を表示できません。",
        `Unexpected no-history message: ${message}`,
      );
    },
  );

  await runCase(
    "download current page exports to the fixed local work file",
    async () => {
      const localPath = getLocalWorkFilePath();
      await fs.rm(localPath, { force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageToLocalFile",
      );

      const markdown = await fs.readFile(localPath, "utf8");
      assert(
        markdown.includes("# spec page"),
        `Exported markdown body is unexpected: ${markdown}`,
      );
      assert(
        markdown.includes('"canonicalPath":"/team/dev/spec"'),
        `Unexpected exported canonicalPath metadata: ${markdown}`,
      );
      assert(
        markdown.includes('"baseRevisionId":"revision-2"'),
        `Unexpected exported revision metadata: ${markdown}`,
      );
      assert(
        vscode.window.activeTextEditor?.document.uri.fsPath === localPath,
        "Export should open the local markdown file.",
      );
    },
  );

  await runCase(
    "download current page set exports nested bundle files and manifest metadata",
    async () => {
      await updateFixture(adminUrl, NESTED_TREE_FIXTURE_PAGES);
      await fs.rm(getBundleRootPath(), { recursive: true, force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev/docs");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageSetToLocalBundle",
      );

      const rootMarkdown = await fs.readFile(
        getBundlePageFilePath("/team/dev/docs"),
        "utf8",
      );
      const guideMarkdown = await fs.readFile(
        getBundlePageFilePath("/team/dev/docs/guide"),
        "utf8",
      );
      const advancedMarkdown = await fs.readFile(
        getBundlePageFilePath("/team/dev/docs/guide/advanced"),
        "utf8",
      );
      const manifest = JSON.parse(
        await fs.readFile(getBundleManifestPath(), "utf8"),
      );

      assert(
        rootMarkdown === "# docs page",
        `Unexpected root bundle markdown: ${rootMarkdown}`,
      );
      assert(
        guideMarkdown === "# guide page",
        `Unexpected guide bundle markdown: ${guideMarkdown}`,
      );
      assert(
        advancedMarkdown === "# advanced page",
        `Unexpected advanced bundle markdown: ${advancedMarkdown}`,
      );
      assert(
        manifest.rootCanonicalPath === "/team/dev/docs",
        `Unexpected manifest rootCanonicalPath: ${toJsonString(manifest)}`,
      );
      assert(
        manifest.pages.some(
          (page) =>
            page.canonicalPath === "/team/dev/docs" &&
            page.relativeFilePath === "team/dev/docs.md" &&
            page.contentHash === hashBody("# docs page"),
        ),
        `Manifest should keep nested path for root page: ${toJsonString(manifest)}`,
      );
      assert(
        manifest.pages.some(
          (page) =>
            page.canonicalPath === "/team/dev/docs/guide/advanced" &&
            page.relativeFilePath === "team/dev/docs/guide/advanced.md" &&
            page.contentHash === hashBody("# advanced page"),
        ),
        `Manifest should keep nested path for descendants: ${toJsonString(manifest)}`,
      );
      assert(
        vscode.window.activeTextEditor?.document.uri.fsPath ===
          getBundleManifestPath(),
        "Bundle download should open manifest.json.",
      );

      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
    },
  );

  await runCase(
    "current page mirror uses the scheme-less instanceKey",
    async () => {
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
      ]);
      await fs.rm(getWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });
      await fs.rm(getLegacyWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });

      await vscode.commands.executeCommand("growi.openPage", "/sample");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPage");

      const newManifestPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample"),
        ".growi-mirror.json",
      );
      const oldManifestPath = path.join(
        getLegacyWorkspaceMirrorRootPath(baseUrl, "/sample"),
        ".growi-mirror.json",
      );
      const newExists = await fs
        .access(newManifestPath)
        .then(() => true)
        .catch(() => false);
      const oldExists = await fs
        .access(oldManifestPath)
        .then(() => true)
        .catch(() => false);

      assert(
        newExists === true && oldExists === false,
        `Expected page mirror to use the scheme-less instanceKey: ${toJsonString({
          newManifestPath,
          oldManifestPath,
          newExists,
          oldExists,
        })}`,
      );
    },
  );

  await runCase(
    "current page mirror reuses existing ancestor prefix mirror",
    async () => {
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/hello",
          body: "# hello page",
          updatedAt: "2026-03-08T01:01:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/test",
          body: "# test page",
          updatedAt: "2026-03-08T01:02:00.000Z",
          updatedBy: "system",
        },
      ]);
      await fs.rm(getWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });

      await vscode.commands.executeCommand("growi.openPage", "/sample");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPrefix");

      await vscode.commands.executeCommand("growi.openPage", "/sample/hello");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPage");

      const prefixManifestPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample"),
        ".growi-mirror.json",
      );
      const prefixManifest = JSON.parse(
        await fs.readFile(prefixManifestPath, "utf8"),
      );
      assert(
        prefixManifest.mode === "prefix",
        `Expected prefix manifest to remain the source of truth: ${toJsonString(prefixManifest)}`,
      );
      assert(
        prefixManifest.pages.some(
          (page) =>
            page.canonicalPath === "/sample/hello" &&
            page.relativeFilePath === "hello.md",
        ),
        `Expected /sample/hello to stay in ancestor prefix manifest: ${toJsonString(prefixManifest)}`,
      );
      const nestedManifestPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample/hello"),
        ".growi-mirror.json",
      );
      const nestedReservedPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample/hello"),
        "__hello__.md",
      );
      const nestedManifestExists = await fs
        .access(nestedManifestPath)
        .then(() => true)
        .catch(() => false);
      const nestedReservedExists = await fs
        .access(nestedReservedPath)
        .then(() => true)
        .catch(() => false);
      assert(
        nestedManifestExists === false && nestedReservedExists === false,
        `Current page mirror should not create nested mirror root: ${toJsonString({
          nestedManifestPath,
          nestedReservedPath,
          nestedManifestExists,
          nestedReservedExists,
        })}`,
      );
    },
  );

  await runCase(
    "compare local work file reuses existing ancestor prefix mirror",
    async () => {
      const capturedChangesCalls = [];
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/hello",
          body: "# hello page",
          updatedAt: "2026-03-08T01:01:00.000Z",
          updatedBy: "system",
        },
      ]);
      await fs.rm(getWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });

      await vscode.commands.executeCommand("growi.openPage", "/sample");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPrefix");
      await fs.writeFile(
        path.join(getWorkspaceMirrorRootPath(baseUrl, "/sample"), "hello.md"),
        "# hello page updated locally\n",
        "utf8",
      );

      await vscode.commands.executeCommand("growi.openPage", "/sample/hello");
      const results = await withCommandExecuteOverride(
        async (next, command, args) => {
          if (command === "vscode.changes") {
            capturedChangesCalls.push(args);
            return undefined;
          }
          return await next(command, ...args);
        },
        async () =>
          await vscode.commands.executeCommand(
            "growi.compareLocalWorkFileWithCurrentPage",
          ),
      );

      assert(
        Array.isArray(results) &&
          results.length === 1 &&
          results[0]?.canonicalPath === "/sample/hello" &&
          results[0]?.status === "LocalChanged",
        `Expected ancestor compare to limit results to /sample/hello: ${toJsonString(results)}`,
      );
      assert(
        capturedChangesCalls.length === 1 &&
          capturedChangesCalls[0]?.[0] === "GROWI Mirror Diff: /sample/hello",
        `Unexpected changes title for ancestor page compare: ${toJsonString(capturedChangesCalls)}`,
      );
    },
  );

  await runCase(
    "upload local work file reuses existing ancestor prefix mirror",
    async () => {
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/hello",
          body: "# hello page",
          updatedAt: "2026-03-08T01:01:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/test",
          body: "# test page",
          updatedAt: "2026-03-08T01:02:00.000Z",
          updatedBy: "system",
        },
      ]);
      await fs.rm(getWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });

      await vscode.commands.executeCommand("growi.openPage", "/sample");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPrefix");
      await fs.writeFile(
        path.join(getWorkspaceMirrorRootPath(baseUrl, "/sample"), "hello.md"),
        "# hello page updated locally\n",
        "utf8",
      );
      await resetStats(adminUrl);

      await vscode.commands.executeCommand("growi.openPage", "/sample/hello");
      const results = await vscode.commands.executeCommand(
        "growi.uploadExportedLocalFileToGrowi",
      );

      assert(
        Array.isArray(results) &&
          results.length === 1 &&
          results[0]?.canonicalPath === "/sample/hello" &&
          results[0]?.status === "Uploaded",
        `Expected ancestor upload to limit results to /sample/hello: ${toJsonString(results)}`,
      );

      const page = await getPageFixture(adminUrl, "/sample/hello");
      assert(
        page.body === "# hello page updated locally\n",
        `Expected uploaded body to reach mock GROWI: ${toJsonString(page)}`,
      );
      const stats = await getStats(adminUrl);
      assert(
        stats.write === 1,
        `Expected ancestor upload to write exactly one page: ${toJsonString(stats)}`,
      );
      const prefixManifest = JSON.parse(
        await fs.readFile(
          path.join(getWorkspaceMirrorRootPath(baseUrl, "/sample"), ".growi-mirror.json"),
          "utf8",
        ),
      );
      assert(
        prefixManifest.pages.some(
          (page) =>
            page.canonicalPath === "/sample/hello" &&
            typeof page.baseRevisionId === "string",
        ),
        `Expected ancestor prefix manifest to stay updated: ${toJsonString(prefixManifest)}`,
      );
    },
  );

  await runCase(
    "legacy-key page compare and upload migrate to the scheme-less instanceKey",
    async () => {
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/hello",
          body: "# hello page",
          updatedAt: "2026-03-08T01:01:00.000Z",
          updatedBy: "system",
        },
      ]);

      const newRootPath = getWorkspaceMirrorRootPath(baseUrl, "/sample/hello");
      const legacyRootPath = getLegacyWorkspaceMirrorRootPath(
        baseUrl,
        "/sample/hello",
      );
      await fs.rm(newRootPath, { recursive: true, force: true });
      await fs.rm(legacyRootPath, { recursive: true, force: true });
      await fs.mkdir(legacyRootPath, { recursive: true });

      const exportedAt = "2026-03-09T00:00:00.000Z";
      const legacyBody = "# hello page legacy local change\n";
      await fs.writeFile(path.join(legacyRootPath, "__hello__.md"), legacyBody, "utf8");
      await fs.writeFile(
        path.join(legacyRootPath, ".growi-mirror.json"),
        `${JSON.stringify(
          {
            version: 1,
            baseUrl,
            rootCanonicalPath: "/sample/hello",
            mode: "page",
            exportedAt,
            pages: [
              {
                canonicalPath: "/sample/hello",
                relativeFilePath: "__hello__.md",
                pageId: "sample-hello",
                baseRevisionId: "sample-hello-rev-1",
                exportedAt,
                contentHash: hashBody("# hello page"),
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      await vscode.commands.executeCommand("growi.openPage", "/sample/hello");
      const compareResults = await withCommandExecuteOverride(
        async (next, command, args) => {
          if (command === "vscode.changes") {
            return undefined;
          }
          return await next(command, ...args);
        },
        async () =>
          await vscode.commands.executeCommand(
            "growi.compareLocalWorkFileWithCurrentPage",
          ),
      );
      assert(
        Array.isArray(compareResults) &&
          compareResults.length === 1 &&
          compareResults[0]?.status === "LocalChanged",
        `Expected compare to read the legacy-key page mirror: ${toJsonString(compareResults)}`,
      );

      await resetStats(adminUrl);
      const uploadResults = await vscode.commands.executeCommand(
        "growi.uploadExportedLocalFileToGrowi",
      );
      assert(
        Array.isArray(uploadResults) &&
          uploadResults.length === 1 &&
          uploadResults[0]?.status === "Uploaded",
        `Expected upload to reuse the legacy-key page mirror: ${toJsonString(uploadResults)}`,
      );

      const page = await getPageFixture(adminUrl, "/sample/hello");
      assert(
        page.body === legacyBody,
        `Expected uploaded body to match the legacy mirror file: ${toJsonString(page)}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.write === 1,
        `Expected exactly one upload from the migrated legacy mirror: ${toJsonString(stats)}`,
      );

      const newManifestPath = path.join(newRootPath, ".growi-mirror.json");
      const newManifest = JSON.parse(await fs.readFile(newManifestPath, "utf8"));
      const newBody = await fs.readFile(path.join(newRootPath, "__hello__.md"), "utf8");
      const legacyManifestExists = await fs
        .access(path.join(legacyRootPath, ".growi-mirror.json"))
        .then(() => true)
        .catch(() => false);
      const legacyBodyExists = await fs
        .access(path.join(legacyRootPath, "__hello__.md"))
        .then(() => true)
        .catch(() => false);

      assert(
        newManifest.rootCanonicalPath === "/sample/hello" &&
          newManifest.pages.some(
            (entry) =>
              entry.canonicalPath === "/sample/hello" &&
              entry.relativeFilePath === "__hello__.md",
          ) &&
          newBody === legacyBody &&
          legacyManifestExists === false &&
          legacyBodyExists === false,
        `Expected legacy-key page mirror to migrate into the scheme-less instanceKey: ${toJsonString({
          newManifestPath,
          newManifest,
          newBody,
          legacyRootPath,
          legacyManifestExists,
          legacyBodyExists,
        })}`,
      );
    },
  );

  await runCase(
    "current prefix mirror reuses existing ancestor prefix mirror",
    async () => {
      await updateFixture(adminUrl, [
        {
          path: "/sample",
          body: "# sample page",
          updatedAt: "2026-03-08T01:00:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/hello",
          body: "# hello page",
          updatedAt: "2026-03-08T01:01:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/test",
          body: "# test page",
          updatedAt: "2026-03-08T01:02:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/sample/test/child",
          body: "# child page",
          updatedAt: "2026-03-08T01:03:00.000Z",
          updatedBy: "system",
        },
      ]);
      await fs.rm(getWorkspaceMirrorRootPath(baseUrl, "/sample"), {
        recursive: true,
        force: true,
      });

      await vscode.commands.executeCommand("growi.openPage", "/sample");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPrefix");

      await vscode.commands.executeCommand("growi.openPage", "/sample/test");
      await vscode.commands.executeCommand("growi.createLocalMirrorForCurrentPrefix");

      const prefixManifestPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample"),
        ".growi-mirror.json",
      );
      const prefixManifest = JSON.parse(
        await fs.readFile(prefixManifestPath, "utf8"),
      );
      assert(
        prefixManifest.pages.some(
          (page) =>
            page.canonicalPath === "/sample/test" &&
            page.relativeFilePath === "test/__test__.md",
        ),
        `Expected /sample/test to stay in ancestor prefix manifest: ${toJsonString(prefixManifest)}`,
      );
      assert(
        prefixManifest.pages.some(
          (page) =>
            page.canonicalPath === "/sample/test/child" &&
            page.relativeFilePath === "test/child.md",
        ),
        `Expected subtree page to stay in ancestor prefix manifest: ${toJsonString(prefixManifest)}`,
      );
      const nestedManifestPath = path.join(
        getWorkspaceMirrorRootPath(baseUrl, "/sample/test"),
        ".growi-mirror.json",
      );
      const nestedManifestExists = await fs
        .access(nestedManifestPath)
        .then(() => true)
        .catch(() => false);
      assert(
        nestedManifestExists === false,
        `Current prefix mirror should not create nested manifest root: ${toJsonString({
          nestedManifestPath,
          nestedManifestExists,
        })}`,
      );
    },
  );

  await runCase(
    "compare local bundle opens vscode changes with diffable pages only",
    async () => {
      const infoMessages = [];
      const warningMessages = [];
      const capturedChangesCalls = [];
      await updateFixture(adminUrl, NESTED_TREE_FIXTURE_PAGES);
      await fs.rm(getBundleRootPath(), { recursive: true, force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageSetToLocalBundle",
      );
      await fs.writeFile(
        getBundlePageFilePath("/team/dev/docs/guide/advanced"),
        "# advanced local change\n",
        "utf8",
      );
      await fs.writeFile(
        getBundlePageFilePath("/team/dev/docs/guide"),
        "# guide local change\n",
        "utf8",
      );
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/docs/guide",
        body: "# guide remote change\n",
        updatedBy: "remote-editor",
      });
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/notes",
        body: "# notes remote change\n",
        updatedBy: "remote-editor",
      });

      const results = await withCommandExecuteOverride(
        async (next, command, args) => {
          if (command === "vscode.changes") {
            capturedChangesCalls.push(args);
            return undefined;
          }
          return await next(command, ...args);
        },
        async () =>
          await withWindowOverrides(
            {
              showInformationMessage: async (message) => {
                infoMessages.push(message);
                return undefined;
              },
              showWarningMessage: async (message) => {
                warningMessages.push(message);
                return undefined;
              },
            },
            async () =>
              await vscode.commands.executeCommand(
                "growi.compareLocalBundleWithGrowi",
              ),
          ),
      );

      assert(Array.isArray(results), "Compare bundle should return an array.");
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/spec" &&
            result.status === "Unchanged",
        ),
        `Expected unchanged page in compare results: ${toJsonString(results)}`,
      );
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/docs/guide" &&
            result.status === "Conflict",
        ),
        `Expected conflict page in compare results: ${toJsonString(results)}`,
      );
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/docs/guide/advanced" &&
            result.status === "LocalChanged",
        ),
        `Expected local changed page in compare results: ${toJsonString(results)}`,
      );
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/notes" &&
            result.status === "RemoteChanged",
        ),
        `Expected remote changed page in compare results: ${toJsonString(results)}`,
      );
      assert(
        capturedChangesCalls.length === 1,
        `Expected one vscode.changes call: ${toJsonString(capturedChangesCalls)}`,
      );
      const [title, resources] = capturedChangesCalls[0];
      assert(
        title === "GROWI Bundle Diff: /team/dev",
        `Unexpected changes title: ${title}`,
      );
      assert(Array.isArray(resources), "Expected vscode.changes resources.");
      assert(
        resources.length === 3,
        `Unexpected changes resources: ${toJsonString(resources)}`,
      );
      const resourceTriples = resources.map((triple) =>
        triple.map((uri) => uri?.toString?.() ?? String(uri)),
      );
      assert(
        resourceTriples.some(
          ([goToFileUri, originalUri, modifiedUri]) =>
            goToFileUri.endsWith("/growi-current-set/team/dev/docs/guide.md") &&
            originalUri === "growi:/team/dev/docs/guide.md" &&
            modifiedUri.endsWith("/growi-current-set/team/dev/docs/guide.md"),
        ),
        `Conflict page should be included in changes resources: ${toJsonString(resourceTriples)}`,
      );
      assert(
        resourceTriples.some(
          ([goToFileUri, originalUri, modifiedUri]) =>
            goToFileUri.endsWith(
              "/growi-current-set/team/dev/docs/guide/advanced.md",
            ) &&
            originalUri === "growi:/team/dev/docs/guide/advanced.md" &&
            modifiedUri.endsWith(
              "/growi-current-set/team/dev/docs/guide/advanced.md",
            ),
        ),
        `Local changed page should be included in changes resources: ${toJsonString(resourceTriples)}`,
      );
      assert(
        resourceTriples.some(
          ([goToFileUri, originalUri, modifiedUri]) =>
            goToFileUri.endsWith("/growi-current-set/team/dev/notes.md") &&
            originalUri === "growi:/team/dev/notes.md" &&
            modifiedUri.endsWith("/growi-current-set/team/dev/notes.md"),
        ),
        `Remote changed page should be included in changes resources: ${toJsonString(resourceTriples)}`,
      );
      assert(
        !resourceTriples.some(
          ([, originalUri]) => originalUri === "growi:/team/dev/spec.md",
        ),
        `Unchanged page should not be included in changes resources: ${toJsonString(resourceTriples)}`,
      );
      assert(
        infoMessages.length === 0,
        `Compare bundle should not show summary-only info: ${toJsonString(infoMessages)}`,
      );
      assert(
        warningMessages.length === 0,
        `Unexpected compare bundle warnings: ${toJsonString(warningMessages)}`,
      );

      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
    },
  );

  await runCase(
    "upload local bundle writes only changed pages and skips conflict pages",
    async () => {
      const infoMessages = [];
      await updateFixture(adminUrl, NESTED_TREE_FIXTURE_PAGES);
      await fs.rm(getBundleRootPath(), { recursive: true, force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev/docs");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageSetToLocalBundle",
      );
      await fs.writeFile(
        getBundlePageFilePath("/team/dev/docs/guide/advanced"),
        "# advanced uploaded locally\n",
        "utf8",
      );
      await fs.writeFile(
        getBundlePageFilePath("/team/dev/docs/guide"),
        "# guide stale local change\n",
        "utf8",
      );
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/docs/guide",
        body: "# guide remote change\n",
        updatedBy: "remote-editor",
      });
      await resetStats(adminUrl);

      const results = await withWindowOverrides(
        {
          showInformationMessage: async (message) => {
            infoMessages.push(message);
            return undefined;
          },
        },
        async () =>
          await vscode.commands.executeCommand(
            "growi.uploadLocalBundleToGrowi",
          ),
      );

      assert(Array.isArray(results), "Upload bundle should return an array.");
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/docs" &&
            result.status === "Unchanged",
        ),
        `Expected unchanged root page in upload results: ${toJsonString(results)}`,
      );
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/docs/guide" &&
            result.status === "Conflict",
        ),
        `Expected conflict page in upload results: ${toJsonString(results)}`,
      );
      assert(
        results.some(
          (result) =>
            result.canonicalPath === "/team/dev/docs/guide/advanced" &&
            result.status === "Uploaded",
        ),
        `Expected uploaded page in upload results: ${toJsonString(results)}`,
      );

      const guidePage = await getPageFixture(adminUrl, "/team/dev/docs/guide");
      const advancedPage = await getPageFixture(
        adminUrl,
        "/team/dev/docs/guide/advanced",
      );
      const manifest = JSON.parse(
        await fs.readFile(getBundleManifestPath(), "utf8"),
      );
      const stats = await getStats(adminUrl);

      assert(
        guidePage.body === "# guide remote change\n",
        `Conflict page must stay remote-newer: ${toJsonString(guidePage)}`,
      );
      assert(
        advancedPage.body === "# advanced uploaded locally\n",
        `Changed page should upload new body: ${toJsonString(advancedPage)}`,
      );
      assert(
        stats.write === 1,
        `Bundle upload should write only one changed page: ${toJsonString(stats)}`,
      );
      assert(
        manifest.pages.some(
          (page) =>
            page.canonicalPath === "/team/dev/docs/guide/advanced" &&
            page.contentHash === hashBody("# advanced uploaded locally\n"),
        ),
        `Manifest should refresh uploaded page hash: ${toJsonString(manifest)}`,
      );
      assert(
        manifest.pages.some(
          (page) =>
            page.canonicalPath === "/team/dev/docs/guide" &&
            page.contentHash === hashBody("# guide page"),
        ),
        `Conflict page manifest should stay unchanged: ${toJsonString(manifest)}`,
      );
      assert(
        infoMessages
          .at(-1)
          ?.includes("Upload Local Bundle to GROWI を完了しました。"),
        `Upload bundle should show summary: ${infoMessages.at(-1)}`,
      );

      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
    },
  );

  await runCase("upload local work file updates remote page body", async () => {
    const localPath = getLocalWorkFilePath();
    await fs.rm(localPath, { force: true });
    const growiUri = vscode.Uri.parse("growi:/team/dev/spec.md");

    await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
    await vscode.commands.executeCommand(
      "growi.downloadCurrentPageToLocalFile",
    );
    await vscode.commands.executeCommand("vscode.open", growiUri, {
      preserveFocus: true,
      preview: false,
    });

    const editor = vscode.window.activeTextEditor;
    assert(Boolean(editor), "Expected the local work file editor to be open.");
    const replaced = await editor.edit((editBuilder) => {
      const document = editor.document;
      const lastLine = document.lineAt(document.lineCount - 1);
      editBuilder.replace(
        new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
        `<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"${baseUrl}","canonicalPath":"/team/dev/spec","pageId":"page-2","baseRevisionId":"revision-2","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# edited by codex host test\n`,
      );
    });
    assert(replaced, "Failed to edit growi-current.md.");
    await editor.document.save();
    await resetStats(adminUrl);
    await vscode.commands.executeCommand(
      "growi.uploadExportedLocalFileToGrowi",
    );

    const activeEditor = vscode.window.activeTextEditor;
    assert(
      activeEditor?.document.uri.fsPath === localPath,
      "Upload should keep growi-current.md focused.",
    );

    const page = await getPageFixture(adminUrl, "/team/dev/spec");
    assert(
      page.body === "# edited by codex host test\n",
      `Upload should update remote body: ${toJsonString(page)}`,
    );

    const savedWorkFile = await fs.readFile(localPath, "utf8");
    assert(
      savedWorkFile.includes(`"baseRevisionId":"${page.revisionId}"`),
      `Work file should refresh to latest revision: ${toJsonString({
        savedWorkFile,
        page,
      })}`,
    );

    const growiDocument = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === growiUri.toString(),
    );
    assert(Boolean(growiDocument), "Expected growi document to stay open.");
    assert(
      growiDocument?.getText() === "# edited by codex host test\n",
      `Open growi document should refresh to remote body: ${growiDocument?.getText()}`,
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.write === 1,
      `Expected one write request during upload: ${toJsonString(stats)}`,
    );
  });

  await runCase("compare local work file opens vscode diff", async () => {
    const localPath = getLocalWorkFilePath();
    await fs.rm(localPath, { force: true });
    await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
    await vscode.commands.executeCommand(
      "growi.downloadCurrentPageToLocalFile",
    );

    const capturedDiffCalls = [];
    await withCommandExecuteOverride(
      async (next, command, args) => {
        if (command === "vscode.diff") {
          capturedDiffCalls.push(args);
          return undefined;
        }
        return await next(command, ...args);
      },
      async () => {
        await vscode.commands.executeCommand(
          "growi.compareLocalWorkFileWithCurrentPage",
        );
      },
    );

    assert(capturedDiffCalls.length === 1, "Expected one vscode.diff call.");
    const [leftUri, rightUri, title] = capturedDiffCalls[0];
    assert(
      leftUri?.toString?.() === "growi:/team/dev/spec.md",
      `Unexpected diff left URI: ${leftUri?.toString?.()}`,
    );
    assert(
      rightUri?.fsPath === localPath,
      `Unexpected diff right URI: ${rightUri?.fsPath}`,
    );
    assert(
      title === "GROWI Diff: /team/dev/spec <-> growi-current.md",
      `Unexpected diff title: ${title}`,
    );
  });

  await runCase(
    "compare local work file rejects baseUrl mismatch",
    async () => {
      const localPath = getLocalWorkFilePath();
      const errorMessages = [];
      await fs.writeFile(
        localPath,
        '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://other.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-2","baseRevisionId":"revision-2","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# local body\n',
        "utf8",
      );
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(localPath),
      );

      const capturedDiffCalls = [];
      await withCommandExecuteOverride(
        async (next, command, args) => {
          if (command === "vscode.diff") {
            capturedDiffCalls.push(args);
            return undefined;
          }
          return await next(command, ...args);
        },
        async () => {
          await withWindowOverrides(
            {
              showErrorMessage: async (message) => {
                errorMessages.push(message);
                return undefined;
              },
            },
            async () => {
              await vscode.commands.executeCommand(
                "growi.compareLocalWorkFileWithCurrentPage",
              );
            },
          );
        },
      );

      assert(
        capturedDiffCalls.length === 0,
        "Diff should not open on baseUrl mismatch.",
      );
      assert(
        errorMessages.at(-1) ===
          "export 元の GROWI base URL が現在設定と一致しないため Compare Local Work File with Current Page を実行できません。接続先を確認してください。",
        `Unexpected compare mismatch error: ${errorMessages.at(-1)}`,
      );
    },
  );

  await runCase(
    "upload local work file skips reopen when open growi page is dirty",
    async () => {
      const localPath = getLocalWorkFilePath();
      const warningMessages = [];
      const growiUri = vscode.Uri.parse("growi:/team/dev/spec.md");
      await fs.rm(localPath, { force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageToLocalFile",
      );

      await vscode.commands.executeCommand("vscode.open", growiUri);
      await vscode.commands.executeCommand("growi.startEdit", growiUri);

      const growiEditor = vscode.window.activeTextEditor;
      assert(Boolean(growiEditor), "Expected growi editor to be active.");
      const growiEdited = await growiEditor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), "draft change\n");
      });
      assert(growiEdited, "Failed to dirty the growi editor.");
      await pause();

      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(localPath),
      );
      const localEditor = vscode.window.activeTextEditor;
      assert(
        Boolean(localEditor),
        "Expected local work file editor to be active.",
      );
      const localEdited = await localEditor.edit((editBuilder) => {
        const document = localEditor.document;
        const lastLine = document.lineAt(document.lineCount - 1);
        editBuilder.replace(
          new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
          `<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"${baseUrl}","canonicalPath":"/team/dev/spec","pageId":"page-2","baseRevisionId":"revision-2","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# upload while growi dirty\n`,
        );
      });
      assert(localEdited, "Failed to edit growi-current.md.");
      await localEditor.document.save();
      await resetStats(adminUrl);

      await withWindowOverrides(
        {
          showWarningMessage: async (message) => {
            warningMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.uploadExportedLocalFileToGrowi",
          );
        },
      );

      assert(
        warningMessages.at(-1) ===
          "GROWI への upload は成功しましたが、表示中の growi: ページは未保存変更があるため自動再読込しませんでした。",
        `Unexpected dirty reopen warning: ${warningMessages.at(-1)}`,
      );

      const page = await getPageFixture(adminUrl, "/team/dev/spec");
      assert(
        page.body === "# upload while growi dirty\n",
        `Upload should still update remote body: ${toJsonString(page)}`,
      );

      const dirtyGrowiDocument = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === growiUri.toString(),
      );
      assert(
        Boolean(dirtyGrowiDocument),
        "Expected dirty growi document to stay open.",
      );
      assert(
        dirtyGrowiDocument?.getText().startsWith("draft change\n"),
        `Dirty growi document should not be reopened: ${dirtyGrowiDocument?.getText()}`,
      );

      const activeEditor = vscode.window.activeTextEditor;
      assert(
        activeEditor?.document.uri.fsPath === localPath,
        "Upload should keep growi-current.md focused when reopen is skipped.",
      );
    },
  );

  await runCase(
    "upload local work file rejects revision conflict",
    async () => {
      const localPath = getLocalWorkFilePath();
      const errorMessages = [];
      await fs.rm(localPath, { force: true });

      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand(
        "growi.downloadCurrentPageToLocalFile",
      );

      const exported = await fs.readFile(localPath, "utf8");
      await fs.writeFile(
        localPath,
        exported.replace("# spec page", "# stale local change"),
        "utf8",
      );
      await adminUpdatePage(adminUrl, {
        path: "/team/dev/spec",
        body: "# updated remotely\n",
        updatedBy: "remote-editor",
      });
      await resetStats(adminUrl);

      await withWindowOverrides(
        {
          showErrorMessage: async (message) => {
            errorMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.uploadExportedLocalFileToGrowi",
          );
        },
      );

      assert(
        errorMessages.at(-1) ===
          "download 後に GROWI 側が更新されたため Upload Local Work File to GROWI を中止しました。再度 download してやり直してください。",
        `Unexpected upload conflict message: ${errorMessages.at(-1)}`,
      );
      const page = await getPageFixture(adminUrl, "/team/dev/spec");
      assert(
        page.body === "# updated remotely\n",
        `Conflict upload must not overwrite remote body: ${toJsonString(page)}`,
      );
      const stats = await getStats(adminUrl);
      assert(
        stats.write === 0,
        `Conflict upload should not write remote body: ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "upload local work file rejects corrupted metadata comment",
    async () => {
      const localPath = getLocalWorkFilePath();
      const errorMessages = [];

      await fs.writeFile(localPath, "# orphan file\n", "utf8");
      await resetStats(adminUrl);

      await withWindowOverrides(
        {
          showErrorMessage: async (message) => {
            errorMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.uploadExportedLocalFileToGrowi",
          );
        },
      );

      assert(
        errorMessages.at(-1) ===
          "growi-current.md の GROWI metadata を読み取れませんでした。再度 download してください。",
        `Unexpected upload metadata error message: ${errorMessages.at(-1)}`,
      );
      const stats = await getStats(adminUrl);
      assert(
        stats.write === 0,
        `Upload without metadata must not hit write API: ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "start edit and end edit commands control dirty refresh flow",
    async () => {
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand("growi.startEdit");

      const editor = vscode.window.activeTextEditor;
      assert(Boolean(editor), "Active editor is missing for edit flow.");
      const edited = await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), "draft change\n");
      });
      assert(edited, "Failed to modify the active document.");
      await pause();

      const errorMessages = [];
      await resetStats(adminUrl);
      await withWindowOverrides(
        {
          showErrorMessage: async (message) => {
            errorMessages.push(message);
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.refreshCurrentPage");
        },
      );

      const refreshError = errorMessages.at(-1);
      assert(
        refreshError?.includes(
          "未保存の変更があるため Refresh Current Page を実行できません",
        ),
        `Unexpected refresh error message: ${refreshError}`,
      );

      const blockedStats = await getStats(adminUrl);
      assert(
        blockedStats.page === 0 &&
          blockedStats.revision === 0 &&
          blockedStats.list === 0,
        `Dirty edit refresh should not hit the server: ${toJsonString(blockedStats)}`,
      );

      await withWindowOverrides(
        {
          showInformationMessage: async (message, _options, ...items) => {
            if (
              typeof message === "string" &&
              message.includes("未保存の変更を破棄して編集を終了しますか？")
            ) {
              assert(
                items.length === 2 &&
                  items[0] === "保存してReadOnlyに戻る" &&
                  items[1] === "破棄して戻る",
                `Unexpected end edit actions: ${toJsonString(items)}`,
              );
              return items[1];
            }
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.endEdit");
        },
      );

      await resetStats(adminUrl);
      await vscode.commands.executeCommand("growi.refreshCurrentPage");
      const resumedStats = await getStats(adminUrl);
      assert(
        resumedStats.page >= 1 && resumedStats.revision >= 1,
        `Refresh should work after End Edit, got ${toJsonString(resumedStats)}`,
      );
    },
  );

  await runCase(
    "end edit save action saves changes and leaves the page refreshable",
    async () => {
      await resetStats(adminUrl);
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand("growi.startEdit");

      const editor = vscode.window.activeTextEditor;
      assert(Boolean(editor), "Active editor is missing for end edit save.");
      const edited = await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), "saved via end edit\n");
      });
      assert(edited, "Failed to modify the active document.");
      await pause();

      await withWindowOverrides(
        {
          showInformationMessage: async (message, _options, ...items) => {
            if (
              typeof message === "string" &&
              message.includes("未保存の変更を破棄して編集を終了しますか？")
            ) {
              assert(
                items.length === 2 &&
                  items[0] === "保存してReadOnlyに戻る" &&
                  items[1] === "破棄して戻る",
                `Unexpected end edit actions: ${toJsonString(items)}`,
              );
              return items[0];
            }
            return undefined;
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.endEdit");
        },
      );

      const page = await getPageFixture(adminUrl, "/team/dev/spec");
      assert(
        typeof page?.body === "string" &&
          page.body.startsWith("saved via end edit\n"),
        `Saved body was not reflected on mock GROWI: ${toJsonString(page)}`,
      );

      await resetStats(adminUrl);
      await vscode.commands.executeCommand("growi.refreshCurrentPage");
      const stats = await getStats(adminUrl);
      assert(
        stats.page >= 1 && stats.revision >= 1,
        `Refresh should work after saving via End Edit, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "save after start edit succeeds even when write response omits page metadata",
    async () => {
      await resetStats(adminUrl);
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await vscode.commands.executeCommand("growi.startEdit");

      const editor = vscode.window.activeTextEditor;
      assert(Boolean(editor), "Active editor is missing for save flow.");
      const edited = await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), "saved from vscode\n");
      });
      assert(edited, "Failed to modify the active document before save.");
      await pause();

      const saved = await editor.document.save();
      assert(saved, "Expected document.save() to succeed.");
      assert(
        editor.document.isDirty === false,
        "Document should not stay dirty after a successful save.",
      );

      const page = await getPageFixture(adminUrl, "/team/dev/spec");
      assert(
        typeof page?.body === "string" &&
          page.body.startsWith("saved from vscode\n"),
        `Saved body was not reflected on mock GROWI: ${toJsonString(page)}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.write === 1,
        `Expected exactly one write request, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "show backlinks command opens the selected backlink page",
    async () => {
      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");
      await resetStats(adminUrl);

      await withWindowOverrides(
        {
          showQuickPick: async (items, options) => {
            assert(
              options.placeHolder === "登録済み Prefix 配下を検索しました。",
              `Unexpected quick pick placeholder: ${options.placeHolder}`,
            );
            const guideItem = items.find(
              (item) => item.canonicalPath === "/team/dev/guide",
            );
            assert(
              Boolean(guideItem),
              `Guide backlink was not offered: ${toJsonString(items)}`,
            );
            return guideItem;
          },
        },
        async () => {
          await vscode.commands.executeCommand("growi.showBacklinks");
        },
      );

      const activePath = await getActivePath();
      assert(
        activePath === "/team/dev/guide.md",
        `Backlinks command did not open the selected page: ${activePath}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.list >= 1 && stats.page >= 1 && stats.revision >= 1,
        `Expected backlinks flow to list and open pages, got ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "current page actions delegates download entries to existing commands",
    async () => {
      await updateFixture(adminUrl, BACKLINK_FIXTURE_PAGES);
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");

      const delegatedCommands = [];
      await withCommandExecuteOverride(
        async (next, command, args) => {
          if (
            command === "growi.downloadCurrentPageToLocalFile" ||
            command === "growi.downloadCurrentPageSetToLocalBundle"
          ) {
            delegatedCommands.push({ command, args });
            return undefined;
          }
          return await next(command, ...args);
        },
        async () => {
          await withWindowOverrides(
            {
              showQuickPick: async (items, options) => {
                assert(
                  options.placeHolder ===
                    "現在ページに対して実行する操作を選択してください。",
                  `Unexpected current page actions placeholder: ${options.placeHolder}`,
                );
                assert(
                  items.some(
                    (item) =>
                      item.label === "現在ページをローカルへダウンロード" &&
                      item.description === "growi-current.md に保存" &&
                      item.command === "growi.downloadCurrentPageToLocalFile",
                  ),
                  `Current page download action was not offered: ${toJsonString(items)}`,
                );
                const bundleItem = items.find(
                  (item) =>
                    item.label === "配下ページをローカルへダウンロード" &&
                    item.description === "growi-current-set/ に保存" &&
                    item.command ===
                      "growi.downloadCurrentPageSetToLocalBundle",
                );
                assert(
                  Boolean(bundleItem),
                  `Current page set download action was not offered: ${toJsonString(items)}`,
                );
                return bundleItem;
              },
            },
            async () => {
              await vscode.commands.executeCommand(
                "growi.showCurrentPageActions",
              );
            },
          );
        },
      );

      assert(
        delegatedCommands.length === 1,
        `Expected one delegated current page action, got ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[0]?.command ===
          "growi.downloadCurrentPageSetToLocalBundle",
        `Unexpected delegated command: ${toJsonString(delegatedCommands)}`,
      );
      assert(
        delegatedCommands[0]?.args[0]?.uri?.toString?.() ===
          "growi:/team/dev/spec.md" &&
          delegatedCommands[0]?.args[0]?.scope === "page",
        `Unexpected delegated target URI: ${toJsonString(delegatedCommands)}`,
      );
    },
  );

  await runCase(
    "local round trip actions delegate compare and upload entries to existing commands",
    async () => {
      await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");

      const delegatedCommands = [];
      await withCommandExecuteOverride(
        async (next, command, args) => {
          if (
            command === "growi.compareLocalWorkFileWithCurrentPage" ||
            command === "growi.uploadExportedLocalFileToGrowi" ||
            command === "growi.compareLocalBundleWithGrowi" ||
            command === "growi.uploadLocalBundleToGrowi"
          ) {
            delegatedCommands.push({ command, args });
            return undefined;
          }
          return await next(command, ...args);
        },
        async () => {
          await withWindowOverrides(
            {
              showQuickPick: async (items, options) => {
                assert(
                  options.placeHolder ===
                    "ローカルファイルに対して実行する操作を選択してください。",
                  `Unexpected local round trip actions placeholder: ${options.placeHolder}`,
                );
                assert(
                  items.length === 4,
                  `Unexpected local round trip actions: ${toJsonString(items)}`,
                );
                assert(
                  items[0]?.label === "ローカルと現在ページを比較" &&
                    items[0]?.description === "growi-current.md を使用" &&
                    items[0]?.command ===
                      "growi.compareLocalWorkFileWithCurrentPage",
                  `Current page compare action was not first: ${toJsonString(items)}`,
                );
                assert(
                  items[1]?.label === "ローカルと配下ページを比較" &&
                    items[1]?.description === "growi-current-set/ を使用" &&
                    items[1]?.command === "growi.compareLocalBundleWithGrowi",
                  `Bundle compare action was not second: ${toJsonString(items)}`,
                );
                assert(
                  items[2]?.label === "ローカルを現在ページへ反映" &&
                    items[2]?.description === "growi-current.md を使用" &&
                    items[2]?.command ===
                      "growi.uploadExportedLocalFileToGrowi",
                  `Current page upload action was not third: ${toJsonString(items)}`,
                );
                assert(
                  items[3]?.label === "ローカルを配下ページへ反映" &&
                    items[3]?.description === "growi-current-set/ を使用" &&
                    items[3]?.command === "growi.uploadLocalBundleToGrowi",
                  `Bundle upload action was not fourth: ${toJsonString(items)}`,
                );
                return items[1];
              },
            },
            async () => {
              await vscode.commands.executeCommand(
                "growi.showLocalRoundTripActions",
              );
            },
          );
        },
      );

      assert(
        delegatedCommands.length === 1,
        `Expected one delegated local round trip action, got ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[0]?.command === "growi.compareLocalBundleWithGrowi",
        `Unexpected delegated command: ${toJsonString(delegatedCommands)}`,
      );
      assert(
        delegatedCommands[0]?.args[0]?.toString?.() ===
          "growi:/team/dev/spec.md",
        `Unexpected delegated target URI: ${toJsonString(delegatedCommands)}`,
      );
    },
  );

  await runCase(
    "Explorer synthetic directory page wrapper delegates current-page actions to the page URI",
    async () => {
      const delegatedCommands = [];

      await withCommandExecuteOverride(
        async (next, command, args) => {
          if (command === "growi.downloadCurrentPageSetToLocalBundle") {
            delegatedCommands.push({ command, args });
            return undefined;
          }
          return await next(command, ...args);
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.explorerDownloadCurrentPageSetToLocalBundle",
            {
              uri: { scheme: "growi", path: "/team/dev.md" },
              contextValue: "growi.directoryPage",
            },
          );
        },
      );

      assert(
        delegatedCommands.length === 1,
        `Expected one delegated Explorer directory action, got ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[0]?.args[0]?.path === "/team/dev.md",
        `Unexpected delegated page URI: ${toJsonString(
          delegatedCommands,
        )}`,
      );
    },
  );

  await runCase(
    "Explorer context wrappers delegate prefix-root and local mirror actions",
    async () => {
      const delegatedCommands = [];

      await withCommandExecuteOverride(
        async (next, command, args) => {
          if (
            command === "growi.showCurrentPageInfo" ||
            command === "growi.compareLocalBundleWithGrowi" ||
            command === "growi.uploadLocalBundleToGrowi"
          ) {
            delegatedCommands.push({ command, args });
            return undefined;
          }
          return await next(command, ...args);
        },
        async () => {
          await vscode.commands.executeCommand(
            "growi.explorerShowCurrentPageInfo",
            {
              uri: { scheme: "growi", path: "/team/" },
              contextValue: "growi.prefixRoot",
            },
          );
          await vscode.commands.executeCommand(
            "growi.explorerCompareLocalBundleWithGrowi",
            {
              uri: { scheme: "growi", path: "/team/" },
              contextValue: "growi.prefixRoot",
            },
          );
          await vscode.commands.executeCommand(
            "growi.explorerUploadLocalBundleToGrowi",
            {
              uri: { scheme: "growi", path: "/team/" },
              contextValue: "growi.prefixRoot",
            },
          );
        },
      );

      assert(
        delegatedCommands.length === 3,
        `Expected three delegated Explorer context actions, got ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[0]?.command === "growi.showCurrentPageInfo" &&
          delegatedCommands[0]?.args[0]?.path === "/team.md",
        `Unexpected prefix-root page delegation: ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[1]?.command === "growi.compareLocalBundleWithGrowi" &&
          delegatedCommands[1]?.args[0]?.uri?.path === "/team.md" &&
          delegatedCommands[1]?.args[0]?.scope === "subtree",
        `Unexpected local bundle compare delegation: ${toJsonString(
          delegatedCommands,
        )}`,
      );
      assert(
        delegatedCommands[2]?.command === "growi.uploadLocalBundleToGrowi" &&
          delegatedCommands[2]?.args[0]?.uri?.path === "/team.md" &&
          delegatedCommands[2]?.args[0]?.scope === "subtree",
        `Unexpected local bundle upload delegation: ${toJsonString(
          delegatedCommands,
        )}`,
      );
    },
  );

  await runCase("URL open normalization", async () => {
    await resetStats(adminUrl);
    await vscode.commands.executeCommand(
      "growi.openPage",
      `${baseUrl}team//dev/url-open/`,
    );
    const activePath = await getActivePath();
    assert(
      activePath === "/team/dev/url-open.md",
      `Unexpected normalized URL path: ${activePath}`,
    );
  });

  await runCase("permalink URL open normalization", async () => {
    await updateFixture(
      adminUrl,
      PERMALINK_FIXTURE_PAGES.map((page) => ({
        ...page,
        body: page.body.replace(
          baseUrlPlaceholder(),
          `${baseUrl}${PERMALINK_PAGE_ID}`,
        ),
      })),
    );
    await resetStats(adminUrl);
    await vscode.commands.executeCommand(
      "growi.openPage",
      `${baseUrl}${PERMALINK_PAGE_ID}`,
    );
    const activePath = await getActivePath();
    assert(
      activePath === "/team/dev/spec.md",
      `Unexpected permalink URL path: ${activePath}`,
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page >= 2 && stats.revision >= 1,
      `Permalink open should resolve pageId then open page: ${toJsonString(stats)}`,
    );
  });

  await runCase(
    "same-instance idurl add prefix resolves to canonical path",
    async () => {
      await updateFixture(adminUrl, [
        {
          pageId: PERMALINK_PAGE_ID,
          path: "/team",
          body: "# team page",
          updatedAt: "2026-03-08T01:10:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/team/dev",
          body: "# team dev page",
          updatedAt: "2026-03-08T01:11:00.000Z",
          updatedBy: "system",
        },
        {
          path: "/team/dev/spec",
          body: "# spec page",
          updatedAt: "2026-03-08T01:12:00.000Z",
          updatedBy: "spec-owner",
        },
      ]);
      await resetStats(adminUrl);
      await vscode.commands.executeCommand(
        "growi.addPrefix",
        `${baseUrl}${PERMALINK_PAGE_ID}`,
      );

      const entries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.parse("growi:/team/"),
      );
      const entryMap = new Map(entries.map(([name, type]) => [name, type]));
      assert(
        entryMap.get("dev.md") === vscode.FileType.File,
        `Expected canonical path prefix root to expose /team/dev page: ${toJsonString(entries)}`,
      );
      assert(
        entryMap.get("dev") === vscode.FileType.Directory,
        `Expected canonical path prefix root to expose /team/dev directory: ${toJsonString(entries)}`,
      );

      const stats = await getStats(adminUrl);
      assert(
        stats.page >= 1 && stats.list >= 1,
        `idurl addPrefix should resolve pageId and list canonical path: ${toJsonString(stats)}`,
      );
    },
  );

  await runCase(
    "ambiguous root-relative permalink falls back to canonical path",
    async () => {
      await updateFixture(
        adminUrl,
        PERMALINK_FIXTURE_PAGES.map((page) => ({
          ...page,
          body: page.body.replace(
            baseUrlPlaceholder(),
            `${baseUrl}${PERMALINK_PAGE_ID}`,
          ),
        })),
      );
      await resetStats(adminUrl);
      await vscode.commands.executeCommand(
        "growi.openPage",
        AMBIGUOUS_PATH_ONLY_PAGE,
      );
      const activePath = await getActivePath();
      assert(
        activePath === `${AMBIGUOUS_PATH_ONLY_PAGE}.md`,
        `Ambiguous path should fall back to canonical path: ${activePath}`,
      );
    },
  );

  await runCase("foreign-host permalink input is rejected", async () => {
    await resetStats(adminUrl);
    const beforePath = await getActivePath();
    await vscode.commands.executeCommand(
      "growi.openPage",
      `https://other.example.com/${PERMALINK_PAGE_ID}`,
    );
    const afterPath = await getActivePath();
    assert(
      beforePath === afterPath,
      "Foreign-host permalink should keep active editor unchanged.",
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page === 0 && stats.revision === 0 && stats.list === 0,
      `Foreign-host permalink should not call API: ${toJsonString(stats)}`,
    );
  });

  await runCase(
    "document links resolve absolute path and same-baseUrl URLs",
    async () => {
      await updateFixture(adminUrl, [
        ...BACKLINK_FIXTURE_PAGES,
        {
          path: "/team/dev/link-doc",
          body: `# link doc\n\n[path](/team/dev/spec)\n\n[url](${baseUrl}team/dev/guide#overview)\n\n[permalink](${baseUrl}${PERMALINK_PAGE_ID})\n\n[attachment](/attachment/69ae3fab9bb449092d0d3f66)\n\n[rel](./guide)\n`,
          updatedAt: "2026-03-08T00:06:00.000Z",
          updatedBy: "link-owner",
        },
        {
          path: "/team/dev/spec",
          pageId: PERMALINK_PAGE_ID,
          body: "# spec page",
          updatedAt: "2026-03-08T00:01:00.000Z",
          updatedBy: "spec-owner",
        },
      ]);
      await vscode.commands.executeCommand(
        "growi.openPage",
        "/team/dev/link-doc",
      );
      const document = vscode.window.activeTextEditor?.document;
      const uri = document?.uri;
      assert(uri && document, "Expected active growi document.");

      const links = await vscode.commands.executeCommand(
        "vscode.executeLinkProvider",
        uri,
      );
      assert(Array.isArray(links), "Expected link provider results.");
      assert(
        links.length === 4,
        `Unexpected resolved links: ${toJsonString(links)}`,
      );
      assert(
        links.some(
          (link) => link.target?.toString() === "growi:/team/dev/spec.md",
        ),
        `Absolute path link was not resolved: ${toJsonString(links)}`,
      );
      assert(
        links.some(
          (link) => link.target?.toString() === "growi:/team/dev/guide.md",
        ),
        `Absolute URL link was not resolved: ${toJsonString(links)}`,
      );
      assert(
        links.some(
          (link) => link.target?.toString() === "growi:/team/dev/spec.md",
        ),
        `Permalink URL link was not resolved: ${toJsonString(links)}`,
      );
      assert(
        links.some(
          (link) =>
            link.target?.toString() ===
            `${baseUrl}attachment/69ae3fab9bb449092d0d3f66`,
        ),
        `Attachment web link was not resolved: ${toJsonString(links)}`,
      );
      assert(
        links.every(
          (link) =>
            link.target?.toString() !== "growi:/team/dev/link-doc/guide.md",
        ),
        `Relative link should remain unresolved: ${toJsonString(links)}`,
      );

      const pathOffset = document.getText().indexOf("/team/dev/spec") + 2;
      const pathDefinitions = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        uri,
        document.positionAt(pathOffset),
      );
      assert(Array.isArray(pathDefinitions), "Expected definition results.");
      assert(
        pathDefinitions.some(
          (definition) =>
            definition.targetUri?.toString?.() === "growi:/team/dev/spec.md" ||
            definition.uri?.toString?.() === "growi:/team/dev/spec.md",
        ),
        `Definition provider did not resolve absolute path link: ${toJsonString(pathDefinitions)}`,
      );

      const attachmentOffset =
        document.getText().indexOf("/attachment/69ae3fab9bb449092d0d3f66") + 2;
      const attachmentDefinitions = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        uri,
        document.positionAt(attachmentOffset),
      );
      assert(
        Array.isArray(attachmentDefinitions),
        "Expected attachment definition results.",
      );
      assert(
        attachmentDefinitions.length === 0,
        `Attachment web link should not resolve via definition provider: ${toJsonString(attachmentDefinitions)}`,
      );
    },
  );
  await runCase("path open normalization", async () => {
    await resetStats(adminUrl);
    await vscode.commands.executeCommand(
      "growi.openPage",
      "/team//dev/path-open///",
    );
    const activePath = await getActivePath();
    assert(
      activePath === "/team/dev/path-open.md",
      `Unexpected normalized path: ${activePath}`,
    );
  });

  await runCase("show backlinks detects permalink references", async () => {
    await updateFixture(
      adminUrl,
      PERMALINK_FIXTURE_PAGES.map((page) => ({
        ...page,
        body:
          page.path === "/team/dev/permalink-guide"
            ? `# permalink guide\n\n[to spec](${baseUrl}${PERMALINK_PAGE_ID})`
            : page.body.replace(
                baseUrlPlaceholder(),
                `${baseUrl}${PERMALINK_PAGE_ID}`,
              ),
      })),
    );
    await vscode.commands.executeCommand("growi.addPrefix", "/team/dev");
    await vscode.commands.executeCommand("growi.openPage", "/team/dev/spec");

    await withPatchedQuickPick(
      {
        async pick(items) {
          const guideItem = items.find(
            (item) => item.canonicalPath === "/team/dev/permalink-guide",
          );
          assert(
            Boolean(guideItem),
            `Permalink backlink was not offered: ${toJsonString(items)}`,
          );
          return guideItem;
        },
      },
      async () => {
        await vscode.commands.executeCommand("growi.showBacklinks");
      },
    );

    const activePath = await getActivePath();
    assert(
      activePath === "/team/dev/permalink-guide.md",
      `Backlinks command did not open the permalink source page: ${activePath}`,
    );
  });

  await runCase("invalid input failure", async () => {
    await resetStats(adminUrl);
    const beforePath = await getActivePath();
    await vscode.commands.executeCommand("growi.openPage", "not-a-valid-path");
    const afterPath = await getActivePath();
    assert(
      beforePath === afterPath,
      "Invalid input should keep active editor unchanged.",
    );

    const stats = await getStats(adminUrl);
    assert(
      stats.page === 0 && stats.revision === 0 && stats.list === 0,
      `Invalid input should not call API: ${toJsonString(stats)}`,
    );
  });

  await runCase(
    "refresh current page invalidates only page cache",
    async () => {
      await resetStats(adminUrl);
      const pageUri = vscode.Uri.parse("growi:/cache/page.md");

      await vscode.workspace.openTextDocument(pageUri);
      await vscode.workspace.fs.readFile(pageUri);
      let stats = await getStats(adminUrl);
      assert(
        stats.page === 1 && stats.revision === 1 && stats.list === 0,
        `Initial read should be cached: ${toJsonString(stats)}`,
      );

      await vscode.commands.executeCommand("growi.refreshCurrentPage", pageUri);
      stats = await getStats(adminUrl);
      assert(
        stats.page === 1 && stats.revision === 1,
        `Refresh current page should invalidate cache without listing fetch: ${toJsonString(stats)}`,
      );
      assert(
        stats.list === 0,
        `Refresh current page should not hit listing API: ${toJsonString(stats)}`,
      );

      await vscode.workspace.fs.readFile(pageUri);
      const afterRead = await getStats(adminUrl);
      assert(
        afterRead.page === 2 && afterRead.revision === 2,
        `Read after refresh should re-fetch page content: ${toJsonString(afterRead)}`,
      );
    },
  );

  await runCase("refresh listing invalidates only listing cache", async () => {
    await resetStats(adminUrl);
    const directoryUri = vscode.Uri.parse("growi:/cache/");
    await vscode.workspace.fs.readDirectory(directoryUri);
    await vscode.workspace.fs.readDirectory(directoryUri);

    let stats = await getStats(adminUrl);
    assert(
      stats.list === 1 && stats.page === 0 && stats.revision === 0,
      `Listing cache should dedupe requests: ${toJsonString(stats)}`,
    );

    await vscode.commands.executeCommand("growi.refreshListing", directoryUri);
    stats = await getStats(adminUrl);
    assert(
      stats.list === 2,
      `Refresh listing should re-fetch directory listing: ${toJsonString(stats)}`,
    );
    assert(
      stats.page === 0 && stats.revision === 0,
      `Refresh listing should not fetch page content: ${toJsonString(stats)}`,
    );

    await vscode.workspace.fs.readDirectory(directoryUri);
    const afterRead = await getStats(adminUrl);
    assert(
      afterRead.list === 2,
      `Listing should be cached again: ${toJsonString(afterRead)}`,
    );
  });

  await closeAllEditors();
}

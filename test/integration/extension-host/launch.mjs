import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { startMockGrowiServer } from "../mockGrowiServer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const extensionTestsPath = path.resolve(__dirname, "./run-tests.mjs");
const workspacePath = path.join(os.tmpdir(), "vscode-growifs-integration");
const workspaceFilePath = path.join(
  os.tmpdir(),
  "vscode-growifs-integration.code-workspace",
);
const runtimeRootPath = path.join(os.tmpdir(), "vscode-growifs-runtime");
const runtimeLogPath = path.join(runtimeRootPath, "runtime.jsonl");
const disabledMarketplaceExtensionIds = [
  "GitHub.copilot",
  "GitHub.copilot-chat",
  "github.copilot",
  "github.copilot-chat",
  "ms-vscode.vscode-copilot-vision",
  "ms-vscode.vscode-websearchforcopilot",
];
const extensionHostUserSettings = {
  "chat.agent.enabled": false,
  "chat.agentsControl.enabled": "hidden",
  "chat.commandCenter.enabled": false,
  "chat.detectParticipant.enabled": false,
  "chat.disableAIFeatures": true,
  "chat.extensionTools.enabled": false,
  "chat.growthNotification.enabled": false,
  "chat.mcp.discovery.enabled": false,
  "chat.mcp.enabled": false,
  "chat.signInTitleBar.enabled": false,
  "chat.tips.enabled": false,
  "chat.unifiedAgentsBar.enabled": false,
  "chat.viewProgressBadge.enabled": false,
  "chat.viewSessions.enabled": false,
  disableAICustomizations: true,
  "extensions.autoCheckUpdates": false,
  "extensions.autoUpdate": false,
  "extensions.ignoreRecommendations": true,
  "github.copilot.chat.backgroundAgent.enabled": false,
  "github.copilot.chat.claudeAgent.enabled": false,
  "github.copilot.chat.cloudAgent.enabled": false,
  "github.copilot.chat.enableUserPreferences": false,
  "github.copilot.chat.exploreAgent.enabled": false,
  "github.copilot.chat.githubMcpServer.enabled": false,
  "github.copilot.chat.reviewAgent.enabled": false,
  "github.copilot.enable": { "*": false },
  "window.commandCenter": false,
  "workbench.disableAICustomizations": true,
  "workbench.startupEditor": "none",
};

function createLaunchArgs({ extensionsDirPath, userDataDirPath }) {
  return [
    workspaceFilePath,
    "--extensions-dir",
    extensionsDirPath,
    "--user-data-dir",
    userDataDirPath,
    ...disabledMarketplaceExtensionIds.flatMap((extensionId) => [
      "--disable-extension",
      extensionId,
    ]),
  ];
}

async function writeExtensionHostUserSettings(userDataDirPath) {
  const settingsDirPath = path.join(userDataDirPath, "User");
  await fs.mkdir(settingsDirPath, { recursive: true });
  await fs.writeFile(
    path.join(settingsDirPath, "settings.json"),
    `${JSON.stringify(extensionHostUserSettings, null, 2)}\n`,
    "utf8",
  );
}

async function createTestExtensionRoot() {
  const sourceManifestPath = path.join(repoRoot, "package.json");
  const manifest = JSON.parse(await fs.readFile(sourceManifestPath, "utf8"));

  const vscodeEngine = manifest.engines?.vscode ?? "^1.105.0";
  const testManifest = {
    ...manifest,
    activationEvents: process.env.GROWI_UI_REVIEW_SCENARIO
      ? (manifest.activationEvents ?? []).filter(
          (event) => event !== "onStartupFinished",
        )
      : manifest.activationEvents,
    engines: {
      ...(manifest.engines ?? {}),
      vscode: vscodeEngine,
    },
  };

  const extensionRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscode-growifs-extension-"),
  );

  await fs.writeFile(
    path.join(extensionRoot, "package.json"),
    `${JSON.stringify(testManifest, null, 2)}\n`,
    "utf8",
  );

  await fs.cp(path.join(repoRoot, "dist"), path.join(extensionRoot, "dist"), {
    recursive: true,
  });

  return extensionRoot;
}

async function main() {
  const mockServer = await startMockGrowiServer();
  const extensionDevelopmentPath = await createTestExtensionRoot();
  const extensionsDirPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscode-growifs-extensions-"),
  );
  const userDataDirPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscode-growifs-user-data-"),
  );
  await writeExtensionHostUserSettings(userDataDirPath);
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.mkdir(runtimeRootPath, { recursive: true });
  await fs.writeFile(
    workspaceFilePath,
    `${JSON.stringify(
      {
        folders: [{ path: workspacePath }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const downloadedVSCodePath = await downloadAndUnzipVSCode();
  const vscodeExecutablePath = process.env.GROWI_UI_REVIEW_SCENARIO
    ? downloadedVSCodePath
    : resolveCliPathFromVSCodeExecutablePath(downloadedVSCodePath);

  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        ...process.env,
        GROWI_HOST_TEST_ADMIN_URL: mockServer.adminUrl,
        GROWI_HOST_TEST_BASE_URL: mockServer.baseUrl,
        GROWI_HOST_TEST_TOKEN: mockServer.token,
        GROWI_RUNTIME_MODE: process.env.GROWI_RUNTIME_MODE ?? "debug-f5",
        GROWI_RUNTIME_ROOT: process.env.GROWI_RUNTIME_ROOT ?? runtimeRootPath,
        GROWI_JSONL_PATH: process.env.GROWI_JSONL_PATH ?? runtimeLogPath,
      },
      launchArgs: createLaunchArgs({ extensionsDirPath, userDataDirPath }),
    });
  } finally {
    await mockServer.stop();
    await fs.rm(extensionDevelopmentPath, { recursive: true, force: true });
    await fs.rm(extensionsDirPath, { recursive: true, force: true });
    await fs.rm(userDataDirPath, { recursive: true, force: true });
    await fs.rm(workspaceFilePath, { force: true });
    await fs.rm(runtimeRootPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Failed to launch extension host:", error);
  process.exit(1);
});

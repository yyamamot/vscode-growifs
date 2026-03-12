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

async function createTestExtensionRoot() {
  const sourceManifestPath = path.join(repoRoot, "package.json");
  const manifest = JSON.parse(await fs.readFile(sourceManifestPath, "utf8"));

  const vscodeEngine = manifest.engines?.vscode ?? "^1.105.0";
  const testManifest = {
    ...manifest,
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
  await fs.mkdir(workspacePath, { recursive: true });
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
  const vscodeExecutablePath = resolveCliPathFromVSCodeExecutablePath(
    await downloadAndUnzipVSCode(),
  );

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
      },
      launchArgs: [workspaceFilePath],
    });
  } finally {
    await mockServer.stop();
    await fs.rm(extensionDevelopmentPath, { recursive: true, force: true });
    await fs.rm(workspaceFilePath, { force: true });
  }
}

main().catch((error) => {
  console.error("Failed to launch extension host:", error);
  process.exit(1);
});

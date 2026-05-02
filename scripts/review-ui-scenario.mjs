import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveOutputDir(scenario) {
  if (process.env.GROWI_UI_REVIEW_OUTPUT_DIR) {
    return path.resolve(process.env.GROWI_UI_REVIEW_OUTPUT_DIR);
  }
  const outputRoot = process.env.GROWI_UI_REVIEW_OUTPUT_ROOT
    ? path.resolve(process.env.GROWI_UI_REVIEW_OUTPUT_ROOT)
    : path.join(repoRoot, ".tmp/ui-review-pack", "manual");
  return path.join(outputRoot, "scenarios", scenario.id);
}

function runExtensionHost(scenarioPath, outputDir) {
  const screenshotPath = path.join(outputDir, "screenshots", "screen-1.png");
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "test/integration/extension-host/launch.mjs")],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          GROWI_UI_REVIEW_SCENARIO: scenarioPath,
          GROWI_UI_REVIEW_OUTPUT_DIR: outputDir,
          GROWI_UI_REVIEW_SCREENSHOT_PATH: screenshotPath,
          GROWI_JSONL_PATH: path.join(outputDir, "runtime.jsonl"),
          GROWI_RUNTIME_ROOT: path.join(outputDir, "runtime"),
        },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Extension host exited with signal ${signal}.`
            : `Extension host exited with code ${code}.`,
        ),
      );
    });
  });
}

async function loadEvaluator() {
  const evaluatorPath = path.join(repoRoot, "dist/harness/uiReview.js");
  return await import(pathToFileURL(evaluatorPath).href);
}

async function main() {
  const scenarioArg =
    process.argv[2] ??
    "fixtures/harness/explorer-quickpick-smoke/scenario.json";

  const scenarioPath = path.resolve(repoRoot, scenarioArg);
  const scenario = await readJson(scenarioPath);
  const outputDir = resolveOutputDir(scenario);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "screenshots"), { recursive: true });
  await runExtensionHost(scenarioPath, outputDir);

  const { buildUiReviewPrompt, evaluateUiReviewEvidence } =
    await loadEvaluator();
  const uiState = await readJson(path.join(outputDir, "ui-state.json"));
  const commandTrace = await readJson(
    path.join(outputDir, "command-trace.json"),
  );
  const evaluation = evaluateUiReviewEvidence(
    { uiState, commandTrace, menus: uiState.menus },
    scenario,
  );
  const report = {
    ...evaluation,
    generatedAt: new Date().toISOString(),
    artifactDir: outputDir,
  };
  const artifactFiles = [
    "ui-review-report.json",
    "ui-state.json",
    "ui-geometry.json",
    "command-trace.json",
    "runtime.jsonl",
    "harness.jsonl",
    "workspace-state.json",
    "screenshots/screen-1.png",
    "screenshots/screen-1.capture.json",
    "native-context-menu-report.json",
    "screenshots/native-context-menu-focused-tree-item-shift-f10.png",
    "screenshots/native-context-menu-focused-tree-item-shift-f10.capture.json",
    "screenshots/native-context-menu-focused-tree-item-list-command.png",
    "screenshots/native-context-menu-focused-tree-item-list-command.capture.json",
    "ui-review-prompt.md",
  ].map((fileName) => path.join(outputDir, fileName));

  await writeJson(path.join(outputDir, "ui-review-report.json"), report);
  await fs.writeFile(
    path.join(outputDir, "ui-review-prompt.md"),
    buildUiReviewPrompt({ scenario, report, artifactFiles }),
    "utf8",
  );

  console.log(`ui review scenario: ${scenario.id}`);
  console.log(`ui review scenario artifacts: ${outputDir}`);
  console.log(`ui review scenario result: ${report.result}`);

  if (report.result !== "pass") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

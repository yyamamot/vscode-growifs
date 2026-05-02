import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "fixtures/harness/manifest.json");

function parseArgs(argv) {
  const args = [...argv];
  while (args[0] === "--") {
    args.shift();
  }
  const parsed = {
    scenario: "auto",
    id: "smoke",
    allUiScenarios: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scenario") {
      parsed.scenario = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--id") {
      parsed.id = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--all-ui-scenarios") {
      parsed.allUiScenarios = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.scenario) {
    throw new Error("Missing --scenario value.");
  }
  if (!parsed.id) {
    throw new Error("Missing --id value.");
  }

  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function matchesScenario(entry, alias) {
  return entry.id === alias || (entry.aliases ?? []).includes(alias);
}

function resolveScenario(manifest, alias) {
  const scenario = (manifest.scenarios ?? []).find((entry) =>
    matchesScenario(entry, alias),
  );
  if (!scenario?.path) {
    const available = (manifest.scenarios ?? [])
      .flatMap((entry) => [entry.id, ...(entry.aliases ?? [])])
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Unknown UI review scenario: ${alias}. Available: ${available}`,
    );
  }
  return scenario;
}

function resolveSmokeScenario(manifest) {
  return resolveScenario(manifest, "smoke");
}

function globToRegExp(glob) {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*") {
      if (next === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  source += "$";
  return new RegExp(source);
}

function getChangedFileGlobs(scenario) {
  if (!Array.isArray(scenario.changedFileGlobs)) {
    return [];
  }
  return scenario.changedFileGlobs.filter((glob) => typeof glob === "string");
}

function matchScenarioChangedFiles(scenario, changedFiles) {
  const globs = getChangedFileGlobs(scenario);
  const matches = [];
  for (const glob of globs) {
    const pattern = globToRegExp(glob);
    const files = changedFiles.filter((filePath) => pattern.test(filePath));
    if (files.length > 0) {
      matches.push({ scenarioId: scenario.id, glob, files });
    }
  }
  return matches;
}

function runGitDiffNameOnly() {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "--name-only", "HEAD"], {
      cwd: repoRoot,
      stdio: ["inherit", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(
          stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean),
        );
        return;
      }
      reject(
        new Error(
          signal
            ? `git diff --name-only HEAD exited with signal ${signal}.`
            : `git diff --name-only HEAD exited with code ${code}.`,
        ),
      );
    });
  });
}

async function selectScenarios(manifest, args) {
  if (args.allUiScenarios) {
    return {
      selectedScenarios: manifest.scenarios ?? [],
      selectionMode: "all",
      changedFiles: [],
      matchedAreas: [],
    };
  }

  if (args.scenario !== "auto") {
    const scenario = resolveScenario(manifest, args.scenario);
    return {
      selectedScenarios: [scenario],
      selectionMode: "explicit",
      changedFiles: [],
      matchedAreas: [],
    };
  }

  const changedFiles = await runGitDiffNameOnly();
  const matchedAreas = [];
  const selected = [];
  const selectedIds = new Set();
  for (const scenario of manifest.scenarios ?? []) {
    const matches = matchScenarioChangedFiles(scenario, changedFiles);
    if (matches.length === 0) {
      continue;
    }
    matchedAreas.push(...matches);
    if (!selectedIds.has(scenario.id)) {
      selected.push(scenario);
      selectedIds.add(scenario.id);
    }
  }

  if (selected.length === 0) {
    const smoke = resolveSmokeScenario(manifest);
    selected.push(smoke);
    selectedIds.add(smoke.id);
  }

  return {
    selectedScenarios: selected,
    selectionMode: "auto",
    changedFiles,
    matchedAreas,
  };
}

function runScenario({ scenarioPath, scenarioOutputDir, packDir }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts/review-ui-scenario.mjs"), scenarioPath],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          GROWI_UI_REVIEW_OUTPUT_DIR: scenarioOutputDir,
          GROWI_UI_REVIEW_PACK_DIR: packDir,
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
            ? `Scenario ${scenarioPath} exited with signal ${signal}.`
            : `Scenario ${scenarioPath} exited with code ${code}.`,
        ),
      );
    });
  });
}

async function copyIfExists(sourcePath, targetPath) {
  try {
    await fs.copyFile(sourcePath, targetPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson(manifestPath);
  const selection = await selectScenarios(manifest, args);
  const packDir =
    process.env.GROWI_UI_REVIEW_PACK_DIR ??
    path.join(
      repoRoot,
      ".tmp/ui-review-pack",
      `${createTimestamp()}-${args.id}`,
    );

  await fs.rm(packDir, { recursive: true, force: true });
  await fs.mkdir(path.join(packDir, "screenshots"), { recursive: true });
  const scenarioReports = [];

  for (const scenarioEntry of selection.selectedScenarios) {
    const scenarioPath = path.join("fixtures/harness", scenarioEntry.path);
    const scenarioId = scenarioEntry.id;
    const scenarioOutputDir = path.join(packDir, "scenarios", scenarioId);

    await fs.mkdir(scenarioOutputDir, { recursive: true });

    const scenarioReportPath = path.join(
      scenarioOutputDir,
      "ui-review-report.json",
    );
    let scenarioError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (attempt > 1) {
        await fs.rm(scenarioOutputDir, { recursive: true, force: true });
        await fs.mkdir(scenarioOutputDir, { recursive: true });
      }
      try {
        await runScenario({ scenarioPath, scenarioOutputDir, packDir });
        scenarioError = undefined;
        break;
      } catch (error) {
        scenarioError = error;
        if (await exists(scenarioReportPath)) {
          break;
        }
        if (attempt === 1) {
          console.warn(
            `ui review scenario launch failed for ${scenarioId}; retrying once.`,
          );
        }
      }
    }

    let scenarioReport;
    try {
      scenarioReport = await readJson(scenarioReportPath);
    } catch (error) {
      if (error?.code !== "ENOENT" || !scenarioError) {
        throw error;
      }
      scenarioReport = {
        result: "needs-fix",
        scenarioId,
        generatedAt: new Date().toISOString(),
        artifactDir: scenarioOutputDir,
        checks: [
          {
            pass: false,
            message:
              scenarioError instanceof Error
                ? scenarioError.message
                : String(scenarioError),
          },
        ],
      };
    }
    scenarioReports.push(scenarioReport);

    await copyIfExists(
      path.join(scenarioOutputDir, "screenshots", "screen-1.png"),
      path.join(packDir, "screenshots", `${scenarioId}.png`),
    );
    await copyIfExists(
      path.join(scenarioOutputDir, "screenshots", "screen-1.capture.json"),
      path.join(packDir, "screenshots", `${scenarioId}.capture.json`),
    );
    await copyIfExists(
      path.join(scenarioOutputDir, "native-context-menu-report.json"),
      path.join(
        packDir,
        "screenshots",
        `${scenarioId}.native-context-menu-report.json`,
      ),
    );
    await copyIfExists(
      path.join(
        scenarioOutputDir,
        "screenshots",
        "native-context-menu-focused-tree-item-shift-f10.png",
      ),
      path.join(
        packDir,
        "screenshots",
        `${scenarioId}.native-context-menu.shift-f10.png`,
      ),
    );
    await copyIfExists(
      path.join(
        scenarioOutputDir,
        "screenshots",
        "native-context-menu-focused-tree-item-shift-f10.capture.json",
      ),
      path.join(
        packDir,
        "screenshots",
        `${scenarioId}.native-context-menu.shift-f10.capture.json`,
      ),
    );
    await copyIfExists(
      path.join(
        scenarioOutputDir,
        "screenshots",
        "native-context-menu-focused-tree-item-list-command.png",
      ),
      path.join(
        packDir,
        "screenshots",
        `${scenarioId}.native-context-menu.list-command.png`,
      ),
    );
    await copyIfExists(
      path.join(
        scenarioOutputDir,
        "screenshots",
        "native-context-menu-focused-tree-item-list-command.capture.json",
      ),
      path.join(
        packDir,
        "screenshots",
        `${scenarioId}.native-context-menu.list-command.capture.json`,
      ),
    );
  }

  const nonPassReport = scenarioReports.find(
    (report) => report.result !== "pass",
  );
  const result = scenarioReports.some((report) => report.result === "needs-fix")
    ? "needs-fix"
    : (nonPassReport?.result ?? "pass");
  const firstScenario = selection.selectedScenarios[0];
  const firstScenarioOutputDir = firstScenario
    ? path.join(packDir, "scenarios", firstScenario.id)
    : undefined;
  const rootReport = {
    result,
    id: args.id,
    scenario: args.scenario,
    scenarioId: firstScenario?.id,
    selectedScenarios: selection.selectedScenarios.map(
      (scenario) => scenario.id,
    ),
    selectedScenarioDetails: selection.selectedScenarios.map((scenario) => ({
      id: scenario.id,
      aliases: scenario.aliases ?? [],
      path: scenario.path,
    })),
    selectionMode: selection.selectionMode,
    changedFiles: selection.changedFiles,
    matchedAreas: selection.matchedAreas,
    generatedAt: new Date().toISOString(),
    scenarios: scenarioReports,
  };

  await writeJson(path.join(packDir, "ui-review-report.json"), rootReport);
  if (firstScenarioOutputDir) {
    await copyIfExists(
      path.join(firstScenarioOutputDir, "ui-state.json"),
      path.join(packDir, "ui-state.json"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "ui-geometry.json"),
      path.join(packDir, "ui-geometry.json"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "command-trace.json"),
      path.join(packDir, "command-trace.json"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "workspace-state.json"),
      path.join(packDir, "workspace-state.json"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "runtime.jsonl"),
      path.join(packDir, "runtime.jsonl"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "harness.jsonl"),
      path.join(packDir, "harness.jsonl"),
    );
    await copyIfExists(
      path.join(firstScenarioOutputDir, "ui-review-prompt.md"),
      path.join(packDir, "ui-review-prompt.md"),
    );
  }

  console.log(`ui review pack: ${packDir}`);
  console.log(`ui review result: ${rootReport.result}`);

  if (rootReport.result !== "pass") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

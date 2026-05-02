import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: options.captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout });
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited with signal ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code}.`,
        ),
      );
    });
  });
}

function parsePackPath(stdout) {
  const match = stdout.match(/^ui review pack: (.+)$/m);
  if (!match) {
    throw new Error("review:ui:feature did not print a ui review pack path.");
  }
  return match[1].trim();
}

async function main() {
  const passthroughArgs = process.argv.slice(2);
  while (passthroughArgs[0] === "--") {
    passthroughArgs.shift();
  }
  const hasScenarioSelection = passthroughArgs.some(
    (arg) => arg === "--scenario" || arg === "--all-ui-scenarios",
  );
  if (!hasScenarioSelection) {
    passthroughArgs.push("--scenario", "auto");
  }
  await run("pnpm", [
    "run",
    "test:unit",
    "--",
    "test/unit/uiReview.test.ts",
    "test/unit/projectConfig.test.ts",
  ]);
  await run("pnpm", ["run", "test:integration:host"]);
  const review = await run(
    "pnpm",
    ["run", "review:ui:feature", "--", ...passthroughArgs],
    { captureStdout: true },
  );
  const packPath = parsePackPath(review.stdout);
  const reportPath = path.join(packPath, "ui-review-report.json");
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));

  if (report.result !== "pass") {
    throw new Error(
      `UI review gate failed: ${report.result}. See ${reportPath}`,
    );
  }

  console.log(`verify:ui-change result: ${report.result}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

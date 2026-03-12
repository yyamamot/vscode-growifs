import fs from "node:fs";
import path from "node:path";

const requiredEnv = ["GROWI_BASE_URL", "GROWI_API_TOKEN"];

function parseDotEnv(text) {
  const result = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadDotEnvIfNeeded() {
  const missingBeforeLoad = requiredEnv.filter((name) => !process.env[name]);
  if (missingBeforeLoad.length === 0) {
    return;
  }

  const dotenvPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(dotenvPath)) {
    return;
  }

  const parsed = parseDotEnv(fs.readFileSync(dotenvPath, "utf8"));
  for (const name of missingBeforeLoad) {
    const value = parsed[name];
    if (typeof value === "string" && value.length > 0) {
      process.env[name] = value;
    }
  }
}

function normalizeBaseUrl(input) {
  return input.replace(/\/+$/, "");
}

function classifyResponse(response) {
  if (response.status === 401) {
    return "AuthenticationFailed";
  }

  if (response.status === 403) {
    return "PermissionDenied";
  }

  if (response.status === 404 || response.status === 405) {
    return "ApiUnsupported";
  }

  if (response.status >= 500) {
    return "ServerError";
  }

  return "Ok";
}

async function fetchJson(baseUrl, token, path) {
  const url = new URL(path, `${baseUrl}/`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
  });

  const location = response.headers.get("location");
  const contentType = response.headers.get("content-type") ?? "";
  const classification = classifyResponse(response);

  if (
    response.status >= 300 &&
    response.status < 400 &&
    location?.includes("/login")
  ) {
    return {
      classification: "ApiUnsupported",
      status: response.status,
      path,
      detail: "Redirected to /login",
    };
  }

  if (classification !== "Ok") {
    return {
      classification,
      status: response.status,
      path,
      detail: `HTTP ${response.status}`,
    };
  }

  if (!contentType.includes("application/json")) {
    return {
      classification: "ApiUnsupported",
      status: response.status,
      path,
      detail: `Non-JSON response: ${contentType || "unknown"}`,
    };
  }

  await response.json();

  return {
    classification: "Ok",
    status: response.status,
    path,
    detail: "JSON response received",
  };
}

loadDotEnvIfNeeded();

const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(
    [
      "Integration bootstrap requires local environment variables.",
      `Missing environment variables: ${missing.join(", ")}`,
      "Set them in the environment or .env based on .env.example and rerun pnpm run test:integration.",
    ].join("\n"),
  );
  process.exit(1);
}

const baseUrl = normalizeBaseUrl(process.env.GROWI_BASE_URL);
const token = process.env.GROWI_API_TOKEN;

const checks = [
  "/_api/v3/page?path=/",
  "/_api/v3/pages/list?path=/&limit=1&page=1",
];

async function main() {
  console.log("Integration bootstrap: Docker GROWI connectivity check");
  console.log(`Base URL: ${baseUrl}`);

  let hasFailure = false;

  for (const path of checks) {
    try {
      const result = await fetchJson(baseUrl, token, path);
      console.log(
        `[${result.classification}] ${path} -> ${result.detail} (status: ${result.status})`,
      );

      if (result.classification !== "Ok") {
        hasFailure = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[ConnectionFailed] ${path} -> ${message}`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

await main();

#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

const [englishBundle, japaneseBundle, packageJson, packageNls, packageNlsJa] =
  await Promise.all([
    readJson(join(root, "l10n", "bundle.l10n.json")),
    readJson(join(root, "l10n", "bundle.l10n.ja.json")),
    readJson(join(root, "package.json")),
    readJson(join(root, "package.nls.json")),
    readJson(join(root, "package.nls.ja.json")),
  ]);

assertSameKeys(
  "l10n/bundle.l10n.json",
  englishBundle,
  "l10n/bundle.l10n.ja.json",
  japaneseBundle,
);
assertPackageNls(packageJson, packageNls, packageNlsJa);

const extensionFiles = [
  ...(await listTypeScriptFiles(join(root, "src", "vscode"))),
  join(root, "src", "extension.ts"),
];
const extensionSources = await Promise.all(
  extensionFiles.map(async (file) => await readFile(file, "utf8")),
);
assertNoJapaneseSourceText(extensionFiles, extensionSources);
const l10nKeys = Array.from(
  new Set(extensionSources.flatMap(extractL10nLiteralKeys)),
).sort();

assertKeysPresent("l10n/bundle.l10n.json", englishBundle, l10nKeys);
assertKeysPresent("l10n/bundle.l10n.ja.json", japaneseBundle, l10nKeys);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`l10n check failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `l10n check passed: ${l10nKeys.length} extension strings, ${Object.keys(englishBundle).length} bundle entries.`,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat().sort();
}

function extractL10nLiteralKeys(source) {
  const keys = [];
  const regexes = [
    /vscode\.l10n\.t\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    /localize\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
  ];
  for (const regex of regexes) {
    let match = regex.exec(source);
    while (match !== null) {
      const raw = match[2] ?? "";
      keys.push(raw.replace(/\\(["'`\\])/g, "$1"));
      match = regex.exec(source);
    }
  }
  return keys;
}

function assertSameKeys(leftName, left, rightName, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  const missingRight = leftKeys.filter((key) => right[key] === undefined);
  const missingLeft = rightKeys.filter((key) => left[key] === undefined);
  if (missingRight.length > 0) {
    failures.push(
      `${rightName} is missing keys from ${leftName}: ${missingRight.join(", ")}`,
    );
  }
  if (missingLeft.length > 0) {
    failures.push(
      `${leftName} is missing keys from ${rightName}: ${missingLeft.join(", ")}`,
    );
  }
}

function collectPackagePlaceholderKeys(manifest) {
  const keys = [];
  for (const command of manifest.contributes?.commands ?? []) {
    collectPlaceholderKey(
      keys,
      `command ${command.command} title`,
      command.title,
    );
    if (command.shortTitle !== undefined) {
      collectPlaceholderKey(
        keys,
        `command ${command.command} shortTitle`,
        command.shortTitle,
      );
    }
  }
  for (const [index, welcome] of (
    manifest.contributes?.viewsWelcome ?? []
  ).entries()) {
    collectPlaceholderKey(
      keys,
      `viewsWelcome[${index}] contents`,
      welcome.contents,
    );
  }
  collectPlaceholderKey(
    keys,
    "configuration title",
    manifest.contributes?.configuration?.title,
  );
  for (const [name, property] of Object.entries(
    manifest.contributes?.configuration?.properties ?? {},
  )) {
    if (property?.markdownDescription !== undefined) {
      collectPlaceholderKey(
        keys,
        `configuration ${name} markdownDescription`,
        property.markdownDescription,
      );
    }
  }
  return keys;
}

function collectPlaceholderKey(keys, label, value) {
  const text = value ?? "";
  const match = /^%(.+)%$/.exec(text);
  if (!match) {
    failures.push(`${label} must be an NLS placeholder, actual=${text}`);
    return;
  }
  keys.push(match[1]);
}

function assertPackageNls(manifest, english, japanese) {
  if (manifest.l10n !== "./l10n") {
    failures.push(
      `package.json l10n must be ./l10n, actual=${String(manifest.l10n)}`,
    );
  }
  const keys = collectPackagePlaceholderKeys(manifest);
  assertSameKeys("package.nls.json", english, "package.nls.ja.json", japanese);
  assertKeysPresent("package.nls.json", english, keys);
  assertKeysPresent("package.nls.ja.json", japanese, keys);
}

function assertKeysPresent(name, object, keys) {
  const missing = keys.filter((key) => object[key] === undefined);
  if (missing.length > 0) {
    failures.push(`${name} is missing keys: ${missing.join(", ")}`);
  }
}

function assertNoJapaneseSourceText(files, sources) {
  const japaneseCharacter =
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  for (const [index, source] of sources.entries()) {
    if (!japaneseCharacter.test(source)) {
      continue;
    }
    failures.push(`${files[index]} contains Japanese source text`);
  }
}

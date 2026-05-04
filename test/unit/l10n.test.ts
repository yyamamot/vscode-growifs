import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
    .sort();
}

function extractL10nLiteralKeys(source: string): string[] {
  const keys: string[] = [];
  const regexes = [
    /vscode\.l10n\.t\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    /localize\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
  ];
  for (const regex of regexes) {
    let match: RegExpExecArray | null = regex.exec(source);
    while (match !== null) {
      keys.push((match[2] ?? "").replace(/\\(["'`\\])/g, "$1"));
      match = regex.exec(source);
    }
  }
  return keys;
}

function runtimeL10nKeys(): string[] {
  const files = [
    ...listTypeScriptFiles(join(root, "src", "vscode")),
    join(root, "src", "extension.ts"),
  ];
  return Array.from(
    new Set(
      files.flatMap((file) =>
        extractL10nLiteralKeys(readFileSync(file, "utf8")),
      ),
    ),
  ).sort();
}

describe("l10n resources", () => {
  it("covers package contribution placeholders in both package NLS files", () => {
    const manifest = readJson("package.json") as {
      l10n?: string;
      contributes?: {
        commands?: Array<{
          command?: string;
          shortTitle?: string;
          title?: string;
        }>;
        configuration?: {
          properties?: Record<string, { markdownDescription?: string }>;
          title?: string;
        };
        viewsWelcome?: Array<{ contents?: string }>;
      };
    };
    const english = readJson("package.nls.json");
    const japanese = readJson("package.nls.ja.json");
    const keys = collectPackagePlaceholderKeys(manifest);

    expect(manifest.l10n).toBe("./l10n");
    expect(Object.keys(english).sort()).toEqual(Object.keys(japanese).sort());
    expect(keys.filter((key) => english[key] === undefined)).toEqual([]);
    expect(keys.filter((key) => japanese[key] === undefined)).toEqual([]);
  });

  it("keeps runtime bundle key sets in parity", () => {
    const english = readJson("l10n/bundle.l10n.json");
    const japanese = readJson("l10n/bundle.l10n.ja.json");

    expect(Object.keys(english).sort()).toEqual(Object.keys(japanese).sort());
  });

  it("keeps English runtime bundle values free of Japanese UI text", () => {
    const english = readJson("l10n/bundle.l10n.json");
    const japaneseCharacter =
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

    expect(
      Object.values(english).filter(
        (value): value is string =>
          typeof value === "string" && japaneseCharacter.test(value),
      ),
    ).toEqual([]);
  });

  it("keeps runtime source files free of Japanese UI text", () => {
    const japaneseCharacter =
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
    const offenders = runtimeSourceFiles().filter((file) =>
      japaneseCharacter.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("covers runtime localize literals in both bundles", () => {
    const english = readJson("l10n/bundle.l10n.json");
    const japanese = readJson("l10n/bundle.l10n.ja.json");
    const keys = runtimeL10nKeys();

    expect(keys.filter((key) => english[key] === undefined)).toEqual([]);
    expect(keys.filter((key) => japanese[key] === undefined)).toEqual([]);
  });
});

function runtimeSourceFiles(): string[] {
  return [
    ...listTypeScriptFiles(join(root, "src", "vscode")),
    join(root, "src", "extension.ts"),
  ];
}

function collectPackagePlaceholderKeys(manifest: {
  contributes?: {
    commands?: Array<{ shortTitle?: string; title?: string }>;
    configuration?: {
      properties?: Record<string, { markdownDescription?: string }>;
      title?: string;
    };
    viewsWelcome?: Array<{ contents?: string }>;
  };
}): string[] {
  const values = [
    ...(manifest.contributes?.commands ?? []).flatMap((command) => [
      command.title,
      command.shortTitle,
    ]),
    ...(manifest.contributes?.viewsWelcome ?? []).map(
      (welcome) => welcome.contents,
    ),
    manifest.contributes?.configuration?.title,
    ...Object.values(manifest.contributes?.configuration?.properties ?? {}).map(
      (property) => property.markdownDescription,
    ),
  ];
  return values
    .filter((value): value is string => value !== undefined)
    .map((value) => {
      const match = /^%(.+)%$/.exec(value);
      expect(match?.[1]).toBeDefined();
      return match?.[1] ?? "";
    });
}

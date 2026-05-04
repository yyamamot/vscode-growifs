import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  GROWI_SKILL_PACK_FILES,
  type LlmPromptUiLabels,
  renderDoNotEditFile,
  renderEditableFiles,
  renderPromptWithOptions,
  renderTaskFile,
} from "./llmSkillPackTemplates";
import {
  MIRROR_MANIFEST_NAME,
  MIRROR_ROOT_DIR,
  parseMirrorManifest,
} from "./localRoundTrip";

export interface LlmSkillPackInstallResult {
  files: string[];
}

export interface LlmEditSessionResult {
  files: string[];
  editableFiles: string[];
  promptPath: string;
  manifestFound: boolean;
}

export interface LlmGitignoreResult {
  missingEntries: string[];
  updated: boolean;
  path: string;
}

const AGENT_PROMPT_DIR = path.join(".growi-agent", "prompt", "current");
const GITIGNORE_ENTRIES = [".growi-mirrors/", ".growi-agent/"] as const;

export async function installLlmSkillPack(
  workspaceRoot: string,
): Promise<LlmSkillPackInstallResult> {
  const written: string[] = [];
  for (const file of GROWI_SKILL_PACK_FILES) {
    const absolutePath = path.join(workspaceRoot, file.relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    written.push(file.relativePath);
  }
  return { files: written };
}

export async function startLlmEditSession(
  workspaceRoot: string,
  options: {
    gitignoreWarning?: string;
    taskText?: string;
    uiLabels?: LlmPromptUiLabels;
  } = {},
): Promise<LlmEditSessionResult> {
  const { editableFiles, manifestFound } =
    await collectEditableFiles(workspaceRoot);
  const files = [
    {
      relativePath: path.join(AGENT_PROMPT_DIR, "task.md"),
      content: renderTaskFile(options.taskText),
    },
    {
      relativePath: path.join(AGENT_PROMPT_DIR, "editable-files.txt"),
      content: renderEditableFiles(editableFiles),
    },
    {
      relativePath: path.join(AGENT_PROMPT_DIR, "do-not-edit.txt"),
      content: renderDoNotEditFile(),
    },
    {
      relativePath: path.join(AGENT_PROMPT_DIR, "prompt.md"),
      content: renderPromptWithOptions({
        files: editableFiles,
        gitignoreWarning: options.gitignoreWarning,
        uiLabels: options.uiLabels,
      }),
    },
  ];

  const written: string[] = [];
  for (const file of files) {
    const absolutePath = path.join(workspaceRoot, file.relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    written.push(file.relativePath);
  }

  return {
    files: written,
    editableFiles,
    promptPath: path.join(AGENT_PROMPT_DIR, "prompt.md"),
    manifestFound,
  };
}

export async function readCurrentLlmPrompt(
  workspaceRoot: string,
): Promise<string> {
  return readFile(
    path.join(workspaceRoot, AGENT_PROMPT_DIR, "prompt.md"),
    "utf8",
  );
}

export function formatGitignoreWarning(
  result: LlmGitignoreResult,
): string | undefined {
  if (result.missingEntries.length === 0 || result.updated) {
    return undefined;
  }
  return `.gitignore does not include ${result.missingEntries.join(", ")}. Do not commit local mirror or LLM agent artifacts.`;
}

export async function ensureLlmGitignoreEntries(
  workspaceRoot: string,
  shouldUpdate: boolean,
): Promise<LlmGitignoreResult> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const missingEntries = GITIGNORE_ENTRIES.filter(
    (entry) => !lines.includes(entry),
  );
  if (missingEntries.length === 0) {
    return {
      missingEntries: [],
      updated: false,
      path: ".gitignore",
    };
  }
  if (!shouldUpdate) {
    return {
      missingEntries: [...missingEntries],
      updated: false,
      path: ".gitignore",
    };
  }

  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const block = [
    "# GROWI local mirror and LLM agent artifacts",
    ...missingEntries,
  ].join("\n");
  await writeFile(gitignorePath, `${content}${prefix}${block}\n`, "utf8");
  return {
    missingEntries: [...missingEntries],
    updated: true,
    path: ".gitignore",
  };
}

async function collectEditableFiles(
  workspaceRoot: string,
): Promise<{ editableFiles: string[]; manifestFound: boolean }> {
  const manifestPaths = await findMirrorManifestPaths(workspaceRoot);
  const editableCandidates: string[] = [];

  for (const manifestPath of manifestPaths) {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = parseMirrorManifest(raw);
    if (!parsed.ok) {
      continue;
    }
    const manifestDirectory = path.dirname(manifestPath);
    for (const page of parsed.value.pages) {
      const localPath = normalizeEditableManifestPath(
        workspaceRoot,
        manifestDirectory,
        page.relativeFilePath,
      );
      if (localPath) {
        editableCandidates.push(localPath);
      }
    }
  }

  const editableFiles = (
    await Promise.all(
      editableCandidates.map(async (localPath) => {
        const absolutePath = path.join(workspaceRoot, localPath);
        return (await isFile(absolutePath)) ? localPath : undefined;
      }),
    )
  )
    .filter((localPath): localPath is string => Boolean(localPath))
    .sort((left, right) => left.localeCompare(right));

  return {
    editableFiles: [...new Set(editableFiles)],
    manifestFound: manifestPaths.length > 0,
  };
}

async function findMirrorManifestPaths(
  workspaceRoot: string,
): Promise<string[]> {
  const mirrorRoot = path.join(workspaceRoot, MIRROR_ROOT_DIR);
  if (!(await fileExists(mirrorRoot))) {
    return [];
  }
  const result: string[] = [];
  await collectManifestPaths(mirrorRoot, result);
  return result.sort((left, right) => left.localeCompare(right));
}

async function collectManifestPaths(
  directory: string,
  result: string[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectManifestPaths(entryPath, result);
      continue;
    }
    if (entry.isFile() && entry.name === MIRROR_MANIFEST_NAME) {
      result.push(entryPath);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function normalizeEditableManifestPath(
  workspaceRoot: string,
  manifestDirectory: string,
  relativeFilePath: string,
): string | undefined {
  if (path.isAbsolute(relativeFilePath) || !relativeFilePath.endsWith(".md")) {
    return undefined;
  }

  const absolutePath = path.resolve(
    manifestDirectory,
    ...relativeFilePath.split("/"),
  );
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized.startsWith(`${MIRROR_ROOT_DIR}/`)) {
    return undefined;
  }
  return normalized;
}

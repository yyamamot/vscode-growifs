import * as assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  createLlmLocalMirrorDiffContext,
  readCurrentLlmLocalMirrorDiffPrompt,
} from "../../src/vscode/llmDiffContextService";
import {
  ensureLlmGitignoreEntries,
  formatGitignoreWarning,
  installLlmSkillPack,
  readCurrentLlmPrompt,
  startLlmEditSession,
} from "../../src/vscode/llmSkillPackService";
import { serializeMirrorManifest } from "../../src/vscode/localRoundTrip";
import type { MirrorCompareScmResource } from "../../src/vscode/mirror/mirrorCompareScm";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "growifs-llm-skill-"));
  tempDirs.push(dir);
  return dir;
}

async function writeManifest(
  workspaceRoot: string,
  manifestDir: string,
  pages: Array<{ canonicalPath: string; relativeFilePath: string }>,
): Promise<string> {
  const absoluteDir = path.join(workspaceRoot, manifestDir);
  await mkdir(absoluteDir, { recursive: true });
  const manifestPath = path.join(absoluteDir, ".growi-mirror.json");
  await writeFile(
    manifestPath,
    serializeMirrorManifest({
      version: 1,
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/team",
      mode: "prefix",
      exportedAt: "2026-05-03T00:00:00.000Z",
      pages: pages.map((page, index) => ({
        canonicalPath: page.canonicalPath,
        relativeFilePath: page.relativeFilePath,
        pageId: `page-${index}`,
        baseRevisionId: `revision-${index}`,
        exportedAt: "2026-05-03T00:00:00.000Z",
        contentHash: `hash-${index}`,
      })),
    }),
    "utf8",
  );
  return manifestPath;
}

function resource(input: {
  workspaceRoot: string;
  canonicalPath: string;
  status: MirrorCompareScmResource["status"];
  relativePath?: string;
}): MirrorCompareScmResource {
  const relativePath =
    input.relativePath ??
    path.join(
      ".growi-mirrors",
      "growi.example.com",
      "team",
      `${input.canonicalPath.replace(/^\/+/, "").replace(/\//g, "_")}.md`,
    );
  const localPath = path.join(input.workspaceRoot, relativePath);
  return {
    canonicalPath: input.canonicalPath,
    status: input.status,
    localFileUri: { scheme: "file", path: localPath, fsPath: localPath },
    remoteUri: {
      scheme: "growi-diff",
      path: `/mirror-remote${input.canonicalPath}`,
    },
  };
}

describe("llmSkillPackService", () => {
  it("installs GROWI local mirror skills without touching AGENTS.md", async () => {
    const workspaceRoot = await createWorkspace();
    const agentsPath = path.join(workspaceRoot, "AGENTS.md");
    await writeFile(agentsPath, "# Existing Instructions\n", "utf8");

    const result = await installLlmSkillPack(workspaceRoot);

    assert.deepEqual(result.files, [
      ".agents/skills/growi-local-mirror-prompt/SKILL.md",
      ".agents/skills/growi-local-mirror-prompt/agents/openai.yaml",
      ".agents/skills/growi-local-mirror-prompt/agents/generic.md",
      ".agents/skills/growi-local-mirror-diff/SKILL.md",
      ".agents/skills/growi-local-mirror-diff/agents/openai.yaml",
      ".agents/skills/growi-local-mirror-diff/agents/generic.md",
    ]);
    await assert.rejects(
      readFile(
        path.join(
          workspaceRoot,
          ".agents",
          "skills",
          "growi-local-mirror-prompt",
          "README.md",
        ),
        "utf8",
      ),
      /ENOENT/,
    );
    await assert.rejects(
      readFile(
        path.join(
          workspaceRoot,
          ".agents",
          "skills",
          "growi-local-mirror-prompt",
          "safety.md",
        ),
        "utf8",
      ),
      /ENOENT/,
    );
    await assert.rejects(
      readFile(
        path.join(
          workspaceRoot,
          ".agents",
          "skills",
          "growi-local-mirror-review-pack",
          "SKILL.md",
        ),
        "utf8",
      ),
      /ENOENT/,
    );
    assert.equal(
      await readFile(agentsPath, "utf8"),
      "# Existing Instructions\n",
    );

    const skill = await readFile(
      path.join(
        workspaceRoot,
        ".agents",
        "skills",
        "growi-local-mirror-prompt",
        "SKILL.md",
      ),
      "utf8",
    );
    assert.match(skill, /^---\nname: growi-local-mirror-prompt\n/m);
    assert.match(skill, /GROWI local mirror Markdown/);
    assert.match(
      skill,
      /`\.growi-agent\/prompt\/current\/editable-files\.txt`/,
    );
    assert.match(skill, /You, the LLM, must not read or edit any manifest/);
    assert.match(skill, /Do not call GROWI APIs/);
    assert.match(skill, /Do not run SCM commands/);
    assert.match(
      skill,
      /Do not run upload, take remote, or remote apply commands/,
    );
    assert.match(skill, /Do not run the GROWI apply command/);
    assert.doesNotMatch(skill, /Kiwi|kiwifs|\.kiwi/);

    const openaiYaml = await readFile(
      path.join(
        workspaceRoot,
        ".agents",
        "skills",
        "growi-local-mirror-prompt",
        "agents",
        "openai.yaml",
      ),
      "utf8",
    );
    assert.match(openaiYaml, /display_name: "GROWI Local Mirror Prompt"/);
    assert.match(
      openaiYaml,
      /default_prompt: "Use \$growi-local-mirror-prompt/,
    );
    assert.match(openaiYaml, /allow_implicit_invocation: false/);

    const diffSkill = await readFile(
      path.join(
        workspaceRoot,
        ".agents",
        "skills",
        "growi-local-mirror-diff",
        "SKILL.md",
      ),
      "utf8",
    );
    assert.match(diffSkill, /^---\nname: growi-local-mirror-diff\n/m);
    assert.match(diffSkill, /\.growi-agent\/diff\/current\/scm-state\.json/);
    assert.match(diffSkill, /\.growi-agent\/diff\/current\/diffs\/\*\.patch/);
    assert.match(diffSkill, /Do not inspect workspace files to compensate/);
    assert.match(diffSkill, /Do not edit any file/);
    assert.match(diffSkill, /Do not run the Take Remote command/);
    assert.doesNotMatch(diffSkill, /Kiwi|kiwifs|\.kiwi/);
  });

  it("creates a current prompt from valid manifest pages with existing Markdown files only", async () => {
    const workspaceRoot = await createWorkspace();
    const mirrorDir = path.join(".growi-mirrors", "growi.example.com", "team");
    await writeManifest(workspaceRoot, mirrorDir, [
      { canonicalPath: "/team/home", relativeFilePath: "home.md" },
      { canonicalPath: "/team/missing", relativeFilePath: "missing.md" },
      { canonicalPath: "/team/json", relativeFilePath: "data.json" },
      { canonicalPath: "/team/outside", relativeFilePath: "../../outside.md" },
    ]);
    await writeFile(
      path.join(
        workspaceRoot,
        ".growi-mirrors",
        "invalid",
        ".growi-mirror.json",
      ),
      "{ invalid json",
      "utf8",
    ).catch(async () => {
      await mkdir(path.join(workspaceRoot, ".growi-mirrors", "invalid"), {
        recursive: true,
      });
      await writeFile(
        path.join(
          workspaceRoot,
          ".growi-mirrors",
          "invalid",
          ".growi-mirror.json",
        ),
        "{ invalid json",
        "utf8",
      );
    });
    const existingEditablePath = path.join(workspaceRoot, mirrorDir, "home.md");
    await mkdir(path.dirname(existingEditablePath), { recursive: true });
    await writeFile(existingEditablePath, "Existing page body\n", "utf8");

    const result = await startLlmEditSession(workspaceRoot, {
      taskText: "Improve the mirrored GROWI pages.",
      uiLabels: {
        growiApply: "GROWI\u306b\u53cd\u6620",
        takeRemote: "Take Remote Changes",
      },
    });

    assert.equal(result.manifestFound, true);
    assert.deepEqual(result.editableFiles, [
      ".growi-mirrors/growi.example.com/team/home.md",
    ]);
    assert.deepEqual(result.files, [
      path.join(".growi-agent", "prompt", "current", "task.md"),
      path.join(".growi-agent", "prompt", "current", "editable-files.txt"),
      path.join(".growi-agent", "prompt", "current", "do-not-edit.txt"),
      path.join(".growi-agent", "prompt", "current", "prompt.md"),
    ]);

    const editable = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "prompt",
        "current",
        "editable-files.txt",
      ),
      "utf8",
    );
    assert.match(
      editable,
      /\.growi-mirrors\/growi\.example\.com\/team\/home\.md/,
    );
    assert.doesNotMatch(editable, /missing\.md/);
    assert.doesNotMatch(editable, /data\.json/);
    assert.doesNotMatch(editable, /\.growi-mirror\.json/);

    const doNotEdit = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "prompt",
        "current",
        "do-not-edit.txt",
      ),
      "utf8",
    );
    assert.match(doNotEdit, /\.growi-mirrors\/\*\*\/\.growi-mirror\.json/);
    assert.match(
      doNotEdit,
      /\.agents\/skills\/growi-local-mirror-prompt\/\*\*/,
    );
    assert.match(doNotEdit, /\.growi-agent\/\*\*/);

    const prompt = await readCurrentLlmPrompt(workspaceRoot);
    assert.match(prompt, /\$growi-local-mirror-prompt/);
    assert.match(
      prompt,
      /Do not read or edit \.growi-mirrors\/\*\*\/\.growi-mirror\.json/,
    );
    assert.match(
      prompt,
      /Do not call GROWI APIs, SCM commands, upload commands/,
    );
    assert.match(
      prompt,
      /Do not run the GROWI apply command, including the current UI command label `GROWIに反映`/,
    );
    assert.match(prompt, /Do not run the Take Remote command/);
    assert.doesNotMatch(prompt, /Kiwi|kiwifs|\.kiwi/);
  });

  it("creates an empty prompt when no local mirror manifest is found", async () => {
    const workspaceRoot = await createWorkspace();

    const result = await startLlmEditSession(workspaceRoot);

    assert.equal(result.manifestFound, false);
    assert.deepEqual(result.editableFiles, []);
    const prompt = await readCurrentLlmPrompt(workspaceRoot);
    assert.match(
      prompt,
      /\.agents\/skills\/growi-local-mirror-prompt\/SKILL\.md/,
    );
    assert.match(prompt, /No editable files are listed/);
    assert.match(prompt, /create or refresh a local mirror first/);
  });

  it("updates gitignore with only local mirror and agent artifact entries", async () => {
    const workspaceRoot = await createWorkspace();
    await writeFile(
      path.join(workspaceRoot, ".gitignore"),
      "dist/\n.growi-mirrors/\n",
      "utf8",
    );

    const result = await ensureLlmGitignoreEntries(workspaceRoot, true);

    assert.deepEqual(result, {
      missingEntries: [".growi-agent/"],
      updated: true,
      path: ".gitignore",
    });
    const gitignore = await readFile(
      path.join(workspaceRoot, ".gitignore"),
      "utf8",
    );
    assert.match(gitignore, /^\.growi-mirrors\/$/m);
    assert.match(gitignore, /^\.growi-agent\/$/m);
    assert.doesNotMatch(
      gitignore,
      /^\.agents\/skills\/growi-local-mirror-prompt\/$/m,
    );

    const second = await ensureLlmGitignoreEntries(workspaceRoot, true);
    assert.deepEqual(second, {
      missingEntries: [],
      updated: false,
      path: ".gitignore",
    });
    assert.equal(
      await readFile(path.join(workspaceRoot, ".gitignore"), "utf8"),
      gitignore,
    );
  });

  it("keeps generating prompt artifacts with warning when gitignore update is skipped", async () => {
    const workspaceRoot = await createWorkspace();

    const gitignoreResult = await ensureLlmGitignoreEntries(
      workspaceRoot,
      false,
    );
    const warning = formatGitignoreWarning(gitignoreResult);
    const session = await startLlmEditSession(workspaceRoot, {
      gitignoreWarning: warning,
    });

    assert.deepEqual(gitignoreResult.missingEntries, [
      ".growi-mirrors/",
      ".growi-agent/",
    ]);
    assert.equal(gitignoreResult.updated, false);
    assert.equal(session.files.length, 4);
    assert.match(
      warning ?? "",
      /\.gitignore does not include \.growi-mirrors\/, \.growi-agent\//,
    );
    const prompt = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "prompt",
        "current",
        "prompt.md",
      ),
      "utf8",
    );
    assert.match(
      prompt,
      /\.gitignore does not include \.growi-mirrors\/, \.growi-agent\//,
    );
  });
});

describe("llmDiffContextService", () => {
  it("fails when SCM state is missing", async () => {
    const workspaceRoot = await createWorkspace();

    await assert.rejects(
      createLlmLocalMirrorDiffContext(workspaceRoot, undefined),
      /No local mirror SCM snapshot/,
    );
  });

  it("creates diff context artifacts from mirror compare SCM resources", async () => {
    const workspaceRoot = await createWorkspace();
    const resources = [
      resource({
        workspaceRoot,
        canonicalPath: "/team/home",
        status: "LocalChanged",
      }),
      resource({
        workspaceRoot,
        canonicalPath: "/team/remote",
        status: "RemoteChanged",
      }),
      resource({
        workspaceRoot,
        canonicalPath: "/team/conflict",
        status: "Conflict",
      }),
    ];

    const result = await createLlmLocalMirrorDiffContext(
      workspaceRoot,
      {
        currentCanonicalPath: "/team",
        targetScope: "subtree",
        resources,
      },
      {
        now: new Date("2026-05-03T00:00:00.000Z"),
        readResourceText: async (scmResource, side) =>
          side === "remote"
            ? `# Remote ${scmResource.canonicalPath}\n`
            : `# Local ${scmResource.canonicalPath}\n`,
      },
    );

    assert.equal(result.resourceCount, 3);
    assert.equal(
      result.promptPath,
      path.join(".growi-agent", "diff", "current", "prompt.md"),
    );
    assert.ok(
      result.files.includes(
        path.join(
          ".growi-agent",
          "diff",
          "current",
          "diffs",
          "001-team_home.patch",
        ),
      ),
    );

    const scmState = JSON.parse(
      await readFile(
        path.join(
          workspaceRoot,
          ".growi-agent",
          "diff",
          "current",
          "scm-state.json",
        ),
        "utf8",
      ),
    ) as {
      currentCanonicalPath: string;
      targetScope: string;
      resources: Array<{
        canonicalPath: string;
        status: string;
        changedFile?: string;
        patchPath?: string;
        patchStatus?: string;
        applyCandidate: boolean;
      }>;
    };
    assert.equal(scmState.currentCanonicalPath, "/team");
    assert.equal(scmState.targetScope, "subtree");
    assert.deepEqual(
      scmState.resources.map((entry) => entry.status),
      ["LocalChanged", "RemoteChanged", "Conflict"],
    );
    assert.deepEqual(
      scmState.resources.map((entry) => entry.applyCandidate),
      [true, false, true],
    );
    assert.deepEqual(
      scmState.resources.map((entry) => entry.patchStatus),
      ["changed", "changed", "changed"],
    );
    assert.match(
      scmState.resources[0]?.changedFile ?? "",
      /^\.growi-mirrors\/growi\.example\.com\/team\/team_home\.md/,
    );
    assert.match(
      scmState.resources[0]?.patchPath ?? "",
      /001-team_home\.patch$/,
    );

    const changedFiles = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "diff",
        "current",
        "changed-files.txt",
      ),
      "utf8",
    );
    assert.match(
      changedFiles,
      /\.growi-mirrors\/growi\.example\.com\/team\/team_home\.md/,
    );
    assert.match(
      changedFiles,
      /\.growi-mirrors\/growi\.example\.com\/team\/team_remote\.md/,
    );

    const patch = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "diff",
        "current",
        "diffs",
        "001-team_home.patch",
      ),
      "utf8",
    );
    assert.match(patch, /^--- remote\/team\/home$/m);
    assert.match(
      patch,
      /^\+\+\+ \.growi-mirrors\/growi\.example\.com\/team\/team_home\.md/m,
    );
    assert.match(patch, /^@@ -1,1 \+1,1 @@$/m);
    assert.match(patch, /^-# Remote \/team\/home$/m);
    assert.match(patch, /^\+# Local \/team\/home$/m);
  });

  it("writes real unified diff hunks with context instead of full file replacement", async () => {
    const workspaceRoot = await createWorkspace();
    const resources = [
      resource({
        workspaceRoot,
        canonicalPath: "/team/home",
        status: "LocalChanged",
      }),
    ];
    const remoteText = [
      "# Purpose",
      "",
      "Line 1",
      "Line 2",
      "Line 3",
      "Line 4",
      "Line 5",
      "Line 6",
      "Line 7",
    ].join("\n");
    const localText = [
      "# Purpose",
      "",
      "Line 1",
      "Line 2 updated",
      "Line 3",
      "Line 4",
      "Line 5",
      "Line 6",
      "Line 7",
    ].join("\n");

    await createLlmLocalMirrorDiffContext(
      workspaceRoot,
      {
        currentCanonicalPath: "/team/home",
        targetScope: "page",
        resources,
      },
      {
        readResourceText: async (_resource, side) =>
          side === "remote" ? remoteText : localText,
      },
    );

    const patch = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "diff",
        "current",
        "diffs",
        "001-team_home.patch",
      ),
      "utf8",
    );
    assert.match(patch, /^@@ -1,7 \+1,7 @@$/m);
    assert.match(patch, /^ # Purpose$/m);
    assert.match(patch, /^ Line 1$/m);
    assert.match(patch, /^-Line 2$/m);
    assert.match(patch, /^\+Line 2 updated$/m);
    assert.match(patch, /^ Line 5$/m);
    assert.doesNotMatch(patch, /^-Line 6$/m);
    assert.doesNotMatch(patch, /^\+Line 6$/m);
  });

  it("marks unchanged patch artifacts in scm-state without treating them as generation failures", async () => {
    const workspaceRoot = await createWorkspace();
    const resources = [
      resource({
        workspaceRoot,
        canonicalPath: "/team/home",
        status: "LocalChanged",
      }),
    ];

    await createLlmLocalMirrorDiffContext(
      workspaceRoot,
      {
        currentCanonicalPath: "/team/home",
        targetScope: "page",
        resources,
      },
      { readResourceText: async () => "# Same\n" },
    );

    const scmState = JSON.parse(
      await readFile(
        path.join(
          workspaceRoot,
          ".growi-agent",
          "diff",
          "current",
          "scm-state.json",
        ),
        "utf8",
      ),
    ) as {
      resources: Array<{ patchStatus?: string; warning?: string }>;
      warnings: string[];
    };
    const patch = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "diff",
        "current",
        "diffs",
        "001-team_home.patch",
      ),
      "utf8",
    );
    assert.equal(scmState.resources[0]?.patchStatus, "unchanged");
    assert.equal(scmState.resources[0]?.warning, undefined);
    assert.deepEqual(scmState.warnings, []);
    assert.equal(
      patch,
      "--- remote/team/home\n+++ .growi-mirrors/growi.example.com/team/team_home.md\n",
    );
  });

  it("keeps the context when a resource patch cannot be generated", async () => {
    const workspaceRoot = await createWorkspace();
    const resources = [
      resource({
        workspaceRoot,
        canonicalPath: "/team/home",
        status: "LocalChanged",
      }),
    ];

    const result = await createLlmLocalMirrorDiffContext(
      workspaceRoot,
      {
        currentCanonicalPath: "/team/home",
        targetScope: "page",
        resources,
      },
      {
        readResourceText: async () => {
          throw new Error("missing content");
        },
      },
    );

    assert.equal(result.resourceCount, 1);
    assert.match(result.warnings[0] ?? "", /missing content/);
    const scmState = await readFile(
      path.join(
        workspaceRoot,
        ".growi-agent",
        "diff",
        "current",
        "scm-state.json",
      ),
      "utf8",
    );
    assert.match(scmState, /Failed to generate patch for \/team\/home/);
  });

  it("writes prompt with read-only diff rules", async () => {
    const workspaceRoot = await createWorkspace();
    await createLlmLocalMirrorDiffContext(
      workspaceRoot,
      {
        currentCanonicalPath: "/team/home",
        targetScope: "page",
        resources: [
          resource({
            workspaceRoot,
            canonicalPath: "/team/home",
            status: "Conflict",
          }),
        ],
      },
      {
        readResourceText: async (_resource, side) => side,
        uiLabels: {
          growiApply: "GROWI\u306b\u53cd\u6620",
          takeRemote: "Take Remote Changes",
        },
      },
    );

    const prompt = await readCurrentLlmLocalMirrorDiffPrompt(workspaceRoot);
    assert.match(prompt, /^\$growi-local-mirror-diff/);
    assert.match(
      prompt,
      /\.agents\/skills\/growi-local-mirror-diff\/SKILL\.md/,
    );
    assert.match(
      prompt,
      /\.agents\/skills\/growi-local-mirror-diff\/agents\/generic\.md/,
    );
    assert.match(prompt, /Do not call GROWI APIs, SCM commands/);
    assert.match(
      prompt,
      /Do not run the GROWI apply command or Take Remote command/,
    );
    assert.match(
      prompt,
      /current UI command labels `GROWIに反映` and `Take Remote Changes`/,
    );
    assert.match(prompt, /patchStatus=unchanged/);
    assert.match(prompt, /Do not perform secret scanning/);
    assert.match(prompt, /Conflict: 1/);
    assert.doesNotMatch(prompt, /Kiwi|kiwifs|\.kiwi/);
  });
});

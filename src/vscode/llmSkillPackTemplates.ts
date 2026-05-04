export const GROWI_LOCAL_MIRROR_PROMPT_SKILL = "growi-local-mirror-prompt";
export const GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR =
  ".agents/skills/growi-local-mirror-prompt";
export const GROWI_LOCAL_MIRROR_DIFF_SKILL = "growi-local-mirror-diff";
export const GROWI_LOCAL_MIRROR_DIFF_SKILL_DIR =
  ".agents/skills/growi-local-mirror-diff";

export interface LlmPromptUiLabels {
  growiApply: string;
  takeRemote: string;
}

const DEFAULT_PROMPT_UI_LABELS: LlmPromptUiLabels = {
  growiApply: "Apply to GROWI",
  takeRemote: "Take Remote Changes",
};

export const GROWI_SKILL_PACK_FILES: ReadonlyArray<{
  relativePath: string;
  content: string;
}> = [
  {
    relativePath: `${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/SKILL.md`,
    content: `---
name: growi-local-mirror-prompt
description: Use when a user asks an LLM to work with GROWI local mirror Markdown while limiting file reads and edits to the active local mirror session scope.
---

# GROWI Local Mirror Prompt

Use this skill to prepare and follow a minimal GROWI local mirror work scope.

## Primary Rule

The user's LLM prompt is the source of truth for what to do. Do not add review, conflict resolution, safety checking, GROWI API work, SCM work, upload work, take remote work, or GROWI apply work unless the user explicitly asks for analysis only.

If your LLM does not support \`$growi-local-mirror-prompt\` skill syntax, read this \`SKILL.md\` file directly and follow the same rules.

## Allowed Reads

- \`.growi-agent/prompt/current/task.md\`
- \`.growi-agent/prompt/current/editable-files.txt\`
- \`.growi-agent/prompt/current/do-not-edit.txt\`
- \`.growi-agent/prompt/current/prompt.md\`
- Markdown files listed in \`.growi-agent/prompt/current/editable-files.txt\`

This extension reads \`.growi-mirrors/**/.growi-mirror.json\` to create \`editable-files.txt\`. You, the LLM, must not read or edit any manifest.

## Allowed Edits

- Only Markdown files listed in \`.growi-agent/prompt/current/editable-files.txt\`
- Do not create new files.
- Do not delete files.

## Do Not Read Or Edit

- Any workspace file outside the allowed reads above
- \`.growi-mirrors/**/.growi-mirror.json\`
- \`${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/**\`
- \`.growi-agent/**\` (only the prompt input files listed under Allowed Reads may be read)

## Command Boundaries

- Do not call GROWI APIs.
- Do not run SCM commands.
- Do not run upload, take remote, or remote apply commands.
- Do not run the GROWI apply command.
`,
  },
  {
    relativePath: `${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/agents/openai.yaml`,
    content: `interface:
  display_name: "GROWI Local Mirror Prompt"
  short_description: "Limit LLM local mirror reads and edits to the active GROWI session scope"
  default_prompt: "Use $growi-local-mirror-prompt for the current GROWI local mirror request."

policy:
  allow_implicit_invocation: false
`,
  },
  {
    relativePath: `${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/agents/generic.md`,
    content: `# Generic LLM Usage

Use this file for LLMs that do not support \`$growi-local-mirror-prompt\` skill syntax.

Provide these files explicitly:

- \`${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/SKILL.md\`
- \`.growi-agent/prompt/current/task.md\`
- \`.growi-agent/prompt/current/editable-files.txt\`
- \`.growi-agent/prompt/current/do-not-edit.txt\`
- \`.growi-agent/prompt/current/prompt.md\`

Then ask the LLM to read and edit only the Markdown files listed in \`editable-files.txt\`.
`,
  },
  {
    relativePath: `${GROWI_LOCAL_MIRROR_DIFF_SKILL_DIR}/SKILL.md`,
    content: `---
name: growi-local-mirror-diff
description: Use when reading GROWI local mirror SCM diff context from .growi-agent/diff/current without editing files or running GROWI/SCM commands.
---

# GROWI Local Mirror Diff

Use this skill to read generated local mirror diff context. This skill is read-only.

If your LLM does not support \`$growi-local-mirror-diff\` skill syntax, read this \`SKILL.md\` file directly and follow the same rules.

## Allowed Reads

- \`.growi-agent/diff/current/scm-state.json\`
- \`.growi-agent/diff/current/changed-files.txt\`
- \`.growi-agent/diff/current/diffs/*.patch\`
- \`.growi-agent/diff/current/prompt.md\`

If \`.growi-agent/diff/current/changed-files.txt\` is empty, report that no local mirror Markdown diff context is available and ask the user to run local mirror compare or prepare the diff context again. Do not inspect workspace files to compensate.

## Review Goals

- Summarize meaningful page body changes.
- Identify accidental removals, risky assumptions, and conflict risks.
- Treat \`RemoteChanged\` resources as GROWI-side update warnings, not apply candidates.
- For \`Conflict\` resources, explain what needs human merge review.
- End with concise human review points.

## Do Not Read Or Edit

- Do not edit any file.
- Do not read workspace files outside the allowed diff context artifacts above.
- Do not read or edit \`.growi-mirrors/**\`.
- Do not read or edit \`.agents/**\`.
- Do not read or edit \`.growi-agent/**\` (only the diff context artifacts listed under Allowed Reads may be read).

## Command Boundaries

- Do not call GROWI APIs.
- Do not run SCM commands.
- Do not run upload, take remote, or remote apply commands.
- Do not run the GROWI apply command.
- Do not run the Take Remote command.
`,
  },
  {
    relativePath: `${GROWI_LOCAL_MIRROR_DIFF_SKILL_DIR}/agents/openai.yaml`,
    content: `interface:
  display_name: "GROWI Local Mirror Diff"
  short_description: "Read GROWI local mirror SCM diff context without editing files"
  default_prompt: "Use $growi-local-mirror-diff to read the current GROWI local mirror diff context."

policy:
  allow_implicit_invocation: false
`,
  },
  {
    relativePath: `${GROWI_LOCAL_MIRROR_DIFF_SKILL_DIR}/agents/generic.md`,
    content: `# Generic LLM Usage

Use this file for LLMs that do not support \`$growi-local-mirror-diff\` skill syntax.

Provide these files explicitly:

- \`${GROWI_LOCAL_MIRROR_DIFF_SKILL_DIR}/SKILL.md\`
- \`.growi-agent/diff/current/scm-state.json\`
- \`.growi-agent/diff/current/changed-files.txt\`
- \`.growi-agent/diff/current/diffs/*.patch\`
- \`.growi-agent/diff/current/prompt.md\`

Then ask the LLM to summarize local mirror diffs, risks, conflicts, and human review points without editing files or running commands.
`,
  },
];

export const DO_NOT_EDIT_ENTRIES = [
  ".growi-mirrors/**/.growi-mirror.json",
  `${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/**`,
  ".growi-agent/** (prompt input files may be read only; do not edit any .growi-agent file)",
] as const;

export function renderTaskFile(taskText?: string): string {
  const body = taskText?.trim()
    ? taskText.trim()
    : "Use the user's LLM prompt as the source of truth for this local mirror task.";
  return `# LLM Local Mirror Task

${body}
`;
}

export function renderEditableFiles(files: readonly string[]): string {
  return files.length > 0 ? `${files.join("\n")}\n` : "";
}

export function renderDoNotEditFile(): string {
  return `${DO_NOT_EDIT_ENTRIES.join("\n")}\n`;
}

export function renderPrompt(files: readonly string[]): string {
  return renderPromptWithOptions({ files });
}

export function renderPromptWithOptions(options: {
  files: readonly string[];
  gitignoreWarning?: string;
  uiLabels?: LlmPromptUiLabels;
}): string {
  const files = options.files;
  const uiLabels = options.uiLabels ?? DEFAULT_PROMPT_UI_LABELS;
  const editableBlock =
    files.length > 0
      ? files.map((file) => `- ${file}`).join("\n")
      : "- No editable files are listed. Ask the user to create or refresh a local mirror first.";
  const gitignoreBlock = options.gitignoreWarning
    ? `\nWarning:\n\n- ${options.gitignoreWarning}\n`
    : "";

  return `$growi-local-mirror-prompt

If your LLM does not support $skill syntax, read ${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/SKILL.md directly and follow the same rules.

You are working on a GROWI local mirror request.

Read only these prompt inputs:

- .growi-agent/prompt/current/task.md
- .growi-agent/prompt/current/editable-files.txt
- .growi-agent/prompt/current/do-not-edit.txt
- ${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/SKILL.md

Editable files:

${editableBlock}

Rules:

- Follow the user's LLM prompt as the source of truth for the task.
- Read only the prompt inputs above and the Markdown files listed in editable-files.txt.
- Edit only Markdown files listed in editable-files.txt.
- Do not create new files.
- Do not delete files.
- Do not read or edit .growi-mirrors/**/.growi-mirror.json.
- Do not read or edit ${GROWI_LOCAL_MIRROR_PROMPT_SKILL_DIR}/**.
- Do not edit .growi-agent/**; read only the prompt inputs listed above.
- Do not call GROWI APIs, SCM commands, upload commands, take remote commands, or remote apply commands.
- Do not run the GROWI apply command, including the current UI command label \`${uiLabels.growiApply}\`.
- Do not run the Take Remote command, including the current UI command label \`${uiLabels.takeRemote}\`.
- Do not add review, conflict resolution, or safety checking unless the user explicitly asks for it.
${gitignoreBlock}
`;
}

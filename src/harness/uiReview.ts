export interface UiReviewTreeItem {
  label?: string;
  kind?: string;
  uri?: string;
  canonicalPath?: string;
  contextValue?: string;
  description?: string;
}

export interface UiReviewQuickPickItem {
  label?: string;
  description?: string;
  detail?: string;
  canonicalPath?: string;
  action?: string;
  command?: string;
  buttons?: UiReviewQuickPickItemButton[];
}

export interface UiReviewQuickPickItemButton {
  tooltip?: string;
  iconPath?: string;
}

export interface UiReviewQuickPickState {
  name: string;
  placeholder?: string;
  value?: string;
  selected?: UiReviewQuickPickItem[];
  items: UiReviewQuickPickItem[];
}

export interface UiReviewCommandTraceEntry {
  command: string;
  status: "started" | "succeeded" | "failed";
  args?: unknown[];
  error?: string;
}

export interface UiReviewState {
  treeItems: UiReviewTreeItem[];
  quickPicks: UiReviewQuickPickState[];
  menus?: UiReviewMenuEvidence;
}

export interface UiReviewEvidence {
  uiState: UiReviewState;
  commandTrace: UiReviewCommandTraceEntry[];
  menus?: UiReviewMenuEvidence;
}

export interface UiReviewTreeItemExpectation {
  label?: string;
  kind?: string;
  uri?: string;
  canonicalPath?: string;
  contextValue?: string;
  description?: string;
}

export interface UiReviewQuickPickExpectation {
  name: string;
  placeholder?: string;
  value?: string;
  item: UiReviewQuickPickItem;
}

export interface UiReviewQuickPickOrderExpectation {
  name: string;
  placeholder?: string;
  value?: string;
  items: UiReviewQuickPickItem[];
}

export interface UiReviewQuickPickItemActionExpectation
  extends UiReviewQuickPickExpectation {
  action?: string;
  command?: string;
  button?: UiReviewQuickPickItemButton;
}

export interface UiReviewMenuItem {
  menu?: string;
  command?: string;
  when?: string;
  group?: string;
}

export type UiReviewMenuEvidence =
  | UiReviewMenuItem[]
  | Record<string, UiReviewMenuItem[]>;

export interface UiReviewMenuItemExpectation extends UiReviewMenuItem {
  menu: string;
}

export interface UiReviewScenarioChecks {
  requiredTreeItems?: UiReviewTreeItemExpectation[];
  requiredQuickPickItems?: UiReviewQuickPickExpectation[];
  requiredQuickPickItemOrder?: UiReviewQuickPickOrderExpectation[];
  forbiddenQuickPickItems?: UiReviewQuickPickExpectation[];
  requiredSelectedQuickPickItems?: UiReviewQuickPickExpectation[];
  requiredQuickPickItemActions?: UiReviewQuickPickItemActionExpectation[];
  requiredMenuItems?: UiReviewMenuItemExpectation[];
  forbiddenMenuItems?: UiReviewMenuItemExpectation[];
  requiredCommandSequence?: string[];
  duplicateQuickPickItems?: "allow" | "forbid";
  forbiddenJapaneseText?: boolean;
}

export interface UiReviewScenarioEvidenceLayer {
  name: string;
  source: string;
  role: string;
  status?: string;
}

export interface UiReviewScenario {
  id: string;
  title?: string;
  aliases?: string[];
  uiAreas?: string[];
  changedFileGlobs?: string[];
  target?: string;
  reviewFocus?: string[];
  uxReviewQuestions?: string[];
  evidenceLayers?: UiReviewScenarioEvidenceLayer[];
  checks?: UiReviewScenarioChecks;
}

export interface UiReviewCheckResult {
  name: string;
  pass: boolean;
  message: string;
  result?: "needs-fix" | "human-review";
}

export interface UiReviewEvaluation {
  scenarioId: string;
  result: "pass" | "needs-fix" | "human-review";
  checks: UiReviewCheckResult[];
}

export interface UiReviewPromptReport extends UiReviewEvaluation {
  artifactDir?: string;
  generatedAt?: string;
}

function matchesString(
  actual: string | undefined,
  expected: string | undefined,
) {
  return expected === undefined || actual === expected;
}

function matchesTreeItem(
  item: UiReviewTreeItem,
  expected: UiReviewTreeItemExpectation,
) {
  return (
    matchesString(item.label, expected.label) &&
    matchesString(item.kind, expected.kind) &&
    matchesString(item.uri, expected.uri) &&
    matchesString(item.canonicalPath, expected.canonicalPath) &&
    matchesString(item.contextValue, expected.contextValue) &&
    matchesString(item.description, expected.description)
  );
}

function matchesQuickPickItem(
  item: UiReviewQuickPickItem,
  expected: UiReviewQuickPickItem,
) {
  return (
    matchesString(item.label, expected.label) &&
    matchesString(item.description, expected.description) &&
    matchesString(item.detail, expected.detail) &&
    matchesString(item.canonicalPath, expected.canonicalPath) &&
    matchesString(item.action, expected.action) &&
    matchesString(item.command, expected.command) &&
    matchesQuickPickButtons(item.buttons, expected.buttons)
  );
}

function describeExpectation(value: unknown) {
  return JSON.stringify(value);
}

function containsJapaneseText(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function collectUiTextValues(
  value: unknown,
  path: string,
  output: { path: string; value: string }[],
) {
  if (typeof value === "string") {
    output.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectUiTextValues(item, `${path}[${index}]`, output);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectUiTextValues(nested, `${path}.${key}`, output);
    }
  }
}

function matchesQuickPickButton(
  button: UiReviewQuickPickItemButton,
  expected: UiReviewQuickPickItemButton,
) {
  return (
    matchesString(button.tooltip, expected.tooltip) &&
    matchesString(button.iconPath, expected.iconPath)
  );
}

function matchesQuickPickButtons(
  buttons: UiReviewQuickPickItemButton[] | undefined,
  expectedButtons: UiReviewQuickPickItemButton[] | undefined,
) {
  if (expectedButtons === undefined) {
    return true;
  }
  return expectedButtons.every((expected) =>
    buttons?.some((button) => matchesQuickPickButton(button, expected)),
  );
}

function findQuickPick(
  uiState: UiReviewState,
  expected: {
    name: string;
    placeholder?: string;
    value?: string;
  },
) {
  return uiState.quickPicks.find(
    (candidate) =>
      candidate.name === expected.name &&
      matchesString(candidate.placeholder, expected.placeholder) &&
      matchesString(candidate.value, expected.value),
  );
}

function evaluateRequiredTreeItems(
  uiState: UiReviewState,
  requiredTreeItems: readonly UiReviewTreeItemExpectation[],
) {
  return requiredTreeItems.map((expected): UiReviewCheckResult => {
    const pass = uiState.treeItems.some((item) =>
      matchesTreeItem(item, expected),
    );
    return {
      name: "requiredTreeItem",
      pass,
      message: pass
        ? `Found tree item ${describeExpectation(expected)}.`
        : `Missing tree item ${describeExpectation(expected)}.`,
    };
  });
}

function evaluateRequiredQuickPickItems(
  uiState: UiReviewState,
  requiredQuickPickItems: readonly UiReviewQuickPickExpectation[],
) {
  return requiredQuickPickItems.map((expected): UiReviewCheckResult => {
    const quickPick = findQuickPick(uiState, expected);
    const pass =
      quickPick?.items.some((item) =>
        matchesQuickPickItem(item, expected.item),
      ) ?? false;
    return {
      name: "requiredQuickPickItem",
      pass,
      message: pass
        ? `Found ${expected.name} quick pick item ${describeExpectation(expected.item)}.`
        : `Missing ${expected.name} quick pick item ${describeExpectation(expected.item)}.`,
    };
  });
}

function evaluateRequiredQuickPickItemOrder(
  uiState: UiReviewState,
  requiredQuickPickItemOrder: readonly UiReviewQuickPickOrderExpectation[],
) {
  return requiredQuickPickItemOrder.map((expected): UiReviewCheckResult => {
    const quickPick = findQuickPick(uiState, expected);
    let cursor = 0;
    for (const item of quickPick?.items ?? []) {
      if (matchesQuickPickItem(item, expected.items[cursor] ?? {})) {
        cursor += 1;
      }
      if (cursor >= expected.items.length) {
        break;
      }
    }

    const pass = cursor >= expected.items.length;
    return {
      name: "requiredQuickPickItemOrder",
      pass,
      message: pass
        ? `Observed ${expected.name} quick pick item order ${describeExpectation(expected.items)}.`
        : `Missing ${expected.name} quick pick item order ${describeExpectation(expected.items)}.`,
    };
  });
}

function evaluateForbiddenQuickPickItems(
  uiState: UiReviewState,
  forbiddenQuickPickItems: readonly UiReviewQuickPickExpectation[],
) {
  return forbiddenQuickPickItems.map((expected): UiReviewCheckResult => {
    const quickPick = findQuickPick(uiState, expected);
    const found =
      quickPick?.items.some((item) =>
        matchesQuickPickItem(item, expected.item),
      ) ?? false;
    return {
      name: "forbiddenQuickPickItem",
      pass: !found,
      message: found
        ? `Found forbidden ${expected.name} quick pick item ${describeExpectation(expected.item)}.`
        : `Did not find forbidden ${expected.name} quick pick item ${describeExpectation(expected.item)}.`,
    };
  });
}

function evaluateRequiredSelectedQuickPickItems(
  uiState: UiReviewState,
  requiredSelectedQuickPickItems: readonly UiReviewQuickPickExpectation[],
) {
  return requiredSelectedQuickPickItems.map((expected): UiReviewCheckResult => {
    const quickPick = findQuickPick(uiState, expected);
    const pass =
      quickPick?.selected?.some((item) =>
        matchesQuickPickItem(item, expected.item),
      ) ?? false;
    return {
      name: "requiredSelectedQuickPickItem",
      pass,
      message: pass
        ? `Found selected ${expected.name} quick pick item ${describeExpectation(expected.item)}.`
        : `Missing selected ${expected.name} quick pick item ${describeExpectation(expected.item)}.`,
    };
  });
}

function evaluateRequiredQuickPickItemActions(
  uiState: UiReviewState,
  requiredQuickPickItemActions: readonly UiReviewQuickPickItemActionExpectation[],
) {
  return requiredQuickPickItemActions.map((expected): UiReviewCheckResult => {
    const quickPick = findQuickPick(uiState, expected);
    const matchingItem = quickPick?.items.find((item) =>
      matchesQuickPickItem(item, expected.item),
    );
    const pass =
      matchingItem !== undefined &&
      matchesString(matchingItem.action, expected.action) &&
      matchesString(matchingItem.command, expected.command) &&
      (expected.button === undefined ||
        matchingItem.buttons?.some((button) =>
          matchesQuickPickButton(button, expected.button ?? {}),
        ) === true);

    return {
      name: "requiredQuickPickItemAction",
      pass,
      message: pass
        ? `Found ${expected.name} quick pick item action ${describeExpectation(expected)}.`
        : `Missing ${expected.name} quick pick item action ${describeExpectation(expected)}.`,
    };
  });
}

function evaluateRequiredCommandSequence(
  commandTrace: readonly UiReviewCommandTraceEntry[],
  requiredCommandSequence: readonly string[],
): UiReviewCheckResult {
  const succeededCommands = commandTrace
    .filter((entry) => entry.status === "succeeded")
    .map((entry) => entry.command);
  let cursor = 0;
  for (const command of succeededCommands) {
    if (command === requiredCommandSequence[cursor]) {
      cursor += 1;
    }
    if (cursor >= requiredCommandSequence.length) {
      break;
    }
  }

  const pass = cursor >= requiredCommandSequence.length;
  return {
    name: "requiredCommandSequence",
    pass,
    message: pass
      ? `Observed required command sequence: ${requiredCommandSequence.join(" -> ")}.`
      : `Missing required command sequence: ${requiredCommandSequence.join(" -> ")}. Observed: ${succeededCommands.join(" -> ")}.`,
  };
}

function evaluateRequiredLabels(uiState: UiReviewState): UiReviewCheckResult[] {
  const checks: UiReviewCheckResult[] = [];
  const missingTreeLabels = uiState.treeItems.filter(
    (item) => !item.label || item.label.trim().length === 0,
  );
  checks.push({
    name: "treeItemLabels",
    pass: missingTreeLabels.length === 0,
    message:
      missingTreeLabels.length === 0
        ? "All collected tree items have labels."
        : `Found tree items without labels: ${describeExpectation(missingTreeLabels)}.`,
  });

  for (const quickPick of uiState.quickPicks) {
    const missingQuickPickLabels = quickPick.items.filter(
      (item) => !item.label || item.label.trim().length === 0,
    );
    checks.push({
      name: "quickPickItemLabels",
      pass: missingQuickPickLabels.length === 0,
      message:
        missingQuickPickLabels.length === 0
          ? `${quickPick.name} quick pick items all have labels.`
          : `Found ${quickPick.name} quick pick items without labels: ${describeExpectation(missingQuickPickLabels)}.`,
    });
  }

  return checks;
}

function buildQuickPickIdentity(item: UiReviewQuickPickItem) {
  return [
    item.label ?? "",
    item.description ?? "",
    item.detail ?? "",
    item.canonicalPath ?? "",
    item.action ?? "",
  ].join("\u0000");
}

function evaluateDuplicateQuickPickItems(
  uiState: UiReviewState,
): UiReviewCheckResult[] {
  return uiState.quickPicks.map((quickPick): UiReviewCheckResult => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of quickPick.items) {
      const identity = buildQuickPickIdentity(item);
      if (seen.has(identity)) {
        duplicates.add(identity);
      }
      seen.add(identity);
    }

    return {
      name: "duplicateQuickPickItems",
      pass: duplicates.size === 0,
      message:
        duplicates.size === 0
          ? `${quickPick.name} quick pick has no duplicate items.`
          : `${quickPick.name} quick pick has duplicate items: ${describeExpectation([...duplicates])}.`,
    };
  });
}

function evaluateForbiddenJapaneseText(
  uiState: UiReviewState,
): UiReviewCheckResult {
  const values: { path: string; value: string }[] = [];
  collectUiTextValues(
    {
      treeItems: uiState.treeItems,
      quickPicks: uiState.quickPicks,
      menus: uiState.menus,
    },
    "uiState",
    values,
  );
  const matches = values.filter(({ value }) => containsJapaneseText(value));
  return {
    name: "forbiddenJapaneseText",
    pass: matches.length === 0,
    message:
      matches.length === 0
        ? "No Japanese text was found in collected UI evidence."
        : `Found Japanese text in collected UI evidence: ${describeExpectation(matches)}.`,
  };
}

function flattenMenuEvidence(
  menuEvidence: UiReviewMenuEvidence | undefined,
): UiReviewMenuItem[] | undefined {
  if (menuEvidence === undefined) {
    return undefined;
  }
  if (Array.isArray(menuEvidence)) {
    return menuEvidence;
  }
  return Object.entries(menuEvidence).flatMap(([menu, items]) =>
    items.map((item) => ({ ...item, menu: item.menu ?? menu })),
  );
}

function matchesMenuItem(
  item: UiReviewMenuItem,
  expected: UiReviewMenuItemExpectation,
) {
  return (
    matchesString(item.menu, expected.menu) &&
    matchesString(item.command, expected.command) &&
    matchesString(item.when, expected.when) &&
    matchesString(item.group, expected.group)
  );
}

function evaluateRequiredMenuItems(
  menuEvidence: UiReviewMenuEvidence | undefined,
  requiredMenuItems: readonly UiReviewMenuItemExpectation[],
) {
  if (requiredMenuItems.length === 0) {
    return [];
  }

  const menuItems = flattenMenuEvidence(menuEvidence);
  if (menuItems === undefined) {
    return requiredMenuItems.map(
      (expected): UiReviewCheckResult => ({
        name: "requiredMenuItem",
        pass: false,
        result: "human-review",
        message: `Menu evidence unavailable for required menu item ${describeExpectation(expected)}.`,
      }),
    );
  }

  return requiredMenuItems.map((expected): UiReviewCheckResult => {
    const pass = menuItems.some((item) => matchesMenuItem(item, expected));
    return {
      name: "requiredMenuItem",
      pass,
      message: pass
        ? `Found menu item ${describeExpectation(expected)}.`
        : `Missing menu item ${describeExpectation(expected)}.`,
    };
  });
}

function evaluateForbiddenMenuItems(
  menuEvidence: UiReviewMenuEvidence | undefined,
  forbiddenMenuItems: readonly UiReviewMenuItemExpectation[],
) {
  if (forbiddenMenuItems.length === 0) {
    return [];
  }

  const menuItems = flattenMenuEvidence(menuEvidence);
  if (menuItems === undefined) {
    return forbiddenMenuItems.map(
      (expected): UiReviewCheckResult => ({
        name: "forbiddenMenuItem",
        pass: false,
        result: "human-review",
        message: `Menu evidence unavailable for forbidden menu item ${describeExpectation(expected)}.`,
      }),
    );
  }

  return forbiddenMenuItems.map((expected): UiReviewCheckResult => {
    const found = menuItems.some((item) => matchesMenuItem(item, expected));
    return {
      name: "forbiddenMenuItem",
      pass: !found,
      message: found
        ? `Found forbidden menu item ${describeExpectation(expected)}.`
        : `Did not find forbidden menu item ${describeExpectation(expected)}.`,
    };
  });
}

function resolveEvaluationResult(
  checks: readonly UiReviewCheckResult[],
): UiReviewEvaluation["result"] {
  if (checks.every((check) => check.pass)) {
    return "pass";
  }
  if (checks.some((check) => !check.pass && check.result === "needs-fix")) {
    return "needs-fix";
  }
  if (checks.some((check) => !check.pass && check.result === undefined)) {
    return "needs-fix";
  }
  return "human-review";
}

export function evaluateUiReviewEvidence(
  evidence: UiReviewEvidence,
  scenario: UiReviewScenario,
): UiReviewEvaluation {
  const checks: UiReviewCheckResult[] = [];
  const scenarioChecks = scenario.checks ?? {};

  checks.push(...evaluateRequiredLabels(evidence.uiState));
  checks.push(
    ...evaluateRequiredTreeItems(
      evidence.uiState,
      scenarioChecks.requiredTreeItems ?? [],
    ),
  );
  checks.push(
    ...evaluateRequiredQuickPickItems(
      evidence.uiState,
      scenarioChecks.requiredQuickPickItems ?? [],
    ),
  );
  checks.push(
    ...evaluateRequiredQuickPickItemOrder(
      evidence.uiState,
      scenarioChecks.requiredQuickPickItemOrder ?? [],
    ),
  );
  checks.push(
    ...evaluateForbiddenQuickPickItems(
      evidence.uiState,
      scenarioChecks.forbiddenQuickPickItems ?? [],
    ),
  );
  checks.push(
    ...evaluateRequiredSelectedQuickPickItems(
      evidence.uiState,
      scenarioChecks.requiredSelectedQuickPickItems ?? [],
    ),
  );
  checks.push(
    ...evaluateRequiredQuickPickItemActions(
      evidence.uiState,
      scenarioChecks.requiredQuickPickItemActions ?? [],
    ),
  );
  checks.push(
    ...evaluateRequiredMenuItems(
      evidence.menus ?? evidence.uiState.menus,
      scenarioChecks.requiredMenuItems ?? [],
    ),
  );
  checks.push(
    ...evaluateForbiddenMenuItems(
      evidence.menus ?? evidence.uiState.menus,
      scenarioChecks.forbiddenMenuItems ?? [],
    ),
  );

  if (scenarioChecks.requiredCommandSequence) {
    checks.push(
      evaluateRequiredCommandSequence(
        evidence.commandTrace,
        scenarioChecks.requiredCommandSequence,
      ),
    );
  }
  if (scenarioChecks.duplicateQuickPickItems !== "allow") {
    checks.push(...evaluateDuplicateQuickPickItems(evidence.uiState));
  }
  if (scenarioChecks.forbiddenJapaneseText === true) {
    checks.push(evaluateForbiddenJapaneseText(evidence.uiState));
  }

  return {
    scenarioId: scenario.id,
    result: resolveEvaluationResult(checks),
    checks,
  };
}

export function buildUiReviewPrompt({
  scenario,
  report,
  artifactFiles,
}: {
  scenario: UiReviewScenario;
  report: UiReviewPromptReport;
  artifactFiles: readonly string[];
}): string {
  const checks =
    report.checks.length > 0
      ? report.checks
          .map((check) => `- ${check.pass ? "PASS" : "FAIL"} ${check.message}`)
          .join("\n")
      : "- No deterministic checks were reported.";
  const files =
    artifactFiles.length > 0
      ? artifactFiles.map((filePath) => `- ${filePath}`).join("\n")
      : "- No evidence files were reported.";
  const reviewFocusItems = scenario.reviewFocus ?? [];
  const uxReviewQuestionItems = scenario.uxReviewQuestions ?? [];
  const reviewFocus =
    reviewFocusItems.length > 0
      ? reviewFocusItems.map((focus) => `- ${focus}`).join("\n")
      : "- Review the captured TreeView, QuickPick, menu, and command evidence for daily operation usability.";
  const uxReviewQuestions =
    uxReviewQuestionItems.length > 0
      ? uxReviewQuestionItems.map((question) => `- ${question}`).join("\n")
      : "- What would block a user from completing the represented daily operation flow?";
  const evidenceLayers = scenario.evidenceLayers?.length
    ? `## Evidence Layers

Use the scenario evidence layers as prompt-only review metadata. They describe how to weigh artifacts for UX review and never change deterministic pass/fail results.

- Layer 1 native context menu screenshot: best-effort supporting evidence for the actual right-click surface when available.
- Layer 2 keyboard action preview QuickPick screenshot: stable visual evidence for the same target-specific action set through GROWI: Show Tree Item Actions.
- Layer 3 deterministic menu model: source of truth for contributed view/item/context commands, when clauses, groups, and forbidden menu entries.

${scenario.evidenceLayers
  .map((layer) => {
    const status = layer.status ? ` Status: ${layer.status}.` : "";
    return `- ${layer.name}: source=${layer.source}; role=${layer.role}.${status}`;
  })
  .join("\n")}
`
    : "";

  return `# UI Review Prompt: ${scenario.id}

Result: ${report.result}

Target: ${scenario.target ?? "GROWI TreeView / QuickPick"}

Review the deterministic UI evidence pack before proposing UI/UX improvements. Do not treat this prompt as an instruction to change product UI directly; use it to identify findings and candidate IMPs.

## Review Focus

${reviewFocus}

## Deterministic Checks

${checks}

## Evidence Files

${files}

${evidenceLayers}
Use ui-state.json as the source of truth for treeItems, quickPicks, menus, and activePath. Use command-trace.json as the source of truth for executed commands and failures. Screenshots are supporting evidence only.

## UX Review Questions

${uxReviewQuestions}

## Known Geometry Limitation

Native VS Code UI geometry is unavailable in this harness. Do not infer exact pixel layout, visual overlap, or cursor target size from screenshots alone. Use ui-state.json and command-trace.json for logical UI structure, command order, menu availability, and QuickPick content.

## Expected Output Format

### Findings

- Severity, affected UI area, and user impact.

### Evidence

- Reference the artifact file and the relevant tree item, QuickPick item, menu command, command trace entry, or screenshot observation.

### Suggested IMP candidates

- Candidate title, affected requirement or test-plan area when known, and why it should or should not become a follow-up IMP.
`;
}

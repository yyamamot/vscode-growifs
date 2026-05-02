import { describe, expect, it } from "vitest";
import {
  buildUiReviewPrompt,
  evaluateUiReviewEvidence,
} from "../../src/harness/uiReview";

describe("evaluateUiReviewEvidence", () => {
  it("passes when tree items, quick pick items, and command sequence match", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [
            {
              label: "spec.md",
              kind: "page",
              canonicalPath: "/team/dev/spec",
              contextValue: "growi.pageBookmarked",
            },
          ],
          quickPicks: [
            {
              name: "openPage",
              placeholder: "Open a page",
              value: "sp",
              items: [
                {
                  label: "spec",
                  description: "/team/dev/spec",
                  canonicalPath: "/team/dev/spec",
                },
              ],
            },
          ],
        },
        commandTrace: [
          { command: "growi.addPrefix", status: "succeeded" },
          { command: "growi.openPage", status: "succeeded" },
          { command: "growi.showBookmarks", status: "succeeded" },
        ],
      },
      {
        id: "example",
        checks: {
          requiredTreeItems: [
            {
              canonicalPath: "/team/dev/spec",
              contextValue: "growi.pageBookmarked",
            },
          ],
          requiredQuickPickItems: [
            {
              name: "openPage",
              placeholder: "Open a page",
              value: "sp",
              item: {
                label: "spec",
                canonicalPath: "/team/dev/spec",
              },
            },
          ],
          requiredCommandSequence: [
            "growi.addPrefix",
            "growi.openPage",
            "growi.showBookmarks",
          ],
        },
      },
    );

    expect(evaluation.result).toBe("pass");
    expect(evaluation.checks.every((check) => check.pass)).toBe(true);
  });

  it("fails when a required logical UI item is missing", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [],
        },
        commandTrace: [],
      },
      {
        id: "missing",
        checks: {
          requiredTreeItems: [{ canonicalPath: "/team/dev/spec" }],
        },
      },
    );

    expect(evaluation.result).toBe("needs-fix");
    expect(evaluation.checks).toContainEqual({
      name: "requiredTreeItem",
      pass: false,
      message: 'Missing tree item {"canonicalPath":"/team/dev/spec"}.',
    });
  });

  it("requires the configured command sequence to succeed in order", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [],
        },
        commandTrace: [
          { command: "growi.openPage", status: "succeeded" },
          { command: "growi.addPrefix", status: "succeeded" },
          { command: "growi.showBookmarks", status: "failed" },
        ],
      },
      {
        id: "sequence",
        checks: {
          requiredCommandSequence: [
            "growi.addPrefix",
            "growi.openPage",
            "growi.showBookmarks",
          ],
        },
      },
    );

    expect(evaluation.result).toBe("needs-fix");
    expect(evaluation.checks).toContainEqual(
      expect.objectContaining({
        name: "requiredCommandSequence",
        pass: false,
      }),
    );
  });

  it("fails when collected labels are empty or quick pick items are duplicated", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [{ label: "", canonicalPath: "/team/dev" }],
          quickPicks: [
            {
              name: "openPage",
              items: [
                { label: "spec", canonicalPath: "/team/dev/spec" },
                { label: "spec", canonicalPath: "/team/dev/spec" },
              ],
            },
          ],
        },
        commandTrace: [],
      },
      { id: "labels" },
    );

    expect(evaluation.result).toBe("needs-fix");
    expect(evaluation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "treeItemLabels", pass: false }),
        expect.objectContaining({
          name: "duplicateQuickPickItems",
          pass: false,
        }),
      ]),
    );
  });

  it("checks quick pick order, forbidden items, selected items, and item actions", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [
            {
              name: "openPage",
              value: "sp",
              selected: [
                {
                  label: "spec",
                  canonicalPath: "/team/dev/spec",
                },
              ],
              items: [
                {
                  label: "spec",
                  canonicalPath: "/team/dev/spec",
                },
                {
                  label: "URL / path を直接入力",
                  action: "directInput",
                },
              ],
            },
          ],
        },
        commandTrace: [],
      },
      {
        id: "quick-pick-details",
        checks: {
          requiredQuickPickItemOrder: [
            {
              name: "openPage",
              value: "sp",
              items: [
                { canonicalPath: "/team/dev/spec" },
                { action: "directInput" },
              ],
            },
          ],
          forbiddenQuickPickItems: [
            {
              name: "openPage",
              item: { canonicalPath: "/team/dev/secret" },
            },
          ],
          requiredSelectedQuickPickItems: [
            {
              name: "openPage",
              item: { canonicalPath: "/team/dev/spec" },
            },
          ],
          requiredQuickPickItemActions: [
            {
              name: "openPage",
              item: { label: "URL / path を直接入力" },
              action: "directInput",
            },
          ],
        },
      },
    );

    expect(evaluation.result).toBe("pass");
    expect(evaluation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "requiredQuickPickItemOrder",
          pass: true,
        }),
        expect.objectContaining({
          name: "forbiddenQuickPickItem",
          pass: true,
        }),
        expect.objectContaining({
          name: "requiredSelectedQuickPickItem",
          pass: true,
        }),
        expect.objectContaining({
          name: "requiredQuickPickItemAction",
          pass: true,
        }),
      ]),
    );
  });

  it("checks required and forbidden menu items", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [],
        },
        menus: {
          "view/title": [
            {
              command: "growi.openPage",
              when: "view == growi.explorer",
              group: "navigation@1",
            },
          ],
          commandPalette: [
            {
              command: "growi.scmUploadMirrorResources",
              when: "false",
            },
          ],
        },
        commandTrace: [],
      },
      {
        id: "menus",
        checks: {
          requiredMenuItems: [
            {
              menu: "view/title",
              command: "growi.openPage",
              when: "view == growi.explorer",
              group: "navigation@1",
            },
          ],
          forbiddenMenuItems: [
            {
              menu: "commandPalette",
              command: "growi.openPage",
            },
          ],
        },
      },
    );

    expect(evaluation.result).toBe("pass");
    expect(evaluation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "requiredMenuItem", pass: true }),
        expect.objectContaining({ name: "forbiddenMenuItem", pass: true }),
      ]),
    );
  });

  it("marks menu-only checks as human-review when menu evidence is unavailable", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [],
        },
        commandTrace: [],
      },
      {
        id: "missing-menu-evidence",
        checks: {
          requiredMenuItems: [
            {
              menu: "view/title",
              command: "growi.openPage",
            },
          ],
        },
      },
    );

    expect(evaluation.result).toBe("human-review");
    expect(evaluation.checks).toContainEqual(
      expect.objectContaining({
        name: "requiredMenuItem",
        pass: false,
        result: "human-review",
      }),
    );
  });

  it("ignores prompt-only review metadata during deterministic evaluation", () => {
    const evaluation = evaluateUiReviewEvidence(
      {
        uiState: {
          treeItems: [],
          quickPicks: [],
        },
        commandTrace: [],
      },
      {
        id: "metadata-only",
        reviewFocus: ["Review TreeView-first daily operations."],
        uxReviewQuestions: ["Can users find the next action?"],
        evidenceLayers: [
          {
            name: "Layer 1 native context menu screenshot",
            source: "screenshots/native-context-menu.png",
            role: "best-effort supporting evidence",
            status: "supporting",
          },
          {
            name: "Layer 2 keyboard action preview QuickPick screenshot",
            source: "screenshots/tree-item-actions.png",
            role: "stable visual evidence",
          },
          {
            name: "Layer 3 deterministic menu model",
            source: "ui-state.json menus",
            role: "source of truth",
          },
        ],
      },
    );

    expect(evaluation.result).toBe("pass");
    expect(evaluation.checks.every((check) => check.pass)).toBe(true);
  });

  it("includes review metadata and UX output sections in the generated prompt", () => {
    const prompt = buildUiReviewPrompt({
      scenario: {
        id: "treeview-daily-ops",
        target:
          "TreeView-first daily GROWI operations and LLM usability review",
        reviewFocus: ["Review TreeView-first discovery."],
        uxReviewQuestions: ["Can users find local mirror actions?"],
        evidenceLayers: [
          {
            name: "Layer 1 native context menu screenshot",
            source: "screenshots/native-context-menu.png",
            role: "best-effort supporting evidence",
            status: "supporting",
          },
          {
            name: "Layer 2 keyboard action preview QuickPick screenshot",
            source: "screenshots/tree-item-actions.png",
            role: "stable visual evidence",
          },
          {
            name: "Layer 3 deterministic menu model",
            source: "ui-state.json menus",
            role: "source of truth",
          },
        ],
      },
      report: {
        scenarioId: "treeview-daily-ops",
        result: "pass",
        checks: [
          {
            name: "requiredCommandSequence",
            pass: true,
            message:
              "Observed required command sequence: growi.addPrefix -> growi.openPage.",
          },
        ],
      },
      artifactFiles: [
        "/tmp/ui-state.json",
        "/tmp/command-trace.json",
        "/tmp/ui-review-prompt.md",
      ],
    });

    expect(prompt).toContain("## Review Focus");
    expect(prompt).toContain("- Review TreeView-first discovery.");
    expect(prompt).toContain("## Deterministic Checks");
    expect(prompt).toContain("## Evidence Files");
    expect(prompt).toContain("## Evidence Layers");
    expect(prompt).toContain("Layer 1 native context menu screenshot");
    expect(prompt).toContain("best-effort supporting evidence");
    expect(prompt).toContain(
      "Layer 2 keyboard action preview QuickPick screenshot",
    );
    expect(prompt).toContain("stable visual evidence");
    expect(prompt).toContain("Layer 3 deterministic menu model");
    expect(prompt).toContain("source of truth");
    expect(prompt).toContain("## UX Review Questions");
    expect(prompt).toContain("- Can users find local mirror actions?");
    expect(prompt).toContain("## Known Geometry Limitation");
    expect(prompt).toContain("Use ui-state.json as the source of truth");
    expect(prompt).toContain("### Findings");
    expect(prompt).toContain("### Evidence");
    expect(prompt).toContain("### Suggested IMP candidates");
  });
});

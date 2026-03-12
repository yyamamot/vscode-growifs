import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class FoldingRange {
    constructor(
      public readonly start: number,
      public readonly end: number,
    ) {}
  }

  return {
    FoldingRange,
  };
});

import {
  collectDrawioAutoFoldSelectionLines,
  collectDrawioFenceRanges,
  createDrawioFoldingRangeProvider,
} from "../../src/vscode/drawioFolding";

function createDocument(text: string) {
  return {
    getText() {
      return text;
    },
  };
}

describe("collectDrawioFenceRanges", () => {
  it("extracts only drawio and draw.io fenced blocks for backticks and tildes", () => {
    const document = createDocument(
      [
        "```drawio",
        "a",
        "```",
        "```mermaid",
        "b",
        "```",
        "~~~draw.io extra",
        "c",
        "~~~",
      ].join("\n"),
    );

    expect(collectDrawioFenceRanges(document as never)).toEqual([
      { startLine: 0, endLine: 2 },
      { startLine: 6, endLine: 8 },
    ]);
    expect(collectDrawioAutoFoldSelectionLines(document as never)).toEqual([
      0, 6,
    ]);
  });

  it("ignores drawio-like text unless it is the first info token", () => {
    const document = createDocument(
      ["```{.drawio}", "a", "```", "```md drawio", "b", "```"].join("\n"),
    );

    expect(collectDrawioFenceRanges(document as never)).toEqual([]);
  });

  it("extends unclosed drawio fences to the end of the document", () => {
    const document = createDocument(["~~~draw.io", "a", "b"].join("\n"));

    expect(collectDrawioFenceRanges(document as never)).toEqual([
      { startLine: 0, endLine: 2 },
    ]);
  });

  it("creates folding ranges from extracted fences", () => {
    const provider = createDrawioFoldingRangeProvider();
    const ranges = provider.provideFoldingRanges(
      createDocument(["```drawio", "a", "```"].join("\n")) as never,
      {} as never,
      {} as never,
    );

    expect(ranges).toEqual([{ start: 0, end: 2 }]);
  });
});

import * as vscode from "vscode";

interface DrawioFenceRange {
  startLine: number;
  endLine: number;
}

interface ActiveFence {
  markerCharacter: "`" | "~";
  markerLength: number;
  startLine: number;
  target: boolean;
}

const OPENING_FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

function getInfoStringFirstToken(remainder: string): string | undefined {
  return remainder.trimStart().split(/\s+/, 1)[0] || undefined;
}

function isDrawioFenceToken(token: string | undefined): boolean {
  return token === "drawio" || token === "draw.io";
}

function isClosingFence(line: string, fence: ActiveFence): boolean {
  const trimmed = line.trim();
  if (trimmed.length < fence.markerLength) {
    return false;
  }

  const markerPattern =
    fence.markerCharacter === "`"
      ? new RegExp(`^\`{${fence.markerLength},}\\s*$`)
      : new RegExp(`^~{${fence.markerLength},}\\s*$`);
  return markerPattern.test(trimmed);
}

export function collectDrawioFenceRanges(
  document: vscode.TextDocument,
): DrawioFenceRange[] {
  const lines = document.getText().split(/\r?\n/);
  const ranges: DrawioFenceRange[] = [];
  let activeFence: ActiveFence | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";

    if (!activeFence) {
      const openingFenceMatch = line.match(OPENING_FENCE_PATTERN);
      if (!openingFenceMatch) {
        continue;
      }

      const marker = openingFenceMatch[1] ?? "";
      const token = getInfoStringFirstToken(openingFenceMatch[2] ?? "");
      activeFence = {
        markerCharacter: marker[0] as "`" | "~",
        markerLength: marker.length,
        startLine: lineIndex,
        target: isDrawioFenceToken(token),
      };
      continue;
    }

    if (!isClosingFence(line, activeFence)) {
      continue;
    }

    if (activeFence.target) {
      ranges.push({
        startLine: activeFence.startLine,
        endLine: lineIndex,
      });
    }
    activeFence = undefined;
  }

  if (activeFence?.target) {
    ranges.push({
      startLine: activeFence.startLine,
      endLine: Math.max(lines.length - 1, activeFence.startLine),
    });
  }

  return ranges;
}

export function collectDrawioAutoFoldSelectionLines(
  document: vscode.TextDocument,
): number[] {
  return collectDrawioFenceRanges(document).map((range) => range.startLine);
}

export function createDrawioFoldingRangeProvider(): vscode.FoldingRangeProvider {
  return {
    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
      return collectDrawioFenceRanges(document).map(
        (range) => new vscode.FoldingRange(range.startLine, range.endLine),
      );
    },
  };
}

import * as vscode from "vscode";

interface HeadingCandidate {
  level: number;
  title: string;
  line: number;
  titleStartCharacter: number;
  titleEndCharacter: number;
}

function collectAtxHeadingCandidates(text: string): HeadingCandidate[] {
  const lines = text.split(/\r?\n/);
  const headings: HeadingCandidate[] = [];

  let fencedBlockMarker: "```" | "~~~" | undefined;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";

    const fenceMatch = line.match(/^\s{0,3}(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[1] as "```" | "~~~";
      if (!fencedBlockMarker) {
        fencedBlockMarker = marker;
      } else if (fencedBlockMarker === marker) {
        fencedBlockMarker = undefined;
      }
      continue;
    }
    if (fencedBlockMarker) {
      continue;
    }

    const atxMatch = line.match(
      /^(\s{0,3})(#{1,6})([ \t]+)(.*?)(?:[ \t]+#+[ \t]*)?$/,
    );
    if (!atxMatch) {
      continue;
    }

    const title = atxMatch[4]?.trim() ?? "";
    if (title.length === 0) {
      continue;
    }

    const titleStartCharacter =
      atxMatch[1].length + atxMatch[2].length + atxMatch[3].length;
    headings.push({
      level: atxMatch[2].length,
      title,
      line: lineIndex,
      titleStartCharacter,
      titleEndCharacter: titleStartCharacter + title.length,
    });
  }

  return headings;
}

export function collectAtxHeadingSymbols(
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  const symbols: vscode.DocumentSymbol[] = [];
  const stack: Array<{ level: number; symbol: vscode.DocumentSymbol }> = [];

  for (const heading of collectAtxHeadingCandidates(document.getText())) {
    const symbol = new vscode.DocumentSymbol(
      heading.title,
      `H${heading.level}`,
      vscode.SymbolKind.Namespace,
      new vscode.Range(
        new vscode.Position(heading.line, 0),
        new vscode.Position(heading.line, heading.titleEndCharacter),
      ),
      new vscode.Range(
        new vscode.Position(heading.line, heading.titleStartCharacter),
        new vscode.Position(heading.line, heading.titleEndCharacter),
      ),
    );

    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.symbol.children.push(symbol);
    } else {
      symbols.push(symbol);
    }

    stack.push({ level: heading.level, symbol });
  }

  return symbols;
}

export function createGrowiDocumentSymbolProvider(): vscode.DocumentSymbolProvider {
  return {
    provideDocumentSymbols(
      document: vscode.TextDocument,
    ): vscode.DocumentSymbol[] {
      return collectAtxHeadingSymbols(document);
    },
  };
}

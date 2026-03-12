export interface MarkdownLinkCandidate {
  isImage: boolean;
  rawTarget: string;
  normalizedTarget: string;
  targetStartOffset: number;
  targetEndOffset: number;
}

export function normalizeMarkdownLinkTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  const noAngleBrackets =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const [target] = noAngleBrackets.split(/\s+/);
  return target ?? "";
}

export function collectMarkdownLinkCandidates(
  text: string,
): MarkdownLinkCandidate[] {
  const pattern = /(!?)\[[^\]]*]\(([^)]+)\)/g;
  const candidates: MarkdownLinkCandidate[] = [];

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const isImage = match[1] === "!";
    const rawTarget = match[2];
    if (!rawTarget || typeof match.index !== "number") {
      continue;
    }

    const targetStartOffset = match.index + fullMatch.indexOf("(") + 1;
    const targetEndOffset = targetStartOffset + rawTarget.length;
    candidates.push({
      isImage,
      rawTarget,
      normalizedTarget: normalizeMarkdownLinkTarget(rawTarget),
      targetStartOffset,
      targetEndOffset,
    });
  }

  return candidates;
}

import * as vscode from "vscode";
import type {
  CurrentPageDetailAction,
  CurrentPageDetailPreviewList,
  CurrentPageDetailSummary,
  CurrentPageDetailWebviewInput,
  UriLike,
} from "./commands";
import { localize } from "./l10n";

interface CurrentPageDetailWebviewLabels {
  pageDetail: string;
  pageInfo: string;
  pageInfoDescription: string;
  backlinks: string;
  backlinksDescription: string;
  attachments: string;
  attachmentsDescription: string;
  revisions: string;
  revisionsDescription: string;
  unavailable: string;
  status: string;
  pageInfoUnavailable: string;
  unknown: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  partial: string;
  count: string;
  empty: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createNonce(): string {
  const source =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += source[Math.floor(Math.random() * source.length)];
  }
  return nonce;
}

function toVscodeUri(uri: UriLike): vscode.Uri {
  if (uri.scheme === "file") {
    return vscode.Uri.file(uri.fsPath ?? uri.path);
  }
  return vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
}

function renderAction(action: CurrentPageDetailAction): string {
  return `<button class="action-button" type="button" data-command="${escapeHtml(
    action.command,
  )}">
    ${escapeHtml(action.label)}
  </button>`;
}

function renderCount(
  input: CurrentPageDetailPreviewList,
  labels: CurrentPageDetailWebviewLabels,
): string {
  if (input.unavailableReason) {
    return `<span class="count">${escapeHtml(input.unavailableReason)}</span>`;
  }
  if (input.totalCount === undefined) {
    return "";
  }
  const suffix = input.partial ? labels.partial : labels.count;
  return `<span class="count">${input.totalCount}${suffix}</span>`;
}

function renderPreviewItems(
  input: CurrentPageDetailPreviewList,
  labels: CurrentPageDetailWebviewLabels,
): string {
  if (input.items.length === 0) {
    return `<li class="empty">${escapeHtml(labels.empty)}</li>`;
  }
  return input.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
}

function renderPageInfo(
  summary: CurrentPageDetailSummary | undefined,
  labels: CurrentPageDetailWebviewLabels,
): string {
  const info = summary?.pageInfo;
  if (!info) {
    return `<dl class="metadata"><div><dt>${escapeHtml(labels.status)}</dt><dd>${escapeHtml(labels.pageInfoUnavailable)}</dd></div></dl>`;
  }
  const rows = [
    ["URL", info.url],
    ["pageId", info.pageId],
    ["revision", info.revisionId ?? labels.unknown],
    [labels.lastUpdatedBy, info.lastUpdatedBy],
    [labels.lastUpdatedAt, info.lastUpdatedAt],
  ];
  return `<dl class="metadata">${rows
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("\n")}</dl>`;
}

function findAction(
  actions: readonly CurrentPageDetailAction[],
  command: string,
): CurrentPageDetailAction | undefined {
  return actions.find((action) => action.command === command);
}

function renderPreviewSection(input: {
  title: string;
  description: string;
  preview?: CurrentPageDetailPreviewList;
  action?: CurrentPageDetailAction;
  labels: CurrentPageDetailWebviewLabels;
}): string {
  const action = input.action ? renderAction(input.action) : "";
  const preview = input.preview ?? {
    items: [],
    unavailableReason: input.labels.unavailable,
  };
  return `<section class="section">
    <div class="section-header">
      <div>
        <h2>${escapeHtml(input.title)} ${renderCount(preview, input.labels)}</h2>
        <p>${escapeHtml(input.description)}</p>
      </div>
      ${action}
    </div>
    <ol class="preview-list">${renderPreviewItems(preview, input.labels)}</ol>
  </section>`;
}

export function renderPageDetailHtml(input: {
  canonicalPath: string;
  actions: readonly CurrentPageDetailAction[];
  summary?: CurrentPageDetailSummary;
  cspSource: string;
  nonce: string;
  labels: CurrentPageDetailWebviewLabels;
}): string {
  const pageInfoAction = findAction(input.actions, "growi.showCurrentPageInfo");
  const backlinkAction = findAction(input.actions, "growi.showBacklinks");
  const attachmentAction = findAction(
    input.actions,
    "growi.showCurrentPageAttachments",
  );
  const revisionAction = findAction(
    input.actions,
    "growi.showRevisionHistoryDiff",
  );
  const language = escapeHtml(vscode.env.language || "en");
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource} 'unsafe-inline'; script-src 'nonce-${input.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.labels.pageDetail)}</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 20px 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .header {
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 600;
    }
    .path {
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      overflow-wrap: anywhere;
    }
    .actions {
      display: grid;
      gap: 8px;
      max-width: 720px;
      margin-top: 20px;
    }
    .summary {
      display: grid;
      gap: 12px;
      max-width: 860px;
      margin-top: 20px;
    }
    .section {
      padding: 14px 16px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }
    .section-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    p {
      margin: 4px 0 0;
      color: var(--vscode-descriptionForeground);
    }
    .count {
      margin-left: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      font-weight: 400;
    }
    .metadata {
      display: grid;
      gap: 8px;
      margin: 12px 0 0;
    }
    .metadata div {
      display: grid;
      grid-template-columns: minmax(88px, 128px) minmax(0, 1fr);
      gap: 12px;
    }
    dt {
      color: var(--vscode-descriptionForeground);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .preview-list {
      display: grid;
      gap: 6px;
      margin: 12px 0 0;
      padding-left: 20px;
    }
    .preview-list li {
      overflow-wrap: anywhere;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      list-style: none;
      margin-left: -20px;
    }
    .action-button {
      flex: 0 0 auto;
      display: grid;
      gap: 4px;
      min-height: 30px;
      padding: 5px 10px;
      text-align: center;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
      font: inherit;
    }
    .action-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .action-button:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>${escapeHtml(input.labels.pageDetail)}</h1>
    <div class="path">${escapeHtml(input.canonicalPath)}</div>
  </header>
  <main class="summary">
    <section class="section">
      <div class="section-header">
        <div>
          <h2>${escapeHtml(input.labels.pageInfo)}</h2>
          <p>${escapeHtml(input.labels.pageInfoDescription)}</p>
        </div>
        ${pageInfoAction ? renderAction(pageInfoAction) : ""}
      </div>
      ${renderPageInfo(input.summary, input.labels)}
    </section>
    ${renderPreviewSection({
      title: input.labels.backlinks,
      description: input.labels.backlinksDescription,
      preview: input.summary?.backlinks,
      action: backlinkAction,
      labels: input.labels,
    })}
    ${renderPreviewSection({
      title: input.labels.attachments,
      description: input.labels.attachmentsDescription,
      preview: input.summary?.attachments,
      action: attachmentAction,
      labels: input.labels,
    })}
    ${renderPreviewSection({
      title: input.labels.revisions,
      description: input.labels.revisionsDescription,
      preview: input.summary?.revisions,
      action: revisionAction,
      labels: input.labels,
    })}
  </main>
  <script nonce="${input.nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("button[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({
          type: "runAction",
          command: button.dataset.command
        });
      });
    });
  </script>
</body>
</html>`;
}

export function createCurrentPageDetailWebviewController(context: {
  extensionUri: vscode.Uri;
  executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
}) {
  let panel: vscode.WebviewPanel | undefined;
  let messageDisposable: vscode.Disposable | undefined;

  return {
    open(input: CurrentPageDetailWebviewInput): void {
      const title = localize("Page Details: {0}", input.canonicalPath);
      if (panel) {
        panel.title = title;
        panel.reveal(vscode.ViewColumn.Beside);
      } else {
        panel = vscode.window.createWebviewPanel(
          "growi.currentPageDetail",
          title,
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            localResourceRoots: [context.extensionUri],
          },
        );
        panel.onDidDispose(() => {
          messageDisposable?.dispose();
          messageDisposable = undefined;
          panel = undefined;
        });
      }

      const allowedCommands = new Set(
        input.actions.map((action) => action.command),
      );
      const targetUri = toVscodeUri(input.targetUri);
      messageDisposable?.dispose();
      messageDisposable = panel.webview.onDidReceiveMessage(
        async (message: unknown) => {
          if (
            !message ||
            typeof message !== "object" ||
            !("type" in message) ||
            message.type !== "runAction" ||
            !("command" in message) ||
            typeof message.command !== "string" ||
            !allowedCommands.has(message.command)
          ) {
            return;
          }
          await context.executeCommand(message.command, targetUri);
        },
      );

      panel.webview.html = renderPageDetailHtml({
        canonicalPath: input.canonicalPath,
        actions: input.actions,
        summary: input.summary,
        cspSource: panel.webview.cspSource,
        nonce: createNonce(),
        labels: {
          pageDetail: localize("Page Details"),
          pageInfo: localize("Page Info"),
          pageInfoDescription: localize("URL, pageId, revision, and updates"),
          backlinks: localize("Backlinks"),
          backlinksDescription: localize(
            "Top 5 pages linking to the current page",
          ),
          attachments: localize("Attachments"),
          attachmentsDescription: localize(
            "Top 5 attachments for the current page",
          ),
          revisions: localize("History"),
          revisionsDescription: localize("Top 5 recent revisions"),
          unavailable: localize("Not loaded"),
          status: localize("Status"),
          pageInfoUnavailable: localize("Could not retrieve page info"),
          unknown: localize("Unknown"),
          lastUpdatedBy: localize("Updated by"),
          lastUpdatedAt: localize("Updated at"),
          partial: localize("partial"),
          count: localize(" items"),
          empty: localize("No displayable items"),
        },
      });
    },
    dispose(): void {
      messageDisposable?.dispose();
      messageDisposable = undefined;
      panel?.dispose();
      panel = undefined;
    },
  };
}

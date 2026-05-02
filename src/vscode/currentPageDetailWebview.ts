import * as vscode from "vscode";
import type {
  CurrentPageDetailAction,
  CurrentPageDetailPreviewList,
  CurrentPageDetailSummary,
  CurrentPageDetailWebviewInput,
  UriLike,
} from "./commands";

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

function renderCount(input: CurrentPageDetailPreviewList): string {
  if (input.unavailableReason) {
    return `<span class="count">${escapeHtml(input.unavailableReason)}</span>`;
  }
  if (input.totalCount === undefined) {
    return "";
  }
  const suffix = input.partial ? "一部表示" : "件";
  return `<span class="count">${input.totalCount}${suffix}</span>`;
}

function renderPreviewItems(input: CurrentPageDetailPreviewList): string {
  if (input.items.length === 0) {
    return `<li class="empty">表示できる項目はありません</li>`;
  }
  return input.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
}

function renderPageInfo(summary?: CurrentPageDetailSummary): string {
  const info = summary?.pageInfo;
  if (!info) {
    return `<dl class="metadata"><div><dt>状態</dt><dd>ページ情報を取得できません</dd></div></dl>`;
  }
  const rows = [
    ["URL", info.url],
    ["pageId", info.pageId],
    ["revision", info.revisionId ?? "不明"],
    ["更新者", info.lastUpdatedBy],
    ["更新日時", info.lastUpdatedAt],
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
}): string {
  const action = input.action ? renderAction(input.action) : "";
  const preview = input.preview ?? {
    items: [],
    unavailableReason: "未取得",
  };
  return `<section class="section">
    <div class="section-header">
      <div>
        <h2>${escapeHtml(input.title)} ${renderCount(preview)}</h2>
        <p>${escapeHtml(input.description)}</p>
      </div>
      ${action}
    </div>
    <ol class="preview-list">${renderPreviewItems(preview)}</ol>
  </section>`;
}

function renderPageDetailHtml(input: {
  canonicalPath: string;
  actions: readonly CurrentPageDetailAction[];
  summary?: CurrentPageDetailSummary;
  cspSource: string;
  nonce: string;
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
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource} 'unsafe-inline'; script-src 'nonce-${input.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ページ詳細</title>
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
    <h1>ページ詳細</h1>
    <div class="path">${escapeHtml(input.canonicalPath)}</div>
  </header>
  <main class="summary">
    <section class="section">
      <div class="section-header">
        <div>
          <h2>ページ情報</h2>
          <p>URL、pageId、revision、更新情報</p>
        </div>
        ${pageInfoAction ? renderAction(pageInfoAction) : ""}
      </div>
      ${renderPageInfo(input.summary)}
    </section>
    ${renderPreviewSection({
      title: "被リンク",
      description: "現在ページへの参照元 top 5",
      preview: input.summary?.backlinks,
      action: backlinkAction,
    })}
    ${renderPreviewSection({
      title: "添付",
      description: "現在ページに紐づく添付 top 5",
      preview: input.summary?.attachments,
      action: attachmentAction,
    })}
    ${renderPreviewSection({
      title: "履歴",
      description: "最近の revision top 5",
      preview: input.summary?.revisions,
      action: revisionAction,
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
      const title = `ページ詳細: ${input.canonicalPath}`;
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

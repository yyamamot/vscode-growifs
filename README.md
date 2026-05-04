# vscode-growifs

[日本語](https://github.com/yyamamot/vscode-growifs/blob/main/README.ja.md) | English

## Overview

`vscode-growifs` is a desktop VS Code extension for browsing, editing, and exploring [GROWI](https://growi.org/) pages from VS Code.

It does not mount GROWI as an operating system filesystem. Instead, it exposes pages as virtual Markdown documents through the `growi:` scheme. The page tree is not added to the VS Code workspace; use the dedicated `GROWI` view under Explorer and the Command Palette.

When needed, you can also use a local mirror to export GROWI pages as local Markdown files. This makes GROWI content easier to inspect with local tools or an LLM, while keeping diff review and apply operations in VS Code Source Control.

The experimental LLM Assist Kit prepares Skills and prompts for local mirror editing and SCM diff review. It scopes which files an LLM may read or edit and keeps the final GROWI apply decision in Source Control View.

<!-- screenshot: overview-explorer / GROWI Explorer overview with hybrid directory pages / dark theme -->
<p align="center">
  <a href="#quick-start">
    <img src="assets/readme1.png" alt="GROWI Explorer overview and welcome actions" width="960">
  </a>
</p>

## What You Can Do

- Open GROWI pages as Markdown in VS Code
- Browse registered prefixes in the dedicated `GROWI` view under Explorer
- Create pages with GROWI hierarchy templates when available
- Switch page edit state with `Start Edit` / `End Edit` or the status bar
- Rename and delete pages from the current page or Explorer items
- Inspect attachments from the current page and open them in GROWI Web
- Open diffs between the current body and past revisions
- Find backlinks inside registered prefix ranges
- Use a local mirror for local Markdown editing, Source Control diff review, and GROWI apply
- Use experimental LLM Assist Kit to prepare Skills and prompts for local mirror editing and SCM diff review

## Installation

To install from the VS Code Marketplace:

1. Open the Extensions view
2. Search for `growifs`
3. Select `yyamamot.growifs`
4. Press `Install`
5. Configure the GROWI base URL and API token

## Quick Start

### 1. Configure Base URL

Run `GROWI: Configure Base URL` from the Command Palette and enter the target GROWI URL.

| Item | Details |
| --- | --- |
| Examples | `https://growi.example.com/`, `http://localhost:3000/` |
| Requirement | The URL must start with `http://` or `https://` |

### 2. Configure API Token

Run `GROWI: Configure API Token` from the Command Palette and enter a GROWI API token. The token is stored in VS Code Secret Storage and is not written to settings.

### 3. Open a Page

Run `GROWI: Open Page`. It accepts:

- Page paths such as `/team/dev`
- GROWI page URLs copied from the browser
- GROWI permalink URLs that include a page ID

`Open Page` also shows page path and basename candidates under registered prefixes. It does not perform full-text search across the entire GROWI instance.

### 4. Add Prefixes and Browse in Explorer

Run `GROWI: Add Prefix` to register the prefix you want to browse.

| Item | Details |
| --- | --- |
| Examples | `/team`, `/team/dev`, `https://growi.example.com/67ca...` |
| Location | Dedicated `GROWI` view under Explorer |

The `GROWI` view title actions provide `Open Page`, `Add Prefix`, `Refresh Listing`, `Show Bookmarks`, and `Clear Prefixes`. Context menus provide page open, browser open, create here, rename, delete, backlinks, and local mirror actions.

<!-- screenshot: explorer-prefix-root / Prefix root and context actions in growi explorer / dark theme -->
<p align="center">
  <a href="#commands">
    <img src="assets/readme2.png" alt="Prefix root synthetic page and context actions" width="520">
  </a>
</p>

GROWI can have a page with the same name as a directory. This extension shows that real page separately as `__<name>__.md` next to the directory row.

### 5. Edit a Page

Open the target page and run `GROWI: Start Edit`. You can also switch from the `$(lock) Read-only` status bar item.

During editing, the status bar changes to `$(unlock) Editing`. After saving, run `GROWI: End Edit` to return to read-only mode.

Only pages in edit mode can be saved. Read-only pages are protected from accidental saves.

<!-- screenshot: edit-mode / Status bar edit mode toggle and protected save state / dark theme -->
<p align="center">
  <a href="#commands">
    <img src="assets/readme-edit-mode.png" alt="Edit mode status bar and save protection" width="960">
  </a>
</p>

## Local Mirror and Source Control

Local mirror is optional. Use it when you want to handle GROWI pages as local Markdown files.

The basic flow has three steps:

1. Run `Sync This Page Locally` or `Sync Child Pages Locally`
2. Run `Check This Page Diff` or `Check Child Page Diffs`
3. Use `Apply to GROWI` or `Take Remote Changes` from Source Control View for selected resources

<!-- screenshot: local-mirror / Local mirror layout and compare workflow / dark theme -->
<p align="center">
  <a href="#local-mirror-and-source-control">
    <img src="assets/readme3.png" alt="Local mirror layout with __sample__.md and local files" width="260">
  </a>
</p>

<p align="center">
  <a href="#local-mirror-and-source-control">
    <img src="assets/readme4.png" alt="Local mirror diff workflow" width="960">
  </a>
</p>

Mirrors are created under `.growi-mirrors/<instanceKey>/<rootCanonicalPath>/` inside the workspace. `instanceKey` is a filesystem-safe identifier derived from `host + port + basePath`; for example, `http://localhost:3000/` becomes `localhost_3000`.

The default subtree sync limit is 50 pages. You can change it with `growi.localMirror.maxPrefixPages`; values above 200 are clamped to 200. For large subtrees, split the target into smaller prefixes.

Source Control View shows the latest successful compare result as `GROWI Mirror Compare`.

| Group | Meaning |
| --- | --- |
| `Local Changes` | The local mirror has changes that are not applied to GROWI |
| `GROWI Changes` | The GROWI revision has advanced since the mirror was created |
| `Conflicts` | Both the local mirror and GROWI have changes |

Saving Markdown under the local mirror updates `Local Changes` in Source Control View. To confirm GROWI-side changes or conflicts, run `Check This Page Diff`, `Check Child Page Diffs`, or `Compare Again` from Source Control View.

### LLM Assist Kit (Experimental)

LLM Assist Kit prepares prompt and diff review context files for giving local mirror work to an LLM. The generated artifacts state which files may be read, which Markdown files may be edited, and which GROWI / SCM operations must not be run.

The main flow is:

1. Run `GROWI: Install LLM Local Mirror Skills` to generate `.agents/skills/growi-local-mirror-prompt/` and `.agents/skills/growi-local-mirror-diff/`
2. Sync the local mirror, then run `GROWI: Prepare LLM Local Mirror Prompt` and give `.growi-agent/prompt/current/` to the LLM
3. After compare, run `GROWI: Prepare LLM Local Mirror Diff` from Source Control View and give `.growi-agent/diff/current/` to the LLM for diff review

In Codex, you may use `$growi-local-mirror-prompt` or `$growi-local-mirror-diff` when useful. For LLMs with different Skill syntax, explicitly provide the generated files instead.

| Purpose | Files to provide to the LLM |
| --- | --- |
| Local mirror editing | `.agents/skills/growi-local-mirror-prompt/SKILL.md`, `.agents/skills/growi-local-mirror-prompt/agents/generic.md`, `.growi-agent/prompt/current/prompt.md` |
| SCM diff review | `.agents/skills/growi-local-mirror-diff/SKILL.md`, `.agents/skills/growi-local-mirror-diff/agents/generic.md`, `.growi-agent/diff/current/prompt.md` |

| Generated path | Purpose |
| --- | --- |
| `.agents/skills/growi-local-mirror-prompt/` | Skill for editing local mirror Markdown |
| `.agents/skills/growi-local-mirror-diff/` | Skill for reading SCM diff evidence |
| `.growi-agent/prompt/current/` | Prompt and editable file list for an editing request |
| `.growi-agent/diff/current/` | Prompt and patches for SCM diff review |

`.growi-agent/` is generated output. The extension may ask whether to add `.growi-mirrors/` and `.growi-agent/` to `.gitignore`, but it does not ignore `.agents/skills/**`.

LLM Assist Kit does not call GROWI APIs, run SCM commands, or apply changes to GROWI. The final review and apply operation stays in Source Control View.

## Commands

Most operations are available from the `GROWI` TreeView context menu. Many are also available from the Command Palette.

### Connection and Browse

| Command | Purpose |
| --- | --- |
| `GROWI: Configure Base URL` | Configure the target GROWI URL |
| `GROWI: Configure API Token` | Save the API token in Secret Storage |
| `GROWI: Open README` | Open this README |
| `GROWI: Open Page` | Open a page from a path, URL, or permalink |
| `GROWI: Add Prefix` | Add a browse prefix to the `GROWI` view |
| `GROWI: Refresh Listing` | Refresh pages under registered prefixes |
| `GROWI: Clear Prefixes` | Clear prefixes for the current base URL |
| `GROWI: Show Bookmarks` | Show GROWI root bookmarks as open candidates |

### Page Operations

| Command | Purpose |
| --- | --- |
| `GROWI: Create Page` | Create a new page |
| `GROWI: Start Edit` | Start editing the current page |
| `GROWI: End Edit` | End edit mode |
| `GROWI: Refresh Current Page` | Reload the current page |
| `GROWI: Rename Page` | Rename the current page canonical path |
| `GROWI: Delete Page` | Move the current page to trash |
| `GROWI: Show Current Page Actions` | Show available current-page actions in Quick Pick |

### Reference Information

| Command | Purpose |
| --- | --- |
| `GROWI: Show Current Page Info` | Show URL, path, updater, and related page metadata |
| `GROWI: Show Current Page Attachments` | Show attachments for the current page |
| `GROWI: Show Backlinks` | Search backlinks inside registered prefixes |
| `GROWI: Show Revision History Diff` | Open a diff between a past revision and the current body |

### Local Mirror

| Command | Purpose |
| --- | --- |
| `GROWI: Sync Local Mirror for Current Page` | Sync the current page to the local mirror |
| `GROWI: Sync Local Mirror for Current Prefix` | Sync the current subtree to the local mirror |
| `GROWI: Compare Local Mirror with GROWI` | Compare the local mirror with GROWI |
| `GROWI: Upload Local Mirror to GROWI` | Apply local mirror changes to GROWI |
| `GROWI: Install LLM Local Mirror Skills` | Generate the LLM Assist Kit Skills |
| `GROWI: Prepare LLM Local Mirror Prompt` | Generate edit prompt artifacts under `.growi-agent/prompt/current/` |
| `GROWI: Prepare LLM Local Mirror Diff` | Generate diff review artifacts under `.growi-agent/diff/current/` from the SCM snapshot |
| `Compare Again` | Refresh the Source Control View compare result |
| `Check GROWI Updates` | Check GROWI-side updates from Source Control View |
| `Apply to GROWI` | Apply selected Source Control resources to GROWI |
| `Take Remote Changes` | Take selected GROWI-side changes into the local mirror |

## Settings

| Setting | Default | Details |
| --- | --- | --- |
| `growi.baseUrl` | `""` | Target GROWI URL |
| `growi.pageListing.initialPageSize` | `100` | Initial page count fetched for prefix listing |
| `growi.pageListing.maxAutoPagesPerPrefix` | `300` | Maximum pages searched per prefix after `Open Page` input |
| `growi.localMirror.maxPrefixPages` | `50` | Maximum pages to sync for subtree local mirror; clamped to 200 |

The API token is stored in VS Code Secret Storage, not in settings.

## Requirements / Compatibility

| Item | Requirement |
| --- | --- |
| VS Code | Desktop VS Code `1.105+` |
| GROWI | GROWI `7.x` |
| Authentication | GROWI API token |
| API | GROWI 7.x APIs for page read, listing, save, create, rename, delete, revisions, bookmarks, and attachments |

If some APIs are not available in your GROWI environment, only the corresponding features may be unavailable.

## Limitations

| Limitation | Details |
| --- | --- |
| OS-level mount | This is not a FUSE-like local drive |
| Generic non-VS Code client support | The extension is designed for VS Code Desktop |
| Multiple simultaneous GROWI connections | The active base URL is the only visible connection |
| Full-text search across the whole instance | `Open Page` focuses on candidates under registered prefixes |
| Permanent delete and restore | `GROWI: Delete Page` moves pages to trash |
| Attachment upload, delete, and body insertion | Not supported in the current version |
| Non-image attachment preview | Use the attachment list and open the item in GROWI Web |
| `FILE_UPLOAD=local` `/attachment/{attachmentId}` preview | Token-only preview does not cover login-session or cookie-dependent assets |
| Generic relative/external URL resolution | Wiki link navigation assumes the same GROWI instance |
| draw.io / diagrams.net / PlantUML / Mermaid rendering | Diagrams are not rendered in the current version |
| Automatic merge | Ambiguous local mirror apply cases fall back to conflict or skip |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Base URL is rejected | Confirm it starts with `http://` or `https://` |
| API token fails | Confirm the GROWI 7.x API token is valid and has no extra whitespace |
| Added prefixes show nothing | Confirm the prefix starts with `/`, target pages exist, and Base URL / API token are correct |
| Page cannot be saved | Confirm `GROWI: Start Edit` is active |
| Attachment images do not show in Preview | Confirm the image uses a token-readable same-host URL |
| Backlinks are incomplete | Only registered prefix ranges are searched |
| Local mirror cannot sync | Confirm a file workspace is open and existing mirror files do not have local changes |
| `Apply to GROWI` fails | Run compare first and resolve conflicts or missing remote pages |
| Source Control View is empty | Confirm the local mirror is under the workspace and compare succeeded |
| Revision diff cannot open | Confirm revision APIs are available on the GROWI side |

## Development

Requirements:

- Node.js `22+`
- pnpm

Main commands:

```bash
pnpm run build
pnpm run test:unit
pnpm run test:integration
pnpm run lint
```

During F5 debug runs, runtime JSONL logs can be enabled with `GROWI_RUNTIME_MODE=debug-f5`. `GROWI_JSONL_PATH` takes precedence for the output path; otherwise logs are written under `.growi-logs/runtime/*.jsonl`. Use the `GROWI` view title action or `GROWI: Reveal Runtime Logs` to open the log location, and `GROWI: Clear Runtime Logs` to delete `.jsonl` files.

## License

- License: [MIT](./LICENSE)

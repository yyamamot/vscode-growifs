# Changelog

[日本語](https://github.com/yyamamot/vscode-growifs/blob/main/CHANGELOG.ja.md) | English

## 0.0.8 (2026-05-04)

- Added English / Japanese localization for UI text.
- Added LLM Assist Kit for local mirror editing and diff review.

## 0.0.7 (2026-05-02)

- Made `GROWI` Explorer prefix expansion lazy and added `Load More` for large prefixes.
- Reworked TreeView context menus and local mirror / SCM wording so targets and apply direction are easier to understand.
- Added automatic detection of local mirror Markdown changes and reflected them in Source Control without requiring manual compare first.
- Avoided modifying the installed extension directory after Marketplace / VSIX installation by moving `Open README` and local mirror write / delete paths away from the install root.

## 0.0.6 (2026-04-19)

- Put the direct `URL / path` input option first in `Open Page` when the input starts with `/` or `http(s)://`.
- Added an `Open Page` entry from the top of the `GROWI` view so pages can be opened without using the Command Palette first.
- Improved `Open Page` candidate ranking by page name and path segment, and kept direct URL / path input available when there are no candidates.
- Linked current-page bookmarks with GROWI root bookmarks so `Show Bookmarks` can reopen or manually remove them.
- Made `Show Bookmarks` indicate whether each bookmark is outside registered prefixes or cannot be opened.
- Showed `Compare Local Mirror with GROWI` results in Source Control and Explorer to make local changes, remote changes, and conflicts easier to find.
- Added prefix-root context actions to sync child pages to the local mirror.

## 0.0.5 (2026-04-16)

- Applied GROWI hierarchy templates when using `Create Page` / `Create Here`, with `_template` first and ancestor `__template` fallback.
- Updated status bar edit state labels to `$(lock) Read-only` / `$(unlock) Editing` and made Start Edit / End Edit easier to toggle.
- Added a Quick Pick attachment list for the current page and a path to open selected attachments in GROWI Web.
- Added JSONL diagnostic logs only for F5 debug runtime, with commands to reveal the log location and clear runtime logs.
- Added browser-open support from Explorer context menus for pages, synthetic pages, and prefix roots.
- Standardized `GROWI` view title actions as icons to reduce horizontal pressure from `Add Prefix`, `Refresh Listing`, `Clear Prefixes`, and runtime log actions.
- Updated README workflow descriptions around the current `GROWI` view and Command Palette entry points.

## 0.0.4 (2026-04-12)

- Breaking change: stopped treating the `growi:` prefix as a workspace root and moved browsing to the dedicated Explorer `GROWI` view and Command Palette.
- Clarified that local mirror commands require an open local `file:` workspace or folder.
- Breaking change: changed local mirror storage to `.growi-mirrors/<instanceKey>/` and removed automatic migration from the old `.growi-workspaces` layout.

## 0.0.3 (2026-04-04)

- Added page create, rename, and delete support.

## 0.0.2 (2026-03-15)

- Breaking change: migrated workspace mirror layout to `.growi-workspaces/<instanceKey>/` and `.growi-mirror.json`, changing compatibility with the old mirror naming and layout.

## 0.0.1 (2026-03-13)

- Initial release. Deprecated because the publisher name changed.

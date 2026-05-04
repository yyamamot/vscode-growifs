import { describe, expect, it } from "vitest";

import {
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createCreatePageCommand,
  createDeletePageCommand,
  createDeletePrefixCommand,
  createExplorerCreatePageHereCommand,
  createExplorerDeletePageCommand,
  createExplorerRefreshCurrentPageCommand,
  createExplorerRenamePageCommand,
  createExplorerShowCurrentPageInfoCommand,
  createRenamePageCommand,
  GROWI_COMMANDS,
  GROWI_SECRET_KEYS,
  normalizeBaseUrl,
} from "../../src/vscode/commands";
import { createDeps, createUri } from "./commandsTestUtils";

describe("normalizeBaseUrl", () => {
  it("accepts http and https URLs", () => {
    expect(normalizeBaseUrl("https://growi.example.com")).toEqual({
      ok: true,
      value: "https://growi.example.com/",
    });
    expect(normalizeBaseUrl("http://localhost:3000/")).toEqual({
      ok: true,
      value: "http://localhost:3000/",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(normalizeBaseUrl("ftp://growi.example.com")).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
  });
});

describe("createConfigureBaseUrlCommand", () => {
  it("stores a normalized base URL", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://old.example.com/");
    deps.showInputBox.mockResolvedValue("https://growi.example.com");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).toHaveBeenCalledWith(
      "https://growi.example.com/",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Updated the GROWI base URL.",
    );
  });

  it("keeps API token handling out of public configuration", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("https://growi.example.com");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).toHaveBeenCalledWith(
      "https://growi.example.com/",
    );
    expect(deps.storeSecret).not.toHaveBeenCalled();
  });

  it("rejects invalid base URLs", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("not-a-url");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter an http:// or https:// URL for the GROWI base URL.",
    );
  });
});

describe("createConfigureApiTokenCommand", () => {
  it("stores a non-empty token in secret storage", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("  secret-token  ");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).toHaveBeenCalledWith(
      GROWI_SECRET_KEYS.apiToken,
      "secret-token",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Saved the GROWI API token.",
    );
  });

  it("does not write API token into public settings", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("secret-token");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).toHaveBeenCalledWith(
      GROWI_SECRET_KEYS.apiToken,
      "secret-token",
    );
    expect(deps.updateBaseUrl).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("   ");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI API token cannot be empty.",
    );
  });
});

describe("createAddPrefixCommand", () => {
  it("shows placeholder and prompt for canonical path and idurl input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue(undefined);

    await createAddPrefixCommand(deps)();

    expect(deps.showInputBox).toHaveBeenCalledWith({
      placeHolder: "https://growi.example.com/67ca... or /team/dev",
      prompt: "Enter the prefix or same-instance idurl to register",
      title: "GROWI: Add Prefix",
    });
  });

  it("adds prefix and shows information message", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev"],
      added: true,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev");
    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Added the GROWI prefix.",
    );
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("resolves same-instance idurl before registering prefix", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/team/dev/spec",
      uri: "growi:/team/dev/spec.md",
    });
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev/spec"],
      added: true,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "pageIdPermalink",
      pageId: "0123456789abcdefabcdef01",
      source: "url",
    });
    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Added the GROWI prefix.",
    );
  });

  it("shows an error when base URL is not configured", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({ ok: false, reason: "InvalidBaseUrl" });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL is not configured. Run Configure Base URL first.",
    );
  });

  it("shows an error for invalid prefix path", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("team/dev");

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter a page path starting with / for Prefix.",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("rejects foreign-host idurl input", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://other.example.com/wiki/0123456789abcdefabcdef01",
    );

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter a canonical path starting with / or a same-instance idurl for Prefix.",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("rejects non-idurl same-instance URL input", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/team/dev",
    );

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter a canonical path starting with / or a same-instance idurl for Prefix.",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("shows an error when idurl cannot be resolved", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    } as const);

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "No page was found for the specified idurl.",
    );
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it.each([
    [
      "BaseUrlNotConfigured",
      "GROWI base URL is not configured. Run Configure Base URL first.",
    ],
    [
      "ApiTokenNotConfigured",
      "GROWI API token is not configured. Run Configure API Token first.",
    ],
    [
      "InvalidApiToken",
      "GROWI API token is invalid. Check Configure API Token.",
    ],
    [
      "PermissionDenied",
      "GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
    ],
    [
      "ApiNotSupported",
      "Could not add the prefix because the pageId resolution API is not supported.",
    ],
    [
      "ConnectionFailed",
      "Could not add the prefix because the connection to GROWI failed.",
    ],
  ] as const)("shows an error when idurl resolution fails: %s", async (reason, message) => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: false,
      reason,
    } as const);

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("shows information for duplicate prefix re-sync", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev"],
      added: false,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "The specified prefix is already registered. Synced the Explorer view again.",
    );
    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error for ancestor conflict", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team");
    deps.addPrefix.mockResolvedValue({
      ok: false,
      reason: "AncestorConflict",
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "The specified prefix is an ancestor of an existing prefix. Specify a more specific prefix.",
    );
  });

  it("shows an error for descendant conflict", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/feature");
    deps.addPrefix.mockResolvedValue({
      ok: false,
      reason: "DescendantConflict",
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "The specified prefix is a descendant of an existing prefix. Specify a prefix that does not overlap existing prefixes.",
    );
  });
});

describe("createClearPrefixesCommand", () => {
  it("shows an error when base URL is not configured", async () => {
    const deps = createDeps();

    await createClearPrefixesCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL is not configured. Run Configure Base URL first.",
    );
    expect(deps.clearPrefixes).not.toHaveBeenCalled();
  });

  it("shows information when no prefixes are registered", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue([]);

    await createClearPrefixesCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "There are no prefixes to delete on the current target.",
    );
    expect(deps.showClearPrefixesConfirmation).not.toHaveBeenCalled();
  });

  it("does nothing when confirmation is cancelled", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.showClearPrefixesConfirmation.mockResolvedValue(false);

    await createClearPrefixesCommand(deps)();

    expect(deps.clearPrefixes).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("clears prefixes after confirmation", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev", "/team/ops"]);
    deps.clearPrefixes.mockResolvedValue({
      ok: true,
      value: [],
      cleared: true,
      removed: ["/team/dev", "/team/ops"],
    });

    await createClearPrefixesCommand(deps)();

    expect(deps.showClearPrefixesConfirmation).toHaveBeenCalledWith(
      "https://growi.example.com/",
      ["/team/dev", "/team/ops"],
    );
    expect(deps.clearPrefixes).toHaveBeenCalledTimes(1);
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Deleted the GROWI prefix registered on the current target.",
    );
  });
});

describe("createDeletePrefixCommand", () => {
  it("shows an error when the target is not a prefix root", async () => {
    const deps = createDeps();

    await createDeletePrefixCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
      contextValue: "growi.page",
    });

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "This is not the prefix root to delete.",
    );
    expect(deps.deletePrefix).not.toHaveBeenCalled();
  });

  it("deletes a registered prefix root and reports success", async () => {
    const deps = createDeps();
    deps.deletePrefix.mockResolvedValue({
      ok: true,
      value: ["/team/ops"],
      removed: true,
    });

    await createDeletePrefixCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.deletePrefix).toHaveBeenCalledWith("/team/dev");
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Deleted the target prefix.",
    );
  });

  it("treats an unregistered prefix root as a no-op", async () => {
    const deps = createDeps();
    deps.deletePrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev"],
      removed: false,
    });

    await createDeletePrefixCommand(deps)({
      uri: createUri("growi", "/team/ops/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.deletePrefix).toHaveBeenCalledWith("/team/ops");
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "The target prefix is not registered.",
    );
  });
});

describe("createCreatePageCommand", () => {
  it("creates a page with the resolved template body, opens it, and starts edit mode", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/new-page.md/");
    deps.resolveCreatePageBody.mockResolvedValue("# template body");

    await createCreatePageCommand(deps)();

    expect(deps.resolveCreatePageBody).toHaveBeenCalledWith(
      "/team/dev/new-page",
    );
    expect(deps.createPage).toHaveBeenCalledWith(
      "/team/dev/new-page",
      "# template body",
    );
    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/new-page.md");
    expect(deps.bootstrapEditSession).toHaveBeenCalledWith(
      "/team/dev/new-page",
    );
    expect(deps.setEditSession).toHaveBeenCalledWith(
      "/team/dev/new-page",
      expect.objectContaining({
        pageId: "page-123",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# title",
        dirty: false,
      }),
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("uses the injected initial value when opening the path prompt", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/new-page");

    await createCreatePageCommand(deps)({
      initialValue: "/team/dev/",
    });

    expect(deps.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "/team/dev/",
      }),
    );
    expect(deps.createPage).toHaveBeenCalledWith("/team/dev/new-page", "");
  });

  it("falls back to empty body when template resolution fails", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/new-page");
    deps.resolveCreatePageBody.mockResolvedValue("");

    await createCreatePageCommand(deps)();

    expect(deps.createPage).toHaveBeenCalledWith("/team/dev/new-page", "");
  });

  it("rejects invalid page path input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("team/dev/new-page");

    await createCreatePageCommand(deps)();

    expect(deps.createPage).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter a page path starting with / for Create Page.",
    );
  });

  it.each([
    ["AlreadyExists", "A page with the specified path already exists."],
    [
      "NotFound",
      "Cannot run Create Page because the specified parent page was not found.",
    ],
    [
      "InvalidApiToken",
      "GROWI API token is invalid. Check Configure API Token.",
    ],
    [
      "PermissionDenied",
      "GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
    ],
    [
      "ApiNotSupported",
      "Cannot run Create Page because the page creation API is not supported.",
    ],
    [
      "ConnectionFailed",
      "Cannot run Create Page because the connection to GROWI failed.",
    ],
  ] as const)("maps %s create failure to message", async (reason, message) => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/new-page");
    deps.createPage.mockResolvedValue({ ok: false, reason });

    await createCreatePageCommand(deps)();

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

describe("createDeletePageCommand", () => {
  it("deletes the current page and refreshes subtree state", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });

    await createDeletePageCommand(deps)();

    expect(deps.showDeletePageConfirmation).toHaveBeenCalledWith(
      "/team/dev/spec",
      "page",
    );
    expect(deps.deletePage).toHaveBeenCalledWith({
      pageId: "page-123",
      revisionId: "revision-001",
      canonicalPath: "/team/dev/spec",
      mode: "page",
    });
    expect(deps.clearSubtreeState).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/");
    expect(deps.closeDeletedPages).toHaveBeenCalledWith(
      "/team/dev/spec",
      "page",
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("asks for subtree scope when descendants exist", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/child"],
    });
    deps.showDeleteScopeConfirmation.mockResolvedValue("subtree");

    await createDeletePageCommand(deps)();

    expect(deps.showDeleteScopeConfirmation).toHaveBeenCalledWith(
      "/team/dev/spec",
    );
    expect(deps.showDeletePageConfirmation).toHaveBeenCalledWith(
      "/team/dev/spec",
      "subtree",
    );
    expect(deps.deletePage).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subtree",
      }),
    );
  });

  it("blocks delete when the active document is dirty", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.findOpenTextDocumentByUri.mockReturnValue({ isDirty: true });

    await createDeletePageCommand(deps)();

    expect(deps.deletePage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Cannot run Delete Page because there are unsaved changes. Save first.",
    );
  });

  it.each([
    [
      "HasChildren",
      "This page has child pages, so this page alone cannot be deleted. Delete child pages too.",
    ],
    [
      "NotFound",
      "Cannot run Delete Page because the target page was not found.",
    ],
    [
      "InvalidApiToken",
      "GROWI API token is invalid. Check Configure API Token.",
    ],
    [
      "PermissionDenied",
      "GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
    ],
    [
      "ApiNotSupported",
      "Cannot run Delete Page because the page deletion API is not supported.",
    ],
    [
      "ConnectionFailed",
      "Cannot run Delete Page because the connection to GROWI failed.",
    ],
  ] as const)("maps %s delete failure to message", async (reason, message) => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.deletePage.mockResolvedValue({ ok: false, reason });

    await createDeletePageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });

  it("shows a warning when deleted pages cannot be closed cleanly", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.closeDeletedPages.mockResolvedValue({
      attempted: true,
      hasFailed: true,
    });

    await createDeletePageCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "Delete Page succeeded, but some page tabs could not be closed. Close them manually.",
    );
  });
});

describe("createRenamePageCommand", () => {
  it("renames the current page and refreshes renamed subtree state", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");

    await createRenamePageCommand(deps)();

    expect(deps.renamePage).toHaveBeenCalledWith({
      pageId: "page-123",
      revisionId: "revision-001",
      currentCanonicalPath: "/team/dev/spec",
      targetCanonicalPath: "/team/dev/spec-renamed",
      mode: "page",
    });
    expect(deps.clearSubtreeState).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/");
    expect(deps.reopenRenamedPages).toHaveBeenCalledWith(
      "/team/dev/spec",
      "/team/dev/spec-renamed",
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("asks for subtree scope when descendants exist", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/child"],
    });
    deps.showRenameScopeConfirmation.mockResolvedValue("subtree");

    await createRenamePageCommand(deps)();

    expect(deps.showRenameScopeConfirmation).toHaveBeenCalledWith(
      "/team/dev/spec",
    );
    expect(deps.renamePage).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subtree",
      }),
    );
  });

  it("blocks rename when the active document is dirty", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.findOpenTextDocumentByUri.mockReturnValue({ isDirty: true });

    await createRenamePageCommand(deps)();

    expect(deps.renamePage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Cannot run Rename Page because there are unsaved changes. Save first.",
    );
  });

  it("rejects invalid target path input", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("team/dev/spec-renamed");

    await createRenamePageCommand(deps)();

    expect(deps.renamePage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Enter a page path starting with / for Rename Page.",
    );
  });

  it.each([
    ["AlreadyExists", "A page with the same path already exists."],
    [
      "ParentNotFound",
      "Cannot run Rename Page because the specified parent page was not found.",
    ],
    [
      "NotFound",
      "Cannot run Rename Page because the target page was not found.",
    ],
    [
      "InvalidApiToken",
      "GROWI API token is invalid. Check Configure API Token.",
    ],
    [
      "PermissionDenied",
      "GROWI access is insufficient or the server rejected authentication. Check permissions and the API token.",
    ],
    [
      "ApiNotSupported",
      "Cannot run Rename Page because the page rename API is not supported.",
    ],
    [
      "ConnectionFailed",
      "Cannot run Rename Page because the connection to GROWI failed.",
    ],
  ] as const)("maps %s rename failure to message", async (reason, message) => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");
    deps.renamePage.mockResolvedValue({ ok: false, reason });

    await createRenamePageCommand(deps)();

    expect(deps.reopenRenamedPages).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });

  it("shows server rejection detail when rename request is rejected", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");
    deps.renamePage.mockResolvedValue({
      ok: false,
      reason: "Rejected",
      message: "Rename Page request was rejected (HTTP 400: Invalid path).",
    });

    await createRenamePageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Rename Page request was rejected (HTTP 400: Invalid path).",
    );
  });

  it("shows detailed unsupported message when rename API reports 405", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");
    deps.renamePage.mockResolvedValue({
      ok: false,
      reason: "ApiNotSupported",
      message:
        "Rename Page endpoint returned HTTP 405. The connected GROWI may not support PUT /_api/v3/pages/rename.",
    });

    await createRenamePageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Rename Page endpoint returned HTTP 405. The connected GROWI may not support PUT /_api/v3/pages/rename.",
    );
  });

  it("shows a warning when renamed pages cannot be reopened cleanly", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-001",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.showInputBox.mockResolvedValue("/team/dev/spec-renamed");
    deps.reopenRenamedPages.mockResolvedValue({
      attempted: true,
      hasDirty: true,
      hasFailed: false,
    });

    await createRenamePageCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "Rename Page succeeded, but pages with unsaved changes were not reopened automatically. Open the new path manually.",
    );
  });
});

describe("Explorer context wrapper commands", () => {
  it("delegates current-page actions with a page URI as-is", async () => {
    const deps = createDeps();

    await createExplorerShowCurrentPageInfoCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.showCurrentPageInfo,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("maps prefix root items to their canonical page URI", async () => {
    const deps = createDeps();

    await createExplorerRefreshCurrentPageCommand(deps)({
      uri: createUri("growi", "/team/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.refreshCurrentPage,
      { scheme: "growi", path: "/team.md" },
    );
  });

  it("starts create page from a page item's parent path", async () => {
    const deps = createDeps();

    await createExplorerCreatePageHereCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.createPage,
      { initialValue: "/team/dev/" },
    );
  });

  it("starts create page from a directory path", async () => {
    const deps = createDeps();

    await createExplorerCreatePageHereCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.directory",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.createPage,
      { initialValue: "/team/dev/" },
    );
  });

  it("starts create page from a prefix root path", async () => {
    const deps = createDeps();

    await createExplorerCreatePageHereCommand(deps)({
      uri: createUri("growi", "/team/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.createPage,
      { initialValue: "/team/" },
    );
  });

  it("ignores invalid Explorer targets for create-here", async () => {
    const deps = createDeps();

    await createExplorerCreatePageHereCommand(deps)({
      uri: createUri("file", "/tmp/current.md"),
    });

    expect(deps.executeCommand).not.toHaveBeenCalled();
  });

  it("delegates rename from page items", async () => {
    const deps = createDeps();

    await createExplorerRenamePageCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.renamePage,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("delegates delete from directory page items", async () => {
    const deps = createDeps();

    await createExplorerDeletePageCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
      contextValue: "growi.directoryPage",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.deletePage,
      createUri("growi", "/team/dev.md"),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  createEndEditCommand,
  createRefreshCurrentPageCommand,
  createRefreshListingCommand,
  createStartEditCommand,
} from "../../src/vscode/commands";
import { createDeps, createUri } from "./commandsTestUtils";

describe("createRefreshCurrentPageCommand", () => {
  it("invalidates cache and reopens current page from argument URI", async () => {
    const deps = createDeps();

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/設計.md"),
    );

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/設計");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("invalidates cache and reopens current page from active editor URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/設計.md"),
    );

    await createRefreshCurrentPageCommand(deps)();

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/設計");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/README.md"),
    );

    await createRefreshCurrentPageCommand(deps)();

    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Refresh Current Page can only run on growi: pages.",
    );
  });

  it("rejects refresh when edit session is dirty", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Cannot run Refresh Current Page because there are unsaved changes. Save or run End Edit first.",
    );
  });

  it.each([
    [
      new Error("FileNotFound"),
      "Cannot run Refresh Current Page because the target page was not found.",
    ],
    [
      new Error("read page API is not supported"),
      "Cannot run Refresh Current Page because the body fetch API is not supported.",
    ],
    [
      new Error("failed to connect to GROWI"),
      "Cannot run Refresh Current Page because the connection to GROWI failed.",
    ],
    [new Error("unexpected"), "Refresh Current Page reload failed."],
  ])("maps refresh current page failure to message", async (error, message) => {
    const deps = createDeps();
    deps.openUri.mockRejectedValue(error);

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

describe("createStartEditCommand", () => {
  it("bootstraps and stores edit session with dirty=false", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );

    await createStartEditCommand(deps)();

    expect(deps.bootstrapEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.setEditSession).toHaveBeenCalledWith(
      "/team/dev/spec",
      expect.objectContaining({
        pageId: "page-123",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# title",
        dirty: false,
      }),
    );
    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("skips bootstrap when edit session already exists", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "existing-page-id",
      baseRevisionId: "existing-revision-id",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "existing body",
      enteredAt: "2026-03-08T01:00:00.000Z",
      dirty: false,
    });

    await createStartEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.setEditSession).not.toHaveBeenCalled();
    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
  });

  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createStartEditCommand(deps)(createUri("file", "/tmp/readme.md"));
    await createStartEditCommand(deps)(createUri("growi", "/team/dev/"));
    await createStartEditCommand(deps)(createUri("growi", "/"));

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledTimes(3);
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "Start Edit can only run on growi: pages.",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "Start Edit can only run on growi: pages.",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "Start Edit can only run on growi: pages.",
    );
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
      "Cannot run Start Edit because the edit start API is not supported.",
    ],
    [
      "ConnectionFailed",
      "Cannot run Start Edit because the connection to GROWI failed.",
    ],
    [
      "NotFound",
      "Cannot run Start Edit because the target page was not found.",
    ],
  ] as const)("maps %s bootstrap failure to Japanese message", async (reason, message) => {
    const deps = createDeps();
    deps.bootstrapEditSession.mockResolvedValue({ ok: false, reason });

    await createStartEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
    expect(deps.setEditSession).not.toHaveBeenCalled();
    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
  });
});

describe("createEndEditCommand", () => {
  it("closes session without confirmation when dirty=false", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: false,
    });

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).not.toHaveBeenCalled();
    expect(deps.closeEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("saves the document when dirty=true and save was selected", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("saveAndReturn");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.saveDocument).toHaveBeenCalledWith(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("asks confirmation and closes + reopens when dirty=true and discarded", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("discardAndReturn");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.closeEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("keeps session when dirty=true and canceled", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("cancel");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.saveDocument).not.toHaveBeenCalled();
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createEndEditCommand(deps)(createUri("file", "/tmp/readme.md"));
    await createEndEditCommand(deps)(createUri("growi", "/team/dev/"));
    await createEndEditCommand(deps)(createUri("growi", "/"));

    expect(deps.getEditSession).not.toHaveBeenCalled();
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledTimes(3);
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "End Edit can only run on growi: pages.",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "End Edit can only run on growi: pages.",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "End Edit can only run on growi: pages.",
    );
  });
});

describe("createRefreshListingCommand", () => {
  it("invalidates cache and probes listing from directory URI", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)(createUri("growi", "/team/dev/"));

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("invalidates parent cache and probes listing from active editor page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/設計.md"),
    );

    await createRefreshListingCommand(deps)();

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("accepts explorer tree item arguments from title actions", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error when directory URI is not provided as an argument", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)(
      createUri("growi", "/team/dev/設計.md"),
    );

    expect(deps.invalidateReadDirectoryCache).not.toHaveBeenCalled();
    expect(deps.readDirectory).not.toHaveBeenCalled();
    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Refresh Listing can only run on growi: directories.",
    );
  });

  it.each([
    [
      new Error("list pages API is not supported"),
      "Cannot run Refresh Listing because the list API is not supported.",
    ],
    [
      new Error("failed to connect to GROWI"),
      "Cannot run Refresh Listing because the connection to GROWI failed.",
    ],
    [new Error("unexpected"), "Refresh Listing reload failed."],
  ])("maps refresh listing failure to message", async (error, message) => {
    const deps = createDeps();
    deps.readDirectory.mockRejectedValue(error);

    await createRefreshListingCommand(deps)(createUri("growi", "/team/dev/"));

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

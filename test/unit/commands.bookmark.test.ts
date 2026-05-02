import { describe, expect, it } from "vitest";

import {
  createAddCurrentPageBookmarkCommand,
  createRemoveCurrentPageBookmarkCommand,
  createShowBookmarksCommand,
} from "../../src/vscode/commands";
import { createDeps, createUri } from "./commandsTestUtils";

describe("createAddCurrentPageBookmarkCommand", () => {
  it("adds the current growi page to bookmarks", async () => {
    const deps = createDeps();

    await createAddCurrentPageBookmarkCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.addBookmark).toHaveBeenCalledWith("/team/dev/spec", undefined);
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページをブックマークに追加しました。",
    );
  });

  it("accepts explorer tree item targets", async () => {
    const deps = createDeps();

    await createAddCurrentPageBookmarkCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
    });

    expect(deps.addBookmark).toHaveBeenCalledWith("/team/dev/spec", undefined);
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
  });

  it("shows information when the current page is already bookmarked", async () => {
    const deps = createDeps();
    deps.addBookmark.mockResolvedValue({
      ok: true,
      value: [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
        },
      ],
      added: false,
    });

    await createAddCurrentPageBookmarkCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページは既にブックマーク済みです。",
    );
  });
});

describe("createRemoveCurrentPageBookmarkCommand", () => {
  it("removes the current growi page from bookmarks", async () => {
    const deps = createDeps();

    await createRemoveCurrentPageBookmarkCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.deleteBookmark).toHaveBeenCalledWith(
      "/team/dev/spec",
      undefined,
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "ブックマークから削除しました。",
    );
  });

  it("accepts explorer tree item targets", async () => {
    const deps = createDeps();

    await createRemoveCurrentPageBookmarkCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
    });

    expect(deps.deleteBookmark).toHaveBeenCalledWith(
      "/team/dev/spec",
      undefined,
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
  });

  it("shows information when the current page is not bookmarked", async () => {
    const deps = createDeps();
    deps.deleteBookmark.mockResolvedValue({
      ok: true,
      value: [],
      removed: false,
    });

    await createRemoveCurrentPageBookmarkCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "対象ページはブックマークされていません。",
    );
  });
});

describe("createShowBookmarksCommand", () => {
  it("shows bookmark quick pick and opens the selected page", async () => {
    const deps = createDeps();
    deps.getBookmarks.mockResolvedValue({
      ok: true,
      value: [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
        },
      ],
    });
    deps.showBookmarkQuickPick.mockResolvedValue({
      action: "open",
      canonicalPath: "/team/dev/spec",
      pageId: "page-1",
    });

    await createShowBookmarksCommand(deps)();

    expect(deps.showBookmarkQuickPick).toHaveBeenCalledWith(
      [
        {
          label: "spec",
          description: "/team/dev/spec",
          detail: "追加日時: 2026-04-17T00:00:00.000Z",
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
        },
      ],
      { placeHolder: "ブックマークからページを選択してください。" },
    );
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("removes a bookmark selected from the quick pick", async () => {
    const deps = createDeps();
    deps.getBookmarks.mockResolvedValue({
      ok: true,
      value: [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
        },
      ],
    });
    deps.showBookmarkQuickPick.mockResolvedValue({
      action: "remove",
      canonicalPath: "/team/dev/spec",
      pageId: "page-1",
    });

    await createShowBookmarksCommand(deps)();

    expect(deps.deleteBookmark).toHaveBeenCalledWith(
      "/team/dev/spec",
      "page-1",
    );
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "ブックマークから削除しました。",
    );
    expect(deps.openUri).not.toHaveBeenCalled();
  });

  it("shows outsidePrefix status in bookmark detail", async () => {
    const deps = createDeps();
    deps.getBookmarks.mockResolvedValue({
      ok: true,
      value: [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
          status: "outsidePrefix",
        },
      ],
    });
    deps.showBookmarkQuickPick.mockResolvedValue(undefined);

    await createShowBookmarksCommand(deps)();

    expect(deps.showBookmarkQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          detail: "状態: prefix未登録 ・ 追加日時: 2026-04-17T00:00:00.000Z",
        }),
      ],
      { placeHolder: "ブックマークからページを選択してください。" },
    );
  });

  it("shows unresolvable status in bookmark detail", async () => {
    const deps = createDeps();
    deps.getBookmarks.mockResolvedValue({
      ok: true,
      value: [
        {
          canonicalPath: "/team/dev/spec",
          addedAt: "2026-04-17T00:00:00.000Z",
          pageId: "page-1",
          status: "unresolvable",
        },
      ],
    });
    deps.showBookmarkQuickPick.mockResolvedValue(undefined);

    await createShowBookmarksCommand(deps)();

    expect(deps.showBookmarkQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          detail: "状態: 開けない ・ 追加日時: 2026-04-17T00:00:00.000Z",
        }),
      ],
      { placeHolder: "ブックマークからページを選択してください。" },
    );
  });

  it("shows information when there are no bookmarks", async () => {
    const deps = createDeps();
    deps.getBookmarks.mockResolvedValue({ ok: true, value: [] });

    await createShowBookmarksCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "ブックマークはありません。現在ページで Add Current Page to Bookmarks を実行してください。",
    );
    expect(deps.showBookmarkQuickPick).not.toHaveBeenCalled();
  });
});

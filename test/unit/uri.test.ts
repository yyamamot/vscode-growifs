import { describe, expect, it } from "vitest";

import {
  buildGrowiUriFromInput,
  normalizeCanonicalPath,
  parseAddPrefixInput,
  parseGrowiLinkReference,
  parseOpenPageInput,
} from "../../src/core/uri";

describe("normalizeCanonicalPath", () => {
  it("normalizes unicode, repeated slashes, trailing slash, and .md suffix", () => {
    expect(normalizeCanonicalPath("/team//dev/%E8%A8%AD%E8%A8%88.md/")).toEqual(
      {
        ok: true,
        value: "/team/dev/設計",
      },
    );
  });

  it("preserves the root path", () => {
    expect(normalizeCanonicalPath("/")).toEqual({
      ok: true,
      value: "/",
    });
  });

  it("rejects empty and relative paths", () => {
    expect(normalizeCanonicalPath("")).toEqual({
      ok: false,
      reason: "InvalidPath",
    });
    expect(normalizeCanonicalPath("team/dev")).toEqual({
      ok: false,
      reason: "InvalidPath",
    });
  });

  it("rejects invalid percent-encoding", () => {
    expect(normalizeCanonicalPath("/broken/%E0%A4%A")).toEqual({
      ok: false,
      reason: "InvalidPath",
    });
  });
});

describe("buildGrowiUriFromInput", () => {
  it("resolves path input and URL input to the same growi URI", () => {
    const fromPath = buildGrowiUriFromInput("/team//dev/設計.md/");
    const fromUrl = buildGrowiUriFromInput(
      "https://growi.example.com/team/dev/%E8%A8%AD%E8%A8%88",
    );

    expect(fromPath).toEqual({
      ok: true,
      value: {
        canonicalPath: "/team/dev/設計",
        uri: "growi:/team/dev/設計.md",
        source: "path",
      },
    });
    expect(fromUrl).toEqual({
      ok: true,
      value: {
        canonicalPath: "/team/dev/設計",
        uri: "growi:/team/dev/設計.md",
        source: "url",
      },
    });
  });

  it("rejects unsupported or malformed URLs", () => {
    expect(buildGrowiUriFromInput("ftp://growi.example.com/team/dev")).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
    expect(buildGrowiUriFromInput("https://%zz")).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
  });
});

describe("parseOpenPageInput", () => {
  it("parses same-instance permalink URL as pageId input", () => {
    expect(
      parseOpenPageInput(
        "https://growi.example.com/wiki/0123456789abcdefABCDEF01",
        {
          baseUrl: "https://growi.example.com/wiki/",
        },
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: "pageIdPermalink",
        pageId: "0123456789abcdefABCDEF01",
        source: "url",
      },
    });
  });

  it("parses root-relative permalink as ambiguous path/pageId input", () => {
    expect(parseOpenPageInput("/0123456789abcdefabcdef01")).toEqual({
      ok: true,
      value: {
        kind: "ambiguousSingleSegmentHex",
        canonicalPath: "/0123456789abcdefabcdef01",
        pageId: "0123456789abcdefabcdef01",
        source: "path",
      },
    });
  });

  it("rejects foreign-host permalink URLs", () => {
    expect(
      parseOpenPageInput("https://other.example.com/0123456789abcdefabcdef01", {
        baseUrl: "https://growi.example.com/",
      }),
    ).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
  });
});

describe("parseAddPrefixInput", () => {
  it("parses canonical path input without pageId ambiguity", () => {
    expect(parseAddPrefixInput("/0123456789abcdefabcdef01")).toEqual({
      ok: true,
      value: {
        kind: "canonicalPath",
        canonicalPath: "/0123456789abcdefabcdef01",
        uri: "growi:/0123456789abcdefabcdef01.md",
        source: "path",
      },
    });
  });

  it("parses same-instance idurl input as pageId permalink", () => {
    expect(
      parseAddPrefixInput(
        "https://growi.example.com/wiki/0123456789abcdefabcdef01",
        {
          baseUrl: "https://growi.example.com/wiki/",
        },
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: "pageIdPermalink",
        pageId: "0123456789abcdefabcdef01",
        source: "url",
      },
    });
  });

  it("rejects foreign-host and non-idurl URL input", () => {
    expect(
      parseAddPrefixInput(
        "https://other.example.com/wiki/0123456789abcdefabcdef01",
        {
          baseUrl: "https://growi.example.com/wiki/",
        },
      ),
    ).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });

    expect(
      parseAddPrefixInput("https://growi.example.com/wiki/team/dev", {
        baseUrl: "https://growi.example.com/wiki/",
      }),
    ).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
  });
});

describe("parseGrowiLinkReference", () => {
  it("parses same-base permalink URLs for link navigation", () => {
    expect(
      parseGrowiLinkReference(
        "https://growi.example.com/wiki/0123456789abcdefabcdef01",
        {
          baseUrl: "https://growi.example.com/wiki/",
        },
      ),
    ).toEqual({
      kind: "pageIdPermalink",
      pageId: "0123456789abcdefabcdef01",
      source: "url",
    });
  });

  it("keeps absolute path links as canonical path references", () => {
    expect(parseGrowiLinkReference("/team/dev/spec")).toEqual({
      kind: "canonicalPath",
      canonicalPath: "/team/dev/spec",
      uri: "growi:/team/dev/spec.md",
      source: "path",
    });
  });
});

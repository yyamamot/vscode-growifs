import { describe, expect, it, vi } from "vitest";

import { createGrowiAssetProxyRequestHandler } from "../../src/vscode/assetProxy";

describe("createGrowiAssetProxyRequestHandler", () => {
  it("fetches upstream asset with bearer token for supported internal asset id", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "image/png",
        },
        status: 200,
      });
    });
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => "secret-token",
      getBaseUrl: () => "https://growi.example.com",
    });

    const response = await handler({
      method: "GET",
      url: "/growi-assets/growi-asset%3A%252Fuploads%252Fimage.png",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://growi.example.com/uploads/image.png?access_token=secret-token",
      {
        headers: {
          Authorization: "Bearer secret-token",
        },
        method: "GET",
        redirect: "manual",
      },
    );
    expect(response).toEqual({
      body: new Uint8Array([1, 2, 3]),
      headers: { "content-type": "image/png" },
      status: 200,
    });
  });

  it("rejects unsupported target in internal asset id", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => "secret-token",
      getBaseUrl: () => "https://growi.example.com",
    });

    const response = await handler({
      method: "GET",
      url: "/growi-assets/growi-asset%3Ahttps%253A%252F%252Fassets.example.com%252Fimage.png",
    });

    expect(response).toEqual({
      body: new TextEncoder().encode("UnsupportedTarget"),
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-growi-asset-proxy-error": "UnsupportedTarget",
      },
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects request when api token is unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => undefined,
      getBaseUrl: () => "https://growi.example.com",
    });

    const response = await handler({
      method: "GET",
      url: "/growi-assets/growi-asset%3A%252Fuploads%252Fimage.png",
    });

    expect(response).toEqual({
      body: new TextEncoder().encode("MissingToken"),
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-growi-asset-proxy-error": "MissingToken",
      },
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps upstream fetch failure to bad gateway", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network failed");
    });
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => "secret-token",
      getBaseUrl: () => "https://growi.example.com",
    });

    const response = await handler({
      method: "GET",
      url: "/growi-assets/growi-asset%3A%252Fuploads%252Fimage.png",
    });

    expect(response).toEqual({
      body: new TextEncoder().encode("UpstreamFetchFailed"),
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-growi-asset-proxy-error": "UpstreamFetchFailed",
      },
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

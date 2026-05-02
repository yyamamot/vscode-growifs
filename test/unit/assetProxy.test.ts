import { describe, expect, it, vi } from "vitest";

import { createGrowiAssetProxyRequestHandler } from "../../src/vscode/assetProxy";

const PROXY_SECRET = "test-secret";

function proxyUrl(internalAssetId: string, secret = PROXY_SECRET): string {
  return `/growi-assets/${encodeURIComponent(secret)}/${encodeURIComponent(
    internalAssetId,
  )}`;
}

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
      proxySecret: PROXY_SECRET,
    });

    const response = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fuploads%2Fimage.png"),
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
      proxySecret: PROXY_SECRET,
    });

    const response = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:https%3A%2F%2Fassets.example.com%2Fimage.png"),
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
      proxySecret: PROXY_SECRET,
    });

    const response = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fuploads%2Fimage.png"),
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
      proxySecret: PROXY_SECRET,
    });

    const response = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fuploads%2Fimage.png"),
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

  it("rejects missing or mismatched proxy secret before resolving token or fetching", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const getApiToken = vi.fn(async () => "secret-token");
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken,
      getBaseUrl: () => "https://growi.example.com",
      proxySecret: PROXY_SECRET,
    });

    const missingSecretResponse = await handler({
      method: "GET",
      url: "/growi-assets/growi-asset%3A%252Fuploads%252Fimage.png",
    });
    const mismatchedSecretResponse = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fuploads%2Fimage.png", "wrong-secret"),
    });

    const expectedResponse = {
      body: new TextEncoder().encode("NotFound"),
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-growi-asset-proxy-error": "NotFound",
      },
      status: 404,
    };
    expect(missingSecretResponse).toEqual(expectedResponse);
    expect(mismatchedSecretResponse).toEqual(expectedResponse);
    expect(getApiToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-whitelisted asset paths before fetching", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => "secret-token",
      getBaseUrl: () => "https://growi.example.com",
      proxySecret: PROXY_SECRET,
    });

    const pagePathResponse = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fpage%2Fimage.png"),
    });
    const attachmentRouteResponse = await handler({
      method: "GET",
      url: proxyUrl("growi-asset:%2Fattachment%2F12345"),
    });

    const expectedResponse = {
      body: new TextEncoder().encode("UnsupportedTarget"),
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-growi-asset-proxy-error": "UnsupportedTarget",
      },
      status: 400,
    };
    expect(pagePathResponse).toEqual(expectedResponse);
    expect(attachmentRouteResponse).toEqual(expectedResponse);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/uploads/image.png",
      "https://growi.example.com/uploads/image.png?access_token=secret-token",
    ],
    [
      "/files/image.png",
      "https://growi.example.com/files/image.png?access_token=secret-token",
    ],
    [
      "/_api/attachments/12345",
      "https://growi.example.com/_api/attachments/12345?access_token=secret-token",
    ],
  ])("fetches whitelisted asset path %s", async (assetPath, expectedUrl) => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const handler = createGrowiAssetProxyRequestHandler({
      fetch: fetchMock,
      getApiToken: async () => "secret-token",
      getBaseUrl: () => "https://growi.example.com",
      proxySecret: PROXY_SECRET,
    });

    await handler({
      method: "GET",
      url: proxyUrl(`growi-asset:${encodeURIComponent(assetPath)}`),
    });

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
      headers: {
        Authorization: "Bearer secret-token",
      },
      method: "GET",
      redirect: "manual",
    });
  });
});

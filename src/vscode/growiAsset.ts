const GROWI_ASSET_SCHEME = "growi-asset:";
const ASSET_PROXY_PREFIX = "http://127.0.0.1:0/growi-assets/";

export interface NormalizedGrowiAssetTarget {
  internalAssetId: string;
  proxyUrl: string;
}

interface NormalizeGrowiAssetTargetOptions {
  baseUrl?: string;
}

interface ResolveGrowiAssetUpstreamUrlOptions {
  baseUrl?: string;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isRootRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function isSameHostAbsoluteUrl(
  target: string,
  baseUrl: string | undefined,
): boolean {
  if (!baseUrl) {
    return false;
  }

  try {
    return new URL(target).host === new URL(baseUrl).host;
  } catch {
    return false;
  }
}

function normalizeToInternalAssetTarget(
  target: string,
  baseUrl: string | undefined,
): string | undefined {
  if (isRootRelativePath(target)) {
    return target;
  }

  if (!isHttpUrl(target) || !isSameHostAbsoluteUrl(target, baseUrl)) {
    return undefined;
  }

  try {
    const parsed = new URL(target);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

function decodeInternalAssetTarget(
  internalAssetId: string,
): string | undefined {
  if (!internalAssetId.startsWith(GROWI_ASSET_SCHEME)) {
    return undefined;
  }

  const encodedTarget = internalAssetId.slice(GROWI_ASSET_SCHEME.length);
  if (!encodedTarget) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedTarget);
  } catch {
    return undefined;
  }
}

export function resolveGrowiAssetUpstreamUrl(
  internalAssetId: string,
  options: ResolveGrowiAssetUpstreamUrlOptions = {},
): string | undefined {
  const normalizedTarget = decodeInternalAssetTarget(internalAssetId);
  if (!normalizedTarget || !isRootRelativePath(normalizedTarget)) {
    return undefined;
  }

  const { baseUrl } = options;
  if (!baseUrl) {
    return undefined;
  }

  try {
    return new URL(normalizedTarget, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function buildGrowiAssetProxyUrl(
  internalAssetId: string,
  proxyOrigin = "http://127.0.0.1:0",
): string {
  return `${proxyOrigin}/growi-assets/${encodeURIComponent(internalAssetId)}`;
}

export function normalizeGrowiAssetTarget(
  target: string,
  options: NormalizeGrowiAssetTargetOptions = {},
): NormalizedGrowiAssetTarget | undefined {
  const normalizedTarget = normalizeToInternalAssetTarget(
    target,
    options.baseUrl,
  );
  if (!normalizedTarget) {
    return undefined;
  }

  const internalAssetId = `${GROWI_ASSET_SCHEME}${encodeURIComponent(normalizedTarget)}`;
  const proxyUrl = `${ASSET_PROXY_PREFIX}${encodeURIComponent(internalAssetId)}`;

  return {
    internalAssetId,
    proxyUrl,
  };
}

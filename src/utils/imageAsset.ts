import type { ImageAssetMap } from '@/types/manuscript';

export const IMAGE_ASSET_SCHEME = 'mdasset:';

export const createImageAssetId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const toImageAssetSrc = (assetId: string): string => `${IMAGE_ASSET_SCHEME}${assetId}`;

export const parseImageAssetId = (src: string): string | null => {
  if (!src.startsWith(IMAGE_ASSET_SCHEME)) {
    return null;
  }

  const assetId = src.slice(IMAGE_ASSET_SCHEME.length).trim();
  return assetId.length > 0 ? assetId : null;
};

export const isImageAssetSrc = (src: string): boolean => parseImageAssetId(src) !== null;

export const normalizeImageAssetMap = (payload: unknown): ImageAssetMap => {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const result: ImageAssetMap = {};

  Object.entries(record).forEach(([id, dataUrl]) => {
    if (id.trim().length === 0 || typeof dataUrl !== 'string') {
      return;
    }

    if (!dataUrl.startsWith('data:image/')) {
      return;
    }

    result[id] = dataUrl;
  });

  return result;
};

import { fileToDataUrl } from '@/services/image/imageToBase64';
import {
  normalizeImageBlob,
  type CompressOption,
  type NormalizedImageAsset,
} from '@/services/image/compressImage';

export interface NormalizedImageAssetPayload extends NormalizedImageAsset {
  dataUrl: string;
}

export const normalizeImageAssetBlob = async (
  blob: Blob,
  option: CompressOption,
  sourceName = '',
): Promise<NormalizedImageAssetPayload> => {
  const normalized = await normalizeImageBlob(blob, option, sourceName);
  return {
    ...normalized,
    dataUrl: await fileToDataUrl(normalized.blob),
  };
};

export const normalizeRemoteImage = async (
  url: string,
  option: CompressOption,
): Promise<NormalizedImageAssetPayload> => {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`fetch failed: ${url}`);
  }

  const blob = await response.blob();
  return await normalizeImageAssetBlob(blob, option, url);
};

export const replaceMarkdownImageSource = (
  markdown: string,
  targetSource: string,
  nextSource: string,
): string => markdown.replace(
  /!\[([^\]]*)\]\(([^\s)]+)(\s+"[^"]*")?\)/gu,
  (segment, alt: string, source: string, title = '') => {
    if (source !== targetSource) {
      return segment;
    }

    return `![${alt}](${nextSource}${title})`;
  },
);

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

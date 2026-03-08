export interface CompressOption {
  quality: number;
  maxWidth: number;
}

export interface NormalizedImageAsset {
  blob: Blob;
  mime: string;
  extension: string;
}

const SVG_MIME = 'image/svg+xml';
const BITMAP_MIME = 'image/png';

const isSvgSource = (blob: Blob, sourceName = ''): boolean =>
  blob.type === SVG_MIME || /\.svgz?$/iu.test(sourceName);

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image load failed'));
    };
    image.src = objectUrl;
  });

const renderBitmapToPng = async (
  blob: Blob,
  option: CompressOption,
): Promise<NormalizedImageAsset> => {
  const image = await loadImage(blob);
  const ratio = Math.min(1, option.maxWidth / Math.max(1, image.width));
  const targetWidth = Math.max(1, Math.floor(image.width * ratio));
  const targetHeight = Math.max(1, Math.floor(image.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('canvas context unavailable');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const renderedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, BITMAP_MIME, option.quality);
  });

  if (renderedBlob === null) {
    throw new Error('canvas to blob failed');
  }

  return {
    blob: renderedBlob,
    mime: BITMAP_MIME,
    extension: 'png',
  };
};

export const normalizeImageBlob = async (
  blob: Blob,
  option: CompressOption,
  sourceName = '',
): Promise<NormalizedImageAsset> => {
  if (isSvgSource(blob, sourceName)) {
    return {
      blob,
      mime: SVG_MIME,
      extension: 'svg',
    };
  }

  return await renderBitmapToPng(blob, option);
};

export const compressImage = async (
  file: File,
  option: CompressOption,
): Promise<Blob> => (await normalizeImageBlob(file, option, file.name)).blob;

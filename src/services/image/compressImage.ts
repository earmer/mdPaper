export interface CompressOption {
  quality: number;
  maxWidth: number;
}

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = URL.createObjectURL(file);
  });

export const compressImage = async (
  file: File,
  option: CompressOption,
): Promise<Blob> => {
  const image = await loadImage(file);
  const ratio = Math.min(1, option.maxWidth / image.width);
  const targetWidth = Math.max(1, Math.floor(image.width * ratio));
  const targetHeight = Math.max(1, Math.floor(image.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (context === null) {
    URL.revokeObjectURL(image.src);
    throw new Error('canvas context unavailable');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const type = file.type.includes('png') ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, option.quality);
  });

  URL.revokeObjectURL(image.src);

  if (blob === null) {
    throw new Error('canvas to blob failed');
  }

  return blob;
};

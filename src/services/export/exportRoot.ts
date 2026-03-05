import { nextTick } from 'vue';
import type { PaperSize } from '@/types/manuscript';

export const EXPORT_ROOT_ID = 'journal-export-root';
export const EXPORT_ARTICLE_ID = 'journal-export-article';

const getPaperWidthMm = (paperSize: PaperSize): number =>
  paperSize === 'Letter' ? 216 : 210;

const waitForImageReady = async (img: HTMLImageElement): Promise<void> => {
  img.loading = 'eager';

  if (typeof img.decode === 'function') {
    try {
      await img.decode();
      return;
    } catch {
      // fall back to load/error listeners
    }
  }

  if (img.complete) {
    return;
  }

  await new Promise<void>((resolve) => {
    const done = (): void => {
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
      resolve();
    };

    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
};

const waitForFontsReady = async (): Promise<void> => {
  const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fontSet === undefined) {
    return;
  }

  try {
    await Promise.allSettled([
      fontSet.load('1em KaTeX_Main'),
      fontSet.load('1em KaTeX_Math'),
    ]);
    await fontSet.ready;
  } catch {
    // ignore font readiness failures and continue export
  }
};

const createIsolatedExportRoot = (
  sourceArticle: HTMLElement,
  paperSize: PaperSize,
): { root: HTMLDivElement; article: HTMLElement } => {
  const staleRoot = document.getElementById(EXPORT_ROOT_ID);
  staleRoot?.remove();

  const root = document.createElement('div');
  root.id = EXPORT_ROOT_ID;
  root.className = 'journal-export-root';
  root.setAttribute('aria-hidden', 'true');
  root.style.position = 'fixed';
  root.style.left = '-100000px';
  root.style.top = '0';
  root.style.background = '#ffffff';
  root.style.transform = 'none';
  root.style.overflow = 'visible';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '-1';
  root.style.width = `${getPaperWidthMm(paperSize)}mm`;

  const article = sourceArticle.cloneNode(true) as HTMLElement;
  article.id = EXPORT_ARTICLE_ID;
  article.style.transform = 'none';
  root.appendChild(article);
  document.body.prepend(root);

  return { root, article };
};

export const waitForExportRenderReady = async (article: HTMLElement): Promise<void> => {
  await nextTick();
  await nextTick();
  await waitForFontsReady();

  const images = Array.from(article.querySelectorAll<HTMLImageElement>('img'));
  await Promise.allSettled(images.map((img) => waitForImageReady(img)));
  await nextTick();
};

export const withIsolatedExportRoot = async <T>(
  sourceArticle: HTMLElement,
  paperSize: PaperSize,
  runner: (article: HTMLElement) => Promise<T>,
): Promise<T> => {
  await nextTick();
  await nextTick();

  const { root, article } = createIsolatedExportRoot(sourceArticle, paperSize);

  try {
    return await runner(article);
  } finally {
    root.remove();
  }
};

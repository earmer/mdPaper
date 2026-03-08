import { Previewer, type PagedStylesheet, type PreviewFlow } from 'pagedjs';
import type { ExportPayload } from '@/types/manuscript';
import {
  EXPORT_ROOT_ID,
  waitForExportRenderReady,
} from '@/services/export/exportRoot';
import {
  applyLayoutVars,
  buildFooterLeftText,
  buildFooterRightText,
  buildHeaderLeftText,
  buildHeaderRightText,
  buildPageLabel,
  getPaperCssSize,
} from '@/services/export/helpers';
import { nextAnimationFrame } from '@/utils/dom';

const BROWSER_PRINT_BODY_CLASS = 'browser-print-exporting';
const BROWSER_PRINT_ROOT_CLASS = 'journal-export-root journal-export-root--browser';
const BROWSER_PREVIEW_ROOT_ID = 'journal-preview-pagination-root';
const BROWSER_PREVIEW_ROOT_CLASS = 'journal-export-root journal-export-root--preview';
const BROWSER_PRINT_MEASURE_CLASS = 'journal-print-source';
const BROWSER_PRINT_PAGES_CLASS = 'journal-print-pages';
const BROWSER_PRINT_HEADER_CLASS = 'journal-print-running-header';
const BROWSER_PRINT_FOOTER_CLASS = 'journal-print-running-footer';
const AFTER_PRINT_FALLBACK_TIMEOUT_MS = 30000;
const MM_TO_PX = 96 / 25.4;
const MIN_DISPLAY_MATH_SCALE = 0.45;
const DISPLAY_MATH_SCALE_PASSES = 3;

interface BrowserPrintContext {
  root: HTMLDivElement;
  measurePage: HTMLElement;
  sourceArticle: HTMLElement;
  pages: HTMLDivElement;
  dispose: () => void;
}

interface BrowserPrintContextOptions {
  rootId?: string;
  rootClass?: string;
}

export interface BrowserPreviewPageSnapshot {
  html: string;
}

const toPrintTitle = (fileName: string): string =>
  fileName.replace(/\.pdf$/iu, '').trim() || 'mdPaper';

const buildPagedStylesheet = (payload: ExportPayload): PagedStylesheet => ({
  [`${window.location.href}#mdpaper-browser-print`]: `
    @page {
      size: ${getPaperCssSize(payload.exportSetting.paperSize)};
      margin: ${payload.exportSetting.margins.top}mm ${payload.exportSetting.margins.right}mm ${payload.exportSetting.margins.bottom}mm ${payload.exportSetting.margins.left}mm;
    }

    .journal-article {
      padding: 0 !important;
      min-height: auto !important;
    }

    .journal-front {
      margin-top: 0;
    }

    .journal-page-header-static,
    .journal-export-page-number {
      display: none !important;
    }
  `,
});

const getPaperHeightMm = (paperSize: ExportPayload['exportSetting']['paperSize']): number =>
  paperSize === 'Letter' ? 279.4 : 297;

const getPageContentHeightPx = (payload: ExportPayload): number => {
  const paperHeightMm = getPaperHeightMm(payload.exportSetting.paperSize);
  return Math.max(
    0,
    (paperHeightMm - payload.exportSetting.margins.top - payload.exportSetting.margins.bottom) * MM_TO_PX,
  );
};

const stripKatexMathMlForExport = (root: HTMLElement): void => {
  const mathMlNodes = Array.from(root.querySelectorAll<HTMLElement>('.katex-mathml'));
  mathMlNodes.forEach((node) => {
    node.remove();
  });
};

const scaleDisplayMathBlocks = (
  root: HTMLElement,
  payload: ExportPayload,
): void => {
  const maxContentHeightPx = getPageContentHeightPx(payload);
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.katex-display-block'));

  blocks.forEach((block) => {
    block.style.removeProperty('font-size');

    const display = block.querySelector<HTMLElement>('.katex-display');
    const formula = block.querySelector<HTMLElement>('.katex-display > .katex') ?? display;
    if (display === null || formula === null) {
      return;
    }

    display.style.overflow = 'visible';

    for (let pass = 0; pass < DISPLAY_MATH_SCALE_PASSES; pass += 1) {
      const availableWidth = Math.max(0, display.clientWidth);
      const formulaWidth = Math.max(formula.scrollWidth, formula.getBoundingClientRect().width);
      const formulaHeight = Math.max(block.scrollHeight, block.getBoundingClientRect().height);

      let ratio = 1;
      if (availableWidth > 0 && formulaWidth > availableWidth + 1) {
        ratio = Math.min(ratio, availableWidth / formulaWidth);
      }
      if (maxContentHeightPx > 0 && formulaHeight > maxContentHeightPx + 1) {
        ratio = Math.min(ratio, maxContentHeightPx / formulaHeight);
      }

      if (ratio >= 0.999) {
        break;
      }

      const currentFontSizePx = Number.parseFloat(getComputedStyle(block).fontSize);
      if (!Number.isFinite(currentFontSizePx) || currentFontSizePx <= 0) {
        break;
      }

      const nextFontSizePx = Math.max(MIN_DISPLAY_MATH_SCALE, ratio) * currentFontSizePx;
      block.style.fontSize = `${nextFontSizePx}px`;
    }
  });
};

const forceCenterAlignedBlocks = (root: HTMLElement): void => {
  const tableCaptions = Array.from(root.querySelectorAll<HTMLElement>('.md-table-caption, table > caption'));
  tableCaptions.forEach((caption) => {
    caption.style.display = caption.tagName === 'CAPTION' ? 'table-caption' : 'block';
    if (caption.tagName === 'CAPTION') {
      caption.style.captionSide = 'top';
    }
    caption.style.width = '100%';
    caption.style.textAlign = 'center';
  });

  const figures = Array.from(root.querySelectorAll<HTMLElement>('.md-figure, figure'));
  figures.forEach((figure) => {
    figure.style.display = 'flex';
    figure.style.flexDirection = 'column';
    figure.style.alignItems = 'center';
    figure.style.width = '100%';
    figure.style.marginLeft = 'auto';
    figure.style.marginRight = 'auto';
    figure.style.textAlign = 'center';
  });

  const figureImages = Array.from(root.querySelectorAll<HTMLElement>('.md-figure img, figure img'));
  figureImages.forEach((image) => {
    image.style.display = 'block';
    image.style.marginLeft = 'auto';
    image.style.marginRight = 'auto';
  });

  const figureCaptions = Array.from(root.querySelectorAll<HTMLElement>('.md-figure figcaption, .md-figure-caption, figure figcaption'));
  figureCaptions.forEach((caption) => {
    caption.style.display = 'block';
    caption.style.width = '100%';
    caption.style.marginLeft = 'auto';
    caption.style.marginRight = 'auto';
    caption.style.textAlign = 'center';
  });

  const displayMathBlocks = Array.from(root.querySelectorAll<HTMLElement>('.katex-display-block'));
  displayMathBlocks.forEach((block) => {
    block.style.display = 'grid';
    block.style.gridTemplateColumns = 'minmax(3.1em, 1fr) auto minmax(3.1em, 1fr)';
    block.style.alignItems = 'center';
    block.style.textAlign = 'center';
  });

  const displayMath = Array.from(root.querySelectorAll<HTMLElement>('.katex-display-block > .katex-display, .katex-display'));
  displayMath.forEach((display) => {
    display.style.gridColumn = '2';
    display.style.margin = '0';
    display.style.textAlign = 'center';
  });

  const formulas = Array.from(root.querySelectorAll<HTMLElement>('.katex-display > .katex'));
  formulas.forEach((formula) => {
    formula.style.display = 'block';
    formula.style.margin = '0 auto';
    formula.style.textAlign = 'center';
  });
};

const createRunningHeader = (
  leftText: string,
  rightText: string,
): HTMLElement | null => {
  if (leftText.length === 0 && rightText.length === 0) {
    return null;
  }

  const header = document.createElement('header');
  header.className = BROWSER_PRINT_HEADER_CLASS;

  const left = document.createElement('span');
  left.className = `${BROWSER_PRINT_HEADER_CLASS}__left`;
  left.textContent = leftText;

  const right = document.createElement('span');
  right.className = `${BROWSER_PRINT_HEADER_CLASS}__right`;
  right.textContent = rightText;

  header.append(left, right);
  return header;
};

const createRunningFooter = (
  leftText: string,
  centerText: string,
  rightText: string,
): HTMLElement | null => {
  if (leftText.length === 0 && centerText.length === 0 && rightText.length === 0) {
    return null;
  }

  const footer = document.createElement('footer');
  footer.className = BROWSER_PRINT_FOOTER_CLASS;

  const left = document.createElement('span');
  left.className = `${BROWSER_PRINT_FOOTER_CLASS}__left`;
  left.textContent = leftText;

  const center = document.createElement('span');
  center.className = `${BROWSER_PRINT_FOOTER_CLASS}__center`;
  center.textContent = centerText;

  const right = document.createElement('span');
  right.className = `${BROWSER_PRINT_FOOTER_CLASS}__right`;
  right.textContent = rightText;

  footer.append(left, center, right);
  return footer;
};

const injectRunningChrome = (
  payload: ExportPayload,
  pagesRoot: HTMLElement,
  totalPages: number,
): void => {
  const headerLeftText = buildHeaderLeftText(payload);
  const headerRightText = buildHeaderRightText(payload);
  const footerLeftText = buildFooterLeftText(payload);
  const footerRightText = buildFooterRightText(payload);

  const pages = Array.from(pagesRoot.querySelectorAll<HTMLElement>('.pagedjs_page'));
  pages.forEach((page, index) => {
    const pageBox = page.querySelector<HTMLElement>('.pagedjs_pagebox');
    if (pageBox === null) {
      return;
    }

    pageBox.querySelector(`.${BROWSER_PRINT_HEADER_CLASS}`)?.remove();
    pageBox.querySelector(`.${BROWSER_PRINT_FOOTER_CLASS}`)?.remove();

    const pageLabel = payload.exportSetting.headerFooter.showFooter
      && payload.exportSetting.headerFooter.showPageNumber
      ? buildPageLabel(payload.locale, index + 1, totalPages)
      : '';

    const header = payload.exportSetting.headerFooter.showHeader
      ? createRunningHeader(headerLeftText, headerRightText)
      : null;
    const footer = payload.exportSetting.headerFooter.showFooter
      ? createRunningFooter(footerLeftText, pageLabel, footerRightText)
      : null;

    if (header !== null) {
      pageBox.appendChild(header);
    }

    if (footer !== null) {
      pageBox.appendChild(footer);
    }
  });
};

const createBrowserPrintContext = (
  payload: ExportPayload,
  options: BrowserPrintContextOptions = {},
): BrowserPrintContext => {
  const rootId = options.rootId ?? EXPORT_ROOT_ID;
  const rootClass = options.rootClass ?? BROWSER_PRINT_ROOT_CLASS;

  document.getElementById(rootId)?.remove();

  const measurePage = payload.articleElement.cloneNode(true) as HTMLElement;
  measurePage.classList.add(BROWSER_PRINT_MEASURE_CLASS);
  measurePage.removeAttribute('id');

  const sourceArticle = measurePage.querySelector<HTMLElement>('.journal-article');
  if (sourceArticle === null) {
    throw new Error('Printable journal article clone was not found.');
  }

  const root = document.createElement('div');
  root.id = rootId;
  root.className = rootClass;
  root.setAttribute('aria-hidden', 'true');
  root.style.position = 'fixed';
  root.style.left = '-100000px';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.style.pointerEvents = 'none';
  root.style.background = '#ffffff';

  const pages = document.createElement('div');
  pages.className = BROWSER_PRINT_PAGES_CLASS;

  root.append(measurePage, pages);
  document.body.prepend(root);

  applyLayoutVars({ ...payload, articleElement: root });
  applyLayoutVars({ ...payload, articleElement: measurePage });
  applyLayoutVars({ ...payload, articleElement: sourceArticle });
  applyLayoutVars({ ...payload, articleElement: pages });

  return {
    root,
    measurePage,
    sourceArticle,
    pages,
    dispose: () => root.remove(),
  };
};

const renderPagedDocument = async (
  payload: ExportPayload,
  context: BrowserPrintContext,
): Promise<PreviewFlow> => {
  await waitForExportRenderReady(context.measurePage);
  stripKatexMathMlForExport(context.sourceArticle);
  scaleDisplayMathBlocks(context.sourceArticle, payload);
  forceCenterAlignedBlocks(context.sourceArticle);
  await nextAnimationFrame();

  const pagedSource = context.sourceArticle.cloneNode(true) as HTMLElement;
  pagedSource.removeAttribute('id');

  const previewer = new Previewer();
  const flow = await previewer.preview(
    pagedSource,
    [buildPagedStylesheet(payload)],
    context.pages,
  );

  forceCenterAlignedBlocks(context.pages);
  injectRunningChrome(payload, context.pages, flow.total);
  await waitForExportRenderReady(context.pages);
  await nextAnimationFrame();

  return flow;
};

const snapshotPreviewPages = (pagesRoot: HTMLElement): BrowserPreviewPageSnapshot[] =>
  Array.from(pagesRoot.querySelectorAll<HTMLElement>('.pagedjs_page')).map((page) => {
    const clone = page.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    return {
      html: clone.outerHTML,
    };
  });

export const renderBrowserPreviewPages = async (
  payload: ExportPayload,
): Promise<BrowserPreviewPageSnapshot[]> => {
  const context = createBrowserPrintContext(payload, {
    rootId: BROWSER_PREVIEW_ROOT_ID,
    rootClass: BROWSER_PREVIEW_ROOT_CLASS,
  });

  try {
    await nextAnimationFrame();
    await renderPagedDocument(payload, context);
    return snapshotPreviewPages(context.pages);
  } finally {
    context.dispose();
  }
};

const printCurrentWindow = async (fileName: string): Promise<void> => {
  const originalTitle = document.title;
  document.title = toPrintTitle(fileName);

  try {
    await nextAnimationFrame();
    await nextAnimationFrame();

    await new Promise<void>((resolve) => {
      let settled = false;
      const supportsAfterPrint = 'onafterprint' in window;
      let fallbackTimerId = 0;

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.removeEventListener('afterprint', handleAfterPrint);
        if (fallbackTimerId !== 0) {
          window.clearTimeout(fallbackTimerId);
        }
        resolve();
      };

      const handleAfterPrint = (): void => {
        finish();
      };

      if (supportsAfterPrint) {
        window.addEventListener('afterprint', handleAfterPrint, { once: true });
        fallbackTimerId = window.setTimeout(finish, AFTER_PRINT_FALLBACK_TIMEOUT_MS);
      } else {
        fallbackTimerId = window.setTimeout(finish, 1200);
      }

      window.print();
    });
  } finally {
    document.title = originalTitle;
  }
};

export const exportByBrowserPrintPdf = async (
  payload: ExportPayload,
  fileName: string,
): Promise<void> => {
  document.body.classList.add(BROWSER_PRINT_BODY_CLASS);
  const context = createBrowserPrintContext(payload);

  try {
    await nextAnimationFrame();
    await renderPagedDocument(payload, context);
    await printCurrentWindow(fileName);
  } finally {
    context.dispose();
    document.body.classList.remove(BROWSER_PRINT_BODY_CLASS);
  }
};

import type { PaperSize } from '@/types/manuscript';

interface BlockRange {
  top: number;
  bottom: number;
  height: number;
  strict: boolean;
}

interface HeadingBindingRange {
  top: number;
  keepUntil: number;
  relaxedUntil: number;
}

interface ParagraphRange {
  top: number;
  bottom: number;
  height: number;
  minSplitHeight: number;
}

interface PaperSizeMeta {
  widthMm: number;
  heightMm: number;
}

export interface SharedPaginationInput {
  root: HTMLElement;
  paperSize: PaperSize;
  marginsTopMm: number;
  marginsBottomMm: number;
}

export interface SharedPaginationResult {
  pageHeightPx: number;
  pageTopInsetPx: number;
  pageBottomInsetPx: number;
  pageOffsets: number[];
}

const EXPORT_BREAK_ATTR = 'data-shared-page-break';
const EXPORT_BREAK_SPACER_ATTR = 'data-shared-page-break-spacer';

const getPaperSizeMeta = (paperSize: PaperSize): PaperSizeMeta =>
  paperSize === 'A4'
    ? { widthMm: 210, heightMm: 297 }
    : { widthMm: 216, heightMm: 279.4 };

const clampInset = (pageHeight: number, inset: number): number =>
  Math.max(0, Math.min(pageHeight * 0.45, inset));

const resolveElementLineHeight = (element: HTMLElement): number => {
  const computedStyle = window.getComputedStyle(element);
  const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight);
  if (Number.isFinite(parsedLineHeight) && parsedLineHeight > 0) {
    return parsedLineHeight;
  }

  const parsedFontSize = Number.parseFloat(computedStyle.fontSize);
  if (Number.isFinite(parsedFontSize) && parsedFontSize > 0) {
    return parsedFontSize * 1.5;
  }

  return 18;
};

const measureTotalContentHeight = (root: HTMLElement, rootRect: DOMRect): number => {
  const article = root.querySelector<HTMLElement>('.journal-article');
  const heights = [
    root.scrollHeight,
    root.offsetHeight,
    rootRect.height,
  ];

  if (article !== null) {
    heights.push(article.scrollHeight, article.offsetHeight, article.getBoundingClientRect().height);

    const articleRect = article.getBoundingClientRect();
    let maxBottom = articleRect.bottom - rootRect.top;
    const tails = article.querySelectorAll<HTMLElement>(
      ':scope > *, .markdown-body > *',
    );

    tails.forEach((element) => {
      const elementRect = element.getBoundingClientRect();
      if (elementRect.height <= 0) {
        return;
      }

      maxBottom = Math.max(maxBottom, elementRect.bottom - rootRect.top);
    });

    heights.push(maxBottom);
  }

  return Math.max(...heights) + 2;
};

const measureMeaningfulContentBottom = (root: HTMLElement, rootRect: DOMRect): number => {
  const markers = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.journal-front > *, .journal-body > .markdown-body > *',
    ),
  );

  let maxBottom = 0;
  markers.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }

    maxBottom = Math.max(maxBottom, rect.bottom - rootRect.top);
  });

  if (maxBottom > 0) {
    return maxBottom;
  }

  const article = root.querySelector<HTMLElement>('.journal-article');
  if (article !== null) {
    const articleRect = article.getBoundingClientRect();
    return articleRect.top - rootRect.top;
  }

  return rootRect.height;
};

const collectAvoidBlockRanges = (root: HTMLElement, rootRect: DOMRect): BlockRange[] => {
  const ranges: BlockRange[] = [];
  const selectors: Array<{ selector: string; strict: boolean }> = [
    { selector: '.markdown-body h1', strict: false },
    { selector: '.markdown-body h2', strict: false },
    { selector: '.markdown-body h3', strict: false },
    { selector: '.markdown-body h4', strict: false },
    { selector: '.markdown-body .md-figure', strict: true },
    { selector: '.markdown-body table', strict: false },
    { selector: '.markdown-body pre', strict: false },
    { selector: '.markdown-body .katex-display-block', strict: false },
    { selector: '.markdown-body blockquote', strict: false },
    { selector: '.markdown-body .md-table-caption', strict: false },
    { selector: '.markdown-body .md-reference-list', strict: false },
  ];

  selectors.forEach(({ selector, strict }) => {
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }

      ranges.push({
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top,
        height: rect.height,
        strict,
      });
    });
  });

  ranges.sort((a, b) => a.top - b.top);
  return ranges;
};

const collectHeadingBindingRanges = (
  root: HTMLElement,
  rootRect: DOMRect,
  pageHeight: number,
): HeadingBindingRange[] => {
  const headingBindings: HeadingBindingRange[] = [];
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4'),
  );
  const maxBindingSpan = pageHeight * 0.95;
  const blockKeepWholeSelector = [
    '.markdown-body .md-figure',
    '.markdown-body table',
    '.markdown-body pre',
    '.markdown-body .katex-display',
    '.markdown-body .katex-display-block',
    '.markdown-body blockquote',
    '.markdown-body .md-table-caption',
    '.markdown-body .md-reference-list',
  ].join(', ');

  headings.forEach((heading) => {
    const headingRect = heading.getBoundingClientRect();
    if (headingRect.height <= 0) {
      return;
    }

    let cursor = heading.nextElementSibling;
    let nextBlock: HTMLElement | null = null;
    while (cursor !== null) {
      if (cursor instanceof HTMLElement) {
        const nextRect = cursor.getBoundingClientRect();
        if (nextRect.height > 0) {
          nextBlock = cursor;
          break;
        }
      }
      cursor = cursor.nextElementSibling;
    }

    if (nextBlock === null) {
      return;
    }

    const nextRect = nextBlock.getBoundingClientRect();
    const headingTop = headingRect.top - rootRect.top;
    const nextTop = nextRect.top - rootRect.top;
    const nextBottom = nextRect.bottom - rootRect.top;
    const minParagraphHeight = resolveElementLineHeight(nextBlock) * 2;
    const keepWholeNextBlock = nextBlock.matches(blockKeepWholeSelector);
    let keepUntil = keepWholeNextBlock
      ? nextBottom
      : Math.min(nextBottom, nextTop + minParagraphHeight);
    const relaxedUntil = keepWholeNextBlock
      ? keepUntil
      : Math.min(nextBottom, nextTop + resolveElementLineHeight(nextBlock));

    if (keepUntil - headingTop > maxBindingSpan) {
      const fallbackChunkHeight = Math.max(minParagraphHeight, pageHeight * 0.24);
      keepUntil = Math.min(nextBottom, nextTop + fallbackChunkHeight);
    }

    if (keepUntil <= headingTop + 1) {
      return;
    }

    headingBindings.push({
      top: headingTop,
      keepUntil,
      relaxedUntil,
    });
  });

  headingBindings.sort((a, b) => a.top - b.top);
  return headingBindings;
};

const collectParagraphRanges = (
  root: HTMLElement,
  rootRect: DOMRect,
): ParagraphRange[] => {
  const paragraphRanges: ParagraphRange[] = [];
  const paragraphs = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.markdown-body p, .markdown-body li, .markdown-body blockquote p',
    ),
  );

  paragraphs.forEach((paragraph) => {
    const paragraphRect = paragraph.getBoundingClientRect();
    if (paragraphRect.height <= 0) {
      return;
    }

    paragraphRanges.push({
      top: paragraphRect.top - rootRect.top,
      bottom: paragraphRect.bottom - rootRect.top,
      height: paragraphRect.height,
      minSplitHeight: resolveElementLineHeight(paragraph) * 2,
    });
  });

  paragraphRanges.sort((a, b) => a.top - b.top);
  return paragraphRanges;
};

const buildSmartPageOffsets = (
  pageHeight: number,
  pageAdvance: number,
  totalHeight: number,
  ranges: BlockRange[],
  headingBindings: HeadingBindingRange[],
  paragraphRanges: ParagraphRange[],
): number[] => {
  const offsets: number[] = [0];
  const effectivePageAdvance = Math.max(pageHeight * 0.4, pageAdvance);
  const minPageHeight = effectivePageAdvance * 0.38;
  const headingBindingWindow = effectivePageAdvance * 0.35;
  const maxCrossBlockHeight = effectivePageAdvance * 0.95;
  const maxStrictBlockHeight = effectivePageAdvance - 2;
  const headingRelaxBlankThreshold = effectivePageAdvance * 0.08;
  let guard = 0;

  while (true) {
    const previous = offsets[offsets.length - 1] ?? 0;
    if (previous + effectivePageAdvance >= totalHeight - 2) {
      break;
    }

    let next = previous + effectivePageAdvance;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const initialNext = next;

      const headingBinding = headingBindings.find(
        (binding) =>
          binding.top < next &&
          binding.keepUntil > next &&
          next - binding.top <= headingBindingWindow &&
          binding.top - previous >= minPageHeight,
      );

      if (headingBinding !== undefined) {
        next = headingBinding.top;
      }

      const crossing = ranges.find(
        (range) =>
          range.top < next &&
          range.bottom > next &&
          range.height <= (range.strict ? maxStrictBlockHeight : maxCrossBlockHeight) &&
          (range.strict || range.top - previous >= minPageHeight),
      );

      if (crossing !== undefined) {
        next = crossing.strict
          ? crossing.top
          : Math.max(previous + minPageHeight, crossing.top);
      }

      const crossingParagraph = paragraphRanges.find(
        (paragraph) =>
          paragraph.top < next &&
          paragraph.bottom > next &&
          paragraph.height > paragraph.minSplitHeight * 2 + 1,
      );

      if (crossingParagraph !== undefined) {
        const lowerBound = crossingParagraph.top + crossingParagraph.minSplitHeight;
        const upperBound = crossingParagraph.bottom - crossingParagraph.minSplitHeight;

        if (lowerBound >= upperBound) {
          if (crossingParagraph.top - previous >= minPageHeight) {
            next = crossingParagraph.top;
          }
        } else if (next > upperBound) {
          next = Math.max(previous + minPageHeight, upperBound);
        } else if (next < lowerBound && crossingParagraph.top - previous >= minPageHeight) {
          next = crossingParagraph.top;
        }
      }

      if (Math.abs(next - initialNext) < 0.5) {
        break;
      }
    }

    if (next <= previous + 1) {
      next = previous + effectivePageAdvance;
    }

    const headingBindingAtBreak = headingBindings.find(
      (binding) =>
        Math.abs(binding.top - next) < 0.5
        && binding.relaxedUntil > binding.top + 0.5,
    );
    if (headingBindingAtBreak !== undefined) {
      const blankAfterBreak = previous + effectivePageAdvance - next;
      const relaxedCandidate = Math.min(
        previous + effectivePageAdvance,
        headingBindingAtBreak.relaxedUntil,
      );
      if (
        blankAfterBreak > headingRelaxBlankThreshold
        && relaxedCandidate > next + 0.5
      ) {
        next = relaxedCandidate;
      }
    }

    offsets.push(next);
    guard += 1;
    if (guard > 2048) {
      break;
    }
  }

  return offsets;
};

export const computeSharedPagination = (input: SharedPaginationInput): SharedPaginationResult => {
  const paperSizeMeta = getPaperSizeMeta(input.paperSize);
  const rootRect = input.root.getBoundingClientRect();
  if (rootRect.width <= 0) {
    return {
      pageHeightPx: 0,
      pageTopInsetPx: 0,
      pageBottomInsetPx: 0,
      pageOffsets: [0],
    };
  }

  const paperRatio = paperSizeMeta.heightMm / paperSizeMeta.widthMm;
  const physicalPageHeight = rootRect.width * paperRatio;
  const pxPerMm = physicalPageHeight / paperSizeMeta.heightMm;
  const pageTopInset = clampInset(physicalPageHeight, input.marginsTopMm * pxPerMm);
  const pageBottomInset = clampInset(physicalPageHeight, input.marginsBottomMm * pxPerMm);
  const pageAdvance = Math.max(1, physicalPageHeight - pageTopInset - pageBottomInset);
  const toOffsetCoordinate = (value: number): number => Math.max(0, value - pageTopInset);

  const totalContentHeight = Math.max(
    measureTotalContentHeight(input.root, rootRect),
    physicalPageHeight,
  );
  const meaningfulContentBottom = measureMeaningfulContentBottom(input.root, rootRect);

  const avoidRanges = collectAvoidBlockRanges(input.root, rootRect)
    .map((range) => ({
      ...range,
      top: toOffsetCoordinate(range.top),
      bottom: toOffsetCoordinate(range.bottom),
    }))
    .filter((range) => range.bottom > range.top + 0.5);
  const headingBindings = collectHeadingBindingRanges(input.root, rootRect, pageAdvance)
    .map((binding) => ({
      top: toOffsetCoordinate(binding.top),
      keepUntil: toOffsetCoordinate(binding.keepUntil),
      relaxedUntil: toOffsetCoordinate(binding.relaxedUntil),
    }))
    .filter((binding) => binding.keepUntil > binding.top + 0.5);
  const paragraphRanges = collectParagraphRanges(input.root, rootRect)
    .map((paragraph) => ({
      ...paragraph,
      top: toOffsetCoordinate(paragraph.top),
      bottom: toOffsetCoordinate(paragraph.bottom),
    }))
    .filter((paragraph) => paragraph.bottom > paragraph.top + 0.5);

  const totalOffsetHeight = Math.max(pageAdvance, toOffsetCoordinate(totalContentHeight));
  const meaningfulContentBottomOffset = Math.max(
    0,
    toOffsetCoordinate(meaningfulContentBottom),
  );
  const pageOffsets = buildSmartPageOffsets(
    physicalPageHeight,
    pageAdvance,
    totalOffsetHeight,
    avoidRanges,
    headingBindings,
    paragraphRanges,
  );

  while (pageOffsets.length > 1) {
    const lastStart = pageOffsets[pageOffsets.length - 1] ?? 0;
    if (lastStart >= meaningfulContentBottomOffset - 1) {
      pageOffsets.pop();
      continue;
    }
    break;
  }

  return {
    pageHeightPx: physicalPageHeight,
    pageTopInsetPx: pageTopInset,
    pageBottomInsetPx: pageBottomInset,
    pageOffsets: pageOffsets.length > 0 ? pageOffsets : [0],
  };
};

const collectFlowBlocksForBreaks = (root: HTMLElement): HTMLElement[] => {
  const flowBlocks: HTMLElement[] = [];
  const front = root.querySelector<HTMLElement>('.journal-front');
  if (front !== null) {
    flowBlocks.push(...Array.from(front.children).filter((child): child is HTMLElement => child instanceof HTMLElement));
  }

  const body = root.querySelector<HTMLElement>('.journal-body > .markdown-body');
  if (body !== null) {
    flowBlocks.push(...Array.from(body.children).filter((child): child is HTMLElement => child instanceof HTMLElement));
  }

  return flowBlocks;
};

export const clearSharedPaginationBreaks = (root: HTMLElement): void => {
  const targets = root.querySelectorAll<HTMLElement>(`[${EXPORT_BREAK_ATTR}]`);
  targets.forEach((target) => {
    target.removeAttribute(EXPORT_BREAK_ATTR);
    target.style.removeProperty('break-before');
    target.style.removeProperty('page-break-before');
  });

  const spacers = root.querySelectorAll<HTMLElement>(`[${EXPORT_BREAK_SPACER_ATTR}]`);
  spacers.forEach((spacer) => {
    spacer.remove();
  });
};

export const applySharedPaginationBreaks = (input: SharedPaginationInput): SharedPaginationResult => {
  clearSharedPaginationBreaks(input.root);

  const result = computeSharedPagination(input);
  const breakOffsets = result.pageOffsets.slice(1);
  if (breakOffsets.length === 0) {
    return result;
  }

  const rootRect = input.root.getBoundingClientRect();
  const blocks = collectFlowBlocksForBreaks(input.root);
  if (blocks.length === 0) {
    return result;
  }

  const candidates = blocks
    .map((block) => {
      const rect = block.getBoundingClientRect();
      return {
        block,
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top,
      };
    })
    .filter((item) => Number.isFinite(item.top) && Number.isFinite(item.bottom))
    .sort((a, b) => a.top - b.top);

  const marked = new Set<HTMLElement>();
  breakOffsets.forEach((offset) => {
    const breakTop = result.pageTopInsetPx + offset;
    const containing = candidates.find(
      (item) =>
        item.top <= breakTop + 0.5 &&
        item.bottom >= breakTop - 0.5 &&
        !marked.has(item.block),
    )?.block;
    const following = candidates.find(
      (item) => item.top >= breakTop - 0.5 && !marked.has(item.block),
    )?.block;
    const target = containing ?? following;
    if (target === undefined || marked.has(target) || target.parentElement === null) {
      return;
    }

    const spacer = document.createElement('div');
    spacer.setAttribute(EXPORT_BREAK_SPACER_ATTR, '1');
    spacer.setAttribute(EXPORT_BREAK_ATTR, '1');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = `${input.marginsTopMm}mm`;
    spacer.style.margin = '0';
    spacer.style.padding = '0';
    spacer.style.border = '0';
    spacer.style.breakBefore = 'page';
    spacer.style.pageBreakBefore = 'always';

    target.parentElement.insertBefore(spacer, target);
    marked.add(target);
  });

  return result;
};

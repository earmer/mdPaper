export interface PreviewPageFragment {
  frontHtml: string;
  bodyHtml: string;
  bodyCounterReset: string;
}

export interface PreviewPageFragmentInput {
  root: HTMLElement;
  pageOffsets: number[];
  pageHeightPx: number;
  pageTopInsetPx: number;
  pageBottomInsetPx: number;
}

interface DomBoundary {
  node: Node;
  offset: number;
}

const EPSILON = 0.5;
const CONTINUATION_CLASS = 'preview-fragment__continuation';
const SPLIT_TAIL_CLASS = 'preview-fragment__split-tail';

const serializeNodes = (nodes: Node[]): string => {
  const container = document.createElement('div');
  nodes.forEach((node) => container.appendChild(node));
  return container.innerHTML;
};

const collectRootBlocks = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);

const getRelativeRect = (element: HTMLElement, rootRect: DOMRect): DOMRect => {
  const rect = element.getBoundingClientRect();
  return new DOMRect(
    rect.left - rootRect.left,
    rect.top - rootRect.top,
    rect.width,
    rect.height,
  );
};

const createBoundaryAtElementStart = (element: HTMLElement): DomBoundary => ({
  node: element,
  offset: 0,
});

const createBoundaryAtElementEnd = (element: HTMLElement): DomBoundary => ({
  node: element,
  offset: element.childNodes.length,
});

const setRangeBoundary = (
  range: Range,
  kind: 'start' | 'end',
  boundary: DomBoundary,
): void => {
  if (kind === 'start') {
    range.setStart(boundary.node, boundary.offset);
    return;
  }

  range.setEnd(boundary.node, boundary.offset);
};

const getCaretBoundaryFromPoint = (x: number, y: number): DomBoundary | null => {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    if (position !== null) {
      return {
        node: position.offsetNode,
        offset: position.offset,
      };
    }
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range !== null) {
      return {
        node: range.startContainer,
        offset: range.startOffset,
      };
    }
  }

  return null;
};

const normalizeSamplePositions = (rect: DOMRect): number[] => {
  const inset = Math.min(40, Math.max(12, rect.width * 0.16));
  const candidates = [
    rect.left + inset,
    rect.left + rect.width * 0.5,
    rect.right - inset,
  ];

  return Array.from(new Set(candidates.map((value) => Math.round(value * 10) / 10)))
    .filter((value) => value > rect.left + 1 && value < rect.right - 1);
};

const findBoundaryInsideBlock = (
  block: HTMLElement,
  boundaryTop: number,
  rootRect: DOMRect,
  cache: WeakMap<HTMLElement, Map<number, DomBoundary | null>>,
): DomBoundary | null => {
  const cacheKey = Math.round(boundaryTop * 100);
  const cached = cache.get(block)?.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const blockRect = getRelativeRect(block, rootRect);
  const sampleXs = normalizeSamplePositions(new DOMRect(
    blockRect.left + rootRect.left,
    blockRect.top + rootRect.top,
    blockRect.width,
    blockRect.height,
  ));
  const sampleYs = [0, -1, 1, -2, 2, -4, 4, -8, 8]
    .map((offset) => Math.min(
      rootRect.bottom - 1,
      Math.max(rootRect.top + blockRect.top + 1, rootRect.top + boundaryTop + offset),
    ));

  let resolved: DomBoundary | null = null;
  for (const sampleY of sampleYs) {
    for (const sampleX of sampleXs) {
      const boundary = getCaretBoundaryFromPoint(sampleX, sampleY);
      if (boundary === null) {
        continue;
      }

      const owner = boundary.node instanceof Element
        ? boundary.node
        : boundary.node.parentElement;
      if (owner === null || !block.contains(owner)) {
        continue;
      }

      resolved = boundary;
      break;
    }

    if (resolved !== null) {
      break;
    }
  }

  if (!cache.has(block)) {
    cache.set(block, new Map());
  }
  cache.get(block)?.set(cacheKey, resolved);
  return resolved;
};

const isTextLikeBlock = (element: HTMLElement): boolean =>
  element.matches('p, li, blockquote p');

const applyContinuationMarkers = (
  partialBlock: HTMLElement,
  originalBlock: HTMLElement,
  startIncluded: boolean,
  endIncluded: boolean,
): void => {
  if (!startIncluded) {
    if (isTextLikeBlock(originalBlock)) {
      partialBlock.classList.add(CONTINUATION_CLASS);
    } else {
      partialBlock.querySelector<HTMLElement>('p, li')?.classList.add(CONTINUATION_CLASS);
    }
  }

  if (!endIncluded) {
    if (isTextLikeBlock(originalBlock)) {
      partialBlock.classList.add(SPLIT_TAIL_CLASS);
      return;
    }

    const candidates = partialBlock.querySelectorAll<HTMLElement>('p, li');
    const target = candidates[candidates.length - 1];
    target?.classList.add(SPLIT_TAIL_CLASS);
  }
};

const applyOrderedListStart = (
  partialBlock: HTMLElement,
  originalBlock: HTMLElement,
  boundaryTop: number,
  rootRect: DOMRect,
): void => {
  if (originalBlock.tagName !== 'OL') {
    return;
  }

  const items = Array.from(originalBlock.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI');
  if (items.length === 0) {
    return;
  }

  const firstVisibleIndex = items.findIndex((item) => {
    const rect = getRelativeRect(item, rootRect);
    return rect.bottom > boundaryTop + EPSILON;
  });
  if (firstVisibleIndex <= 0) {
    return;
  }

  partialBlock.setAttribute('start', String(firstVisibleIndex + 1));
};

const clonePartialBlock = (
  block: HTMLElement,
  startTop: number,
  endTop: number,
  rootRect: DOMRect,
  boundaryCache: WeakMap<HTMLElement, Map<number, DomBoundary | null>>,
): HTMLElement | null => {
  const blockRect = getRelativeRect(block, rootRect);
  const startIncluded = startTop <= blockRect.top + EPSILON;
  const endIncluded = endTop >= blockRect.bottom - EPSILON;

  const startBoundary = startIncluded
    ? createBoundaryAtElementStart(block)
    : findBoundaryInsideBlock(block, startTop, rootRect, boundaryCache) ?? createBoundaryAtElementStart(block);
  const endBoundary = endIncluded
    ? createBoundaryAtElementEnd(block)
    : findBoundaryInsideBlock(block, endTop, rootRect, boundaryCache) ?? createBoundaryAtElementEnd(block);

  const range = document.createRange();
  setRangeBoundary(range, 'start', startBoundary);
  setRangeBoundary(range, 'end', endBoundary);

  if (range.collapsed) {
    return null;
  }

  const partialBlock = block.cloneNode(false) as HTMLElement;
  partialBlock.appendChild(range.cloneContents());

  if (partialBlock.childNodes.length === 0) {
    return null;
  }

  applyContinuationMarkers(partialBlock, block, startIncluded, endIncluded);
  if (!startIncluded) {
    applyOrderedListStart(partialBlock, block, startTop, rootRect);
  }

  return partialBlock;
};

const collectContainerPageNodes = (
  container: HTMLElement | null,
  rootRect: DOMRect,
  startTop: number,
  endTop: number,
  boundaryCache: WeakMap<HTMLElement, Map<number, DomBoundary | null>>,
): Node[] => {
  if (container === null) {
    return [];
  }

  const nodes: Node[] = [];
  collectRootBlocks(container).forEach((block) => {
    const rect = getRelativeRect(block, rootRect);
    if (rect.bottom <= startTop + EPSILON || rect.top >= endTop - EPSILON) {
      return;
    }

    if (rect.top >= startTop - EPSILON && rect.bottom <= endTop + EPSILON) {
      nodes.push(block.cloneNode(true));
      return;
    }

    const partial = clonePartialBlock(block, startTop, endTop, rootRect, boundaryCache);
    if (partial !== null) {
      nodes.push(partial);
    }
  });

  return nodes;
};

const countElementsBeforeBoundary = (
  root: HTMLElement,
  selector: string,
  rootRect: DOMRect,
  boundaryTop: number,
): number =>
  Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((element) => getRelativeRect(element, rootRect).bottom <= boundaryTop + EPSILON)
    .length;

const buildBodyCounterReset = (
  root: HTMLElement,
  rootRect: DOMRect,
  boundaryTop: number,
): string => {
  const figureSeed = countElementsBeforeBoundary(root, '.journal-body .md-figure', rootRect, boundaryTop);
  const tableSeed = countElementsBeforeBoundary(root, '.journal-body .md-table-caption', rootRect, boundaryTop);
  const equationSeed = countElementsBeforeBoundary(root, '.journal-body .katex-display-block', rootRect, boundaryTop);

  return `figure ${figureSeed} table ${tableSeed} equation ${equationSeed}`;
};

export const buildPreviewPageFragments = (
  input: PreviewPageFragmentInput,
): PreviewPageFragment[] => {
  const article = input.root.querySelector<HTMLElement>('.journal-article');
  if (article === null) {
    return [
      {
        frontHtml: '',
        bodyHtml: '',
        bodyCounterReset: 'figure 0 table 0 equation 0',
      },
    ];
  }

  const front = article.querySelector<HTMLElement>(':scope > .journal-front');
  const body = article.querySelector<HTMLElement>(':scope > .journal-body > .markdown-body');
  const rootRect = input.root.getBoundingClientRect();
  const pageAdvance = Math.max(1, input.pageHeightPx - input.pageTopInsetPx - input.pageBottomInsetPx);
  const boundaryCache = new WeakMap<HTMLElement, Map<number, DomBoundary | null>>();

  return input.pageOffsets.map((offset, pageIndex) => {
    const startTop = input.pageTopInsetPx + offset;
    const endOffset = input.pageOffsets[pageIndex + 1] ?? (offset + pageAdvance);
    const endTop = input.pageTopInsetPx + endOffset;
    const frontNodes = collectContainerPageNodes(front, rootRect, startTop, endTop, boundaryCache);
    const bodyNodes = collectContainerPageNodes(body, rootRect, startTop, endTop, boundaryCache);

    return {
      frontHtml: serializeNodes(frontNodes),
      bodyHtml: serializeNodes(bodyNodes),
      bodyCounterReset: buildBodyCounterReset(input.root, rootRect, startTop),
    };
  });
};


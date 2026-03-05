<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { PAPER_HEADER_LEFT, PAPER_HEADER_RIGHT } from '@/constants/journal';
import { renderMarkdown } from '@/services/markdown/md';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import {
  formatAffiliationLine,
  formatAuthorAffiliation,
} from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();

const renderedHtml = computed(() =>
  renderMarkdown(store.content, {
    normalizeJournalHeadings: store.exportSetting.normalizeHeadings,
    resolveImageSrc: (source) => store.resolveImageAsset(source),
  }),
);

const authorLineHtml = computed(() =>
  formatAuthorAffiliation(store.metadata.authors, store.metadata.affiliations).join('， '),
);

const affiliationLines = computed(() =>
  store.metadata.affiliations.map((item, index) => formatAffiliationLine(item, index)),
);

const keywordLine = computed(() =>
  store.metadata.keywords
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join('; '),
);

const printRootRef = ref<HTMLElement | null>(null);
const currentPage = ref(1);
const pageCount = ref(1);
const pageHeightPx = ref(0);
const pageOffsets = ref<number[]>([0]);

let resizeObserver: ResizeObserver | null = null;
let resizeRafId: number | null = null;
let imageEventAbortController: AbortController | null = null;
let settleRecalculateTimeoutId: number | null = null;

const paperSizeMeta = computed(() =>
  store.exportSetting.paperSize === 'A4'
    ? { widthMm: 210, heightMm: 297 }
    : { widthMm: 216, heightMm: 279.4 },
);

const previewWindowStyle = computed(() => ({
  width: `${paperSizeMeta.value.widthMm}mm`,
  height: `${paperSizeMeta.value.heightMm}mm`,
}));

const pageTopInsetPx = computed(() => {
  const pageHeight = pageHeightPx.value;
  const pageHeightMm = paperSizeMeta.value.heightMm;
  if (pageHeight <= 0 || pageHeightMm <= 0) {
    return 0;
  }

  const pxPerMm = pageHeight / pageHeightMm;
  const inset = store.exportSetting.margins.top * pxPerMm;
  return Math.max(0, Math.min(pageHeight * 0.45, inset));
});

const pageTopMaskStyle = computed(() => ({
  height: `${pageTopInsetPx.value}px`,
}));

const pageTrackStyle = computed(() => {
  const offset = pageOffsets.value[currentPage.value - 1] ?? Math.max(0, (currentPage.value - 1) * pageHeightPx.value);
  const roundedOffset = Math.round(offset);
  return {
    transform: `translateY(-${roundedOffset}px)`,
  };
});

const currentPageBottomMaskHeight = computed(() => {
  const start =
    pageOffsets.value[currentPage.value - 1]
    ?? Math.max(0, (currentPage.value - 1) * pageHeightPx.value);
  const nextStart = pageOffsets.value[currentPage.value] ?? start + pageHeightPx.value;
  const visibleHeight = Math.max(0, Math.min(pageHeightPx.value, nextStart - start));
  const maskHeight = pageHeightPx.value - pageTopInsetPx.value - visibleHeight;

  return maskHeight > 0.5 ? maskHeight : 0;
});

const pageBottomMaskStyle = computed(() => ({
  height: `${currentPageBottomMaskHeight.value}px`,
}));

const pageIndicatorText = computed(() =>
  t('preview.pageOf', { page: currentPage.value, total: pageCount.value }),
);

const articleStyle = computed(() => ({
  '--body-font-size': `${store.exportSetting.fontSize}pt`,
  '--body-line-height': `${store.exportSetting.lineHeight}`,
  '--body-paragraph-indent': `${store.exportSetting.paragraphIndent}em`,
  '--paper-margin-top': `${store.exportSetting.margins.top}mm`,
  '--paper-margin-right': `${store.exportSetting.margins.right}mm`,
  '--paper-margin-bottom': `${store.exportSetting.margins.bottom}mm`,
  '--paper-margin-left': `${store.exportSetting.margins.left}mm`,
  '--paper-size': store.exportSetting.paperSize,
}));

const previewHeaderStyle = computed(() => ({
  left: `${store.exportSetting.margins.left}mm`,
  right: `${store.exportSetting.margins.right}mm`,
}));

const waitForPreviewAssets = async (): Promise<void> => {
  const root = printRootRef.value;
  if (root === null) {
    return;
  }

  const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fontSet !== undefined) {
    try {
      await fontSet.ready;
    } catch {
      // ignore font readiness failures for preview
    }
  }

  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.allSettled(
    images.map(async (img) => {
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
          return;
        } catch {
          // fallback to load/error listeners
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
    }),
  );
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

interface BlockRange {
  top: number;
  bottom: number;
  height: number;
  strict: boolean;
}

interface HeadingBindingRange {
  top: number;
  keepUntil: number;
}

interface ParagraphRange {
  top: number;
  bottom: number;
  height: number;
  minSplitHeight: number;
}

const collectForcedPageBreakOffsets = (
  root: HTMLElement,
  rootRect: DOMRect,
): number[] => {
  const offsets: number[] = [];
  const separators = Array.from(root.querySelectorAll<HTMLElement>('.markdown-body hr'));

  separators.forEach((separator) => {
    const rect = separator.getBoundingClientRect();
    const top = rect.top - rootRect.top;
    if (!Number.isFinite(top) || top <= 0.5) {
      return;
    }

    offsets.push(top);
  });

  offsets.sort((a, b) => a - b);
  return offsets;
};

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

const collectAvoidBlockRanges = (root: HTMLElement, rootRect: DOMRect): BlockRange[] => {
  const ranges: BlockRange[] = [];
  const selectors: Array<{ selector: string; strict: boolean }> = [
    { selector: '.markdown-body h1', strict: false },
    { selector: '.markdown-body h2', strict: false },
    { selector: '.markdown-body h3', strict: false },
    { selector: '.markdown-body h4', strict: false },
    // Keep figures whole in preview pagination whenever they can fit in one page.
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
    const paragraphLike = nextBlock.matches('p');
    let keepUntil = paragraphLike
      ? Math.min(nextBottom, nextTop + minParagraphHeight)
      : nextBottom;

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
  forcedPageBreakOffsets: number[],
): number[] => {
  const offsets: number[] = [0];
  const effectivePageAdvance = Math.max(pageHeight * 0.4, pageAdvance);
  const minPageHeight = effectivePageAdvance * 0.38;
  const headingBindingWindow = effectivePageAdvance * 0.35;
  const maxCrossBlockHeight = effectivePageAdvance * 0.95;
  const maxStrictBlockHeight = effectivePageAdvance - 2;
  const forcedBreakEpsilon = 0.5;
  let forcedBreakCursor = 0;
  let guard = 0;

  while (true) {
    const previous = offsets[offsets.length - 1] ?? 0;
    if (previous + effectivePageAdvance >= totalHeight - 2) {
      break;
    }

    while (forcedBreakCursor < forcedPageBreakOffsets.length) {
      const currentBreak = forcedPageBreakOffsets[forcedBreakCursor];
      if (currentBreak === undefined || currentBreak > previous + forcedBreakEpsilon) {
        break;
      }
      forcedBreakCursor += 1;
    }

    const inRangeForcedBreak = forcedPageBreakOffsets[forcedBreakCursor];
    if (
      inRangeForcedBreak !== undefined
      && inRangeForcedBreak <= previous + effectivePageAdvance + forcedBreakEpsilon
    ) {
      offsets.push(inRangeForcedBreak);
      guard += 1;
      if (guard > 2048) {
        break;
      }
      continue;
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

    const forcedBeforeNext = forcedPageBreakOffsets[forcedBreakCursor];
    if (
      forcedBeforeNext !== undefined
      && forcedBeforeNext > previous + forcedBreakEpsilon
      && forcedBeforeNext < next - forcedBreakEpsilon
    ) {
      next = forcedBeforeNext;
    }

    offsets.push(next);
    guard += 1;
    if (guard > 2048) {
      break;
    }
  }

  return offsets;
};

const recalculatePagination = (): void => {
  const root = printRootRef.value;
  if (root === null) {
    return;
  }

  const rect = root.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const paperRatio = paperSizeMeta.value.heightMm / paperSizeMeta.value.widthMm;
  const physicalPageHeight = rect.width * paperRatio;
  pageHeightPx.value = physicalPageHeight;
  const pageTopInset = pageTopInsetPx.value;
  const pageAdvance = Math.max(1, physicalPageHeight - pageTopInset);
  const toOffsetCoordinate = (value: number): number => Math.max(0, value - pageTopInset);

  const totalContentHeight = Math.max(measureTotalContentHeight(root, rect), physicalPageHeight);
  const avoidRanges = collectAvoidBlockRanges(root, rect)
    .map((range) => ({
      ...range,
      top: toOffsetCoordinate(range.top),
      bottom: toOffsetCoordinate(range.bottom),
    }))
    .filter((range) => range.bottom > range.top + 0.5);
  const headingBindings = collectHeadingBindingRanges(root, rect, pageAdvance)
    .map((binding) => ({
      top: toOffsetCoordinate(binding.top),
      keepUntil: toOffsetCoordinate(binding.keepUntil),
    }))
    .filter((binding) => binding.keepUntil > binding.top + 0.5);
  const paragraphRanges = collectParagraphRanges(root, rect)
    .map((paragraph) => ({
      ...paragraph,
      top: toOffsetCoordinate(paragraph.top),
      bottom: toOffsetCoordinate(paragraph.bottom),
    }))
    .filter((paragraph) => paragraph.bottom > paragraph.top + 0.5);
  const forcedPageBreakOffsets = collectForcedPageBreakOffsets(root, rect)
    .map((offset) => toOffsetCoordinate(offset))
    .filter((offset, index, list) => {
      if (offset <= 0.5) {
        return false;
      }

      const previous = list[index - 1];
      return previous === undefined || Math.abs(offset - previous) > 0.5;
    });
  const totalOffsetHeight = Math.max(pageAdvance, toOffsetCoordinate(totalContentHeight));
  pageOffsets.value = buildSmartPageOffsets(
    physicalPageHeight,
    pageAdvance,
    totalOffsetHeight,
    avoidRanges,
    headingBindings,
    paragraphRanges,
    forcedPageBreakOffsets,
  );
  const totalPages = Math.max(1, pageOffsets.value.length);
  pageCount.value = totalPages;
  currentPage.value = Math.min(Math.max(currentPage.value, 1), totalPages);
};

const scheduleRecalculate = (): void => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }

  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    recalculatePagination();
  });
};

const scheduleAssetSettledRecalculate = (): void => {
  scheduleRecalculate();

  if (settleRecalculateTimeoutId !== null) {
    window.clearTimeout(settleRecalculateTimeoutId);
  }

  settleRecalculateTimeoutId = window.setTimeout(() => {
    settleRecalculateTimeoutId = null;
    scheduleRecalculate();
  }, 80);
};

const stopImageEventTracking = (): void => {
  if (imageEventAbortController !== null) {
    imageEventAbortController.abort();
    imageEventAbortController = null;
  }
};

const startImageEventTracking = (root: HTMLElement | null): void => {
  stopImageEventTracking();

  if (root === null) {
    return;
  }

  const abortController = new AbortController();
  const onAssetSettled = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement)) {
      return;
    }

    scheduleAssetSettledRecalculate();
  };

  root.addEventListener('load', onAssetSettled, {
    capture: true,
    signal: abortController.signal,
  });
  root.addEventListener('error', onAssetSettled, {
    capture: true,
    signal: abortController.signal,
  });

  imageEventAbortController = abortController;
};

const toPrevPage = (): void => {
  currentPage.value = Math.max(1, currentPage.value - 1);
};

const toNextPage = (): void => {
  currentPage.value = Math.min(pageCount.value, currentPage.value + 1);
};

watch(
  () => [store.metadata, store.content, store.exportSetting],
  async () => {
    await nextTick();
    scheduleRecalculate();
    await waitForPreviewAssets();
    scheduleAssetSettledRecalculate();
  },
  { deep: true },
);

watch(printRootRef, (root, previousRoot) => {
  if (resizeObserver !== null && previousRoot !== null) {
    resizeObserver.unobserve(previousRoot);
  }

  if (resizeObserver !== null && root !== null) {
    resizeObserver.observe(root);
  }

  startImageEventTracking(root);
  scheduleAssetSettledRecalculate();
});

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    scheduleRecalculate();
  });

  if (printRootRef.value !== null) {
    resizeObserver.observe(printRootRef.value);
  }
  startImageEventTracking(printRootRef.value);

  window.addEventListener('resize', scheduleRecalculate);
  await nextTick();
  scheduleRecalculate();
  await waitForPreviewAssets();
  scheduleAssetSettledRecalculate();
});

onBeforeUnmount(() => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }

  if (resizeObserver !== null) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  stopImageEventTracking();
  if (settleRecalculateTimeoutId !== null) {
    window.clearTimeout(settleRecalculateTimeoutId);
    settleRecalculateTimeoutId = null;
  }

  window.removeEventListener('resize', scheduleRecalculate);
});
</script>

<template>
  <section class="preview-pane">
    <div class="preview-pane__header">
      <h2>{{ t('preview.title') }}</h2>
      <div class="preview-pane__pagination">
        <TButton
          size="small"
          variant="outline"
          :disabled="currentPage <= 1"
          @click="toPrevPage"
        >
          {{ t('preview.prevPage') }}
        </TButton>
        <span class="preview-pane__page-indicator">{{ pageIndicatorText }}</span>
        <TButton
          size="small"
          variant="outline"
          :disabled="currentPage >= pageCount"
          @click="toNextPage"
        >
          {{ t('preview.nextPage') }}
        </TButton>
      </div>
    </div>

    <div class="preview-pane__stage">
      <div class="preview-paper-viewer">
        <div class="preview-page-window" :style="previewWindowStyle">
          <header
            class="journal-page-header-static preview-page-header-overlay"
            :style="previewHeaderStyle"
            aria-hidden="true"
          >
            <span class="journal-page-header-static__left">{{ PAPER_HEADER_LEFT }}</span>
            <span class="journal-page-header-static__right">{{ PAPER_HEADER_RIGHT }}</span>
          </header>
          <div
            v-if="pageTopInsetPx > 0"
            class="preview-page-top-mask"
            :style="pageTopMaskStyle"
            aria-hidden="true"
          />
          <div class="preview-page-track" :style="pageTrackStyle">
            <div
              id="journal-print-root"
              ref="printRootRef"
              class="journal-page"
              :data-paper="store.exportSetting.paperSize"
              :style="articleStyle"
            >
              <header class="journal-page-header-static" aria-hidden="true">
                <span class="journal-page-header-static__left">{{ PAPER_HEADER_LEFT }}</span>
                <span class="journal-page-header-static__right">{{ PAPER_HEADER_RIGHT }}</span>
              </header>

              <article class="journal-article">
                <header class="journal-front">
                  <h1 class="journal-title">{{ store.metadata.title }}</h1>
                  <h2 v-if="store.metadata.subtitle" class="journal-subtitle">
                    {{ store.metadata.subtitle }}
                  </h2>

                  <div class="journal-authors" v-html="authorLineHtml" />

                  <div class="journal-affiliations">
                    <p v-for="line in affiliationLines" :key="line">{{ line }}</p>
                  </div>

                  <div v-if="store.metadata.fundings.length > 0" class="journal-funding">
                    <strong>{{ t('preview.fundings') }}：</strong>
                    <span>{{ store.metadata.fundings.map((item) => item.text).join('；') }}</span>
                  </div>

                  <section class="journal-abstract">
                    <h3>{{ t('preview.abstract') }}</h3>
                    <p>{{ store.metadata.abstract }}</p>
                  </section>

                  <section class="journal-keywords">
                    <strong>{{ t('preview.keywords') }}:</strong>
                    <span>{{ keywordLine }}</span>
                  </section>
                </header>

                <section class="journal-body">
                  <div class="markdown-body" :lang="store.locale" v-html="renderedHtml" />
                </section>
              </article>
            </div>
          </div>
          <div
            v-if="currentPageBottomMaskHeight > 0"
            class="preview-page-bottom-mask"
            :style="pageBottomMaskStyle"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  </section>
</template>

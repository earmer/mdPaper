<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
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
  }),
);

const authorLineHtml = computed(() =>
  formatAuthorAffiliation(store.metadata.authors, store.metadata.affiliations).join('， '),
);

const affiliationLines = computed(() =>
  store.metadata.affiliations.map((item, index) => formatAffiliationLine(item, index)),
);

const paperLabel = computed(() =>
  store.exportSetting.paperSize === 'A4' ? t('preview.paperA4') : t('preview.paperLetter'),
);

const printRootRef = ref<HTMLElement | null>(null);
const currentPage = ref(1);
const pageCount = ref(1);
const pageHeightPx = ref(0);
const pageOffsets = ref<number[]>([0]);
const formulaAutoLockedNotified = ref(false);

let resizeObserver: ResizeObserver | null = null;
let resizeRafId: number | null = null;

const paperSizeMeta = computed(() =>
  store.exportSetting.paperSize === 'A4'
    ? { widthMm: 210, heightMm: 297 }
    : { widthMm: 216, heightMm: 279.4 },
);

const previewWindowStyle = computed(() => ({
  width: `${paperSizeMeta.value.widthMm}mm`,
  height: `${paperSizeMeta.value.heightMm}mm`,
}));

const pageTrackStyle = computed(() => {
  const offset = pageOffsets.value[currentPage.value - 1] ?? Math.max(0, (currentPage.value - 1) * pageHeightPx.value);
  return {
    transform: `translate3d(0, -${offset}px, 0)`,
  };
});

const pageIndicatorText = computed(() =>
  t('preview.pageOf', { page: currentPage.value, total: pageCount.value }),
);

const forceSingleColumnByFormula = computed(() => store.hasLongFormulaBlock);

const articleStyle = computed(() => ({
  '--body-font-size': `${store.exportSetting.fontSize}pt`,
  '--body-line-height': `${store.exportSetting.lineHeight}`,
  '--body-paragraph-indent': `${store.exportSetting.paragraphIndent}em`,
  '--body-column-gap': `${store.exportSetting.columnGap}mm`,
  '--paper-margin-top': `${store.exportSetting.margins.top}mm`,
  '--paper-margin-right': `${store.exportSetting.margins.right}mm`,
  '--paper-margin-bottom': `${store.exportSetting.margins.bottom}mm`,
  '--paper-margin-left': `${store.exportSetting.margins.left}mm`,
  '--paper-size': store.exportSetting.paperSize,
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
}

const collectAvoidBlockRanges = (root: HTMLElement, rootRect: DOMRect): BlockRange[] => {
  const selectors = [
    '.markdown-body h2',
    '.markdown-body h3',
    '.markdown-body .md-figure',
    '.markdown-body table',
    '.markdown-body pre',
    '.markdown-body .katex-display-block',
    '.markdown-body blockquote',
  ].join(', ');

  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selectors));
  return nodes
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top,
        height: rect.height,
      };
    })
    .filter((item) => item.height > 0);
};

const buildSmartPageOffsets = (
  pageHeight: number,
  totalHeight: number,
  ranges: BlockRange[],
): number[] => {
  const offsets: number[] = [0];
  const minPageHeight = pageHeight * 0.38;
  const maxCrossBlockHeight = pageHeight * 0.95;
  let guard = 0;

  while (true) {
    const previous = offsets[offsets.length - 1] ?? 0;
    if (previous + pageHeight >= totalHeight - 2) {
      break;
    }

    let next = previous + pageHeight;
    const crossing = ranges.find(
      (range) =>
        range.top < next &&
        range.bottom > next &&
        range.height <= maxCrossBlockHeight &&
        range.top - previous >= minPageHeight,
    );

    if (crossing !== undefined) {
      next = Math.max(previous + minPageHeight, crossing.top);
    }

    if (next <= previous + 1) {
      next = previous + pageHeight;
    }

    offsets.push(next);
    guard += 1;
    if (guard > 2048) {
      break;
    }
  }

  return offsets;
};

const fitFormulaBlocks = (root: HTMLElement): void => {
  const markdownBody = root.querySelector<HTMLElement>('.markdown-body');
  if (markdownBody === null) {
    store.setLongFormulaBlock(false);
    return;
  }

  const formulaBlocks = Array.from(
    markdownBody.querySelectorAll<HTMLElement>('.katex-display-block'),
  );
  if (formulaBlocks.length === 0) {
    store.setLongFormulaBlock(false);
    return;
  }

  const pxPerMm = root.clientWidth / paperSizeMeta.value.widthMm;
  const columnGapPx = store.exportSetting.columnGap * pxPerMm;
  const safeDoubleColumnWidth = Math.max((markdownBody.clientWidth - columnGapPx) / 2, 40);

  let hasLongFormulaBlock = false;
  for (const block of formulaBlocks) {
    const display = block.querySelector<HTMLElement>('.katex-display');
    const katex = display?.querySelector<HTMLElement>('.katex');
    if (display === null || display === undefined || katex === null || katex === undefined) {
      continue;
    }

    display.style.fontSize = '1em';
    const naturalWidth = Math.ceil(katex.scrollWidth);
    if (naturalWidth > safeDoubleColumnWidth + 1) {
      hasLongFormulaBlock = true;
      break;
    }
  }

  store.setLongFormulaBlock(hasLongFormulaBlock);

  if (hasLongFormulaBlock && store.exportSetting.columns === 2) {
    store.exportSetting.columns = 1;
    if (!formulaAutoLockedNotified.value) {
      formulaAutoLockedNotified.value = true;
      MessagePlugin.warning(t('export.formulaSingleColumnLock'));
    }
  }

  if (!hasLongFormulaBlock) {
    formulaAutoLockedNotified.value = false;
  }

  for (const block of formulaBlocks) {
    const display = block.querySelector<HTMLElement>('.katex-display');
    const katex = display?.querySelector<HTMLElement>('.katex');
    if (display === null || display === undefined || katex === null || katex === undefined) {
      continue;
    }

    display.style.fontSize = '1em';
    const naturalWidth = Math.max(1, Math.ceil(katex.scrollWidth));
    const availableWidth = Math.max(1, Math.floor(block.clientWidth) - 2);
    const scale = Math.min(1, availableWidth / naturalWidth);
    display.style.fontSize = `${scale.toFixed(4)}em`;
    block.classList.toggle('katex-display-block--scaled', scale < 0.999);
  }
};

const recalculatePagination = (): void => {
  const root = printRootRef.value;
  if (root === null) {
    return;
  }

  fitFormulaBlocks(root);

  const rect = root.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const paperRatio = paperSizeMeta.value.heightMm / paperSizeMeta.value.widthMm;
  const physicalPageHeight = rect.width * paperRatio;
  pageHeightPx.value = physicalPageHeight;

  const totalContentHeight = Math.max(measureTotalContentHeight(root, rect), physicalPageHeight);
  const avoidRanges = collectAvoidBlockRanges(root, rect);
  pageOffsets.value = buildSmartPageOffsets(
    physicalPageHeight,
    totalContentHeight,
    avoidRanges,
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
    await waitForPreviewAssets();
    scheduleRecalculate();
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

  scheduleRecalculate();
});

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    scheduleRecalculate();
  });

  if (printRootRef.value !== null) {
    resizeObserver.observe(printRootRef.value);
  }

  window.addEventListener('resize', scheduleRecalculate);
  await nextTick();
  await waitForPreviewAssets();
  scheduleRecalculate();
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

  window.removeEventListener('resize', scheduleRecalculate);
});
</script>

<template>
  <section class="preview-pane">
    <div class="preview-pane__header">
      <h2>{{ t('preview.title') }}</h2>
      <p>{{ t('preview.live') }}</p>
      <div class="preview-pane__pagination">
        <span class="preview-pane__paper">{{ paperLabel }}</span>
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
                    <strong>{{ t('preview.keywords') }}：</strong>
                    <span>{{ store.metadata.keywords.join('；') }}</span>
                  </section>
                </header>

                <section
                  class="journal-body"
                  :class="{
                    'journal-body--double': store.exportSetting.columns === 2 && !store.hasLongFormulaBlock,
                    'journal-body--single': store.exportSetting.columns === 1 || store.hasLongFormulaBlock,
                  }"
                >
                  <div class="markdown-body" :lang="store.locale" v-html="renderedHtml" />
                </section>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TAlert
      v-if="forceSingleColumnByFormula"
      class="preview-pane__formula-alert"
      theme="warning"
      :message="t('preview.formulaSingleColumnLock')"
    />
  </section>
</template>

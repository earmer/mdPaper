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
import { computeSharedPagination } from '@/services/pagination/sharedPagination';
import { buildPageLabel } from '@/services/export/helpers';
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
  formatAuthorAffiliation(
    store.metadata.authors,
    store.metadata.affiliations,
    store.metadata.correspondingAuthorId,
  ).join('， '),
);

const affiliationLines = computed(() =>
  store.metadata.affiliations.map((item, index) => formatAffiliationLine(item, index)),
);

const correspondingAuthorLine = computed(() => {
  const selectedAuthor = store.metadata.authors.find(
    (author) => author.id === store.metadata.correspondingAuthorId,
  );
  if (selectedAuthor === undefined) {
    return '';
  }

  const displayName = selectedAuthor.name.trim() || selectedAuthor.nameEn.trim();
  if (displayName.length === 0) {
    return '';
  }

  const contact = store.metadata.correspondingAuthorContact.trim();
  if (contact.length === 0) {
    return `* ${t('preview.correspondingAuthor')}: ${displayName}`;
  }

  return `* ${t('preview.correspondingAuthor')}: ${displayName} (${contact})`;
});

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
const pageTopInsetPx = ref(0);
const pageBottomInsetPx = ref(0);

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

const pageTopMaskStyle = computed(() => ({
  height: `${pageTopInsetPx.value}px`,
}));

const pageTrackStyle = computed(() => {
  const offset = pageOffsets.value[currentPage.value - 1]
    ?? Math.max(0, (currentPage.value - 1) * pageHeightPx.value);
  const roundedOffset = Math.round(offset);
  return {
    top: `-${roundedOffset}px`,
  };
});

const currentPageBottomMaskHeight = computed(() => {
  const pageHeight = pageHeightPx.value;
  const pageTopInset = pageTopInsetPx.value;
  const pageBottomInset = pageBottomInsetPx.value;
  const standardVisibleHeight = Math.max(1, pageHeight - pageTopInset - pageBottomInset);
  const start =
    pageOffsets.value[currentPage.value - 1]
    ?? Math.max(0, (currentPage.value - 1) * standardVisibleHeight);
  const nextStart = pageOffsets.value[currentPage.value] ?? start + standardVisibleHeight;
  const visibleHeight = Math.max(0, Math.min(standardVisibleHeight, nextStart - start));
  const maskHeight = pageHeight - pageTopInset - visibleHeight;

  return maskHeight > 0.5 ? maskHeight : 0;
});

const pageBottomMaskStyle = computed(() => ({
  height: `${currentPageBottomMaskHeight.value}px`,
}));

const pageIndicatorText = computed(() =>
  t('preview.pageOf', { page: currentPage.value, total: pageCount.value }),
);

const previewFooterPageLabel = computed(() =>
  buildPageLabel(store.locale, currentPage.value, pageCount.value),
);

const shouldShowPreviewPageNumber = computed(
  () =>
    store.exportSetting.headerFooter.showFooter
    && store.exportSetting.headerFooter.showPageNumber,
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
      await Promise.allSettled([
        fontSet.load('1em KaTeX_Main'),
        fontSet.load('1em KaTeX_Math'),
      ]);
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

const recalculatePagination = (): void => {
  const root = printRootRef.value;
  if (root === null) {
    return;
  }

  const pagination = computeSharedPagination({
    root,
    paperSize: store.exportSetting.paperSize,
    marginsTopMm: store.exportSetting.margins.top,
    marginsBottomMm: store.exportSetting.margins.bottom,
  });

  pageHeightPx.value = pagination.pageHeightPx;
  pageTopInsetPx.value = pagination.pageTopInsetPx;
  pageBottomInsetPx.value = pagination.pageBottomInsetPx;
  pageOffsets.value = pagination.pageOffsets;
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

                  <p v-if="correspondingAuthorLine" class="journal-corresponding-author">
                    {{ correspondingAuthorLine }}
                  </p>

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
          <div
            v-if="shouldShowPreviewPageNumber"
            class="journal-export-page-number"
            aria-hidden="true"
          >
            {{ previewFooterPageLabel }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

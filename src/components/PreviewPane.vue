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
import type { ExportPayload } from '@/types/manuscript';
import {
  formatAffiliationLine,
  formatAuthorAffiliation,
} from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();

const EMPTY_PREVIEW_PAGE_HTML = '';
const ASSET_SETTLE_RECALCULATE_DELAY_MS = 80;
const PREVIEW_RENDERING_DELAY_MS = 120;
const PREVIEW_PAGED_STYLE_ID = 'preview-pagedjs-styles';

const renderedBodyHtml = computed(() =>
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

const measureRootRef = ref<HTMLElement | null>(null);
const previewPageHtmlList = ref<string[]>([EMPTY_PREVIEW_PAGE_HTML]);
const previewPagedStylesText = ref('');
const currentPage = ref(1);
const pageCount = ref(1);
const previewRendering = ref(false);

let resizeRafId: number | null = null;
let previewRenderingDelayId: number | null = null;
let settleRecalculateTimeoutId: number | null = null;
let previewRenderVersion = 0;
let previewRenderInFlight = false;
let previewRenderQueued = false;
let previewUnmounted = false;
let previewPagedStyleElement: HTMLStyleElement | null = null;

const paperSizeMeta = computed(() =>
  store.exportSetting.paperSize === 'A4'
    ? { widthMm: 210, heightMm: 297 }
    : { widthMm: 216, heightMm: 279.4 },
);

const previewWindowStyle = computed(() => ({
  width: `${paperSizeMeta.value.widthMm}mm`,
  height: `${paperSizeMeta.value.heightMm}mm`,
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

const currentPreviewPageHtml = computed(
  () => previewPageHtmlList.value[currentPage.value - 1] ?? EMPTY_PREVIEW_PAGE_HTML,
);

const arePreviewPagesEqual = (nextPages: string[]): boolean => {
  if (previewPageHtmlList.value.length !== nextPages.length) {
    return false;
  }

  return nextPages.every((page, index) => previewPageHtmlList.value[index] === page);
};

const showPreviewRenderingLater = (): void => {
  if (previewRendering.value || previewRenderingDelayId !== null) {
    return;
  }

  previewRenderingDelayId = window.setTimeout(() => {
    previewRenderingDelayId = null;
    if (previewRenderInFlight && !previewUnmounted) {
      previewRendering.value = true;
    }
  }, PREVIEW_RENDERING_DELAY_MS);
};

const hidePreviewRendering = (): void => {
  if (previewRenderingDelayId !== null) {
    window.clearTimeout(previewRenderingDelayId);
    previewRenderingDelayId = null;
  }

  previewRendering.value = false;
};

const ensurePreviewPagedStyleElement = (): HTMLStyleElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  if (previewPagedStyleElement !== null && document.head.contains(previewPagedStyleElement)) {
    return previewPagedStyleElement;
  }

  const existingStyleElement = document.getElementById(PREVIEW_PAGED_STYLE_ID);
  if (existingStyleElement instanceof HTMLStyleElement) {
    previewPagedStyleElement = existingStyleElement;
    return previewPagedStyleElement;
  }

  const styleElement = document.createElement('style');
  styleElement.id = PREVIEW_PAGED_STYLE_ID;
  document.head.appendChild(styleElement);
  previewPagedStyleElement = styleElement;
  return previewPagedStyleElement;
};

const syncPreviewPagedStyles = (): void => {
  const styleElement = ensurePreviewPagedStyleElement();
  if (styleElement === null) {
    return;
  }

  styleElement.textContent = previewPagedStylesText.value;
};

const buildPreviewPayload = (): ExportPayload | null => {
  const root = measureRootRef.value;
  if (root === null) {
    return null;
  }

  return {
    articleElement: root,
    locale: store.locale,
    metadata: store.metadata,
    exportSetting: store.exportSetting,
  };
};

const waitForPreviewAssets = async (): Promise<void> => {
  const root = measureRootRef.value;
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

const recalculatePagination = async (): Promise<void> => {
  if (previewUnmounted) {
    return;
  }

  if (previewRenderInFlight) {
    previewRenderQueued = true;
    return;
  }

  previewRenderInFlight = true;
  showPreviewRenderingLater();

  try {
    const { renderBrowserPreviewPages } = await import('@/services/export/engines/browserPrintEngine');

    while (!previewUnmounted) {
      const payload = buildPreviewPayload();
      previewRenderQueued = false;

      if (payload === null) {
        break;
      }

      const currentVersion = ++previewRenderVersion;

      try {
        const renderedPreview = await renderBrowserPreviewPages(payload);

        if (previewUnmounted || currentVersion !== previewRenderVersion) {
          continue;
        }

        previewPagedStylesText.value = renderedPreview.stylesText;

        const nextPageHtmlList = renderedPreview.pages.length > 0
          ? renderedPreview.pages.map((page) => page.html)
          : [EMPTY_PREVIEW_PAGE_HTML];

        if (!arePreviewPagesEqual(nextPageHtmlList)) {
          previewPageHtmlList.value = nextPageHtmlList;
        }

        const totalPages = Math.max(1, nextPageHtmlList.length);
        pageCount.value = totalPages;
        currentPage.value = Math.min(Math.max(currentPage.value, 1), totalPages);
      } catch (error) {
        if (previewUnmounted || currentVersion !== previewRenderVersion) {
          continue;
        }

        console.error('Failed to render preview pages with export-standard pagination.', error);
        previewPagedStylesText.value = '';
        previewPageHtmlList.value = [EMPTY_PREVIEW_PAGE_HTML];
        pageCount.value = 1;
        currentPage.value = 1;
      }

      if (!previewRenderQueued) {
        break;
      }
    }
  } finally {
    previewRenderInFlight = false;
    hidePreviewRendering();

    if (previewRenderQueued && !previewUnmounted) {
      void recalculatePagination();
    }
  }
};

const scheduleRecalculate = (): void => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
  }

  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    void recalculatePagination();
  });
};

const scheduleAssetSettledRecalculate = (): void => {
  if (settleRecalculateTimeoutId !== null) {
    window.clearTimeout(settleRecalculateTimeoutId);
  }

  settleRecalculateTimeoutId = window.setTimeout(() => {
    settleRecalculateTimeoutId = null;
    scheduleRecalculate();
  }, ASSET_SETTLE_RECALCULATE_DELAY_MS);
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

watch(measureRootRef, (root, previousRoot) => {
  void previousRoot;
  if (root === null) {
    return;
  }

  scheduleRecalculate();
});

watch(previewPagedStylesText, () => {
  syncPreviewPagedStyles();
});

onMounted(async () => {
  previewUnmounted = false;
  syncPreviewPagedStyles();

  window.addEventListener('resize', scheduleRecalculate);
  await nextTick();
  scheduleRecalculate();
  await waitForPreviewAssets();
  scheduleAssetSettledRecalculate();
});

onBeforeUnmount(() => {
  previewUnmounted = true;
  previewRenderQueued = false;
  previewRenderVersion += 1;
  previewPagedStylesText.value = '';

  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }

  hidePreviewRendering();
  if (settleRecalculateTimeoutId !== null) {
    window.clearTimeout(settleRecalculateTimeoutId);
    settleRecalculateTimeoutId = null;
  }

  previewPagedStyleElement?.remove();
  previewPagedStyleElement = null;

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
        <div class="preview-page-window preview-page-window--paged" :style="previewWindowStyle">
          <div
            :key="`${currentPage}-${pageCount}`"
            class="preview-page-rendered journal-print-pages"
            :data-paper="store.exportSetting.paperSize"
            :style="articleStyle"
            v-html="currentPreviewPageHtml"
          />
          <div v-if="previewRendering" class="preview-page-rendering" aria-hidden="true">
            {{ t('export.exporting') }}
          </div>
        </div>
      </div>
    </div>

    <div class="preview-pane__measure" aria-hidden="true">
      <div
        id="journal-print-root"
        ref="measureRootRef"
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
            <div class="markdown-body" :lang="store.locale" v-html="renderedBodyHtml" />
          </section>
        </article>
      </div>
    </div>
  </section>
</template>

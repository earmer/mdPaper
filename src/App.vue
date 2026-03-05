<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useWindowSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import ExportDialog from '@/components/ExportDialog.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import MetaForm from '@/components/MetaForm.vue';
import PreviewPane from '@/components/PreviewPane.vue';
import TopBar from '@/components/TopBar.vue';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import { debounce } from '@/utils/debounce';

const store = useManuscriptStore();
const { t, locale } = useI18n();
const GUIDE_SEEN_STORAGE_KEY = 'mdpaper-guide-seen-v1';
const GUIDE_META_LAST_STEP = 2;
const GUIDE_CONTENT_LAST_STEP = 4;

const activeTab = ref('meta');
const drawerVisible = ref(false);
const exportDialogVisible = ref(false);
const guideCurrent = ref(-1);
const mobileRecommendDialogVisible = ref(false);
const hasShownMobileRecommendDialog = ref(false);
const { width } = useWindowSize();

const isMobile = computed(() => width.value < 1100);

const paperOptions = computed(() => [
  { label: t('export.paperA4'), value: 'A4' },
  { label: t('export.paperLetter'), value: 'Letter' },
]);

const saveDraftDebounced = debounce(() => {
  if (store.enableDraftPersistence) {
    store.saveDraft();
  }
}, 500);

const guidePrevButtonProps = computed(() => ({
  content: t('guide.prev'),
}));

const guideNextButtonProps = computed(() => ({
  content: t('guide.next'),
}));

const guideSkipButtonProps = computed(() => ({
  content: t('guide.skip'),
}));

const guideFinishButtonProps = computed(() => ({
  content: t('guide.finish'),
}));

const guideSteps = computed(() => [
  {
    element: isMobile.value
      ? '#guide-mobile-meta-panel .guide-meta-title-item'
      : '#guide-meta-panel .guide-meta-title-item',
    title: t('guide.steps.titleTitle'),
    body: t('guide.steps.titleBody'),
    placement: isMobile.value ? 'bottom' : 'right',
  },
  {
    element: isMobile.value
      ? '#guide-mobile-meta-panel .guide-meta-authors-item .t-form__label'
      : '#guide-meta-panel .guide-meta-authors-item .t-form__label',
    title: t('guide.steps.authorsTitle'),
    body: t('guide.steps.authorsBody'),
    placement: isMobile.value ? 'bottom' : 'top',
  },
  {
    element: isMobile.value
      ? '#guide-mobile-meta-panel .guide-meta-corresponding-item'
      : '#guide-meta-panel .guide-meta-corresponding-item',
    title: t('guide.steps.correspondingAuthorTitle'),
    body: t('guide.steps.correspondingAuthorBody'),
    placement: isMobile.value ? 'bottom' : 'right',
  },
  {
    element: isMobile.value
      ? '#guide-mobile-content-panel .markdown-editor__content-head'
      : '#guide-content-panel .markdown-editor__content-head',
    title: t('guide.steps.contentTitle'),
    body: t('guide.steps.contentBody'),
    placement: isMobile.value ? 'bottom' : 'right',
  },
  {
    element: isMobile.value
      ? '#guide-mobile-content-panel .guide-content-fullscreen-btn'
      : '#guide-content-panel .guide-content-fullscreen-btn',
    title: t('guide.steps.fullscreenTitle'),
    body: t('guide.steps.fullscreenBody'),
    placement: isMobile.value ? 'bottom' : 'left',
  },
  {
    element: '#guide-export-button',
    title: t('guide.steps.exportTitle'),
    body: t('guide.steps.exportBody'),
    placement: 'bottom',
  },
]);

const shouldOpenGuideOnFirstVisit = (): boolean => {
  try {
    return localStorage.getItem(GUIDE_SEEN_STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
};

const markGuideSeen = (): void => {
  try {
    localStorage.setItem(GUIDE_SEEN_STORAGE_KEY, '1');
  } catch {
    // Ignore storage errors in restricted environments.
  }
};

const scrollGuideTargetIntoView = async (index: number): Promise<void> => {
  if (index < 0 || index >= guideSteps.value.length) {
    return;
  }

  const targetSelector = guideSteps.value[index]?.element;
  if (typeof targetSelector !== 'string') {
    return;
  }

  await nextTick();
  const target = document.querySelector(targetSelector);
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'auto',
  });
};

watch(
  () => store.$state,
  () => {
    saveDraftDebounced();
  },
  { deep: true },
);

watch(
  () => store.theme,
  (theme) => {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
    document.documentElement.setAttribute('theme-mode', theme);
  },
  { immediate: true },
);

watch(
  () => store.locale,
  (value) => {
    locale.value = value;
  },
  { immediate: true },
);

watch(
  isMobile,
  (value) => {
    if (!value) {
      drawerVisible.value = false;
      mobileRecommendDialogVisible.value = false;
      return;
    }

    if (!hasShownMobileRecommendDialog.value) {
      mobileRecommendDialogVisible.value = true;
      hasShownMobileRecommendDialog.value = true;
    }

    if (guideCurrent.value >= 0 && guideCurrent.value <= GUIDE_CONTENT_LAST_STEP) {
      drawerVisible.value = true;
    }
  },
  { immediate: true },
);

watch(guideCurrent, (value) => {
  if (value < 0) {
    return;
  }

  if (value <= GUIDE_META_LAST_STEP) {
    activeTab.value = 'meta';
  } else if (value <= GUIDE_CONTENT_LAST_STEP) {
    activeTab.value = 'content';
  }

  if (isMobile.value) {
    drawerVisible.value = value <= GUIDE_CONTENT_LAST_STEP;
  }

  void scrollGuideTargetIntoView(value);
});

onMounted(() => {
  if (store.enableDraftPersistence && store.loadDraft()) {
    MessagePlugin.success(t('app.draftLoaded'));
  }

  if (shouldOpenGuideOnFirstVisit()) {
    openGuide();
  }

  window.addEventListener('beforeunload', saveDraftOnUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', saveDraftOnUnload);
});

const openExportDialog = (): void => {
  exportDialogVisible.value = true;
};

const openMobileEditor = (): void => {
  drawerVisible.value = true;
};

const openGuide = (): void => {
  guideCurrent.value = 0;
};

const closeGuide = (): void => {
  guideCurrent.value = -1;
};

const finishGuide = (): void => {
  markGuideSeen();
  closeGuide();
};

const saveDraftOnUnload = (): void => {
  if (store.enableDraftPersistence) {
    store.saveDraft();
  }
};
</script>

<template>
  <TLayout class="app-shell">
    <TopBar
      :mobile="isMobile"
      @open-export="openExportDialog"
      @open-mobile-editor="openMobileEditor"
      @open-guide="openGuide"
    />

    <TContent class="app-main">
      <aside class="app-main__left">
        <TTabs v-model="activeTab" class="app-main__tabs" size="medium">
          <TTabPanel value="meta" :label="t('nav.meta')">
            <div id="guide-meta-panel">
              <MetaForm />
            </div>
          </TTabPanel>
          <TTabPanel value="content" :label="t('nav.content')">
            <div id="guide-content-panel">
              <MarkdownEditor />
            </div>
          </TTabPanel>
          <TTabPanel value="export" :label="t('nav.export')">
            <div class="panel-scroll">
              <TForm label-align="top">
                <TFormItem :label="t('export.paperSize')">
                  <TSelect v-model="store.exportSetting.paperSize" :options="paperOptions" />
                </TFormItem>

                <TFormItem :label="t('export.normalizeHeadings')">
                  <TSwitch v-model="store.exportSetting.normalizeHeadings" />
                </TFormItem>

                <TFormItem :label="t('nav.resource')">
                  <TTag theme="warning" variant="light">
                    {{ t('preview.remoteImageCount', { count: store.remoteImageUrls.length }) }}
                  </TTag>
                </TFormItem>

                <TFormItem>
                  <TButton theme="primary" @click="openExportDialog">
                    <template #icon>
                      <Icon icon="mdi:file-export-outline" />
                    </template>
                    {{ t('app.export') }}
                  </TButton>
                </TFormItem>
              </TForm>
            </div>
          </TTabPanel>
        </TTabs>
      </aside>

      <section class="app-main__right">
        <PreviewPane />
      </section>
    </TContent>

    <footer class="footer-bottom">
      <p class="footer-copy">
        <a
          class="footer-copy-link"
          href="https://www.rubbishjournal.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('app.footerJournalName') }}
        </a>
        {{ t('app.footerJournalSuffix') }}
      </p>
      <p class="footer-copy footer-copy--right">
        {{ t('app.footerCopyPrefix') }}
        <a
          class="footer-copy-link"
          href="https://uminklab.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="footer-umink-u">U</span>{{ t('app.footerLabName') }}
        </a>
        .
      </p>
    </footer>

    <TDrawer v-model:visible="drawerVisible" size="88%" placement="left" :header="t('app.mobileEdit')">
      <TTabs v-model="activeTab" size="medium">
        <TTabPanel value="meta" :label="t('nav.meta')">
          <div id="guide-mobile-meta-panel">
            <MetaForm />
          </div>
        </TTabPanel>
        <TTabPanel value="content" :label="t('nav.content')">
          <div id="guide-mobile-content-panel">
            <MarkdownEditor />
          </div>
        </TTabPanel>
      </TTabs>
    </TDrawer>

    <TDialog
      v-model:visible="mobileRecommendDialogVisible"
      :header="t('app.mobileRecommendTitle')"
      :confirm-btn="t('app.mobileRecommendConfirm')"
      :cancel-btn="null"
      :close-on-overlay-click="false"
      :close-on-esc-keydown="false"
    >
      <p>{{ t('app.mobileRecommendContent') }}</p>
    </TDialog>

    <TGuide
      v-model:current="guideCurrent"
      :steps="guideSteps"
      :prev-button-props="guidePrevButtonProps"
      :next-button-props="guideNextButtonProps"
      :skip-button-props="guideSkipButtonProps"
      :finish-button-props="guideFinishButtonProps"
      :on-finish="finishGuide"
      :on-skip="finishGuide"
    />

    <ExportDialog v-model:visible="exportDialogVisible" />
  </TLayout>
</template>

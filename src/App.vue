<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const activeTab = ref('meta');
const drawerVisible = ref(false);
const exportDialogVisible = ref(false);
const { width } = useWindowSize();

const isMobile = computed(() => width.value < 1100);

const engineOptions = computed(() => [
  { label: t('export.enginePaged'), value: 'paged' },
  { label: t('export.engineCanvas'), value: 'canvas' },
]);

const paperOptions = computed(() => [
  { label: t('export.paperA4'), value: 'A4' },
  { label: t('export.paperLetter'), value: 'Letter' },
]);

const columnOptions = computed(() => [
  { label: t('export.singleColumn'), value: 1 },
  { label: t('export.doubleColumn'), value: 2, disabled: store.hasLongFormulaBlock },
]);

const saveDraftDebounced = debounce(() => {
  if (store.enableDraftPersistence) {
    store.saveDraft();
  }
}, 500);

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

watch(isMobile, (value) => {
  if (!value) {
    drawerVisible.value = false;
  }
});

onMounted(() => {
  if (store.enableDraftPersistence && store.loadDraft()) {
    MessagePlugin.success(t('app.draftLoaded'));
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

const saveDraftOnUnload = (): void => {
  if (store.enableDraftPersistence) {
    store.saveDraft();
  }
};
</script>

<template>
  <TLayout class="app-shell">
    <TopBar :mobile="isMobile" @open-export="openExportDialog" @open-mobile-editor="openMobileEditor" />

    <TContent class="app-main">
      <aside class="app-main__left">
        <TTabs v-model="activeTab" size="medium">
          <TTabPanel value="meta" :label="t('nav.meta')">
            <MetaForm />
          </TTabPanel>
          <TTabPanel value="content" :label="t('nav.content')">
            <MarkdownEditor />
          </TTabPanel>
          <TTabPanel value="export" :label="t('nav.export')">
            <div class="panel-scroll">
              <TForm label-align="top">
                <TFormItem :label="t('export.engine')">
                  <TSelect v-model="store.exportSetting.engine" :options="engineOptions" />
                </TFormItem>

                <TFormItem :label="t('export.paperSize')">
                  <TSelect v-model="store.exportSetting.paperSize" :options="paperOptions" />
                </TFormItem>

                <TFormItem :label="t('export.columns')">
                  <TSelect v-model="store.exportSetting.columns" :options="columnOptions" />
                  <p v-if="store.hasLongFormulaBlock" class="export-lock-tip">
                    {{ t('export.formulaSingleColumnLock') }}
                  </p>
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
          <MetaForm />
        </TTabPanel>
        <TTabPanel value="content" :label="t('nav.content')">
          <MarkdownEditor />
        </TTabPanel>
      </TTabs>
    </TDrawer>

    <ExportDialog v-model:visible="exportDialogVisible" />
  </TLayout>
</template>

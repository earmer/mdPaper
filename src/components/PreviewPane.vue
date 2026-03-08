<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { useTypstCompilerSession } from '@/composables/useTypstCompilerSession';
import { PAPER_HEADER_LEFT, PAPER_HEADER_RIGHT } from '@/constants/journal';
import { buildManuscriptDocument } from '@/services/document/model';
import { renderMarkdown } from '@/services/markdown/md';
import { getPerfSummaryLines, measurePerf } from '@/utils/perfProfiler';
import {
  getTypstTemplateDefinition,
  typstTemplates,
} from '@/services/typst/templates';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import type { PreviewSurface, TypstTemplateId } from '@/types/manuscript';
import {
  formatAffiliationLine,
  formatAuthorAffiliation,
} from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();
const { cancelScheduledCompile, scheduleCompile } = useTypstCompilerSession();
const debugSourceExpanded = ref(true);

const manuscriptDocument = computed(() =>
  measurePerf('preview.document', () => buildManuscriptDocument(store.metadata, store.content)),
);

const renderedBodyHtml = computed(() =>
  measurePerf(
    'preview.renderMarkdown',
    () => renderMarkdown(manuscriptDocument.value.source, {
      normalizeJournalHeadings: store.exportSetting.normalizeHeadings,
      resolveImageSrc: (source) => store.resolveImageAsset(source),
      citationRegistry: manuscriptDocument.value.citations,
    }),
  ),
);

const imageDisplayStyle = computed(() => ({
  '--md-figure-max-width': `${store.imageDisplayOption.maxDisplayPercent}%`,
}));

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

const authorLineHtml = computed(() =>
  formatAuthorAffiliation(
    store.metadata.authors,
    store.metadata.affiliations,
    store.metadata.correspondingAuthorId,
  ).join(store.locale === 'zh-CN' ? '， ' : ', '),
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
    .join(store.locale === 'zh-CN' ? '；' : '; '),
);

const templateOptions = computed(() =>
  typstTemplates.map((template) => ({
    label: t(template.labelKey),
    value: template.id,
  })),
);

const currentTemplate = computed(() =>
  getTypstTemplateDefinition(store.typstTemplateId),
);

const debugVisible = computed({
  get: () => store.typst.debugVisible,
  set: (value: boolean) => store.setTypstDebugVisible(value),
});

const formatTimestamp = (value: string): string => {
  if (value.length === 0) {
    return '—';
  }

  return new Date(value).toLocaleString(store.locale);
};

const compiledAtText = computed(() => {
  if (store.typst.lastSuccessfulCompiledAt.length > 0) {
    return formatTimestamp(store.typst.lastSuccessfulCompiledAt);
  }

  return formatTimestamp(store.typst.lastAttemptedCompiledAt);
});

const lastSuccessfulCompiledAtText = computed(() =>
  formatTimestamp(store.typst.lastSuccessfulCompiledAt),
);

const statusLabel = computed(() => {
  if (store.typst.compileStatus === 'compiling') {
    return t('preview.statusCompiling');
  }
  if (store.typst.compileStatus === 'ready') {
    return t('preview.statusReady');
  }
  if (store.typst.compileStatus === 'error') {
    return t('preview.statusError');
  }
  return t('preview.statusIdle');
});

const isSyncing = computed(() =>
  store.typst.compileStatus === 'compiling'
  || store.typst.compileStatus === 'error'
  || store.typst.artifactStatus === 'stale',
);

const syncStatusLabel = computed(() =>
  isSyncing.value ? t('preview.syncPending') : t('preview.syncReady'),
);

const syncStatusIcon = computed(() =>
  isSyncing.value ? 'mdi:loading' : 'mdi:check-circle-outline',
);

const syncStatusDetail = computed(() => {
  if (store.typst.artifactStatus === 'stale' && store.typst.lastSuccessfulCompiledAt.length > 0) {
    return t('preview.showingLastSuccessful', {
      time: lastSuccessfulCompiledAtText.value,
    });
  }

  if (store.typst.compileStatus === 'ready' && store.typst.lastSuccessfulCompiledAt.length > 0) {
    return t('preview.syncReadyDetail', {
      time: lastSuccessfulCompiledAtText.value,
    });
  }

  return '';
});

const normalizedDiagnostics = computed(() =>
  store.typst.diagnostics.map((item, index) => ({
    id: `${item.source}-${index}`,
    title: item.source === 'typst' ? t('preview.typstDiagnostic') : t('preview.referenceDiagnostic'),
    theme: item.severity === 'error' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default',
    text: [item.message, item.path, item.range]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join(' · '),
    detail: item.detail ?? '',
  })),
);

const runtimeDebugLines = computed(() => [
  `compileStatus=${store.typst.compileStatus}`,
  `artifactStatus=${store.typst.artifactStatus}`,
  `template=${store.typstTemplateId}`,
  `lastAttempt=${store.typst.lastAttemptedCompiledAt || 'n/a'}`,
  `lastSuccess=${store.typst.lastSuccessfulCompiledAt || 'n/a'}`,
  `previewSurface=${store.previewSurface}`,
  ...getPerfSummaryLines(),
  ...store.typst.virtualProjectSummary,
]);

const hasTypstPreview = computed(() => store.typst.svgContent.length > 0);

const linkedImageAlertText = computed(() => {
  const count = store.remoteImageUrls.length;
  if (count === 0) {
    return '';
  }

  return t('preview.linkedImageUnsupported', { count });
});

const showSyncPlaceholder = computed(() =>
  !hasTypstPreview.value && isSyncing.value,
);

const handleTemplateChange = (value: string | number): void => {
  if (value === 'rubbish-default' || value === 'rubbish-compact') {
    store.setTypstTemplate(value as TypstTemplateId);
  }
};

const handleSurfaceChange = (value: string | number | boolean): void => {
  if (value === 'typst' || value === 'html-fallback') {
    store.setPreviewSurface(value as PreviewSurface);
  }
};

const copyGeneratedSource = async (): Promise<void> => {
  if (store.typst.generatedSource.length === 0) {
    return;
  }

  try {
    await navigator.clipboard.writeText(store.typst.generatedSource);
    MessagePlugin.success(t('preview.copySourceSuccess'));
  } catch {
    MessagePlugin.error(t('preview.copySourceFailed'));
  }
};

watch(
  () => [store.metadata, store.content, store.typstTemplateId, store.imageAssets],
  () => {
    scheduleCompile();
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  cancelScheduledCompile();
});
</script>

<template>
  <div class="preview-pane">
    <div class="preview-pane__toolbar">
      <div class="preview-pane__toolbar-main">
        <div class="preview-pane__title-wrap">
          <h3 class="preview-pane__title">{{ t('preview.title') }}</h3>
        </div>
        <p class="preview-pane__subtitle">{{ t(currentTemplate.descriptionKey) }}</p>
      </div>

      <div class="preview-pane__toolbar-actions">
        <TSelect
          :model-value="store.typstTemplateId"
          :options="templateOptions"
          class="preview-pane__template-select"
          size="small"
          @change="handleTemplateChange"
        />
        <TRadioGroup
          :model-value="store.previewSurface"
          variant="default-filled"
          size="small"
          @change="handleSurfaceChange"
        >
          <TRadioButton value="typst">{{ t('preview.modeTypstPreview') }}</TRadioButton>
          <TRadioButton value="html-fallback">{{ t('preview.modeHtmlFallback') }}</TRadioButton>
        </TRadioGroup>
        <TButton size="small" variant="outline" @click="debugVisible = true">
          <template #icon>
            <Icon icon="mdi:bug-outline" />
          </template>
          {{ t('preview.typstDebug') }}
        </TButton>
      </div>
    </div>

    <div class="preview-pane__meta-row">
      <span>{{ t('preview.currentTemplate') }}: {{ t(currentTemplate.labelKey) }}</span>
      <span>{{ t('preview.compiledAt') }}: {{ compiledAtText }}</span>
      <span class="preview-pane__sync-status" :data-state="isSyncing ? 'syncing' : 'ready'">
        <Icon :icon="syncStatusIcon" class="preview-pane__sync-icon" />
        <span>{{ syncStatusLabel }}</span>
      </span>
      <span v-if="syncStatusDetail.length > 0" class="preview-pane__sync-detail">{{ syncStatusDetail }}</span>
    </div>

    <TAlert
      v-if="linkedImageAlertText.length > 0"
      theme="warning"
      :message="linkedImageAlertText"
      class="preview-pane__alert"
    />

    <div v-if="store.previewSurface === 'html-fallback'" class="preview-pane__surface preview-pane__surface--html">
      <div class="preview-pane__fallback-note">
        <TTag theme="warning" variant="light">{{ t('preview.htmlFallbackTag') }}</TTag>
      </div>
      <article
        class="preview-pane__fallback markdown-body"
        :style="imageDisplayStyle"
        :lang="store.locale"
        v-html="renderedBodyHtml"
      />
    </div>

    <div v-else class="preview-pane__surface preview-pane__surface--typst">
      <div v-if="showSyncPlaceholder" class="preview-pane__placeholder">
        <div class="preview-pane__placeholder-status">
          <Icon :icon="syncStatusIcon" class="preview-pane__placeholder-icon" />
          <span>{{ syncStatusLabel }}</span>
        </div>
      </div>
      <div v-else-if="hasTypstPreview" class="typst-preview">
        <div class="typst-preview__canvas" v-html="store.typst.svgContent" />
      </div>
      <TEmpty v-else :description="t('preview.noTypstOutput')" />
    </div>

    <div class="preview-pane__legacy-root" aria-hidden="true">
      <div
        id="journal-print-root"
        class="journal-page"
        :data-paper="store.exportSetting.paperSize"
        :style="[articleStyle, imageDisplayStyle]"
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

    <TDialog
      v-model:visible="debugVisible"
      :header="t('preview.typstDebug')"
      width="980px"
      destroy-on-close
      :confirm-btn="null"
      :cancel-btn="null"
    >
      <div class="typst-debug">
        <div class="typst-debug__header">
          <div class="typst-debug__meta">
            <div><strong>{{ t('preview.debugStatus') }}:</strong> {{ statusLabel }}</div>
            <div><strong>{{ t('preview.currentTemplate') }}:</strong> {{ t(currentTemplate.labelKey) }}</div>
            <div><strong>{{ t('preview.compiledAt') }}:</strong> {{ compiledAtText }}</div>
          </div>
          <TSpace>
            <TButton size="small" variant="outline" @click="store.clearTypstDiagnostics()">
              {{ t('preview.clearErrors') }}
            </TButton>
            <TButton size="small" variant="outline" @click="debugSourceExpanded = !debugSourceExpanded">
              {{ debugSourceExpanded ? t('preview.collapseSource') : t('preview.expandSource') }}
            </TButton>
            <TButton size="small" theme="primary" @click="copyGeneratedSource">
              {{ t('preview.copySource') }}
            </TButton>
          </TSpace>
        </div>

        <div class="typst-debug__diagnostics">
          <h4>{{ t('preview.diagnosticsTitle') }}</h4>
          <pre class="typst-debug__runtime">{{ runtimeDebugLines.join('\n') }}</pre>
          <TEmpty v-if="normalizedDiagnostics.length === 0" :description="t('preview.noDiagnostics')" />
          <div v-else class="typst-debug__diagnostic-list">
            <div
              v-for="item in normalizedDiagnostics"
              :key="item.id"
              class="typst-debug__diagnostic-item"
            >
              <div class="typst-debug__diagnostic-head">
                <TTag :theme="item.theme" variant="light">{{ item.title }}</TTag>
                <span class="typst-debug__diagnostic-text">{{ item.text }}</span>
              </div>
              <pre v-if="item.detail.length > 0" class="typst-debug__diagnostic-detail">{{ item.detail }}</pre>
            </div>
          </div>
        </div>

        <div v-if="debugSourceExpanded" class="typst-debug__source">
          <div class="typst-debug__source-title">{{ t('preview.generatedSource') }}</div>
          <TTextarea
            :value="store.typst.generatedSource"
            readonly
            :autosize="{ minRows: 18, maxRows: 30 }"
          />
        </div>
      </div>
    </TDialog>
  </div>
</template>

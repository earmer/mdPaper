<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { buildManuscriptDocument } from '@/services/document/model';
import { renderMarkdown } from '@/services/markdown/md';
import {
  compileManuscriptTypst,
  prepareTypstManuscript,
} from '@/services/typst/compileManuscript';
import {
  getTypstTemplateDefinition,
  typstTemplates,
} from '@/services/typst/templates';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import type { PreviewSurface, TypstTemplateId } from '@/types/manuscript';

const COMPILE_DEBOUNCE_MS = 450;

const { t } = useI18n();
const store = useManuscriptStore();
const debugSourceExpanded = ref(true);
let compileTimer: number | null = null;
let compileTaskId = 0;

const manuscriptDocument = computed(() =>
  buildManuscriptDocument(store.metadata, store.content),
);

const renderedHtml = computed(() =>
  renderMarkdown(manuscriptDocument.value.source, {
    normalizeJournalHeadings: store.exportSetting.normalizeHeadings,
    resolveImageSrc: (source) => store.resolveImageAsset(source),
    citationRegistry: manuscriptDocument.value.citations,
  }),
);

const imageDisplayStyle = computed(() => ({
  '--md-figure-max-width': `${store.imageOption.maxDisplayPercent}%`,
}));

const templateOptions = computed(() =>
  typstTemplates.map((template) => ({
    label: t(template.labelKey),
    value: template.id,
  })),
);

const currentTemplate = computed(
  () => getTypstTemplateDefinition(store.typstTemplateId),
);

const compiledAtText = computed(() => {
  if (store.typst.compiledAt.length === 0) {
    return '—';
  }

  return new Date(store.typst.compiledAt).toLocaleString(store.locale);
});

const statusLabel = computed(() => {
  if (store.typst.status === 'compiling') {
    return t('preview.statusCompiling');
  }
  if (store.typst.status === 'ready') {
    return t('preview.statusReady');
  }
  if (store.typst.status === 'error') {
    return t('preview.statusError');
  }
  return t('preview.statusIdle');
});

const statusTheme = computed(() => {
  if (store.typst.status === 'compiling') {
    return 'warning';
  }
  if (store.typst.status === 'ready') {
    return 'success';
  }
  if (store.typst.status === 'error') {
    return 'danger';
  }
  return 'default';
});

const errorSummary = computed(() => {
  if (store.typst.errorMessage.length > 0) {
    return store.typst.errorMessage;
  }

  return store.typst.diagnostics.find((item) => item.severity === 'error')?.message ?? '';
});

const normalizedDiagnostics = computed(() =>
  store.typst.diagnostics.map((item, index) => ({
    id: `${item.source}-${index}`,
    title: item.source === 'typst' ? t('preview.typstDiagnostic') : t('preview.referenceDiagnostic'),
    theme: item.severity === 'error' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default',
    text: [item.message, item.path, item.range].filter((part) => typeof part === 'string' && part.length > 0).join(' · '),
    detail: item.detail ?? '',
  })),
);

const runtimeDebugLines = computed(() => [
  `status=${store.typst.status}`,
  `template=${store.typst.templateId}`,
  `compiledAt=${store.typst.compiledAt || 'n/a'}`,
  `previewSurface=${store.previewSurface}`,
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

const triggerCompile = async (): Promise<void> => {
  const taskId = ++compileTaskId;
  const prepared = prepareTypstManuscript(
    store.metadata,
    store.content,
    store.typstTemplateId,
    store.imageOption,
  );
  store.setTypstCompiling(prepared.source);

  try {
    const result = await compileManuscriptTypst(
      store.metadata,
      store.content,
      store.typstTemplateId,
      store.imageAssets,
      store.imageOption,
    );

    if (taskId !== compileTaskId) {
      return;
    }

    store.setTypstArtifacts(result);
  } catch (error) {
    if (taskId !== compileTaskId) {
      return;
    }

    store.setTypstArtifacts({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : t('errors.generic'),
      diagnostics: [{
        severity: 'error',
        message: error instanceof Error ? error.message : t('errors.generic'),
        detail: error instanceof Error && error.stack !== undefined ? error.stack : '',
        source: 'typst',
      }],
      generatedSource: store.typst.generatedSource,
      svgContent: '',
      pdfBlobUrl: '',
      compiledAt: new Date().toISOString(),
      templateId: store.typstTemplateId,
      virtualProjectSummary: [],
    });
  }
};

const scheduleCompile = (): void => {
  if (compileTimer !== null) {
    window.clearTimeout(compileTimer);
  }

  compileTimer = window.setTimeout(() => {
    void triggerCompile();
  }, COMPILE_DEBOUNCE_MS);
};

watch(
  () => [store.metadata, store.content, store.typstTemplateId],
  () => {
    scheduleCompile();
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  if (compileTimer !== null) {
    window.clearTimeout(compileTimer);
  }
});
</script>

<template>
  <div class="preview-pane">
    <div class="preview-pane__toolbar">
      <div class="preview-pane__toolbar-main">
        <div class="preview-pane__title-wrap">
          <h3 class="preview-pane__title">{{ t('preview.title') }}</h3>
          <TTag :theme="statusTheme" variant="light">{{ statusLabel }}</TTag>
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
        <TButton size="small" variant="outline" @click="store.openTypstDebug">
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
    </div>

    <TAlert
      v-if="linkedImageAlertText.length > 0"
      theme="warning"
      :message="linkedImageAlertText"
      class="preview-pane__alert"
    />

    <TAlert
      v-else-if="store.typst.status === 'error' && errorSummary.length > 0"
      theme="warning"
      :message="errorSummary"
      class="preview-pane__alert"
    />

    <div v-if="store.previewSurface === 'html-fallback'" class="preview-pane__surface preview-pane__surface--html">
      <div class="preview-pane__fallback-note">
        <TTag theme="warning" variant="light">{{ t('preview.htmlFallbackTag') }}</TTag>
      </div>
      <article class="preview-pane__fallback markdown-body" :style="imageDisplayStyle" v-html="renderedHtml" />
    </div>

    <div v-else class="preview-pane__surface preview-pane__surface--typst">
      <div v-if="store.typst.status === 'compiling' && !hasTypstPreview" class="preview-pane__placeholder">
        <TLoading size="medium" text="Typst compiling..." />
      </div>
      <div v-else-if="hasTypstPreview" class="typst-preview">
        <div class="typst-preview__canvas" v-html="store.typst.svgContent" />
      </div>
      <TEmpty v-else :description="t('preview.noTypstOutput')" />
    </div>

    <TDialog
      v-model:visible="store.typst.debugVisible"
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
            <TButton size="small" variant="outline" @click="store.clearTypstError">
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
          <TTextarea :value="store.typst.generatedSource" readonly autosize="{ minRows: 18, maxRows: 30 }" />
        </div>
      </div>
    </TDialog>
  </div>
</template>

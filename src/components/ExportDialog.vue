<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { exportLegacyPdf, exportTypstPdf } from '@/services/export/exportPdf';
import { compileManuscriptTypst } from '@/services/typst/compileManuscript';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import { getPrintRoot } from '@/utils/dom';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const store = useManuscriptStore();
const exportingTypst = ref(false);
const exportingLegacy = ref(false);

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const paperOptions = computed(() => [
  { label: t('export.paperA4'), value: 'A4' },
  { label: t('export.paperLetter'), value: 'Letter' },
]);



const ensureFreshTypstArtifact = async (): Promise<string> => {
  const result = await compileManuscriptTypst(
    store.metadata,
    store.content,
    store.typstTemplateId,
    store.imageAssets,
    store.imageOption,
  );
  store.setTypstArtifacts(result);

  if (result.status === 'error' || result.pdfBlobUrl.length === 0) {
    throw new Error(result.errorMessage || t('export.typstExportFailed'));
  }

  return result.pdfBlobUrl;
};

const handleTypstExport = async (): Promise<void> => {
  exportingTypst.value = true;
  MessagePlugin.info(t('export.exportingTypst'));

  try {
    const blobUrl = await ensureFreshTypstArtifact();
    await exportTypstPdf(blobUrl, {
      metadata: store.metadata,
      locale: store.locale,
    });
    MessagePlugin.success(t('export.success'));
    dialogVisible.value = false;
  } catch (error) {
    const reason = error instanceof Error ? error.message : t('errors.generic');
    MessagePlugin.error(t('errors.exportFailed', { reason }));
  } finally {
    exportingTypst.value = false;
  }
};

const handleLegacyExport = async (): Promise<void> => {
  const root = getPrintRoot();
  if (root === null) {
    MessagePlugin.error(t('errors.containerMissing'));
    return;
  }

  exportingLegacy.value = true;
  MessagePlugin.info(t('export.exportingLegacy'));

  try {
    await exportLegacyPdf({
      articleElement: root,
      locale: store.locale,
      metadata: store.metadata,
      exportSetting: store.exportSetting,
    });
    dialogVisible.value = false;
  } catch (error) {
    const reason = error instanceof Error ? error.message : t('errors.generic');
    MessagePlugin.error(t('errors.exportFailed', { reason }));
  } finally {
    exportingLegacy.value = false;
  }
};
</script>

<template>
  <TDialog
    v-model:visible="dialogVisible"
    :header="t('export.dialogTitle')"
    width="760px"
    destroy-on-close
    :close-on-overlay-click="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="export-dialog">
      <TForm label-align="top">
        <TCard size="small" :title="t('export.paperSize')">
          <TSpace direction="vertical" style="width: 100%" size="10px">
            <TSelect v-model="store.exportSetting.paperSize" :options="paperOptions" />
            <TSpace align="center" size="8px">
              <TSwitch v-model="store.exportSetting.normalizeHeadings" />
              <span>{{ t('export.normalizeHeadings') }}</span>
            </TSpace>
          </TSpace>
        </TCard>

        <TCard size="small" :title="t('export.resourceCheck')">
          <TSpace direction="vertical" style="width: 100%" size="8px">
            <div v-if="store.remoteImageUrls.length === 0">
              <TTag theme="success" variant="light">{{ t('export.noRisk') }}</TTag>
            </div>
            <div v-else>
              <TTag theme="warning" variant="light">
                {{ t('preview.remoteImageCount', { count: store.remoteImageUrls.length }) }}
              </TTag>
              <p class="export-dialog__risk-text">{{ t('export.remoteImageUnsupported') }}</p>
            </div>
          </TSpace>
        </TCard>
      </TForm>

      <div class="export-dialog__footer export-dialog__footer--stacked">
        <TSpace>
          <TButton variant="outline" @click="dialogVisible = false">
            {{ t('export.cancel') }}
          </TButton>
          <TButton variant="outline" :loading="exportingLegacy" @click="handleLegacyExport">
            <template v-if="!exportingLegacy" #icon>
              <Icon icon="mdi:file-image-outline" />
            </template>
            {{ t('export.legacyStart') }}
          </TButton>
          <TButton theme="primary" :loading="exportingTypst" @click="handleTypstExport">
            <template v-if="!exportingTypst" #icon>
              <Icon icon="mdi:file-pdf-box" />
            </template>
            {{ t('export.typstStart') }}
          </TButton>
        </TSpace>
      </div>
    </div>
  </TDialog>
</template>

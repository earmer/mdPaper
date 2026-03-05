<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { exportPdf } from '@/services/export/exportPdf';
import { fileToDataUrl, urlToDataUrl } from '@/services/image/imageToBase64';
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
const exporting = ref(false);
const converting = ref(false);

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const paperOptions = computed(() => [
  { label: t('export.paperA4'), value: 'A4' },
  { label: t('export.paperLetter'), value: 'Letter' },
]);

const applyInlineForRemoteImages = async (): Promise<void> => {
  const targets = store.remoteImageUrls;
  if (targets.length === 0) {
    MessagePlugin.warning(t('errors.noRemoteImage'));
    return;
  }

  converting.value = true;

  for (const url of targets) {
    try {
      const dataUrl = await urlToDataUrl(url);
      const assetSource = store.addImageAsset(dataUrl);
      store.content = store.content.split(url).join(assetSource);
    } catch {
      try {
        const response = await fetch(url, { mode: 'no-cors' });
        const blob = await response.blob();
        if (blob.size <= 0) {
          throw new Error('empty blob');
        }
        const dataUrl = await fileToDataUrl(blob);
        const assetSource = store.addImageAsset(dataUrl);
        store.content = store.content.split(url).join(assetSource);
      } catch {
        MessagePlugin.error(t('errors.fetchFailed', { url }));
      }
    }
  }

  converting.value = false;
};

const handleExport = async (): Promise<void> => {
  const root = getPrintRoot();
  if (root === null) {
    MessagePlugin.error(t('errors.containerMissing'));
    return;
  }

  exporting.value = true;
  MessagePlugin.info(t('export.exporting'));

  try {
    await exportPdf({
      articleElement: root,
      locale: store.locale,
      metadata: store.metadata,
      exportSetting: store.exportSetting,
    });
    MessagePlugin.success(t('export.success'));
    dialogVisible.value = false;
  } catch (error) {
    const reason = error instanceof Error ? error.message : t('errors.generic');
    MessagePlugin.error(t('errors.exportFailed', { reason }));
  } finally {
    exporting.value = false;
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
              <p class="export-dialog__risk-text">{{ t('export.remoteImageRisk') }}</p>
              <TButton variant="outline" :loading="converting" @click="applyInlineForRemoteImages">
                <template v-if="!converting" #icon>
                  <Icon icon="mdi:image-sync-outline" />
                </template>
                {{ converting ? t('export.converting') : t('export.convertInline') }}
              </TButton>
            </div>
          </TSpace>
        </TCard>
      </TForm>

      <div class="export-dialog__footer">
        <TSpace>
          <TButton variant="outline" @click="dialogVisible = false">
            {{ t('export.cancel') }}
          </TButton>
          <TButton theme="primary" :loading="exporting" @click="handleExport">
            <template v-if="!exporting" #icon>
              <Icon icon="mdi:file-download-outline" />
            </template>
            {{ t('export.start') }}
          </TButton>
        </TSpace>
      </div>
    </div>
  </TDialog>
</template>

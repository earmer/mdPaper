<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { compressImage } from '@/services/image/compressImage';
import { fileToDataUrl } from '@/services/image/imageToBase64';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import { defaultImageAlt, toInlineImageMarkdown } from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();
const wrapperRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
const processing = ref(false);

interface ToolbarAction {
  key: string;
  label: string;
  icon: string;
  snippet: string;
}

const toolbarActions = computed<ToolbarAction[]>(() => [
  {
    key: 'h2',
    label: t('form.insertHeading'),
    icon: 'mdi:format-header-2',
    snippet: '\n## Heading\n',
  },
  {
    key: 'list',
    label: t('form.insertList'),
    icon: 'mdi:format-list-bulleted',
    snippet: '\n- item 1\n- item 2\n',
  },
  {
    key: 'table',
    label: t('form.insertTable'),
    icon: 'mdi:table',
    snippet: '\n| col1 | col2 |\n| --- | --- |\n| a | b |\n',
  },
  {
    key: 'code',
    label: t('form.insertCode'),
    icon: 'mdi:code-tags',
    snippet: '\n```ts\nconsole.log("hello");\n```\n',
  },
  {
    key: 'inlineMath',
    label: t('form.insertFormulaInline'),
    icon: 'mdi:math-integral-box',
    snippet: '$E=mc^2$',
  },
  {
    key: 'blockMath',
    label: t('form.insertFormulaBlock'),
    icon: 'mdi:function-variant',
    snippet: '\n$$\\n\\int_0^1 x^2 dx = \\frac{1}{3}\\n$$\n',
  },
  {
    key: 'quote',
    label: t('form.insertQuote'),
    icon: 'mdi:format-quote-close',
    snippet: '\n> quote\n',
  },
  {
    key: 'image',
    label: t('form.insertImage'),
    icon: 'mdi:image-outline',
    snippet: '\n![](data:image/png;base64,...)\n',
  },
]);

const getTextarea = (): HTMLTextAreaElement | null => {
  if (wrapperRef.value === null) {
    return null;
  }

  return wrapperRef.value.querySelector('textarea');
};

const insertAtCursor = (snippet: string): void => {
  const textarea = getTextarea();
  if (textarea === null) {
    store.content = `${store.content}${snippet}`;
    return;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = store.content.slice(0, start);
  const after = store.content.slice(end);
  store.content = `${before}${snippet}${after}`;

  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + snippet.length;
    textarea.setSelectionRange(cursor, cursor);
  });
};

const insertTemplate = (snippet: string): void => {
  insertAtCursor(snippet);
};

const buildImageMarkdown = async (file: File): Promise<string> => {
  let targetBlob: Blob = file;

  if (store.imageOption.enableCompression) {
    targetBlob = await compressImage(file, {
      quality: store.imageOption.quality,
      maxWidth: store.imageOption.maxWidth,
    });
  }

  const dataUrl = await fileToDataUrl(targetBlob);
  const alt = defaultImageAlt();
  return `${toInlineImageMarkdown(alt, dataUrl)}\n`;
};

const processFiles = async (files: File[]): Promise<void> => {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));

  if (imageFiles.length === 0) {
    MessagePlugin.error(t('errors.invalidImage'));
    return;
  }

  processing.value = true;

  for (const file of imageFiles) {
    try {
      const markdown = await buildImageMarkdown(file);
      insertAtCursor(markdown);
      MessagePlugin.success(t('app.imageInserted', { name: file.name }));
    } catch {
      MessagePlugin.error(t('app.imageInsertFailed', { name: file.name }));
    }
  }

  processing.value = false;
};

const onDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  dragging.value = false;

  const dropped = event.dataTransfer?.files;
  if (dropped === undefined || dropped.length === 0) {
    return;
  }

  await processFiles(Array.from(dropped));
};

const onDragOver = (event: DragEvent): void => {
  event.preventDefault();
  dragging.value = true;
};

const onDragLeave = (event: DragEvent): void => {
  event.preventDefault();
  dragging.value = false;
};
</script>

<template>
  <div
    ref="wrapperRef"
    class="panel-scroll markdown-editor"
    :class="{ 'is-dragging': dragging }"
    @drop="onDrop"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
  >
    <TAlert theme="info" :message="t('form.dropHint')" close />

    <div class="markdown-editor__toolbar">
      <div class="markdown-editor__toolbar-title">{{ t('form.editorToolbar') }}</div>
      <TSpace wrap>
        <TButton
          v-for="action in toolbarActions"
          :key="action.key"
          variant="outline"
          size="small"
          @click="insertTemplate(action.snippet)"
        >
          <template #icon>
            <Icon :icon="action.icon" />
          </template>
          {{ action.label }}
        </TButton>
      </TSpace>
    </div>

    <TForm label-align="top">
      <TFormItem :label="t('form.contentEditor')">
        <TTextarea
          v-model="store.content"
          class="markdown-editor__textarea"
          :placeholder="t('form.contentPlaceholder')"
          :autosize="{ minRows: 22, maxRows: 40 }"
        />
      </TFormItem>

      <TFormItem :label="t('form.imageCompression')">
        <TSpace direction="vertical" style="width: 100%" size="10px">
          <TSpace align="center">
            <TSwitch v-model="store.imageOption.enableCompression" />
            <span>{{ t('form.imageCompressionEnable') }}</span>
          </TSpace>

          <TInputNumber
            v-model="store.imageOption.quality"
            :label="t('form.imageQuality')"
            :min="0.2"
            :max="1"
            :step="0.01"
            :decimal-places="2"
          />

          <TInputNumber
            v-model="store.imageOption.maxWidth"
            :label="t('form.imageMaxWidth')"
            :min="320"
            :max="5000"
            :step="10"
          />
        </TSpace>
      </TFormItem>
    </TForm>

    <div v-if="processing" class="markdown-editor__processing">
      {{ t('app.processing') }}
    </div>
  </div>
</template>

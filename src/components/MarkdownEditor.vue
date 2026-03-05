<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { compressImage } from '@/services/image/compressImage';
import { fileToDataUrl, urlToDataUrl } from '@/services/image/imageToBase64';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import { defaultImageAlt, toInlineImageMarkdown } from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();
const wrapperRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
const processing = ref(false);
const dragDepth = ref(0);

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

const isLikelyImageFile = (file: File): boolean => {
  if (file.type.startsWith('image/')) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)$/i.test(file.name);
};

const processFiles = async (files: File[]): Promise<void> => {
  const imageFiles = files.filter((file) => isLikelyImageFile(file));

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

const extractDroppedFiles = (event: DragEvent): File[] => {
  const transfer = event.dataTransfer;
  if (transfer === null) {
    return [];
  }

  const files = Array.from(transfer.files);
  if (files.length > 0) {
    return files;
  }

  if (transfer.items === undefined) {
    return [];
  }

  const itemFiles = Array.from(transfer.items)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return itemFiles;
};

const parseUriList = (raw: string): string[] =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

const extractImageUrl = (event: DragEvent): string | null => {
  const transfer = event.dataTransfer;
  if (transfer === null) {
    return null;
  }

  const uriList = parseUriList(transfer.getData('text/uri-list'));
  const plainText = transfer.getData('text/plain').trim();

  const candidates = [...uriList];
  if (plainText.length > 0) {
    candidates.push(plainText);
  }

  for (const value of candidates) {
    if (value.startsWith('data:image/')) {
      return value;
    }

    if (/^https?:\/\/\S+$/i.test(value)) {
      return value;
    }
  }

  return null;
};

const processImageUrl = async (url: string): Promise<boolean> => {
  const alt = defaultImageAlt();

  if (url.startsWith('data:image/')) {
    insertAtCursor(`${toInlineImageMarkdown(alt, url)}\n`);
    MessagePlugin.success(t('app.imageInserted', { name: 'data-url' }));
    return true;
  }

  try {
    const dataUrl = await urlToDataUrl(url);
    insertAtCursor(`${toInlineImageMarkdown(alt, dataUrl)}\n`);
    MessagePlugin.success(t('app.imageInserted', { name: url }));
    return true;
  } catch {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      const blob = await response.blob();
      if (blob.size <= 0) {
        throw new Error('empty blob');
      }
      const dataUrl = await fileToDataUrl(blob);
      insertAtCursor(`${toInlineImageMarkdown(alt, dataUrl)}\n`);
      MessagePlugin.success(t('app.imageInserted', { name: url }));
      return true;
    } catch {
      MessagePlugin.error(t('errors.fetchFailed', { url }));
      return false;
    }
  }
};

const shouldHandleDrag = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types;
  if (types === undefined) {
    return false;
  }

  return (
    types.includes('Files') ||
    types.includes('text/uri-list') ||
    types.includes('text/plain')
  );
};

const onDragEnter = (event: DragEvent): void => {
  if (!shouldHandleDrag(event)) {
    return;
  }

  event.preventDefault();
  dragDepth.value += 1;
  dragging.value = true;
};

const onDrop = async (event: DragEvent): Promise<void> => {
  if (!shouldHandleDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  dragDepth.value = 0;
  dragging.value = false;

  const droppedFiles = extractDroppedFiles(event);
  if (droppedFiles.length > 0) {
    await processFiles(droppedFiles);
    return;
  }

  const imageUrl = extractImageUrl(event);
  if (imageUrl !== null) {
    void (await processImageUrl(imageUrl));
    return;
  }

  MessagePlugin.error(t('errors.invalidImage'));
};

const onDragOver = (event: DragEvent): void => {
  if (!shouldHandleDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer !== null) {
    event.dataTransfer.dropEffect = 'copy';
  }
  dragging.value = true;
};

const onDragLeave = (event: DragEvent): void => {
  if (!shouldHandleDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) {
    dragging.value = false;
  }
};
</script>

<template>
  <div
    ref="wrapperRef"
    class="panel-scroll markdown-editor"
    :class="{ 'is-dragging': dragging }"
    @dragenter.capture.prevent="onDragEnter"
    @drop.capture.prevent="onDrop"
    @dragover.capture.prevent="onDragOver"
    @dragleave.capture.prevent="onDragLeave"
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

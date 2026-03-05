<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { compressImage } from '@/services/image/compressImage';
import { fileToDataUrl, urlToDataUrl } from '@/services/image/imageToBase64';
import { renderMarkdown } from '@/services/markdown/md';
import { useManuscriptStore } from '@/store/useManuscriptStore';
import { defaultImageAlt, toInlineImageMarkdown } from '@/utils/format';

const { t } = useI18n();
const store = useManuscriptStore();
const wrapperRef = ref<HTMLElement | null>(null);
const fullscreenEditorRef = ref<HTMLElement | null>(null);
const lastFocusedTextarea = ref<HTMLTextAreaElement | null>(null);
const fullscreenVisible = ref(false);
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
    key: 'pageBreak',
    label: t('form.insertPageBreak'),
    icon: 'mdi:page-next-outline',
    snippet: '\n\n----\n\n',
  },
  {
    key: 'image',
    label: t('form.insertImage'),
    icon: 'mdi:image-outline',
    snippet: '\n![](https://example.com/figure.png)\n',
  },
]);

const renderedFullscreenHtml = computed(() =>
  renderMarkdown(store.content, {
    normalizeJournalHeadings: false,
    resolveImageSrc: (source) => store.resolveImageAsset(source),
  }),
);

const getTextareaFromRoot = (root: HTMLElement | null): HTMLTextAreaElement | null =>
  root?.querySelector('textarea') ?? null;

const resolveActiveTextarea = (): HTMLTextAreaElement | null => {
  if (fullscreenVisible.value) {
    return getTextareaFromRoot(fullscreenEditorRef.value)
      ?? lastFocusedTextarea.value
      ?? getTextareaFromRoot(wrapperRef.value);
  }

  return lastFocusedTextarea.value ?? getTextareaFromRoot(wrapperRef.value);
};

const insertAtCursor = (snippet: string): void => {
  const textarea = resolveActiveTextarea();
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
    lastFocusedTextarea.value = textarea;
  });
};

const insertTemplate = (snippet: string): void => {
  insertAtCursor(snippet);
};

const markFocusedTextarea = (event: FocusEvent): void => {
  if (!(event.target instanceof HTMLTextAreaElement)) {
    return;
  }

  lastFocusedTextarea.value = event.target;
};

const openFullscreenEditor = async (): Promise<void> => {
  fullscreenVisible.value = true;
  await nextTick();
  const textarea = getTextareaFromRoot(fullscreenEditorRef.value);
  textarea?.focus();
  if (textarea !== null) {
    lastFocusedTextarea.value = textarea;
  }
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
  const assetSource = store.addImageAsset(dataUrl);
  return `${toInlineImageMarkdown(alt, assetSource)}\n`;
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

const extractImageUrlFromHtml = (rawHtml: string): string | null => {
  const html = rawHtml.trim();
  if (html.length === 0 || typeof DOMParser === 'undefined') {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const image = doc.querySelector('img[src]');
  const source = image?.getAttribute('src')?.trim() ?? '';
  if (source.startsWith('data:image/') || /^https?:\/\/\S+$/i.test(source)) {
    return source;
  }

  return null;
};

const extractImageUrlFromTransfer = (transfer: DataTransfer | null): string | null => {
  if (transfer === null) {
    return null;
  }

  const uriList = parseUriList(transfer.getData('text/uri-list'));
  const plainText = transfer.getData('text/plain').trim();
  const htmlText = transfer.getData('text/html');
  const htmlImage = extractImageUrlFromHtml(htmlText);

  const candidates = [...uriList];
  if (plainText.length > 0) {
    candidates.push(plainText);
  }
  if (htmlImage !== null) {
    candidates.push(htmlImage);
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

const extractImageUrl = (event: DragEvent): string | null =>
  extractImageUrlFromTransfer(event.dataTransfer);

const extractClipboardFiles = (event: ClipboardEvent): File[] => {
  const transfer = event.clipboardData;
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

  return Array.from(transfer.items)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
};

const processImageUrl = async (url: string): Promise<boolean> => {
  const alt = defaultImageAlt();

  if (url.startsWith('data:image/')) {
    const assetSource = store.addImageAsset(url);
    insertAtCursor(`${toInlineImageMarkdown(alt, assetSource)}\n`);
    MessagePlugin.success(t('app.imageInserted', { name: 'data-url' }));
    return true;
  }

  try {
    const dataUrl = await urlToDataUrl(url);
    const assetSource = store.addImageAsset(dataUrl);
    insertAtCursor(`${toInlineImageMarkdown(alt, assetSource)}\n`);
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
      const assetSource = store.addImageAsset(dataUrl);
      insertAtCursor(`${toInlineImageMarkdown(alt, assetSource)}\n`);
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

const onPaste = async (event: ClipboardEvent): Promise<void> => {
  const pastedFiles = extractClipboardFiles(event);
  if (pastedFiles.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    await processFiles(pastedFiles);
    return;
  }

  const imageUrl = extractImageUrlFromTransfer(event.clipboardData);
  if (imageUrl === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void (await processImageUrl(imageUrl));
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

    <TForm label-align="top">
      <TFormItem class="markdown-editor__content-item">
        <div class="markdown-editor__content-head">
          <span class="markdown-editor__content-title">{{ t('form.contentEditor') }}</span>
          <TButton size="small" variant="outline" @click="openFullscreenEditor">
            <template #icon>
              <Icon icon="mdi:fullscreen" />
            </template>
            {{ t('form.fullscreenEditor') }}
          </TButton>
        </div>

        <div class="markdown-editor__toolbar">
          <div class="markdown-editor__toolbar-title">{{ t('form.editorToolbar') }}</div>
          <div class="markdown-editor__toolbar-actions">
            <TButton
              v-for="action in toolbarActions"
              :key="action.key"
              class="markdown-editor__toolbar-button"
              variant="outline"
              size="small"
              :title="action.label"
              :aria-label="action.label"
              @click="insertTemplate(action.snippet)"
            >
              <template #icon>
                <Icon :icon="action.icon" />
              </template>
            </TButton>
          </div>
        </div>

        <TTextarea
          v-model="store.content"
          class="markdown-editor__textarea"
          :placeholder="t('form.contentPlaceholder')"
          :autosize="{ minRows: 22, maxRows: 40 }"
          @focus="markFocusedTextarea"
          @paste="onPaste"
        />
      </TFormItem>

      <TFormItem :label="t('form.imageCompression')">
        <TSpace
          direction="vertical"
          style="width: 100%"
          size="10px"
          class="markdown-editor__image-options"
        >
          <TSpace align="center">
            <TSwitch v-model="store.imageOption.enableCompression" />
            <span>{{ t('form.imageCompressionEnable') }}</span>
          </TSpace>

          <div class="markdown-editor__image-option-row">
            <span class="markdown-editor__image-option-label">{{ t('form.imageQuality') }}</span>
            <TInputNumber
              v-model="store.imageOption.quality"
              class="markdown-editor__image-option-input"
              :min="0.2"
              :max="1"
              :step="0.01"
              :decimal-places="2"
            />
          </div>

          <div class="markdown-editor__image-option-row">
            <span class="markdown-editor__image-option-label">{{ t('form.imageMaxWidth') }}</span>
            <TInputNumber
              v-model="store.imageOption.maxWidth"
              class="markdown-editor__image-option-input"
              :min="320"
              :max="5000"
              :step="10"
            />
          </div>
        </TSpace>
      </TFormItem>
    </TForm>

    <div v-if="processing" class="markdown-editor__processing">
      {{ t('app.processing') }}
    </div>
  </div>

  <TDialog
    v-model:visible="fullscreenVisible"
    :header="t('form.fullscreenEditorTitle')"
    width="94vw"
    top="2vh"
    :confirm-btn="null"
    :cancel-btn="null"
    destroy-on-close
  >
    <div class="markdown-editor-fullscreen">
      <section ref="fullscreenEditorRef" class="markdown-editor-fullscreen__pane">
        <div class="markdown-editor-fullscreen__pane-title">
          {{ t('form.contentEditor') }}
        </div>
        <div class="markdown-editor__toolbar markdown-editor__toolbar--fullscreen">
          <div class="markdown-editor__toolbar-title">{{ t('form.editorToolbar') }}</div>
          <div class="markdown-editor__toolbar-actions">
            <TButton
              v-for="action in toolbarActions"
              :key="`fullscreen-${action.key}`"
              class="markdown-editor__toolbar-button"
              variant="outline"
              size="small"
              :title="action.label"
              :aria-label="action.label"
              @click="insertTemplate(action.snippet)"
            >
              <template #icon>
                <Icon :icon="action.icon" />
              </template>
            </TButton>
          </div>
        </div>
        <TTextarea
          v-model="store.content"
          class="markdown-editor__textarea markdown-editor-fullscreen__textarea"
          :placeholder="t('form.contentPlaceholder')"
          :autosize="false"
          @focus="markFocusedTextarea"
          @paste="onPaste"
        />
      </section>

      <section class="markdown-editor-fullscreen__pane markdown-editor-fullscreen__preview-pane">
        <div class="markdown-editor-fullscreen__pane-title">
          {{ t('form.liveMarkdownPreview') }}
        </div>
        <div
          class="markdown-editor-fullscreen__preview markdown-body"
          :lang="store.locale"
          v-html="renderedFullscreenHtml"
        />
      </section>
    </div>
  </TDialog>
</template>

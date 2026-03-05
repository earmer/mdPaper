<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { useManuscriptStore } from '@/store/useManuscriptStore';

const props = defineProps<{
  mobile: boolean;
}>();

const emit = defineEmits<{
  openExport: [];
  openMobileEditor: [];
}>();

const { t, locale } = useI18n();
const store = useManuscriptStore();

const localeOptions = computed(() => [
  { label: t('app.langZh'), value: 'zh-CN' },
  { label: t('app.langEn'), value: 'en-US' },
]);

const themeChecked = computed({
  get: () => store.theme === 'dark',
  set: (value: boolean) => {
    store.setTheme(value ? 'dark' : 'light');
  },
});

const onLocaleChange = (value: string): void => {
  store.setLocale(value as 'zh-CN' | 'en-US');
  locale.value = value;
};

const saveDraft = (): void => {
  store.saveDraft();
  MessagePlugin.success(t('app.draftSaved'));
};

const clearAllInputs = (): void => {
  DialogPlugin.confirm({
    header: t('app.clearAllTitle'),
    body: t('app.clearAllContent'),
    confirmBtn: t('app.confirm'),
    cancelBtn: t('app.cancel'),
    onConfirm: () => {
      store.clearAllInputs();
      MessagePlugin.success(t('app.allCleared'));
    },
  });
};
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__brand">
      <div>
        <div class="top-bar__title-row">
          <div class="top-bar__title">{{ t('app.title') }}</div>
          <a
            class="top-bar__github-link"
            href="https://github.com/UMInk-Lab/mdPaper"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open mdPaper GitHub repository"
          >
            <Icon icon="mdi:github" />
          </a>
        </div>
        <p class="top-bar__subtitle">{{ t('app.subtitle') }}</p>
      </div>
    </div>

    <TSpace size="small" align="center" class="top-bar__actions">
      <TTooltip :content="t('app.language')">
        <TSelect
          :value="store.locale"
          :options="localeOptions"
          size="small"
          style="width: 130px"
          @change="onLocaleChange"
        />
      </TTooltip>

      <TTooltip :content="t('app.theme')">
        <TSwitch
          v-model="themeChecked"
          size="small"
          :label="[t('app.light'), t('app.dark')]"
        />
      </TTooltip>

      <TTooltip :content="t('app.saveDraft')">
        <TButton variant="outline" size="small" @click="saveDraft">
          <template #icon>
            <Icon icon="mdi:content-save-outline" />
          </template>
        </TButton>
      </TTooltip>

      <TTooltip :content="t('app.clearAll')">
        <TButton variant="outline" size="small" @click="clearAllInputs">
          <template #icon>
            <Icon icon="mdi:trash-can-outline" />
          </template>
          {{ t('app.clearAll') }}
        </TButton>
      </TTooltip>

      <TButton theme="primary" size="small" @click="emit('openExport')">
        <template #icon>
          <Icon icon="mdi:file-export-outline" />
        </template>
        {{ t('app.export') }}
      </TButton>

      <TButton
        v-if="props.mobile"
        variant="outline"
        size="small"
        @click="emit('openMobileEditor')"
      >
        <template #icon>
          <Icon icon="mdi:tune-variant" />
        </template>
        {{ t('app.mobileEdit') }}
      </TButton>
    </TSpace>
  </header>
</template>

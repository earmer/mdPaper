import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/en-US';
import zhCN from '@/i18n/zh-CN';

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export type LocaleType = keyof typeof messages;

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages,
});

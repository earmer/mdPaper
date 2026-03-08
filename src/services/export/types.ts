import type {
  ExportSetting,
  LocaleType,
  ManuscriptMeta,
} from '@/types/manuscript';

export interface BrowserPrintPayload {
  metadata: ManuscriptMeta;
  exportSetting: ExportSetting;
  locale: LocaleType;
  articleElement: HTMLElement;
}

export interface ExportFilePayload {
  metadata: ManuscriptMeta;
  locale: LocaleType;
}

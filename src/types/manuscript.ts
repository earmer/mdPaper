export type ThemeMode = 'light' | 'dark';
export type PaperSize = 'A4' | 'Letter';
export type LocaleType = 'zh-CN' | 'en-US';

export interface Affiliation {
  id: string;
  org: string;
  city: string;
  country: string;
}

export interface Author {
  id: string;
  name: string;
  nameEn: string;
  affiliationIds: string[];
  email: string;
}

export interface FundingItem {
  id: string;
  text: string;
}

export interface ManuscriptMeta {
  title: string;
  subtitle: string;
  abstract: string;
  keywords: string[];
  authors: Author[];
  affiliations: Affiliation[];
  fundings: FundingItem[];
}

export interface MarginSetting {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HeaderFooterSetting {
  showHeader: boolean;
  showFooter: boolean;
  showJournalName: boolean;
  showCopyright: boolean;
  showPageNumber: boolean;
}

export interface ImageOption {
  enableCompression: boolean;
  quality: number;
  maxWidth: number;
}

export type ImageAssetMap = Record<string, string>;

export interface ExportSetting {
  paperSize: PaperSize;
  normalizeHeadings: boolean;
  fontSize: number;
  lineHeight: number;
  paragraphIndent: number;
  margins: MarginSetting;
  headerFooter: HeaderFooterSetting;
}

export interface ManuscriptDraft {
  locale: string;
  theme: ThemeMode;
  enableDraftPersistence: boolean;
  metadata: ManuscriptMeta;
  content: string;
  exportSetting: ExportSetting;
  imageOption: ImageOption;
  imageAssets: ImageAssetMap;
}

export interface ExportPayload {
  metadata: ManuscriptMeta;
  exportSetting: ExportSetting;
  locale: string;
  articleElement: HTMLElement;
}

export type ThemeMode = 'light' | 'dark';
export type PaperSize = 'A4' | 'Letter';
export type LocaleType = 'zh-CN' | 'en-US';
export type PreviewSurface = 'typst' | 'html-fallback';
export type TypstTemplateId = 'rubbish-default' | 'rubbish-compact';
export type TypstCompileStatus = 'idle' | 'compiling' | 'ready' | 'error';

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
  correspondingAuthorId: string;
  correspondingAuthorContact: string;
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
  maxDisplayPercent: number;
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

export interface TypstDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  range?: string;
  package?: string;
  detail?: string;
  source: 'typst' | 'citation';
}

export interface CitationEntry {
  key: string;
  order: number;
  content: string;
}

export interface TypstRuntimeState {
  status: TypstCompileStatus;
  errorMessage: string;
  diagnostics: TypstDiagnostic[];
  generatedSource: string;
  svgContent: string;
  pdfBlobUrl: string;
  compiledAt: string;
  templateId: TypstTemplateId;
  virtualProjectSummary: string[];
  debugVisible: boolean;
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
  previewSurface?: PreviewSurface;
  typstTemplateId?: TypstTemplateId;
}

export interface ExportPayload {
  metadata: ManuscriptMeta;
  exportSetting: ExportSetting;
  locale: string;
  articleElement: HTMLElement;
}

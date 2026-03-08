export type ThemeMode = 'light' | 'dark';
export type PaperSize = 'A4' | 'Letter';
export type LocaleType = 'zh-CN' | 'en-US';
export type PreviewSurface = 'typst' | 'html-fallback';
export type TypstTemplateId = 'rubbish-default' | 'rubbish-compact';
export type TypstCompileStatus = 'idle' | 'compiling' | 'ready' | 'error';
export type TypstArtifactStatus = 'empty' | 'fresh' | 'stale';

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

export interface ImageAssetProcessOption {
  enableCompression: boolean;
  quality: number;
  maxWidth: number;
}

export interface ImageDisplayOption {
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
  compileStatus: TypstCompileStatus;
  artifactStatus: TypstArtifactStatus;
  errorMessage: string;
  diagnostics: TypstDiagnostic[];
  generatedSource: string;
  svgContent: string;
  pdfBlobUrl: string;
  lastAttemptedCompiledAt: string;
  lastSuccessfulCompiledAt: string;
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
  imageProcessOption: ImageAssetProcessOption;
  imageDisplayOption: ImageDisplayOption;
  imageAssets: ImageAssetMap;
  previewSurface?: PreviewSurface;
  typstTemplateId?: TypstTemplateId;
}

import { defineStore } from 'pinia';
import { sampleManuscript } from '@/data/sampleManuscript';
import type {
  Affiliation,
  Author,
  ExportSetting,
  FundingItem,
  ImageAssetMap,
  ImageOption,
  LocaleType,
  ManuscriptMeta,
  PreviewSurface,
  ThemeMode,
  TypstDiagnostic,
  TypstRuntimeState,
  TypstTemplateId,
} from '@/types/manuscript';
import { parseRemoteImageUrls } from '@/utils/format';
import {
  createImageAssetId,
  normalizeImageAssetMap,
  parseImageAssetId,
  toImageAssetSrc,
} from '@/utils/imageAsset';
import { revokePdfBlobUrl } from '@/services/typst/runtime';

const DRAFT_KEY = 'mdpaper-draft-v1';
const LEGACY_DRAFT_KEYS = ['journal-pdf-draft-v1'];
const LOCKED_EXPORT_LAYOUT = {
  fontSize: 10.8,
  lineHeight: 1.42,
  paragraphIndent: 2,
  normalizeHeadings: true,
  margins: {
    top: 25,
    right: 25,
    bottom: 25,
    left: 25,
  },
} as const;

interface StoreState {
  locale: LocaleType;
  theme: ThemeMode;
  enableDraftPersistence: boolean;
  metadata: ManuscriptMeta;
  content: string;
  exportSetting: ExportSetting;
  imageOption: ImageOption;
  imageAssets: ImageAssetMap;
  previewSurface: PreviewSurface;
  typstTemplateId: TypstTemplateId;
  editorCursorLine: number;
  typst: TypstRuntimeState;
}

const createEmptyTypstState = (templateId: TypstTemplateId): TypstRuntimeState => ({
  status: 'idle',
  errorMessage: '',
  diagnostics: [],
  generatedSource: '',
  svgContent: '',
  pdfBlobUrl: '',
  compiledAt: '',
  templateId,
  virtualProjectSummary: [],
  debugVisible: false,
});

const applyLockedExportLayout = (setting: ExportSetting): void => {
  setting.fontSize = LOCKED_EXPORT_LAYOUT.fontSize;
  setting.lineHeight = LOCKED_EXPORT_LAYOUT.lineHeight;
  setting.paragraphIndent = LOCKED_EXPORT_LAYOUT.paragraphIndent;
  setting.normalizeHeadings = LOCKED_EXPORT_LAYOUT.normalizeHeadings;
  setting.margins = { ...LOCKED_EXPORT_LAYOUT.margins };
};

const randomId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createEmptyMetadata = (): ManuscriptMeta => ({
  title: '',
  subtitle: '',
  abstract: '',
  keywords: [],
  authors: [
    {
      id: randomId('author'),
      name: '',
      nameEn: '',
      affiliationIds: [],
      email: '',
    },
  ],
  affiliations: [
    {
      id: randomId('affiliation'),
      org: '',
      city: '',
      country: '',
    },
  ],
  correspondingAuthorId: '',
  correspondingAuthorContact: '',
  fundings: [],
});

const normalizeMetadata = (metadata: Partial<ManuscriptMeta> | undefined): ManuscriptMeta => {
  const fallback = createEmptyMetadata();
  if (metadata === undefined) {
    return fallback;
  }

  const authors = Array.isArray(metadata.authors) ? metadata.authors : fallback.authors;
  const affiliations = Array.isArray(metadata.affiliations)
    ? metadata.affiliations
    : fallback.affiliations;
  const correspondingAuthorIdRaw =
    typeof metadata.correspondingAuthorId === 'string' ? metadata.correspondingAuthorId : '';
  const hasCorrespondingAuthor = authors.some((author) => author.id === correspondingAuthorIdRaw);

  return {
    title: metadata.title ?? '',
    subtitle: metadata.subtitle ?? '',
    abstract: metadata.abstract ?? '',
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords : [],
    authors,
    affiliations,
    correspondingAuthorId: hasCorrespondingAuthor ? correspondingAuthorIdRaw : '',
    correspondingAuthorContact:
      typeof metadata.correspondingAuthorContact === 'string'
        ? metadata.correspondingAuthorContact
        : '',
    fundings: Array.isArray(metadata.fundings) ? metadata.fundings : [],
  };
};

const cloneSample = (): StoreState => {
  const data = structuredClone(sampleManuscript);
  applyLockedExportLayout(data.exportSetting);
  const typstTemplateId = data.typstTemplateId ?? 'rubbish-default';

  return {
    locale: data.locale as LocaleType,
    theme: data.theme,
    enableDraftPersistence: data.enableDraftPersistence,
    metadata: data.metadata,
    content: data.content,
    exportSetting: data.exportSetting,
    imageOption: data.imageOption,
    imageAssets: normalizeImageAssetMap(data.imageAssets),
    previewSurface: data.previewSurface ?? 'typst',
    typstTemplateId,
    editorCursorLine: 1,
    typst: createEmptyTypstState(typstTemplateId),
  };
};

const releaseTypstState = (state: TypstRuntimeState): void => {
  revokePdfBlobUrl(state.pdfBlobUrl);
};

export const useManuscriptStore = defineStore('manuscript', {
  state: (): StoreState => cloneSample(),
  getters: {
    remoteImageUrls: (state): string[] => parseRemoteImageUrls(state.content),
    hasRemoteImages(): boolean {
      return this.remoteImageUrls.length > 0;
    },
  },
  actions: {
    setLocale(locale: LocaleType): void {
      this.locale = locale;
    },
    setTheme(theme: ThemeMode): void {
      this.theme = theme;
    },
    resetToSample(): void {
      releaseTypstState(this.typst);
      const data = cloneSample();
      this.locale = data.locale;
      this.theme = data.theme;
      this.enableDraftPersistence = data.enableDraftPersistence;
      this.metadata = data.metadata;
      this.content = data.content;
      this.exportSetting = data.exportSetting;
      this.imageOption = {
        ...data.imageOption,
        maxDisplayPercent: data.imageOption.maxDisplayPercent ?? 100,
      };
      this.imageAssets = data.imageAssets;
      this.previewSurface = data.previewSurface;
      this.typstTemplateId = data.typstTemplateId;
      this.editorCursorLine = 1;
      this.typst = data.typst;
    },
    setPreviewSurface(surface: PreviewSurface): void {
      this.previewSurface = surface;
    },
    setTypstTemplate(templateId: TypstTemplateId): void {
      this.typstTemplateId = templateId;
      this.typst.templateId = templateId;
    },
    setEditorCursorLine(line: number): void {
      if (!Number.isFinite(line)) {
        this.editorCursorLine = 1;
        return;
      }

      this.editorCursorLine = Math.max(1, Math.floor(line));
    },
    openTypstDebug(): void {
      this.typst.debugVisible = true;
    },
    closeTypstDebug(): void {
      this.typst.debugVisible = false;
    },
    clearTypstError(): void {
      this.typst.errorMessage = '';
      this.typst.diagnostics = this.typst.diagnostics.filter((item) => item.source !== 'typst');
      if (this.typst.status === 'error') {
        this.typst.status = this.typst.svgContent.length > 0 ? 'ready' : 'idle';
      }
    },
    setTypstCompiling(source: string): void {
      this.typst.status = 'compiling';
      this.typst.generatedSource = source;
      this.typst.errorMessage = '';
      this.typst.diagnostics = [];
      this.typst.templateId = this.typstTemplateId;
    },
    setTypstArtifacts(payload: {
      status: TypstRuntimeState['status'];
      errorMessage: string;
      diagnostics: TypstDiagnostic[];
      generatedSource: string;
      svgContent: string;
      pdfBlobUrl: string;
      compiledAt: string;
      templateId: TypstTemplateId;
      virtualProjectSummary: string[];
    }): void {
      const shouldReplacePdf = payload.pdfBlobUrl.length > 0 && this.typst.pdfBlobUrl !== payload.pdfBlobUrl;
      if (shouldReplacePdf) {
        revokePdfBlobUrl(this.typst.pdfBlobUrl);
      }

      this.typst.status = payload.status;
      this.typst.errorMessage = payload.errorMessage;
      this.typst.diagnostics = payload.diagnostics;
      this.typst.generatedSource = payload.generatedSource;
      if (payload.svgContent.length > 0) {
        this.typst.svgContent = payload.svgContent;
      }
      if (payload.pdfBlobUrl.length > 0) {
        this.typst.pdfBlobUrl = payload.pdfBlobUrl;
      }
      this.typst.compiledAt = payload.compiledAt;
      this.typst.templateId = payload.templateId;
      this.typst.virtualProjectSummary = payload.virtualProjectSummary;
    },
    resetTypstState(): void {
      releaseTypstState(this.typst);
      this.typst = createEmptyTypstState(this.typstTemplateId);
    },
    addAuthor(): void {
      const firstAffiliation = this.metadata.affiliations[0]?.id;
      const author: Author = {
        id: randomId('author'),
        name: '',
        nameEn: '',
        affiliationIds: firstAffiliation !== undefined ? [firstAffiliation] : [],
        email: '',
      };
      this.metadata.authors.push(author);
    },
    removeAuthor(authorId: string): void {
      this.metadata.authors = this.metadata.authors.filter((item) => item.id !== authorId);
      if (this.metadata.correspondingAuthorId === authorId) {
        this.metadata.correspondingAuthorId = '';
      }
    },
    addAffiliation(): void {
      const affiliation: Affiliation = {
        id: randomId('affiliation'),
        org: '',
        city: '',
        country: '',
      };
      this.metadata.affiliations.push(affiliation);
    },
    removeAffiliation(affiliationId: string): void {
      this.metadata.affiliations = this.metadata.affiliations.filter(
        (item) => item.id !== affiliationId,
      );
      this.metadata.authors = this.metadata.authors.map((author) => ({
        ...author,
        affiliationIds: author.affiliationIds.filter((id) => id !== affiliationId),
      }));
    },
    addFunding(): void {
      const funding: FundingItem = {
        id: randomId('funding'),
        text: '',
      };
      this.metadata.fundings.push(funding);
    },
    removeFunding(fundingId: string): void {
      this.metadata.fundings = this.metadata.fundings.filter((item) => item.id !== fundingId);
    },
    saveDraft(): void {
      const draft = {
        locale: this.locale,
        theme: this.theme,
        enableDraftPersistence: this.enableDraftPersistence,
        metadata: this.metadata,
        content: this.content,
        exportSetting: this.exportSetting,
        imageOption: this.imageOption,
        imageAssets: this.imageAssets,
        previewSurface: this.previewSurface,
        typstTemplateId: this.typstTemplateId,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    },
    loadDraft(): boolean {
      let raw = localStorage.getItem(DRAFT_KEY);
      if (raw === null) {
        for (const legacyKey of LEGACY_DRAFT_KEYS) {
          const legacyRaw = localStorage.getItem(legacyKey);
          if (legacyRaw !== null) {
            raw = legacyRaw;
            break;
          }
        }
      }

      if (raw === null) {
        return false;
      }

      try {
        const parsed = JSON.parse(raw) as Partial<StoreState>;
        if (
          parsed.metadata === undefined ||
          parsed.content === undefined ||
          parsed.exportSetting === undefined ||
          parsed.imageOption === undefined
        ) {
          return false;
        }

        releaseTypstState(this.typst);
        this.locale = (parsed.locale ?? 'zh-CN') as LocaleType;
        this.theme = (parsed.theme ?? 'light') as ThemeMode;
        this.enableDraftPersistence = parsed.enableDraftPersistence ?? true;
        this.metadata = normalizeMetadata(parsed.metadata as Partial<ManuscriptMeta>);
        this.content = parsed.content;
        this.exportSetting = parsed.exportSetting;
        applyLockedExportLayout(this.exportSetting);
        this.imageOption = {
          ...parsed.imageOption,
          maxDisplayPercent: parsed.imageOption.maxDisplayPercent ?? 100,
        };
        this.imageAssets = normalizeImageAssetMap(parsed.imageAssets);
        this.previewSurface = parsed.previewSurface ?? 'typst';
        this.typstTemplateId = parsed.typstTemplateId ?? 'rubbish-default';
        this.editorCursorLine = 1;
        this.typst = createEmptyTypstState(this.typstTemplateId);
        return true;
      } catch {
        return false;
      }
    },
    clearDraft(): void {
      localStorage.removeItem(DRAFT_KEY);
      for (const legacyKey of LEGACY_DRAFT_KEYS) {
        localStorage.removeItem(legacyKey);
      }
    },
    clearAllInputs(): void {
      this.metadata = createEmptyMetadata();
      this.content = '';
      this.imageAssets = {};
      this.resetTypstState();

      if (this.enableDraftPersistence) {
        this.saveDraft();
        return;
      }

      this.clearDraft();
    },
    addImageAsset(dataUrl: string): string {
      if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Invalid image asset payload');
      }

      const assetId = createImageAssetId();
      this.imageAssets = {
        ...this.imageAssets,
        [assetId]: dataUrl,
      };

      return toImageAssetSrc(assetId);
    },
    resolveImageAsset(source: string): string | null {
      const assetId = parseImageAssetId(source);
      if (assetId === null) {
        return null;
      }

      return this.imageAssets[assetId] ?? null;
    },
  },
});

import { defineStore } from 'pinia';
import { exportRegressionFixture } from '@/data/exportFixture';
import { sampleManuscript } from '@/data/sampleManuscript';
import type {
  Affiliation,
  Author,
  ExportEngine,
  ExportSetting,
  FundingItem,
  ImageAssetMap,
  ImageOption,
  LocaleType,
  ManuscriptMeta,
  ThemeMode,
} from '@/types/manuscript';
import { parseRemoteImageUrls } from '@/utils/format';
import {
  createImageAssetId,
  normalizeImageAssetMap,
  parseImageAssetId,
  toImageAssetSrc,
} from '@/utils/imageAsset';

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
}

const applyLockedExportLayout = (setting: ExportSetting): void => {
  setting.fontSize = LOCKED_EXPORT_LAYOUT.fontSize;
  setting.lineHeight = LOCKED_EXPORT_LAYOUT.lineHeight;
  setting.paragraphIndent = LOCKED_EXPORT_LAYOUT.paragraphIndent;
  setting.normalizeHeadings = LOCKED_EXPORT_LAYOUT.normalizeHeadings;
  setting.margins = { ...LOCKED_EXPORT_LAYOUT.margins };
};

const cloneSample = (): StoreState => {
  const data = structuredClone(sampleManuscript);
  applyLockedExportLayout(data.exportSetting);
  return {
    locale: data.locale as LocaleType,
    theme: data.theme,
    enableDraftPersistence: data.enableDraftPersistence,
    metadata: data.metadata,
    content: data.content,
    exportSetting: data.exportSetting,
    imageOption: data.imageOption,
    imageAssets: normalizeImageAssetMap(data.imageAssets),
  };
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
  fundings: [],
});

const normalizeMetadata = (metadata: Partial<ManuscriptMeta> | undefined): ManuscriptMeta => {
  const fallback = createEmptyMetadata();
  if (metadata === undefined) {
    return fallback;
  }

  return {
    title: metadata.title ?? '',
    subtitle: metadata.subtitle ?? '',
    abstract: metadata.abstract ?? '',
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords : [],
    authors: Array.isArray(metadata.authors) ? metadata.authors : fallback.authors,
    affiliations: Array.isArray(metadata.affiliations)
      ? metadata.affiliations
      : fallback.affiliations,
    fundings: Array.isArray(metadata.fundings) ? metadata.fundings : [],
  };
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
    setExportEngine(engine: ExportEngine): void {
      this.exportSetting.engine = engine;
    },
    resetToSample(): void {
      const data = cloneSample();
      this.locale = data.locale;
      this.theme = data.theme;
      this.enableDraftPersistence = data.enableDraftPersistence;
      this.metadata = data.metadata;
      this.content = data.content;
      this.exportSetting = data.exportSetting;
      applyLockedExportLayout(this.exportSetting);
      this.imageOption = data.imageOption;
      this.imageAssets = data.imageAssets;
    },
    loadExportFixture(): void {
      this.metadata = normalizeMetadata(structuredClone(exportRegressionFixture.metadata));
      this.content = exportRegressionFixture.content;
      applyLockedExportLayout(this.exportSetting);
      this.imageAssets = {};
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

        this.locale = (parsed.locale ?? 'zh-CN') as LocaleType;
        this.theme = (parsed.theme ?? 'light') as ThemeMode;
        this.enableDraftPersistence = parsed.enableDraftPersistence ?? true;
        this.metadata = normalizeMetadata(parsed.metadata as Partial<ManuscriptMeta>);
        this.content = parsed.content;
        this.exportSetting = parsed.exportSetting;
        applyLockedExportLayout(this.exportSetting);
        this.imageOption = parsed.imageOption;
        this.imageAssets = normalizeImageAssetMap(parsed.imageAssets);
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

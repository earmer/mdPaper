import { defineStore } from 'pinia';
import { exportRegressionFixture } from '@/data/exportFixture';
import { sampleManuscript } from '@/data/sampleManuscript';
import type {
  Affiliation,
  Author,
  ExportEngine,
  ExportSetting,
  FundingItem,
  ImageOption,
  LocaleType,
  ManuscriptMeta,
  ThemeMode,
} from '@/types/manuscript';
import { parseRemoteImageUrls } from '@/utils/format';

const DRAFT_KEY = 'mdpaper-draft-v1';
const LEGACY_DRAFT_KEYS = ['journal-pdf-draft-v1'];
const LOCKED_EXPORT_LAYOUT = {
  fontSize: 10.8,
  lineHeight: 1.42,
  paragraphIndent: 2,
  columnGap: 8,
  normalizeHeadings: true,
  margins: {
    top: 18,
    right: 18,
    bottom: 20,
    left: 18,
  },
} as const;

interface StoreState {
  locale: LocaleType;
  theme: ThemeMode;
  enableDraftPersistence: boolean;
  hasLongFormulaBlock: boolean;
  metadata: ManuscriptMeta;
  content: string;
  exportSetting: ExportSetting;
  imageOption: ImageOption;
}

const applyLockedExportLayout = (setting: ExportSetting): void => {
  setting.fontSize = LOCKED_EXPORT_LAYOUT.fontSize;
  setting.lineHeight = LOCKED_EXPORT_LAYOUT.lineHeight;
  setting.paragraphIndent = LOCKED_EXPORT_LAYOUT.paragraphIndent;
  setting.columnGap = LOCKED_EXPORT_LAYOUT.columnGap;
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
    hasLongFormulaBlock: false,
    metadata: data.metadata,
    content: data.content,
    exportSetting: data.exportSetting,
    imageOption: data.imageOption,
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
    setLongFormulaBlock(value: boolean): void {
      this.hasLongFormulaBlock = value;
    },
    resetToSample(): void {
      const data = cloneSample();
      this.locale = data.locale;
      this.theme = data.theme;
      this.enableDraftPersistence = data.enableDraftPersistence;
      this.hasLongFormulaBlock = false;
      this.metadata = data.metadata;
      this.content = data.content;
      this.exportSetting = data.exportSetting;
      applyLockedExportLayout(this.exportSetting);
      this.imageOption = data.imageOption;
    },
    loadExportFixture(): void {
      this.metadata = structuredClone(exportRegressionFixture.metadata);
      this.content = exportRegressionFixture.content;
      this.hasLongFormulaBlock = false;
      applyLockedExportLayout(this.exportSetting);
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
        this.metadata = parsed.metadata;
        this.content = parsed.content;
        this.exportSetting = parsed.exportSetting;
        applyLockedExportLayout(this.exportSetting);
        this.imageOption = parsed.imageOption;
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
      this.hasLongFormulaBlock = false;

      if (this.enableDraftPersistence) {
        this.saveDraft();
        return;
      }

      this.clearDraft();
    },
  },
});

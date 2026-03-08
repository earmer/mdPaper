import { useManuscriptStore } from '@/store/useManuscriptStore';
import { revokePdfBlobUrl } from '@/services/typst/blobUrl';
import {
  compileManuscriptTypst,
  prepareTypstManuscript,
} from '@/services/typst/compileManuscript';

const COMPILE_DEBOUNCE_MS = 450;

interface PreparedCompileContext {
  key: string;
  source: string;
}

interface ActiveCompileState {
  key: string;
  runId: number;
  promise: Promise<void>;
}

let compileTimerId: number | null = null;
let compileRunId = 0;
let activeCompile: ActiveCompileState | null = null;
let lastSuccessfulCompileKey = '';

const buildImageAssetsSignature = (imageAssets: Record<string, string>): string =>
  Object.entries(imageAssets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([assetId, dataUrl]) => `${assetId}:${dataUrl}`)
    .join('|');

const buildCompileContext = (
  store: ReturnType<typeof useManuscriptStore>,
): PreparedCompileContext => {
  const prepared = prepareTypstManuscript(
    store.metadata,
    store.content,
    store.typstTemplateId,
  );

  return {
    key: [
      store.typstTemplateId,
      prepared.source,
      buildImageAssetsSignature(store.imageAssets),
    ].join('::'),
    source: prepared.source,
  };
};

const clearCompileTimer = (): void => {
  if (compileTimerId === null) {
    return;
  }

  window.clearTimeout(compileTimerId);
  compileTimerId = null;
};

const hasFreshArtifact = (
  store: ReturnType<typeof useManuscriptStore>,
  context: PreparedCompileContext,
): boolean => (
  store.typst.compileStatus === 'ready'
  && store.typst.artifactStatus === 'fresh'
  && store.typst.pdfBlobUrl.length > 0
  && store.typst.templateId === store.typstTemplateId
  && store.typst.generatedSource === context.source
  && lastSuccessfulCompileKey === context.key
);

const releaseCompileResultPdf = (blobUrl: string): void => {
  if (blobUrl.length === 0) {
    return;
  }

  revokePdfBlobUrl(blobUrl);
};

const runCompile = async (
  store: ReturnType<typeof useManuscriptStore>,
  context: PreparedCompileContext,
): Promise<void> => {
  if (hasFreshArtifact(store, context)) {
    return;
  }

  const runId = ++compileRunId;
  const previousBlobUrl = store.typst.pdfBlobUrl;
  store.setTypstPending(context.source);

  const promise = (async (): Promise<void> => {
    try {
      const result = await compileManuscriptTypst(
        store.metadata,
        store.content,
        store.typstTemplateId,
        store.imageAssets,
      );

      if (runId !== compileRunId) {
        releaseCompileResultPdf(result.pdfBlobUrl);
        return;
      }

      if (result.compileStatus === 'ready' && result.pdfBlobUrl.length > 0) {
        lastSuccessfulCompileKey = context.key;
        store.setTypstSuccess(result);
        if (previousBlobUrl !== result.pdfBlobUrl) {
          revokePdfBlobUrl(previousBlobUrl);
        }
        return;
      }

      releaseCompileResultPdf(result.pdfBlobUrl);
      store.setTypstFailure({
        errorMessage: result.errorMessage,
        diagnostics: result.diagnostics,
        generatedSource: result.generatedSource,
        compiledAt: result.compiledAt,
        templateId: result.templateId,
        virtualProjectSummary: result.virtualProjectSummary,
      });
    } catch (error) {
      if (runId !== compileRunId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Typst compile failed';
      store.setTypstFailure({
        errorMessage,
        diagnostics: [
          {
            severity: 'error',
            message: errorMessage,
            detail: error instanceof Error ? error.stack : undefined,
            source: 'typst',
          },
        ],
        generatedSource: context.source,
        compiledAt: new Date().toISOString(),
        templateId: store.typstTemplateId,
        virtualProjectSummary: [],
      });
    } finally {
      if (activeCompile?.runId === runId) {
        activeCompile = null;
      }
    }
  })();

  activeCompile = {
    key: context.key,
    runId,
    promise,
  };

  await promise;
};

export const useTypstCompilerSession = () => {
  const store = useManuscriptStore();

  const cancelScheduledCompile = (): void => {
    clearCompileTimer();
  };

  const scheduleCompile = (): void => {
    clearCompileTimer();
    compileTimerId = window.setTimeout(() => {
      compileTimerId = null;
      const context = buildCompileContext(store);
      void runCompile(store, context);
    }, COMPILE_DEBOUNCE_MS);
  };

  const ensureFreshTypstArtifact = async (): Promise<string> => {
    clearCompileTimer();
    const context = buildCompileContext(store);

    if (hasFreshArtifact(store, context)) {
      return store.typst.pdfBlobUrl;
    }

    if (activeCompile !== null && activeCompile.key === context.key) {
      await activeCompile.promise;
    } else {
      await runCompile(store, context);
    }

    if (hasFreshArtifact(store, context)) {
      return store.typst.pdfBlobUrl;
    }

    throw new Error(store.typst.errorMessage || 'Missing fresh Typst artifact');
  };

  return {
    cancelScheduledCompile,
    ensureFreshTypstArtifact,
    scheduleCompile,
  };
};

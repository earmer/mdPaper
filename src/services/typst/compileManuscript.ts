import { collectCitationDiagnostics } from '@/services/document/citation';
import { buildTypstManuscriptDocument } from '@/services/document/typstModel';
import { compileTypstArtifacts } from '@/services/typst/runtime';
import { serializeDocumentToTypst } from '@/services/typst/serialize';
import { createPdfBlobUrl } from '@/services/typst/blobUrl';
import { measurePerf, measurePerfAsync } from '@/utils/perfProfiler';
import type {
  ImageAssetMap,
  ManuscriptMeta,
  TypstDiagnostic,
  TypstRuntimeState,
  TypstTemplateId,
} from '@/types/manuscript';

export interface PreparedTypstManuscript {
  diagnostics: TypstDiagnostic[];
  source: string;
}

export interface CompiledTypstManuscript {
  compileStatus: Extract<TypstRuntimeState['compileStatus'], 'ready' | 'error'>;
  errorMessage: string;
  diagnostics: TypstDiagnostic[];
  generatedSource: string;
  svgContent: string;
  pdfBlobUrl: string;
  compiledAt: string;
  templateId: TypstTemplateId;
  virtualProjectSummary: string[];
}

const parseLocation = (message: string): { line?: number; column?: number } => {
  const colonMatch = message.match(/:(\d+):(\d+)/u);
  if (colonMatch !== null) {
    return {
      line: Number(colonMatch[1]),
      column: Number(colonMatch[2]),
    };
  }

  const textMatch = message.match(/line\s+(\d+)(?:\s*,?\s*column\s+(\d+))?/iu);
  if (textMatch !== null) {
    return {
      line: Number(textMatch[1]),
      column: textMatch[2] === undefined ? undefined : Number(textMatch[2]),
    };
  }

  return {};
};

const buildSourceExcerpt = (source: string, line?: number): string | undefined => {
  if (line === undefined || !Number.isFinite(line)) {
    return undefined;
  }

  const lines = source.split('\n');
  const index = Math.max(0, Math.min(lines.length - 1, line - 1));
  const start = Math.max(0, index - 1);
  const end = Math.min(lines.length, index + 2);
  const excerpt = lines
    .slice(start, end)
    .map((item, offset) => {
      const lineNumber = start + offset + 1;
      const marker = lineNumber === line ? '>' : ' ';
      return `${marker} ${String(lineNumber).padStart(4, ' ')} | ${item}`;
    })
    .join('\n')
    .trim();

  return excerpt.length > 0 ? excerpt : undefined;
};

const enrichTypstDiagnostics = (
  diagnostics: TypstDiagnostic[],
  errorMessage: string,
  source: string,
): TypstDiagnostic[] => {
  const enriched = diagnostics.map((item) => {
    if (item.source !== 'typst') {
      return item;
    }

    const location = parseLocation([item.range, item.message, item.detail].filter(Boolean).join(' '));
    const range = item.range ?? (location.line !== undefined
      ? `${location.line}${location.column !== undefined ? `:${location.column}` : ''}`
      : undefined);
    const detail = item.detail ?? buildSourceExcerpt(source, location.line);

    return {
      ...item,
      range,
      detail,
    };
  });

  const hasTypstError = enriched.some((item) => item.source === 'typst' && item.severity === 'error');
  if (!hasTypstError && errorMessage.length > 0) {
    const location = parseLocation(errorMessage);
    enriched.push({
      severity: 'error',
      message: errorMessage,
      range: location.line !== undefined
        ? `${location.line}${location.column !== undefined ? `:${location.column}` : ''}`
        : undefined,
      detail: buildSourceExcerpt(source, location.line),
      source: 'typst',
    });
  }

  return enriched;
};

export const prepareTypstManuscript = (
  metadata: ManuscriptMeta,
  content: string,
  templateId: TypstTemplateId,
): PreparedTypstManuscript => {
  const document = measurePerf(
    'typst.prepare.document',
    () => buildTypstManuscriptDocument(metadata, content),
  );
  const source = measurePerf(
    'typst.prepare.serialize',
    () => serializeDocumentToTypst(document, templateId),
  );
  const diagnostics = measurePerf(
    'typst.prepare.citations',
    () => collectCitationDiagnostics(document.normalizedSource, document.citations),
  );

  return {
    diagnostics,
    source,
  };
};

export const compileManuscriptTypst = async (
  metadata: ManuscriptMeta,
  content: string,
  templateId: TypstTemplateId,
  imageAssets: ImageAssetMap,
): Promise<CompiledTypstManuscript> => {
  const prepared = measurePerf(
    'typst.prepare.total',
    () => prepareTypstManuscript(metadata, content, templateId),
  );
  const result = await measurePerfAsync(
    'typst.compile.total',
    async () => await compileTypstArtifacts(prepared.source, templateId, imageAssets),
  );
  const diagnostics = enrichTypstDiagnostics(
    [...prepared.diagnostics, ...result.diagnostics],
    result.errorMessage,
    prepared.source,
  );
  const hasTypstError = diagnostics.some(
    (item) => item.source === 'typst' && item.severity === 'error',
  );
  const compileStatus: CompiledTypstManuscript['compileStatus'] = hasTypstError || result.pdfData === null || result.svgContent.length === 0
    ? 'error'
    : 'ready';

  return {
    compileStatus,
    errorMessage: result.errorMessage,
    diagnostics,
    generatedSource: result.generatedSource,
    svgContent: result.svgContent,
    pdfBlobUrl: createPdfBlobUrl(result.pdfData),
    compiledAt: result.compiledAt,
    templateId,
    virtualProjectSummary: result.virtualProjectSummary,
  };
};

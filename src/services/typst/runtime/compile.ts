import type { ImageAssetMap, TypstDiagnostic, TypstTemplateId } from '@/types/manuscript';
import {
  ensureBrowserWasmImporters,
  getCompiler,
  withCompileQueue,
} from '@/services/typst/runtime/bootstrap';
import {
  buildTypstVirtualProject,
  buildVirtualProjectSummary,
  syncCompilerProject,
  syncSnippetProject,
} from '@/services/typst/runtime/project';
import type { TypstCompileArtifacts } from '@/services/typst/runtime/types';

const normalizeSeverity = (severity: string | undefined): TypstDiagnostic['severity'] => {
  if (severity === 'error') {
    return 'error';
  }
  if (severity === 'warning') {
    return 'warning';
  }
  return 'info';
};

const stringifyUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const buildSyntheticDiagnostic = (
  message: string,
  detail: string,
  range?: string,
): TypstDiagnostic => ({
  severity: 'error',
  message,
  detail,
  range,
  source: 'typst',
});

const normalizeDiagnostics = (diagnostics: unknown): TypstDiagnostic[] => {
  if (!Array.isArray(diagnostics)) {
    return [];
  }

  return diagnostics.reduce<TypstDiagnostic[]>((items, entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return items;
    }

    const record = entry as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : '';
    if (message.length === 0) {
      return items;
    }

    items.push({
      severity: normalizeSeverity(typeof record.severity === 'string' ? record.severity : undefined),
      message,
      path: typeof record.path === 'string' ? record.path : undefined,
      range: typeof record.range === 'string' ? record.range : undefined,
      package: typeof record.package === 'string' ? record.package : undefined,
      detail: typeof record.trace === 'string'
        ? record.trace
        : typeof record.hints === 'string'
          ? record.hints
          : undefined,
      source: 'typst',
    });
    return items;
  }, []);
};

export const compileTypstArtifacts = async (
  source: string,
  templateId: TypstTemplateId,
  imageAssets: ImageAssetMap,
): Promise<TypstCompileArtifacts> => withCompileQueue(async () => {
  ensureBrowserWasmImporters();
  const compiler = await getCompiler();
  await compiler.reset();

  const project = await buildTypstVirtualProject(source, templateId, imageAssets);
  const virtualProjectSummary = buildVirtualProjectSummary(templateId, project);
  const virtualFsDetail = virtualProjectSummary.join('\n');
  syncCompilerProject(compiler, project);
  const snippet = await syncSnippetProject(compiler, project);

  let pdfData: Uint8Array | null = null;
  let svgContent = '';
  let errorMessage = '';
  const diagnostics: TypstDiagnostic[] = [];

  if (project.resourceWarnings.length > 0) {
    diagnostics.push(buildSyntheticDiagnostic(
      'Typst resource mapping failed',
      project.resourceWarnings.join('\n\n'),
    ));
  }

  try {
    const pdfResult = await compiler.compile({
      mainFilePath: project.mainFilePath,
      format: 'pdf',
      diagnostics: 'full',
    });
    diagnostics.push(...normalizeDiagnostics(pdfResult.diagnostics));
    pdfData = pdfResult.result ?? null;
    if (pdfResult.result === undefined) {
      errorMessage = diagnostics[0]?.message ?? 'Typst PDF compilation failed';
    }
  } catch (error) {
    const detail = stringifyUnknownError(error);
    errorMessage = error instanceof Error ? error.message : 'Typst PDF compilation failed';
    diagnostics.push(buildSyntheticDiagnostic('Typst PDF compilation failed', `${detail}\n\n${virtualFsDetail}`));
  }

  try {
    svgContent = await snippet.svg({
      mainFilePath: project.mainFilePath,
      data_selection: {
        body: true,
        defs: true,
        css: true,
        js: false,
      },
    });
  } catch (error) {
    const detail = stringifyUnknownError(error);
    if (errorMessage.length === 0) {
      errorMessage = error instanceof Error ? error.message : 'Typst SVG rendering failed';
    }
    diagnostics.push(buildSyntheticDiagnostic('Typst SVG rendering failed', `${detail}\n\n${virtualFsDetail}`));
  }

  if (errorMessage.length > 0 && !diagnostics.some((item) => item.severity === 'error')) {
    diagnostics.push(buildSyntheticDiagnostic(errorMessage, `${errorMessage}\n\n${virtualFsDetail}`));
  }

  return {
    diagnostics,
    errorMessage,
    generatedSource: source,
    svgContent,
    pdfData,
    compiledAt: new Date().toISOString(),
    templateId,
    virtualProjectSummary,
  };
});

import { createTypstCompiler, preloadRemoteFonts } from '@myriaddreamin/typst.ts';
import { TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import type { TypstCompiler } from '@myriaddreamin/typst.ts';
import { setImportWasmModule as setCompilerWasmImporter } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import { setImportWasmModule as setRendererWasmImporter } from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import simsunUrl from '@/assets/fonts/simsun.woff2?url';
import stixMathUrl from '@/assets/fonts/stix2math.woff2?url';
import timesUrl from '@/assets/fonts/timesnewroman.woff2?url';
import timesItalicUrl from '@/assets/fonts/timesnewroman-italic.woff2?url';
import {
  getTypstTemplateDefinition,
  getTypstTemplateSources,
} from '@/services/typst/templates';
import { loadBinaryResource } from '@/services/image/resourceAccess';
import type { ImageAssetMap } from '@/types/manuscript';
import { parseImageAssetId } from '@/utils/imageAsset';
import type { TypstDiagnostic, TypstTemplateId } from '@/types/manuscript';

export interface TypstVirtualProject {
  mainFilePath: string;
  templateEntryPath: string;
  sourceFiles: Record<string, string>;
  shadowFiles: Record<string, Uint8Array>;
  importStatements: string[];
  resourceWarnings: string[];
}

export interface TypstCompileArtifacts {
  diagnostics: TypstDiagnostic[];
  errorMessage: string;
  generatedSource: string;
  svgContent: string;
  pdfData: Uint8Array | null;
  compiledAt: string;
  templateId: TypstTemplateId;
  virtualProjectSummary: string[];
}

const fontUrls = [timesUrl, timesItalicUrl, simsunUrl, stixMathUrl];
let compilerPromise: Promise<TypstCompiler> | null = null;
let wasmImporterInitialized = false;
let compileQueue: Promise<void> = Promise.resolve();
let snippetInstance: TypstSnippet | null = null;

const fetchWasmModule = async (wasmUrl: string): Promise<ArrayBuffer> => {
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load Wasm module: ${wasmUrl} (${response.status})`);
  }

  return await response.arrayBuffer();
};

const ensureBrowserWasmImporters = (): void => {
  if (wasmImporterInitialized || typeof window === 'undefined') {
    return;
  }

  setCompilerWasmImporter(async (wasmName: string) => {
    if (wasmName !== 'typst_ts_web_compiler_bg.wasm') {
      throw new Error(`Unexpected compiler Wasm module: ${wasmName}`);
    }

    return await fetchWasmModule(compilerWasmUrl);
  });

  setRendererWasmImporter(async (wasmName: string) => {
    if (wasmName !== 'typst_ts_renderer_bg.wasm') {
      throw new Error(`Unexpected renderer Wasm module: ${wasmName}`);
    }

    return await fetchWasmModule(rendererWasmUrl);
  });

  wasmImporterInitialized = true;
};

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


const withCompileQueue = async <T>(task: () => Promise<T>): Promise<T> => {
  const pending = compileQueue;
  let releaseQueue: (() => void) | null = null;
  compileQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await pending;

  try {
    return await task();
  } finally {
    releaseQueue?.();
  }
};

const getTypstSnippet = (): TypstSnippet => {
  if (snippetInstance !== null) {
    return snippetInstance;
  }

  snippetInstance = new TypstSnippet({
    compiler: async () => await getCompiler(),
  });

  return snippetInstance;
};

const getCompiler = async (): Promise<TypstCompiler> => {
  if (compilerPromise !== null) {
    return compilerPromise;
  }

  compilerPromise = (async () => {
    const compiler = createTypstCompiler();
    await compiler.init({
      beforeBuild: [preloadRemoteFonts(fontUrls)],
    });
    return compiler;
  })();

  return compilerPromise;
};

const collectShadowResourcePaths = (source: string): string[] => {
  const paths = new Set<string>();
  const regex = /image\(\s*"([^"]+)"/gu;
  let match = regex.exec(source);

  while (match !== null) {
    const path = (match[1] ?? '').trim();
    if (path.length > 0) {
      paths.add(path);
    }
    match = regex.exec(source);
  }

  return Array.from(paths);
};

const normalizeMimeToExtension = (mime: string, fallbackSource: string): string => {
  if (mime === 'image/svg+xml') {
    return 'svg';
  }
  if (mime === 'image/webp') {
    return 'webp';
  }
  if (mime === 'image/png') {
    return 'png';
  }
  if (mime === 'image/jpeg') {
    return 'jpg';
  }

  const matched = fallbackSource.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/u);
  return matched?.[1]?.toLowerCase() ?? 'bin';
};

const buildVirtualResourcePath = (resourcePath: string, index: number, mime: string): string =>
  `/@/shadow/resource-${index + 1}.${normalizeMimeToExtension(mime, resourcePath)}`;

const rewriteTypstImageSources = (
  source: string,
  pathMapping: Map<string, string>,
  unsupportedPaths: Set<string>,
): string => source.replace(/image\(\s*"([^"]+)"[^)]*\)/gu, (segment, originalPath: string) => {
  const normalizedPath = originalPath.trim();
  const rewrittenPath = pathMapping.get(normalizedPath);
  if (rewrittenPath !== undefined) {
    return segment.replace(originalPath, rewrittenPath);
  }

  if (unsupportedPaths.has(normalizedPath)) {
    return '[Linked image unavailable for Typst]';
  }

  return segment;
});

const resolveShadowResource = async (
  resourcePath: string,
  imageAssets: ImageAssetMap,
): Promise<{ bytes: Uint8Array; mime: string }> => {
  const assetId = parseImageAssetId(resourcePath);
  if (assetId !== null) {
    const dataUrl = imageAssets[assetId];
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
      throw new Error(`Missing image asset: ${assetId}`);
    }

    const mime = dataUrl.match(/^data:([^;,]+)[;,]/u)?.[1] ?? 'application/octet-stream';
    return {
      bytes: await loadBinaryResource(dataUrl),
      mime,
    };
  }

  if (/^https?:\/\//u.test(resourcePath)) {
    throw new Error(`Remote linked image is not available to Typst runtime: ${resourcePath}`);
  }

  if (resourcePath.startsWith('/')) {
    const mime = resourcePath.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    return {
      bytes: await loadBinaryResource(resourcePath),
      mime,
    };
  }

  if (resourcePath.startsWith('data:')) {
    const mime = resourcePath.match(/^data:([^;,]+)[;,]/u)?.[1] ?? 'application/octet-stream';
    return {
      bytes: await loadBinaryResource(resourcePath),
      mime,
    };
  }

  throw new Error(`Unsupported Typst image source: ${resourcePath}`);
};

const resolveShadowFiles = async (source: string, imageAssets: ImageAssetMap): Promise<{
  rewrittenSource: string;
  shadowFiles: Record<string, Uint8Array>;
  resourceWarnings: string[];
}> => {
  const shadowFiles: Record<string, Uint8Array> = {};
  const resourceWarnings: string[] = [];
  const resourcePaths = collectShadowResourcePaths(source);
  const pathMapping = new Map<string, string>();
  const unsupportedPaths = new Set<string>();

  await Promise.all(resourcePaths.map(async (resourcePath, index) => {
    try {
      const resolved = await resolveShadowResource(resourcePath, imageAssets);
      const virtualPath = buildVirtualResourcePath(resourcePath, index, resolved.mime);
      shadowFiles[virtualPath] = resolved.bytes;
      pathMapping.set(resourcePath, virtualPath);
    } catch (error) {
      unsupportedPaths.add(resourcePath);
      resourceWarnings.push(`${resourcePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  return {
    rewrittenSource: rewriteTypstImageSources(source, pathMapping, unsupportedPaths),
    shadowFiles,
    resourceWarnings,
  };
};

export const buildTypstVirtualProject = async (
  source: string,
  templateId: TypstTemplateId,
  imageAssets: ImageAssetMap,
): Promise<TypstVirtualProject> => {
  const template = getTypstTemplateDefinition(templateId);
  const { rewrittenSource, shadowFiles, resourceWarnings } = await resolveShadowFiles(source, imageAssets);
  const sourceFiles = {
    ...getTypstTemplateSources(templateId),
    '/main.typ': rewrittenSource,
  };

  return {
    mainFilePath: '/main.typ',
    templateEntryPath: template.entryPath,
    sourceFiles,
    shadowFiles,
    importStatements: [
      `#import ${JSON.stringify(template.entryPath)}: mdp_article`,
      `#import ${JSON.stringify(template.frontMatterPath)}: mdp_frontmatter`,
    ],
    resourceWarnings,
  };
};

const buildVirtualProjectSummary = (
  templateId: TypstTemplateId,
  project: TypstVirtualProject,
): string[] => [
  `templateId=${templateId}`,
  `mainFilePath=${project.mainFilePath}`,
  `templateEntryPath=${project.templateEntryPath}`,
  `compilerSvgSharedProject=true`,
  ...project.importStatements.map((item) => `import=${item}`),
  ...Object.keys(project.sourceFiles).sort().map((item) => `source=${item}`),
  ...Object.keys(project.shadowFiles).sort().map((item) => `shadow=${item}`),
  ...project.resourceWarnings.map((item) => `resourceWarning=${item}`),
];

const syncCompilerProject = (compiler: TypstCompiler, project: TypstVirtualProject): void => {
  compiler.resetShadow();
  Object.entries(project.sourceFiles).forEach(([path, content]) => {
    compiler.addSource(path, content);
  });
  Object.entries(project.shadowFiles).forEach(([path, content]) => {
    compiler.mapShadow(path, content);
  });
};

const syncSnippetProject = async (
  _compiler: TypstCompiler,
  project: TypstVirtualProject,
): Promise<TypstSnippet> => {
  const snippet = getTypstSnippet();
  snippet.setMainFilePath(project.mainFilePath);
  await snippet.resetShadow();
  for (const [path, content] of Object.entries(project.sourceFiles)) {
    await snippet.addSource(path, content);
  }
  for (const [path, content] of Object.entries(project.shadowFiles)) {
    await snippet.mapShadow(path, content);
  }

  return snippet;
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

export const createPdfBlobUrl = (pdfData: Uint8Array | null): string => {
  if (pdfData === null) {
    return '';
  }

  const arrayBuffer = pdfData.buffer.slice(
    pdfData.byteOffset,
    pdfData.byteOffset + pdfData.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const revokePdfBlobUrl = (pdfBlobUrl: string): void => {
  if (pdfBlobUrl.length === 0) {
    return;
  }

  URL.revokeObjectURL(pdfBlobUrl);
};

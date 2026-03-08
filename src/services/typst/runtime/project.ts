import type { TypstCompiler } from '@myriaddreamin/typst.ts';
import type { ImageAssetMap, TypstTemplateId } from '@/types/manuscript';
import { loadBinaryResource } from '@/services/image/resourceAccess';
import {
  getTypstTemplateDefinition,
  getTypstTemplateSources,
} from '@/services/typst/templates';
import { getTypstSnippet } from '@/services/typst/runtime/bootstrap';
import type { TypstVirtualProject } from '@/services/typst/runtime/types';
import { parseImageAssetId } from '@/utils/imageAsset';

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

export const buildVirtualProjectSummary = (
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

export const syncCompilerProject = (compiler: TypstCompiler, project: TypstVirtualProject): void => {
  compiler.resetShadow();
  Object.entries(project.sourceFiles).forEach(([path, content]) => {
    compiler.addSource(path, content);
  });
  Object.entries(project.shadowFiles).forEach(([path, content]) => {
    compiler.mapShadow(path, content);
  });
};

export const syncSnippetProject = async (
  _compiler: TypstCompiler,
  project: TypstVirtualProject,
) => {
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

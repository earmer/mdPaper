import type { TypstTemplateId } from '@/types/manuscript';
import frontMatterSource from '@/services/typst/templates/frontmatter.typ?raw';
import rubbishCompactSource from '@/services/typst/templates/rubbish-compact.typ?raw';
import rubbishDefaultSource from '@/services/typst/templates/rubbish-default.typ?raw';

export interface TypstTemplateDefinition {
  id: TypstTemplateId;
  labelKey: string;
  descriptionKey: string;
  entryPath: string;
  frontMatterPath: string;
  render: (body: string) => string;
}

type TemplateSourceMap = Record<string, string>;

const sharedFrontMatterPath = '/@/templates/frontmatter.typ';

const templateSourceMaps: Record<TypstTemplateId, TemplateSourceMap> = {
  'rubbish-default': {
    [sharedFrontMatterPath]: frontMatterSource,
    '/@/templates/rubbish-default.typ': rubbishDefaultSource,
  },
  'rubbish-compact': {
    [sharedFrontMatterPath]: frontMatterSource,
    '/@/templates/rubbish-compact.typ': rubbishCompactSource,
  },
};

const buildTemplateWrapper = (
  entryPath: string,
  frontMatterPath: string,
  body: string,
): string => `#import ${JSON.stringify(entryPath)}: mdp_article
#import ${JSON.stringify(frontMatterPath)}: mdp_frontmatter
#show: mdp_article

${body}`;

const templateDefinitionMap: Record<TypstTemplateId, TypstTemplateDefinition> = {
  'rubbish-default': {
    id: 'rubbish-default',
    labelKey: 'preview.templateRubbishDefault',
    descriptionKey: 'preview.templateRubbishDefaultDesc',
    entryPath: '/@/templates/rubbish-default.typ',
    frontMatterPath: sharedFrontMatterPath,
    render: (body: string) => buildTemplateWrapper('/@/templates/rubbish-default.typ', sharedFrontMatterPath, body),
  },
  'rubbish-compact': {
    id: 'rubbish-compact',
    labelKey: 'preview.templateRubbishCompact',
    descriptionKey: 'preview.templateRubbishCompactDesc',
    entryPath: '/@/templates/rubbish-compact.typ',
    frontMatterPath: sharedFrontMatterPath,
    render: (body: string) => buildTemplateWrapper('/@/templates/rubbish-compact.typ', sharedFrontMatterPath, body),
  },
};

export const typstTemplates: TypstTemplateDefinition[] = Object.values(templateDefinitionMap);

export const getTypstTemplateDefinition = (
  id: TypstTemplateId,
): TypstTemplateDefinition => templateDefinitionMap[id];

export const getTypstTemplateSources = (id: TypstTemplateId): TemplateSourceMap => ({
  ...templateSourceMaps[id],
});

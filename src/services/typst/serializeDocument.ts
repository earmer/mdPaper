import type { ManuscriptDocument } from '@/services/document/model';
import { getTypstTemplateDefinition } from '@/services/typst/templates';
import { buildFrontMatterCall } from '@/services/typst/render/frontmatter';
import { renderBody } from '@/services/typst/render/block';
import type { TypstTemplateId } from '@/types/manuscript';

export const serializeDocumentToTypst = (
  document: ManuscriptDocument,
  templateId: TypstTemplateId,
): string => {
  const template = getTypstTemplateDefinition(templateId);
  const body = [
    buildFrontMatterCall(document),
    '',
    ...renderBody(document),
  ].join('\n');

  return template.render(body).trim();
};

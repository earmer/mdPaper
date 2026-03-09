import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkSupersub from 'remark-supersub';
import { unified } from 'unified';
import { parseCitationRegistry, type CitationRegistry } from '@/services/document/citation';
import { remarkMiTexToTypst } from '@/services/document/remarkMiTexToTypst';
import { normalizeMathInMarkdown } from '@/services/markdown/normalizeMath';
import type { ManuscriptMeta } from '@/types/manuscript';

export interface TypstManuscriptDocument {
  metadata: ManuscriptMeta;
  source: string;
  normalizedSource: string;
  ast: Root;
  citations: CitationRegistry;
}

const typstMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkSupersub)
  .use(remarkMath)
  .use(remarkMiTexToTypst);

export const buildTypstManuscriptDocument = (
  metadata: ManuscriptMeta,
  source: string,
): TypstManuscriptDocument => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const parsed = typstMarkdownProcessor.parse(normalizedSource);
  const ast = typstMarkdownProcessor.runSync(parsed) as Root;

  return {
    metadata,
    source,
    normalizedSource,
    ast,
    citations: parseCitationRegistry(normalizedSource),
  };
};

import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseCitationRegistry, type CitationRegistry } from '@/services/document/citation';
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
  .use(remarkGfm);

export const buildTypstManuscriptDocument = (
  metadata: ManuscriptMeta,
  source: string,
): TypstManuscriptDocument => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const ast = typstMarkdownProcessor.parse(normalizedSource) as Root;

  return {
    metadata,
    source,
    normalizedSource,
    ast,
    citations: parseCitationRegistry(normalizedSource),
  };
};

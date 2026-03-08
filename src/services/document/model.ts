import type Token from 'markdown-it/lib/token.mjs';
import { markdown } from '@/services/markdown/md';
import { parseCitationRegistry, type CitationRegistry } from '@/services/document/citation';
import { normalizeMathInMarkdown } from '@/services/markdown/normalizeMath';
import type { ManuscriptMeta } from '@/types/manuscript';

export interface DocumentBlock {
  id: string;
  kind: string;
  lineStart: number;
  lineEnd: number;
}

export interface ManuscriptDocument {
  metadata: ManuscriptMeta;
  source: string;
  normalizedSource: string;
  tokens: Token[];
  blocks: DocumentBlock[];
  citations: CitationRegistry;
}

const blockTokenTypes = new Set([
  'paragraph_open',
  'heading_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'table_open',
  'fence',
  'code_block',
  'hr',
]);

const normalizeLineNumber = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, value + 1);
};

const buildBlocksFromTokens = (tokens: Token[]): DocumentBlock[] => {
  const blocks: DocumentBlock[] = [];

  tokens.forEach((token, index) => {
    if (!blockTokenTypes.has(token.type)) {
      return;
    }

    const start = normalizeLineNumber(token.map?.[0]);
    const end = normalizeLineNumber(token.map?.[1] ?? token.map?.[0]);
    const kind = token.tag.length > 0 ? token.tag : token.type;

    blocks.push({
      id: `block-${index}`,
      kind,
      lineStart: start,
      lineEnd: Math.max(start, end),
    });
  });

  return blocks;
};

export const buildManuscriptDocument = (
  metadata: ManuscriptMeta,
  source: string,
): ManuscriptDocument => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const tokens = markdown.parse(normalizedSource, {});

  return {
    metadata,
    source,
    normalizedSource,
    tokens,
    blocks: buildBlocksFromTokens(tokens),
    citations: parseCitationRegistry(normalizedSource),
  };
};

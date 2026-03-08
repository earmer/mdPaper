import type Token from 'markdown-it/lib/token.mjs';
import type { ManuscriptDocument } from '@/services/document/model';
import {
  replaceCitationSyntax,
  stripReferenceMarker,
} from '@/services/document/citation';
import {
  escapeTypstText,
  trimParagraph,
} from '@/services/typst/escape';

const parseInlineImage = (markdown: string): { alt: string; src: string; title: string } | null => {
  const matched = markdown.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/u);
  if (matched === null) {
    return null;
  }

  return {
    alt: (matched[1] ?? '').trim(),
    src: (matched[2] ?? '').trim(),
    title: (matched[3] ?? '').trim(),
  };
};

const buildImageBlock = (markdown: string): string => {
  const image = parseInlineImage(markdown);
  if (image === null) {
    return escapeTypstText(markdown);
  }

  if (image.src.startsWith('asset://')) {
    return [
      '#figure(',
      '  [Inline image asset omitted in Typst preview/export.],',
      image.title.length > 0 ? `  caption: [${escapeTypstText(image.title)}],` : '',
      ')',
    ].filter((item) => item.length > 0).join('\n');
  }

  return [
    '#figure(',
    `  image(${JSON.stringify(image.src)}),`,
    image.title.length > 0 ? `  caption: [${escapeTypstText(image.title)}],` : '',
    ')',
  ].filter((item) => item.length > 0).join('\n');
};

const renderCitations = (input: string, document: ManuscriptDocument): string =>
  replaceCitationSyntax(input, document.citations, (match) => escapeTypstText(match.label));

const renderInlineSequence = (
  tokens: Token[],
  document: ManuscriptDocument,
  inReferenceSection: boolean,
  startIndex = 0,
  stopType?: string,
): { content: string; nextIndex: number } => {
  let content = '';
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      index += 1;
      continue;
    }

    if (stopType !== undefined && token.type === stopType) {
      return { content, nextIndex: index };
    }

    if (token.type === 'text') {
      content += inReferenceSection
        ? escapeTypstText(stripReferenceMarker(token.content))
        : renderCitations(escapeTypstText(token.content), document);
      index += 1;
      continue;
    }

    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      content += ' ';
      index += 1;
      continue;
    }

    if (token.type === 'code_inline') {
      content += `#raw(${JSON.stringify(token.content)})`;
      index += 1;
      continue;
    }

    if (token.type === 'math_inline') {
      content += `$${token.content}$`;
      index += 1;
      continue;
    }

    if (token.type === 'image') {
      const src = token.attrGet('src') ?? '';
      const alt = token.content.trim();
      const title = token.attrGet('title') ?? '';
      content += src.length > 0
        ? buildImageBlock(`![${alt}](${src}${title.length > 0 ? ` "${title}"` : ''})`)
        : escapeTypstText(alt);
      index += 1;
      continue;
    }

    if (token.type === 'em_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, index + 1, 'em_close');
      content += `#emph[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    if (token.type === 'strong_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, index + 1, 'strong_close');
      content += `#strong[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    if (token.type === 'link_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, index + 1, 'link_close');
      const href = token.attrGet('href') ?? '';
      content += `#link(${JSON.stringify(href)})[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    index += 1;
  }

  return { content, nextIndex: index };
};

export const renderInlineTokens = (
  tokens: Token[] | null | undefined,
  document: ManuscriptDocument,
  inReferenceSection: boolean,
): string => {
  if (tokens === undefined || tokens === null) {
    return '';
  }

  return trimParagraph(renderInlineSequence(tokens, document, inReferenceSection).content);
};

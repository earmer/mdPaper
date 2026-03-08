import type Token from 'markdown-it/lib/token.mjs';
import type { ManuscriptDocument } from '@/services/document/model';
import {
  replaceCitationSyntax,
  stripReferenceMarker,
} from '@/services/document/citation';
import { getTypstTemplateDefinition } from '@/services/typst/templates';
import type { ImageOption, TypstTemplateId } from '@/types/manuscript';
import { formatAffiliationLine } from '@/utils/format';

const escapeTypstText = (input: string): string => input
  .replace(/\\/gu, '\\\\')
  .replace(/#/gu, '\\#')
  .replace(/\[/gu, '\\[')
  .replace(/\]/gu, '\\]')
  .replace(/\*/gu, '\\*')
  .replace(/_/gu, '\\_');

const trimParagraph = (input: string): string => input.replace(/\s+/gu, ' ').trim();

const stringifyTypstValue = (value: string): string => JSON.stringify(value);

const stringifyTypstArray = (values: string[]): string =>
  `(${values.map((value) => stringifyTypstValue(value)).join(', ')})`;

const stringifyTypstAuthorArray = (authors: Array<{ name: string; markers: string }>): string =>
  `(${authors.map((author) => `(name: ${stringifyTypstValue(author.name)}, markers: ${stringifyTypstValue(author.markers)})`).join(', ')})`;

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

const buildImageBlock = (markdown: string, imageOption: ImageOption): string => {
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

const buildFrontMatterCall = (document: ManuscriptDocument): string => {
  const { metadata } = document;
  const affiliationIndexMap = new Map(metadata.affiliations.map((item, index) => [item.id, index + 1]));
  const authors = metadata.authors.map((author) => {
    const markers = author.affiliationIds
      .map((id) => affiliationIndexMap.get(id))
      .filter((value): value is number => value !== undefined)
      .map((value) => String(value));
    if (author.id === metadata.correspondingAuthorId) {
      markers.push('*');
    }

    return {
      name: author.name.trim() || author.nameEn.trim(),
      markers: markers.join(','),
    };
  }).filter((author) => author.name.length > 0);
  const affiliations = metadata.affiliations
    .map((item, index) => formatAffiliationLine(item, index).trim())
    .filter((item) => item.length > 0);
  const correspondingAuthor = metadata.authors.find((author) => author.id === metadata.correspondingAuthorId);
  const correspondingName = correspondingAuthor === undefined
    ? ''
    : (correspondingAuthor.name.trim() || correspondingAuthor.nameEn.trim());
  const corresponding = correspondingName.length === 0
    ? ''
    : `${correspondingName}${metadata.correspondingAuthorContact.trim().length > 0 ? ` (${metadata.correspondingAuthorContact.trim()})` : ''}`;
  const funding = metadata.fundings
    .map((item) => item.text.trim())
    .filter((item) => item.length > 0)
    .join('；');
  const keywords = metadata.keywords
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return [
    '#mdp_frontmatter(',
    `  title: ${stringifyTypstValue(metadata.title.trim())},`,
    `  subtitle: ${stringifyTypstValue(metadata.subtitle.trim())},`,
    `  authors: ${stringifyTypstAuthorArray(authors)},`,
    `  affiliations: ${stringifyTypstArray(affiliations)},`,
    `  corresponding: ${stringifyTypstValue(corresponding)},`,
    `  funding: ${stringifyTypstValue(funding)},`,
    `  abstract: ${stringifyTypstValue(metadata.abstract.trim())},`,
    `  keywords: ${stringifyTypstArray(keywords)},`,
    ')',
  ].join('\n');
};

const renderCitations = (input: string, document: ManuscriptDocument): string =>
  replaceCitationSyntax(input, document.citations, (match) => escapeTypstText(match.label));

const renderInlineSequence = (
  tokens: Token[],
  document: ManuscriptDocument,
  inReferenceSection: boolean,
  imageOption: ImageOption,
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
        ? buildImageBlock(`![${alt}](${src}${title.length > 0 ? ` "${title}"` : ''})`, imageOption)
        : escapeTypstText(alt);
      index += 1;
      continue;
    }

    if (token.type === 'em_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, imageOption, index + 1, 'em_close');
      content += `#emph[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    if (token.type === 'strong_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, imageOption, index + 1, 'strong_close');
      content += `#strong[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    if (token.type === 'link_open') {
      const inner = renderInlineSequence(tokens, document, inReferenceSection, imageOption, index + 1, 'link_close');
      const href = token.attrGet('href') ?? '';
      content += `#link(${JSON.stringify(href)})[${inner.content}]`;
      index = inner.nextIndex + 1;
      continue;
    }

    index += 1;
  }

  return { content, nextIndex: index };
};

const renderInlineTokens = (
  tokens: Token[] | null | undefined,
  document: ManuscriptDocument,
  inReferenceSection: boolean,
  imageOption: ImageOption,
): string => {
  if (tokens === undefined || tokens === null) {
    return '';
  }

  return trimParagraph(renderInlineSequence(tokens, document, inReferenceSection, imageOption).content);
};

const renderTable = (
  tokens: Token[],
  startIndex: number,
  document: ManuscriptDocument,
  imageOption: ImageOption,
): { content: string; nextIndex: number } => {
  const rows: string[][] = [];
  let index = startIndex + 1;
  let currentRow: string[] = [];

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }

    if (token.type === 'table_close') {
      break;
    }

    if (token.type === 'tr_open') {
      currentRow = [];
    } else if (token.type === 'inline') {
      currentRow.push(renderInlineTokens(token.children, document, false, imageOption));
    } else if (token.type === 'tr_close') {
      rows.push(currentRow);
    }

    index += 1;
  }

  return {
    content: `#table(columns: ${Math.max(1, ...rows.map((row) => row.length))},\n${rows.map((row) => `  [${row.join('], [')}]`).join(',\n')}\n)`,
    nextIndex: index,
  };
};

const renderBody = (document: ManuscriptDocument, imageOption: ImageOption): string[] => {
  const lines: string[] = [];
  const listStack: Array<'bullet' | 'ordered'> = [];
  let inReferenceSection = false;

  for (let index = 0; index < document.tokens.length; index += 1) {
    const token = document.tokens[index];
    if (token === undefined) {
      continue;
    }

    if (token.type === 'heading_open') {
      const inline = document.tokens[index + 1];
      const headingText = renderInlineTokens(inline?.children, document, false, imageOption);
      const plainHeading = headingText.replace(/[#\\\[\]\*_]/gu, '').trim().toLowerCase();
      inReferenceSection = /^(references|reference|参考文献)$/u.test(plainHeading);
      const level = Math.max(1, Number(token.tag.replace('h', '')) - 1);
      const marker = '='.repeat(Math.max(1, Math.min(4, level)));
      lines.push(`${marker} ${headingText}`);
      index += 2;
      continue;
    }

    if (token.type === 'paragraph_open') {
      const inline = document.tokens[index + 1];
      const paragraph = renderInlineTokens(inline?.children, document, inReferenceSection, imageOption);
      if (paragraph.length > 0) {
        if (listStack.length > 0) {
          const indent = '  '.repeat(listStack.length - 1);
          const marker = listStack[listStack.length - 1] === 'ordered' ? '+ ' : '- ';
          lines.push(`${indent}${marker}${paragraph}`);
        } else {
          lines.push(paragraph);
        }
      }
      index += 2;
      continue;
    }

    if (token.type === 'bullet_list_open') {
      listStack.push('bullet');
      continue;
    }

    if (token.type === 'ordered_list_open') {
      listStack.push('ordered');
      continue;
    }

    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop();
      lines.push('');
      continue;
    }

    if (token.type === 'blockquote_open') {
      let endIndex = index;
      while (endIndex < document.tokens.length && document.tokens[endIndex]?.type !== 'blockquote_close') {
        endIndex += 1;
      }
      const inline = document.tokens.slice(index, endIndex).find((item) => item.type === 'inline');
      lines.push(`#quote(block: true)[${renderInlineTokens(inline?.children, document, false, imageOption)}]`);
      index = endIndex;
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      if (token.info.trim() === 'typst') {
        lines.push(token.content.replace(/\s+$/u, ''));
      } else {
        lines.push(`#raw(block: true, lang: ${JSON.stringify(token.info.trim() || 'text')}, ${JSON.stringify(token.content.replace(/\s+$/u, ''))})`);
      }
      lines.push('');
      continue;
    }

    if (token.type === 'table_open') {
      const table = renderTable(document.tokens, index, document, imageOption);
      lines.push(table.content);
      lines.push('');
      index = table.nextIndex;
      continue;
    }

    if (token.type === 'footnote_block_open') {
      lines.push('== Notes');
      continue;
    }
  }

  return lines.filter((line, idx, all) => !(line.length === 0 && all[idx - 1] === ''));
};

export const serializeDocumentToTypst = (
  document: ManuscriptDocument,
  templateId: TypstTemplateId,
  imageOption: ImageOption,
): string => {
  const template = getTypstTemplateDefinition(templateId);
  const body = [
    buildFrontMatterCall(document),
    '',
    ...renderBody(document, imageOption),
  ].join('\n');

  return template.render(body).trim();
};

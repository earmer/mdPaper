import type Token from 'markdown-it/lib/token.mjs';
import type { ManuscriptDocument } from '@/services/document/model';
import { renderInlineTokens } from '@/services/typst/render/inline';

const renderTable = (
  tokens: Token[],
  startIndex: number,
  document: ManuscriptDocument,
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
      currentRow.push(renderInlineTokens(token.children, document, false));
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

export const renderBody = (document: ManuscriptDocument): string[] => {
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
      const headingText = renderInlineTokens(inline?.children, document, false);
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
      const paragraph = renderInlineTokens(inline?.children, document, inReferenceSection);
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
      lines.push(`#quote(block: true)[${renderInlineTokens(inline?.children, document, false)}]`);
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
      const table = renderTable(document.tokens, index, document);
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

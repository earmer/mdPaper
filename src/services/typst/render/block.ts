import type { PhrasingContent, RootContent } from 'mdast';
import type { TypstManuscriptDocument } from '@/services/document/typstModel';
import { escapeTypstText, trimParagraph } from '@/services/typst/escape';
import {
  extractPlainTextFromNodes,
  renderInlineNodes,
  type TypstRenderContext,
} from '@/services/typst/render/inline';

interface TypstBlockquoteNode {
  type: 'blockquote';
  children: RootContent[];
}

interface TypstCodeNode {
  type: 'code';
  lang?: string | null;
  value: string;
}

interface TypstFootnoteDefinitionNode {
  type: 'footnoteDefinition';
  identifier: string;
  children: RootContent[];
}

interface TypstHeadingNode {
  type: 'heading';
  depth: number;
  children: PhrasingContent[];
}

interface TypstHtmlNode {
  type: 'html';
  value: string;
}

interface TypstListItemNode {
  type: 'listItem';
  checked?: boolean | null;
  children: RootContent[];
}

interface TypstListNode {
  type: 'list';
  ordered: boolean;
  spread?: boolean | null;
  start?: number | null;
  children: TypstListItemNode[];
}

interface TypstParagraphNode {
  type: 'paragraph';
  children: PhrasingContent[];
}

interface TypstTableCellNode {
  type: 'tableCell';
  children: PhrasingContent[];
}

interface TypstTableRowNode {
  type: 'tableRow';
  children: TypstTableCellNode[];
}

interface TypstTableNode {
  type: 'table';
  children: TypstTableRowNode[];
}

interface BlockRenderState {
  inReferenceSection: boolean;
}

const referenceHeadingPattern = /^(references|reference|参考文献)$/u;

const indentLines = (lines: string[], spaces: number): string[] => {
  const indent = ' '.repeat(spaces);
  return lines.map((line) => (line.length > 0 ? `${indent}${line}` : ''));
};

const compactLines = (lines: string[]): string[] => {
  const trimmed = [...lines];
  while (trimmed[0] === '') {
    trimmed.shift();
  }
  while (trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }

  return trimmed.filter((line, index, all) => !(line.length === 0 && all[index - 1] === ''));
};

const isReferenceHeading = (node: TypstHeadingNode): boolean =>
  referenceHeadingPattern.test(trimParagraph(extractPlainTextFromNodes(node.children)).toLowerCase());

const collectFootnoteDefinitions = (nodes: RootContent[]): Map<string, TypstFootnoteDefinitionNode> => {
  const definitions = new Map<string, TypstFootnoteDefinitionNode>();

  nodes.forEach((node) => {
    if (node.type !== 'footnoteDefinition') {
      return;
    }

    const definition = node as TypstFootnoteDefinitionNode;
    definitions.set(definition.identifier, definition);
  });

  return definitions;
};

const renderParagraph = (
  node: TypstParagraphNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const paragraph = renderInlineNodes(node.children, context, {
    inReferenceSection: state.inReferenceSection,
    stripLeadingReferenceMarker: state.inReferenceSection,
  });

  return paragraph.length > 0 ? [paragraph] : [];
};

const renderHeading = (
  node: TypstHeadingNode,
  context: TypstRenderContext,
): string[] => {
  const headingText = renderInlineNodes(node.children, context, {
    inReferenceSection: false,
  });
  const level = Math.max(1, Math.min(4, node.depth - 1));
  const marker = '='.repeat(level);

  return [`${marker} ${headingText}`.trimEnd()];
};

const renderTable = (
  node: TypstTableNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const rows = node.children.map((row) =>
    row.children.map((cell) => renderInlineNodes(cell.children, context, {
      inReferenceSection: state.inReferenceSection,
    })),
  );
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const rowLines = rows.map((row) => `  [${row.join('], [')}]`).join(',\n');

  return [`#table(columns: ${columns},`, rowLines, ')'];
};

const renderCode = (node: TypstCodeNode): string[] => {
  const content = node.value.replace(/\s+$/u, '');
  if ((node.lang ?? '').trim() === 'typst') {
    return content.length > 0 ? content.split('\n') : [];
  }

  return [`#raw(block: true, lang: ${JSON.stringify((node.lang ?? '').trim() || 'text')}, ${JSON.stringify(content)})`];
};

const renderListItem = (
  node: TypstListItemNode,
  marker: string,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const childBlocks = node.children.filter((child) => child.type !== 'footnoteDefinition' && child.type !== 'definition');
  const taskPrefix = node.checked === true ? '[x] ' : node.checked === false ? '[ ] ' : '';

  if (childBlocks.length === 0) {
    return [`${marker}${taskPrefix}`.trimEnd()];
  }

  const firstChild = childBlocks[0];
  if (firstChild === undefined) {
    return [`${marker}${taskPrefix}`.trimEnd()];
  }

  const restChildren = childBlocks.slice(1);
  const lines: string[] = [];

  if (firstChild.type === 'paragraph') {
    const paragraph = renderInlineNodes((firstChild as TypstParagraphNode).children, context, {
      inReferenceSection: state.inReferenceSection,
      stripLeadingReferenceMarker: state.inReferenceSection,
    });
    const firstLine = `${marker}${taskPrefix}${paragraph}`.trimEnd();
    lines.push(firstLine.length > 0 ? firstLine : marker.trimEnd());
  } else {
    lines.push(`${marker}${taskPrefix}`.trimEnd());
    const renderedFirst = renderBlockNode(firstChild, context, state);
    if (renderedFirst.length > 0) {
      lines.push(...indentLines(renderedFirst, 2));
    }
  }

  restChildren.forEach((child) => {
    const rendered = renderBlockNode(child, context, state);
    if (rendered.length === 0) {
      return;
    }

    if (child.type !== 'list' && lines[lines.length - 1] !== '') {
      lines.push('');
    }

    lines.push(...indentLines(rendered, 2));
  });

  return compactLines(lines);
};

const renderList = (
  node: TypstListNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const lines: string[] = [];
  const start = node.start ?? 1;

  node.children.forEach((child, index) => {
    const marker = node.ordered ? `${start + index}. ` : '- ';
    const rendered = renderListItem(child, marker, context, state);
    if (rendered.length === 0) {
      return;
    }

    if (node.spread && index > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }

    lines.push(...rendered);
  });

  return compactLines(lines);
};

const renderBlockquote = (
  node: TypstBlockquoteNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const innerLines = renderBlocks(node.children, context, {
    inReferenceSection: state.inReferenceSection,
  });
  if (innerLines.length === 0) {
    return [];
  }

  return [
    '#quote(block: true)[',
    ...indentLines(innerLines, 2),
    ']',
  ];
};

const renderHtml = (node: TypstHtmlNode): string[] => {
  const text = trimParagraph(node.value);
  return text.length > 0 ? [escapeTypstText(text)] : [];
};

const renderFallbackBlock = (node: RootContent): string[] => {
  const text = trimParagraph(extractPlainTextFromNodes([node]));
  return text.length > 0 ? [escapeTypstText(text)] : [];
};

const renderBlockNode = (
  node: RootContent,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  if (node.type === 'paragraph') {
    return renderParagraph(node as TypstParagraphNode, context, state);
  }

  if (node.type === 'heading') {
    return renderHeading(node as TypstHeadingNode, context);
  }

  if (node.type === 'blockquote') {
    return renderBlockquote(node as TypstBlockquoteNode, context, state);
  }

  if (node.type === 'list') {
    return renderList(node as TypstListNode, context, state);
  }

  if (node.type === 'code') {
    return renderCode(node as TypstCodeNode);
  }

  if (node.type === 'table') {
    return renderTable(node as TypstTableNode, context, state);
  }

  if (node.type === 'thematicBreak') {
    return ['#line(length: 100%)'];
  }

  if (node.type === 'html') {
    return renderHtml(node as TypstHtmlNode);
  }

  if (node.type === 'footnoteDefinition' || node.type === 'definition') {
    return [];
  }

  return renderFallbackBlock(node);
};

const renderBlocks = (
  nodes: RootContent[],
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const lines: string[] = [];
  let inReferenceSection = state.inReferenceSection;

  nodes.forEach((node) => {
    if (node.type === 'footnoteDefinition' || node.type === 'definition') {
      return;
    }

    const rendered = renderBlockNode(node, context, {
      inReferenceSection,
    });
    if (rendered.length > 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(...rendered);
    }

    if (node.type === 'heading') {
      inReferenceSection = isReferenceHeading(node as TypstHeadingNode);
    }
  });

  return compactLines(lines);
};

export const renderBody = (document: TypstManuscriptDocument): string[] => {
  const context: TypstRenderContext = {
    document,
    footnoteDefinitions: collectFootnoteDefinitions(document.ast.children),
    renderedFootnotes: new Set<string>(),
  };

  return renderBlocks(document.ast.children, context, {
    inReferenceSection: false,
  });
};

import type { RootContent } from 'mdast';
import type { Math as MdastMath } from 'mdast-util-math';
import type { TypstManuscriptDocument } from '@/services/document/typstModel';
import { escapeTypstPlainText, escapeTypstText, trimParagraph } from '@/services/typst/escape';
import { readMiTexConversionResult } from '@/services/typst/mitex';
import {
  extractPlainTextFromNodes,
  renderInlineNodes,
  type TypstInlineNode,
  type TypstRenderContext,
} from '@/services/typst/render/inline';

interface TypstPositionPoint {
  line?: number;
}

interface TypstNodePosition {
  start?: TypstPositionPoint;
  end?: TypstPositionPoint;
}

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
  children: TypstInlineNode[];
}

interface TypstHtmlNode {
  type: 'html';
  value: string;
}

interface TypstListItemNode {
  type: 'listItem';
  checked?: boolean | null;
  children: RootContent[];
  position?: TypstNodePosition;
}

interface TypstListNode {
  type: 'list';
  ordered: boolean;
  spread?: boolean | null;
  start?: number | null;
  children: TypstListItemNode[];
}

interface TypstMathNode extends MdastMath {
  type: 'math';
}

interface TypstParagraphNode {
  type: 'paragraph';
  children: TypstInlineNode[];
}

interface TypstTableCellNode {
  type: 'tableCell';
  children: TypstInlineNode[];
}

interface TypstTableRowNode {
  type: 'tableRow';
  children: TypstTableCellNode[];
}

interface TypstTableNode {
  type: 'table';
  align?: Array<'left' | 'right' | 'center' | null> | null;
  children: TypstTableRowNode[];
}

interface BlockRenderState {
  inReferenceSection: boolean;
}

const referenceHeadingPattern = /^(references|reference|参考文献)$/u;
const orderedListMarkerPattern = /^\s*(\d+)[.)]\s+/u;

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

const getLineNumber = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getNodeStartLine = (node: { position?: TypstNodePosition }): number | null =>
  getLineNumber(node.position?.start?.line);

const getNodeEndLine = (node: { position?: TypstNodePosition }): number | null =>
  getLineNumber(node.position?.end?.line);

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

const normalizeTableAlign = (
  align: TypstTableNode['align'],
  columns: number,
): string[] => {
  const values = align ?? [];
  return Array.from({ length: columns }, (_item, index) => values[index] ?? 'auto');
};

const renderTableCell = (content: string): string => `[${content}]`;

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
  const aligned = normalizeTableAlign(node.align, columns);
  const paddedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columns - row.length }, () => ''),
  ]);
  const lines = ['#table(', `  columns: ${columns},`];

  if (aligned.some((item) => item !== 'auto')) {
    lines.push(`  align: (${aligned.join(', ')}),`);
  }

  const headerRow = paddedRows[0];
  if (headerRow !== undefined) {
    lines.push(`  table.header(${headerRow.map((cell) => renderTableCell(cell)).join(', ')}),`);
  }

  paddedRows.slice(1).forEach((row) => {
    lines.push(`  ${row.map((cell) => renderTableCell(cell)).join(', ')},`);
  });

  lines.push(')');
  return lines;
};

const renderCode = (node: TypstCodeNode): string[] => {
  const content = node.value.replace(/\s+$/u, '');
  if ((node.lang ?? '').trim() === 'typst') {
    return content.length > 0 ? content.split('\n') : [];
  }

  return [`#raw(block: true, lang: ${JSON.stringify((node.lang ?? '').trim() || 'text')}, ${JSON.stringify(content)})`];
};

const filterRenderableListItemBlocks = (node: TypstListItemNode): RootContent[] =>
  node.children.filter((child) => child.type !== 'footnoteDefinition' && child.type !== 'definition');

const wrapContentBlock = (lines: string[]): string[] => {
  const compacted = compactLines(lines);
  if (compacted.length === 0) {
    return ['[]'];
  }

  if (compacted.length === 1) {
    return [`[${compacted[0]}]`];
  }

  return [
    '[',
    ...indentLines(compacted, 2),
    ']',
  ];
};

const formatFunctionArgument = (lines: string[]): string[] => {
  if (lines.length === 0) {
    return ['  [],'];
  }

  if (lines.length === 1) {
    return [`  ${lines[0]},`];
  }

  const formatted = [...lines];
  formatted[formatted.length - 1] = `${formatted[formatted.length - 1]},`;
  return indentLines(formatted, 2);
};

const applyTaskPrefix = (lines: string[], node: TypstListItemNode): string[] => {
  const prefix = node.checked === true ? '[x] ' : node.checked === false ? '[ ] ' : '';
  if (prefix.length === 0) {
    return lines;
  }

  const nextLines = [...lines];
  const firstContentIndex = nextLines.findIndex((line) => line.length > 0);
  if (firstContentIndex === -1) {
    return [prefix.trimEnd()];
  }

  nextLines[firstContentIndex] = `${prefix}${nextLines[firstContentIndex]}`;
  return nextLines;
};

const renderListItemBlock = (
  node: TypstListItemNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const childBlocks = filterRenderableListItemBlocks(node);
  if (childBlocks.length === 0) {
    return wrapContentBlock(applyTaskPrefix([], node));
  }

  const rendered = renderBlocks(childBlocks, context, state);
  return wrapContentBlock(applyTaskPrefix(rendered, node));
};

const hasListGap = (previous: TypstListItemNode, next: TypstListItemNode): boolean => {
  const previousEnd = getNodeEndLine(previous);
  const nextStart = getNodeStartLine(next);
  return previousEnd !== null && nextStart !== null && nextStart - previousEnd > 1;
};

const splitListSegments = (items: TypstListItemNode[]): TypstListItemNode[][] => {
  const segments: TypstListItemNode[][] = [];
  let current: TypstListItemNode[] = [];

  items.forEach((item, index) => {
    const previous = items[index - 1];
    if (previous !== undefined && hasListGap(previous, item) && current.length > 0) {
      segments.push(current);
      current = [];
    }

    current.push(item);
  });

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
};

const readOrderedSegmentStart = (
  firstItem: TypstListItemNode,
  fallback: number,
  document: TypstManuscriptDocument,
): number => {
  const startLine = getNodeStartLine(firstItem);
  if (startLine === null) {
    return fallback;
  }

  const sourceLine = document.normalizedSource.split(/\r?\n/u)[startLine - 1] ?? '';
  const matched = sourceLine.match(orderedListMarkerPattern);
  if (matched === null) {
    return fallback;
  }

  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const renderListSegment = (
  items: TypstListItemNode[],
  node: TypstListNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const lines = [node.ordered ? '#enum(' : '#list('];
  if (node.ordered) {
    const fallbackStart = node.start ?? 1;
    const firstItem = items[0];
    const start = firstItem === undefined
      ? fallbackStart
      : readOrderedSegmentStart(firstItem, fallbackStart, context.document);
    if (start !== 1) {
      lines.push(`  start: ${start},`);
    }
  }

  items.forEach((item) => {
    lines.push(...formatFunctionArgument(renderListItemBlock(item, context, state)));
  });

  lines.push(')');
  return lines;
};

const renderList = (
  node: TypstListNode,
  context: TypstRenderContext,
  state: BlockRenderState,
): string[] => {
  const segments = splitListSegments(node.children);
  const lines: string[] = [];

  segments.forEach((segment, index) => {
    if (segment.length === 0) {
      return;
    }

    if (index > 0) {
      lines.push('');
    }

    lines.push(...renderListSegment(segment, node, context, state));
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

const renderMiTexErrorBlock = (value: string): string[] => [
  `#text(fill: red)[${escapeTypstPlainText(value)}]`,
];

const renderMathBlock = (node: TypstMathNode): string[] => {
  const converted = readMiTexConversionResult(node);
  if (converted?.status !== 'ok') {
    const raw = converted?.raw ?? node.value;
    return renderMiTexErrorBlock(`$$${raw}$$`);
  }

  const lines = converted.code.split(/\r?\n/gu);
  if (lines.length === 1) {
    return [`#math.equation(block: true, $${lines[0]}$)`];
  }

  return [
    '#math.equation(block: true,',
    '  $',
    ...indentLines(lines, 2),
    '  $',
    ')',
  ];
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

  if (node.type === 'math') {
    return renderMathBlock(node as TypstMathNode);
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

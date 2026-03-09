import type { PhrasingContent, RootContent } from 'mdast';
import type { InlineMath } from 'mdast-util-math';
import type { TypstManuscriptDocument } from '@/services/document/typstModel';
import {
  replaceCitationSyntax,
  stripReferenceMarker,
} from '@/services/document/citation';
import {
  escapeTypstPlainText,
  escapeTypstText,
  trimParagraph,
} from '@/services/typst/escape';
import { readMiTexConversionResult } from '@/services/typst/mitex';

interface TypstDeleteNode {
  type: 'delete';
  children: TypstInlineNode[];
}

interface TypstFootnoteDefinitionNode {
  type: 'footnoteDefinition';
  identifier: string;
  children: RootContent[];
}

interface TypstFootnoteReferenceNode {
  type: 'footnoteReference';
  identifier: string;
}

interface TypstImageNode {
  type: 'image';
  alt?: string | null;
  title?: string | null;
  url: string;
}

interface TypstInlineCodeNode {
  type: 'inlineCode';
  value: string;
}

interface TypstInlineMathNode extends InlineMath {
  type: 'inlineMath';
}

interface TypstLinkNode {
  type: 'link';
  children: TypstInlineNode[];
  url: string;
}

interface TypstLiteralNode {
  type: 'text' | 'html' | 'code';
  value: string;
}

interface TypstParentNode {
  type: 'emphasis' | 'strong';
  children: TypstInlineNode[];
}

export interface TypstScriptNode {
  type: 'subscript' | 'superscript';
  children: TypstInlineNode[];
}

export type TypstInlineNode = PhrasingContent | TypstInlineMathNode | TypstScriptNode;

interface InlineRenderOptions {
  inReferenceSection: boolean;
  stripLeadingReferenceMarker?: boolean;
}

export interface TypstRenderContext {
  document: TypstManuscriptDocument;
  footnoteDefinitions: Map<string, TypstFootnoteDefinitionNode>;
  renderedFootnotes: Set<string>;
}

type PlainTextNode = {
  type: string;
  value?: string;
  alt?: string | null;
  identifier?: string;
  children?: PlainTextNode[];
};

const hasChildren = (node: PlainTextNode): node is PlainTextNode & { children: PlainTextNode[] } =>
  Array.isArray(node.children);

const normalizeInlineText = (value: string): string => value.replace(/\r?\n/gu, ' ');

const renderCitations = (input: string, document: TypstManuscriptDocument): string =>
  replaceCitationSyntax(input, document.citations, (match) => escapeTypstText(match.label));

const buildImageBlock = (src: string, alt: string, title: string): string => {
  if (src.trim().length === 0) {
    return escapeTypstText(alt);
  }

  if (src.startsWith('asset://')) {
    return [
      '#figure(',
      '  [Inline image asset omitted in Typst preview/export.],',
      title.length > 0 ? `  caption: [${escapeTypstText(title)}],` : '',
      ')',
    ].filter((item) => item.length > 0).join('\n');
  }

  return [
    '#figure(',
    `  image(${JSON.stringify(src)}),`,
    title.length > 0 ? `  caption: [${escapeTypstText(title)}],` : '',
    ')',
  ].filter((item) => item.length > 0).join('\n');
};

const buildFootnoteLabel = (identifier: string): string => {
  const sanitized = identifier
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return `mdp-fn-${sanitized.length > 0 ? sanitized : 'note'}`;
};

const renderFootnoteContent = (
  definition: TypstFootnoteDefinitionNode,
  context: TypstRenderContext,
): string => {
  const parts = definition.children
    .map((child) => {
      if (child.type === 'paragraph') {
        return renderInlineNodes(child.children, context, {
          inReferenceSection: false,
        });
      }

      if (child.type === 'code') {
        const node = child as TypstLiteralNode & { lang?: string | null };
        return `#raw(block: true, lang: ${JSON.stringify(node.lang?.trim() || 'text')}, ${JSON.stringify(node.value.replace(/\s+$/u, ''))})`;
      }

      return trimParagraph(extractPlainTextFromNodes([child]));
    })
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parts.join('; ');
};

const renderTextValue = (
  value: string,
  context: TypstRenderContext,
  options: InlineRenderOptions,
  stripLeadingReferenceMarker: boolean,
): string => {
  let normalized = normalizeInlineText(value);
  if (stripLeadingReferenceMarker) {
    normalized = stripReferenceMarker(normalized);
  }

  const escaped = escapeTypstText(normalized);
  return options.inReferenceSection ? escaped : renderCitations(escaped, context.document);
};

const renderFallbackText = (
  value: string,
  context: TypstRenderContext,
  options: InlineRenderOptions,
  stripLeadingReferenceMarker: boolean,
): string => renderTextValue(value, context, options, stripLeadingReferenceMarker);

const renderMiTexErrorText = (value: string): string =>
  `#text(fill: red)[${escapeTypstPlainText(value)}]`;

const renderInlineMath = (node: TypstInlineMathNode): string => {
  const converted = readMiTexConversionResult(node);
  if (converted?.status === 'ok') {
    return `$${converted.code}$`;
  }

  const raw = converted?.raw ?? node.value;
  return renderMiTexErrorText(`$${raw}$`);
};

export const extractPlainTextFromNode = (node: PlainTextNode): string => {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'html' || node.type === 'code') {
    return normalizeInlineText(node.value ?? '');
  }

  if (node.type === 'image') {
    return normalizeInlineText(node.alt ?? '');
  }

  if (node.type === 'inlineMath') {
    return normalizeInlineText(`$${node.value ?? ''}$`);
  }

  if (node.type === 'math') {
    return normalizeInlineText(`$$${node.value ?? ''}$$`);
  }

  if (node.type === 'break') {
    return ' ';
  }

  if (node.type === 'footnoteReference') {
    return `[^${node.identifier ?? ''}]`;
  }

  if (!hasChildren(node)) {
    return '';
  }

  return node.children.map((child) => extractPlainTextFromNode(child)).join('');
};

export const extractPlainTextFromNodes = (
  nodes: Array<RootContent | TypstInlineNode> | null | undefined,
): string => {
  if (nodes === undefined || nodes === null) {
    return '';
  }

  return nodes.map((node) => extractPlainTextFromNode(node as PlainTextNode)).join('');
};

export const renderInlineNodes = (
  nodes: TypstInlineNode[] | null | undefined,
  context: TypstRenderContext,
  options: InlineRenderOptions,
): string => {
  if (nodes === undefined || nodes === null) {
    return '';
  }

  let content = '';
  let shouldStripReferenceMarker = options.stripLeadingReferenceMarker === true;

  nodes.forEach((node) => {
    if (node.type === 'text') {
      content += renderTextValue(node.value, context, options, shouldStripReferenceMarker);
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'inlineMath') {
      content += renderInlineMath(node as TypstInlineMathNode);
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'inlineCode') {
      const inlineCode = node as TypstInlineCodeNode;
      content += `#raw(${JSON.stringify(inlineCode.value)})`;
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'break') {
      content += ' ';
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'emphasis' || node.type === 'strong') {
      const parent = node as TypstParentNode;
      const inner = renderInlineNodes(parent.children, context, {
        inReferenceSection: options.inReferenceSection,
      });
      const command = node.type === 'emphasis' ? 'emph' : 'strong';
      content += `#${command}[${inner}]`;
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'delete') {
      const deleted = node as TypstDeleteNode;
      const inner = renderInlineNodes(deleted.children, context, {
        inReferenceSection: options.inReferenceSection,
      });
      content += `#strike[${inner}]`;
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'superscript' || node.type === 'subscript') {
      const script = node as TypstScriptNode;
      const inner = renderInlineNodes(script.children, context, {
        inReferenceSection: options.inReferenceSection,
      });
      const command = node.type === 'superscript' ? 'super' : 'sub';
      content += `#${command}[${inner}]`;
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'link') {
      const link = node as TypstLinkNode;
      const inner = renderInlineNodes(link.children, context, {
        inReferenceSection: options.inReferenceSection,
      });
      content += `#link(${JSON.stringify(link.url)})[${inner}]`;
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'image') {
      const image = node as TypstImageNode;
      content += buildImageBlock(image.url, (image.alt ?? '').trim(), (image.title ?? '').trim());
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'footnoteReference') {
      const reference = node as TypstFootnoteReferenceNode;
      const definition = context.footnoteDefinitions.get(reference.identifier);
      if (definition === undefined) {
        content += renderFallbackText(`[^${reference.identifier}]`, context, options, shouldStripReferenceMarker);
      } else if (context.renderedFootnotes.has(reference.identifier)) {
        content += `#footnote(<${buildFootnoteLabel(reference.identifier)}>)`;
      } else {
        context.renderedFootnotes.add(reference.identifier);
        content += `#footnote[${renderFootnoteContent(definition, context)}] <${buildFootnoteLabel(reference.identifier)}>`;
      }
      shouldStripReferenceMarker = false;
      return;
    }

    if (node.type === 'html') {
      const html = node as TypstLiteralNode;
      content += renderFallbackText(html.value, context, options, shouldStripReferenceMarker);
      shouldStripReferenceMarker = false;
      return;
    }

    const fallback = extractPlainTextFromNodes([node]);
    content += renderFallbackText(fallback, context, options, shouldStripReferenceMarker);
    shouldStripReferenceMarker = false;
  });

  return trimParagraph(content);
};

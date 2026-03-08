import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import footnote from 'markdown-it-footnote';
import katex from 'markdown-it-katex';
import linkAttributes from 'markdown-it-link-attributes';
import hljs from 'highlight.js';
import type { CitationRegistry } from '@/services/document/citation';
import {
  getCitationDisplay,
  isWithinReferenceSection,
  normalizeCitationKeys,
} from '@/services/document/citation';
import { normalizeMathInMarkdown } from '@/services/markdown/normalizeMath';
import { sanitizeHtml } from '@/services/markdown/sanitize';
import { normalizeAutoNumbers } from '@/services/markdown/postprocess/autoNumbers';
import { normalizeFigureAndTableCaptions } from '@/services/markdown/postprocess/captions';
import { normalizeDisplayMathParagraph } from '@/services/markdown/postprocess/displayMath';
import { normalizeJournalHeadings } from '@/services/markdown/postprocess/headings';
import { normalizeReferenceLists } from '@/services/markdown/postprocess/references';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang.length > 0 && hljs.getLanguage(lang)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`;
    }

    return `<pre class="hljs"><code>${hljs.highlightAuto(code).value}</code></pre>`;
  },
});

markdown.use(katex, {
  throwOnError: false,
  errorColor: '#c0392b',
});
markdown.use(footnote);
markdown.use(linkAttributes, {
  matcher: (href: string) => /^(https?:)?\/\//.test(href),
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
});

interface MarkdownRenderEnv {
  resolveImageSrc?: (source: string) => string | null;
  citationRegistry?: CitationRegistry;
}

const sourceLineAttr = 'data-source-line';

const escapeHtml = (text: string): string => markdown.utils.escapeHtml(text);

const attachSourceLineAttrs = (tokens: Token[]): void => {
  tokens.forEach((token) => {
    if (token.map === null || token.map === undefined) {
      return;
    }

    const [start] = token.map;
    if (typeof start !== 'number' || Number.isNaN(start)) {
      return;
    }

    if (token.nesting !== 1 && token.type !== 'fence' && token.type !== 'code_block') {
      return;
    }

    token.attrSet(sourceLineAttr, String(start + 1));
  });
};

const resolveImageSrcByEnv = (source: string, env: unknown): string => {
  if (typeof env !== 'object' || env === null) {
    return source;
  }

  const maybeEnv = env as MarkdownRenderEnv;
  if (typeof maybeEnv.resolveImageSrc !== 'function') {
    return source;
  }

  const resolved = maybeEnv.resolveImageSrc(source);
  if (typeof resolved !== 'string' || resolved.trim().length === 0) {
    return source;
  }

  return resolved;
};

const defaultImageRender = markdown.renderer.rules.image;
const defaultFenceRender = markdown.renderer.rules.fence;
const defaultCodeBlockRender = markdown.renderer.rules.code_block;

const createHtmlInlineToken = (content: string): Token => {
  const token = new Token('html_inline', '', 0);
  token.content = content;
  return token;
};

const createTextToken = (content: string): Token => {
  const token = new Token('text', '', 0);
  token.content = content;
  return token;
};

const buildCitationInlineToken = (
  rawKeys: string,
  registry: CitationRegistry,
): Token => {
  const match = getCitationDisplay(normalizeCitationKeys(rawKeys), registry);
  const classes = ['md-citation'];
  if (match.missingKeys.length > 0) {
    classes.push('md-citation--missing');
  }

  return createHtmlInlineToken(
    `<span class="${classes.join(' ')}">${escapeHtml(match.label)}</span>`,
  );
};

const applyCitationTokens = (tokens: Token[], registry: CitationRegistry | undefined): void => {
  if (registry === undefined) {
    return;
  }

  const citationPattern = /(\[@[^\]]+(?:;\s*@[A-Za-z0-9:_-]+)*\])/gu;

  tokens.forEach((token) => {
    if (token.type !== 'inline' || !Array.isArray(token.children) || token.map === null) {
      return;
    }

    const lineStart = token.map[0] + 1;
    if (isWithinReferenceSection(lineStart, registry)) {
      return;
    }

    const transformed: Token[] = [];
    token.children.forEach((child) => {
      if (child.type !== 'text') {
        transformed.push(child);
        return;
      }

      const segments = child.content.split(citationPattern);
      segments.forEach((segment) => {
        if (segment.length === 0) {
          return;
        }

        if (!segment.startsWith('[@')) {
          transformed.push(createTextToken(segment));
          return;
        }

        transformed.push(buildCitationInlineToken(segment.slice(2, -1), registry));
      });
    });

    token.children = transformed;
  });
};

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token === undefined) {
    return '';
  }

  const src = token.attrGet('src') ?? '';
  const title = token.attrGet('title') ?? '';
  const alt = token.content || self.renderInlineAsText(token.children ?? [], options, env);
  const safeAlt = escapeHtml(alt);
  const resolvedSrc = resolveImageSrcByEnv(src, env);
  const safeSrc = escapeHtml(resolvedSrc);
  const safeTitle = escapeHtml(title);

  if (resolvedSrc.length === 0) {
    return defaultImageRender?.(tokens, idx, options, env, self) ?? '';
  }

  const captionHtml = safeTitle.length > 0
    ? `<figcaption class="md-figure-caption">${safeTitle}</figcaption>`
    : '';

  return `<figure class="md-figure"><img src="${safeSrc}" alt="${safeAlt}" loading="eager" decoding="async" />${captionHtml}</figure>`;
};

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token === undefined) {
    return '';
  }

  if (token.info.trim() !== 'typst') {
    return defaultFenceRender?.(tokens, idx, options, env, self)
      ?? self.renderToken(tokens, idx, options);
  }

  const sourceLine = token.attrGet(sourceLineAttr);
  const attrs = sourceLine !== null ? ` ${sourceLineAttr}="${sourceLine}"` : '';
  const content = escapeHtml(token.content);

  return [
    `<div class="md-typst-block"${attrs}>`,
    '  <div class="md-typst-block__label">Typst only</div>',
    `  <pre class="hljs language-typst"><code>${content}</code></pre>`,
    '</div>',
  ].join('');
};

markdown.renderer.rules.code_block = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token === undefined) {
    return '';
  }

  return defaultCodeBlockRender?.(tokens, idx, options, env, self)
    ?? `<pre${self.renderAttrs(token)}><code>${escapeHtml(token.content)}</code></pre>`;
};

export interface RenderMarkdownOptions {
  normalizeJournalHeadings?: boolean;
  resolveImageSrc?: (source: string) => string | null;
  citationRegistry?: CitationRegistry;
}

export { markdown };

export const renderMarkdown = (source: string, options: RenderMarkdownOptions = {}): string => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const env = {
    resolveImageSrc: options.resolveImageSrc,
    citationRegistry: options.citationRegistry,
  } satisfies MarkdownRenderEnv;
  const tokens = markdown.parse(normalizedSource, env);
  attachSourceLineAttrs(tokens);
  applyCitationTokens(tokens, options.citationRegistry);

  const rendered = markdown.renderer.render(tokens, markdown.options, env);
  const postprocessed = [
    normalizeDisplayMathParagraph,
    normalizeFigureAndTableCaptions,
    normalizeAutoNumbers,
    normalizeReferenceLists,
  ].reduce((html, transform) => transform(html), rendered);
  const normalizedHeadingHtml = options.normalizeJournalHeadings
    ? normalizeJournalHeadings(postprocessed)
    : postprocessed;

  return sanitizeHtml(normalizedHeadingHtml);
};

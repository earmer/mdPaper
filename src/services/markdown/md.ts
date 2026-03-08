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
  stripReferenceMarker,
} from '@/services/document/citation';
import { normalizeMathInMarkdown } from '@/services/markdown/normalizeMath';
import { sanitizeHtml } from '@/services/markdown/sanitize';

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

const applyCitationTokens = (tokens: Token[], registry: CitationRegistry | undefined): void => {
  if (registry === undefined) {
    return;
  }

  tokens.forEach((token) => {
    if (token.type !== 'inline' || !Array.isArray(token.children) || token.map === null) {
      return;
    }

    const lineStart = (token.map?.[0] ?? 0) + 1;
    if (isWithinReferenceSection(lineStart, registry)) {
      return;
    }

    const transformed: Token[] = [];
    token.children.forEach((child) => {
      if (child.type !== 'text') {
        transformed.push(child);
        return;
      }

      const segments = child.content.split(/(\[@[^\]]+(?:;\s*@[A-Za-z0-9:_-]+)*\])/gu);
      segments.forEach((segment) => {
        if (segment.length === 0) {
          return;
        }

        if (!/^\[@/u.test(segment)) {
          transformed.push(createTextToken(segment));
          return;
        }

        const match = getCitationDisplay(
          segment
            .slice(2, -1)
            .split(';')
            .map((item) => item.trim())
            .map((item) => item.startsWith('@') ? item.slice(1) : item)
            .filter((item) => item.length > 0),
          registry,
        );
        const classes = ['md-citation'];
        if (match.missingKeys.length > 0) {
          classes.push('md-citation--missing');
        }
        transformed.push(
          createHtmlInlineToken(
            `<span class="${classes.join(' ')}">${escapeHtml(match.label)}</span>`,
          ),
        );
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

const stripHeadingOrdinal = (input: string, expectedDepth: 1 | 2 | 3): string => {
  const text = input.trim();
  if (text.length === 0) {
    return '';
  }

  const sectionPattern = new RegExp(
    `^\\s*\\d+(?:\\.\\d+){${Math.max(0, expectedDepth - 1)}}(?:[.．、:：)\\-])?\\s*`,
    'u',
  );
  const cleaned = text.replace(sectionPattern, '').trim();
  return cleaned.length > 0 ? cleaned : text;
};

const normalizeJournalHeadings = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const headings = template.content.querySelectorAll<HTMLElement>('h2, h3, h4');
  let level2 = 0;
  let level3 = 0;
  let level4 = 0;

  headings.forEach((heading) => {
    const raw = (heading.textContent ?? '').replace(/\s+/gu, ' ').trim();
    if (raw.length === 0) {
      return;
    }

    if (/^(appendix\b|part\s+[IVXLCDM]+\b|附录)/iu.test(raw)) {
      heading.classList.add('journal-heading-appendix');
      return;
    }

    let headingNumber = '';
    let headingText = raw;
    const tagName = heading.tagName.toLowerCase();
    if (tagName === 'h2') {
      level2 += 1;
      level3 = 0;
      level4 = 0;
      headingNumber = `${level2}`;
      headingText = stripHeadingOrdinal(raw, 1);
    } else if (tagName === 'h3') {
      if (level2 === 0) {
        level2 = 1;
      }
      level3 += 1;
      level4 = 0;
      headingNumber = `${level2}.${level3}`;
      headingText = stripHeadingOrdinal(raw, 2);
    } else if (tagName === 'h4') {
      if (level2 === 0) {
        level2 = 1;
      }
      if (level3 === 0) {
        level3 = 1;
      }
      level4 += 1;
      headingNumber = `${level2}.${level3}.${level4}`;
      headingText = stripHeadingOrdinal(raw, 3);
    }

    if (headingNumber.length === 0) {
      return;
    }

    heading.classList.add('journal-heading-numbered');
    heading.innerHTML = [
      `<span class="journal-heading-number">${escapeHtml(headingNumber)}</span>`,
      `<span class="journal-heading-title">${escapeHtml(headingText)}</span>`,
    ].join('');
  });

  return template.innerHTML;
};

const normalizeFigureAndTableCaptions = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const figureCaptionPattern = /^(?:figure|fig\.?|图)\s*(?:[A-Za-z]?\d+(?:[.\-]\d+)*)?\s*(?:[:：.．、\-])?\s*(.+)$/iu;
  const template = document.createElement('template');
  template.innerHTML = html;

  const extractCaption = (text: string, pattern: RegExp): string => {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    const matched = normalized.match(pattern);
    return matched?.[1]?.trim() ?? '';
  };

  const figures = template.content.querySelectorAll<HTMLElement>('.md-figure');
  figures.forEach((figure) => {
    let captionText = '';
    const nextSibling = figure.nextElementSibling;
    if (nextSibling instanceof HTMLElement && nextSibling.tagName === 'P') {
      const explicitCaption = extractCaption(nextSibling.textContent ?? '', figureCaptionPattern);
      if (explicitCaption.length > 0) {
        captionText = explicitCaption;
        nextSibling.remove();
      }
    }

    if (captionText.length === 0) {
      captionText = (figure.querySelector<HTMLElement>('figcaption')?.textContent ?? '').trim();
    }

    if (captionText.length === 0) {
      return;
    }

    let figureCaption = figure.querySelector<HTMLElement>('figcaption');
    if (figureCaption === null) {
      figureCaption = document.createElement('figcaption');
      figure.appendChild(figureCaption);
    }
    figureCaption.classList.add('md-figure-caption');
    figureCaption.textContent = captionText;
  });

  return template.innerHTML;
};

const normalizeReferenceLists = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const headings = template.content.querySelectorAll<HTMLElement>('h2, h3, h4');
  headings.forEach((heading) => {
    const headingText = (heading.textContent ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
    if (!/^(references|reference|参考文献)$/u.test(headingText)) {
      return;
    }

    const next = heading.nextElementSibling;
    if (!(next instanceof HTMLElement) || (next.tagName !== 'OL' && next.tagName !== 'UL')) {
      return;
    }

    const target = next.tagName === 'OL' ? next : document.createElement('ol');
    target.classList.add('md-reference-list');

    if (next.tagName === 'UL') {
      Array.from(next.children).forEach((child) => {
        if (child.tagName === 'LI') {
          target.appendChild(child.cloneNode(true));
        }
      });
      next.replaceWith(target);
    }

    target.querySelectorAll('li').forEach((item) => {
      item.textContent = stripReferenceMarker(item.textContent ?? '');
    });
  });

  return template.innerHTML;
};

const normalizeDisplayMathParagraph = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  const paragraphs = template.content.querySelectorAll('p');

  paragraphs.forEach((paragraph) => {
    const meaningfulChildren = Array.from(paragraph.childNodes).filter((node) => {
      if (node.nodeType !== Node.TEXT_NODE) {
        return true;
      }

      return (node.textContent ?? '').trim().length > 0;
    });

    if (meaningfulChildren.length !== 1) {
      return;
    }

    const onlyChild = meaningfulChildren[0];
    if (!(onlyChild instanceof HTMLElement) || !onlyChild.classList.contains('katex-display')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'katex-display-block';
    wrapper.appendChild(onlyChild);
    paragraph.replaceWith(wrapper);
  });

  return template.innerHTML;
};

const normalizeAutoNumbers = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const figures = template.content.querySelectorAll<HTMLElement>('.md-figure, figure');
  figures.forEach((figure, index) => {
    const number = String(index + 1);
    figure.setAttribute('data-figure-number', number);

    const caption = figure.querySelector<HTMLElement>('figcaption, .md-figure-caption');
    caption?.setAttribute('data-figure-number', number);
  });

  const tableCaptions = template.content.querySelectorAll<HTMLElement>('.md-table-caption, table > caption');
  tableCaptions.forEach((caption, index) => {
    caption.setAttribute('data-table-number', String(index + 1));
  });

  const displayMathBlocks = template.content.querySelectorAll<HTMLElement>('.katex-display-block');
  displayMathBlocks.forEach((block, index) => {
    block.setAttribute('data-equation-number', String(index + 1));
  });

  return template.innerHTML;
};

export interface RenderMarkdownOptions {
  normalizeJournalHeadings?: boolean;
  resolveImageSrc?: (source: string) => string | null;
  citationRegistry?: CitationRegistry;
}

export { markdown };

export const renderMarkdown = (source: string, options: RenderMarkdownOptions = {}): string => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const tokens = markdown.parse(normalizedSource, {
    resolveImageSrc: options.resolveImageSrc,
    citationRegistry: options.citationRegistry,
  } satisfies MarkdownRenderEnv);
  attachSourceLineAttrs(tokens);
  applyCitationTokens(tokens, options.citationRegistry);

  const rendered = markdown.renderer.render(tokens, markdown.options, {
    resolveImageSrc: options.resolveImageSrc,
    citationRegistry: options.citationRegistry,
  } satisfies MarkdownRenderEnv);
  const normalizedDisplayMath = normalizeDisplayMathParagraph(rendered);
  const normalizedCaptions = normalizeFigureAndTableCaptions(normalizedDisplayMath);
  const normalizedAutoNumbers = normalizeAutoNumbers(normalizedCaptions);
  const normalizedReferences = normalizeReferenceLists(normalizedAutoNumbers);
  const normalizedHeadingHtml = options.normalizeJournalHeadings
    ? normalizeJournalHeadings(normalizedReferences)
    : normalizedReferences;
  return sanitizeHtml(normalizedHeadingHtml);
};

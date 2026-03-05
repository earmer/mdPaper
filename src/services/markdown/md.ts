import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import katex from 'markdown-it-katex';
import linkAttributes from 'markdown-it-link-attributes';
import hljs from 'highlight.js';
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
}

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

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token === undefined) {
    return '';
  }

  const src = token.attrGet('src') ?? '';
  const title = token.attrGet('title') ?? '';
  const alt = token.content || self.renderInlineAsText(token.children ?? [], options, env);
  const safeAlt = markdown.utils.escapeHtml(alt);
  const resolvedSrc = resolveImageSrcByEnv(src, env);
  const safeSrc = markdown.utils.escapeHtml(resolvedSrc);
  const safeTitle = markdown.utils.escapeHtml(title);

  if (resolvedSrc.length === 0) {
    return defaultImageRender?.(tokens, idx, options, env, self) ?? '';
  }

  const caption = safeTitle.length > 0 ? safeTitle : safeAlt;
  const captionHtml = caption.length > 0 ? `<figcaption class="md-figure-caption">${caption}</figcaption>` : '';

  return `<figure class="md-figure"><img src="${safeSrc}" alt="${safeAlt}" loading="eager" decoding="async" />${captionHtml}</figure>`;
};

const escapeHtml = (text: string): string => markdown.utils.escapeHtml(text);

const stripHeadingOrdinal = (
  input: string,
  expectedDepth: 1 | 2 | 3,
): string => {
  const text = input.trim();
  if (text.length === 0) {
    return '';
  }

  const sectionPattern = new RegExp(
    `^\\s*\\d+(?:\\.\\d+){${Math.max(0, expectedDepth - 1)}}(?:[.．、:：)\\-])?\\s*`,
    'u',
  );
  const cleaned = text.replace(sectionPattern, '').trim();
  if (cleaned.length === 0) {
    return text;
  }

  return cleaned;
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
    const raw = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
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

    if (headingText.length === 0) {
      headingText = raw;
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

  const figureCaptionPattern = /^(?:figure|fig\.?|图)\s*(?:\d+)?\s*[:：]\s*(.+)$/iu;
  const tableCaptionPattern = /^(?:table|表)\s*(?:\d+)?\s*[:：]\s*(.+)$/iu;
  const template = document.createElement('template');
  template.innerHTML = html;

  const extractCaption = (text: string, pattern: RegExp): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) {
      return '';
    }

    const matched = normalized.match(pattern);
    if (matched === null) {
      return '';
    }

    return (matched[1] ?? '').trim();
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
      const existingCaption = figure.querySelector<HTMLElement>('figcaption');
      captionText = (existingCaption?.textContent ?? '').trim();
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

  const tables = template.content.querySelectorAll<HTMLElement>('table');
  tables.forEach((table) => {
    const previous = table.previousElementSibling;
    if (!(previous instanceof HTMLElement) || previous.tagName !== 'P') {
      return;
    }

    const captionText = extractCaption(previous.textContent ?? '', tableCaptionPattern);
    if (captionText.length === 0) {
      return;
    }

    const caption = document.createElement('div');
    caption.className = 'md-table-caption';
    caption.textContent = captionText;
    previous.replaceWith(caption);
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
    const headingText = (heading.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!/^(references|reference|参考文献)$/.test(headingText)) {
      return;
    }

    const next = heading.nextElementSibling;
    if (!(next instanceof HTMLElement) || (next.tagName !== 'OL' && next.tagName !== 'UL')) {
      return;
    }

    if (next.tagName === 'OL') {
      next.classList.add('md-reference-list');
      return;
    }

    const ordered = document.createElement('ol');
    ordered.className = 'md-reference-list';
    Array.from(next.children).forEach((child) => {
      if (child.tagName === 'LI') {
        ordered.appendChild(child.cloneNode(true));
      }
    });
    next.replaceWith(ordered);
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
    if (!(onlyChild instanceof HTMLElement)) {
      return;
    }

    if (!onlyChild.classList.contains('katex-display')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'katex-display-block';
    wrapper.appendChild(onlyChild);
    paragraph.replaceWith(wrapper);
  });

  return template.innerHTML;
};

export interface RenderMarkdownOptions {
  normalizeJournalHeadings?: boolean;
  resolveImageSrc?: (source: string) => string | null;
}

export const renderMarkdown = (source: string, options: RenderMarkdownOptions = {}): string => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const rendered = markdown.render(normalizedSource, {
    resolveImageSrc: options.resolveImageSrc,
  } satisfies MarkdownRenderEnv);
  const normalizedDisplayMath = normalizeDisplayMathParagraph(rendered);
  const normalizedCaptions = normalizeFigureAndTableCaptions(normalizedDisplayMath);
  const normalizedReferences = normalizeReferenceLists(normalizedCaptions);
  const normalizedHeadingHtml = options.normalizeJournalHeadings
    ? normalizeJournalHeadings(normalizedReferences)
    : normalizedReferences;
  return sanitizeHtml(normalizedHeadingHtml);
};

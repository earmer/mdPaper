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
  const safeSrc = markdown.utils.escapeHtml(src);
  const safeTitle = markdown.utils.escapeHtml(title);

  if (src.length === 0) {
    return defaultImageRender?.(tokens, idx, options, env, self) ?? '';
  }

  const caption = safeTitle.length > 0 ? safeTitle : safeAlt;
  const captionHtml = caption.length > 0 ? `<figcaption>${caption}</figcaption>` : '';

  return `<figure class="md-figure"><img src="${safeSrc}" alt="${safeAlt}" loading="lazy" />${captionHtml}</figure>`;
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

export const renderMarkdown = (source: string): string => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const rendered = markdown.render(normalizedSource);
  const normalizedDisplayMath = normalizeDisplayMathParagraph(rendered);
  return sanitizeHtml(normalizedDisplayMath);
};

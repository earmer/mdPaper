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

  return `<figure class="md-figure"><img src="${safeSrc}" alt="${safeAlt}" loading="eager" decoding="async" />${captionHtml}</figure>`;
};

const hasCjk = (text: string): boolean => /[\u3400-\u9fff]/u.test(text);
const hasLatin = (text: string): boolean => /[A-Za-z]/.test(text);

const escapeHtml = (text: string): string => markdown.utils.escapeHtml(text);

const parseRomanOrdinal = (token: string): number | null => {
  const normalized = token.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(normalized)) {
    return null;
  }

  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  let previous = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const char = normalized[index] ?? '';
    const value = values[char];
    if (value === undefined) {
      return null;
    }

    if (value < previous) {
      total -= value;
    } else {
      total += value;
      previous = value;
    }
  }

  if (total <= 0 || total > 3999) {
    return null;
  }

  return total;
};

const parseChineseOrdinal = (token: string): number | null => {
  const normalized = token.replace(/第/g, '').replace(/兩/g, '二').replace(/〇/g, '零');
  if (!/^[零一二三四五六七八九十百]+$/.test(normalized)) {
    return null;
  }

  if (normalized === '十') {
    return 10;
  }

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  const parseSection = (section: string): number => {
    if (section.length === 0) {
      return 0;
    }

    if (section.length === 1) {
      return digits[section] ?? 0;
    }

    let value = 0;
    for (const char of section) {
      value = value * 10 + (digits[char] ?? 0);
    }
    return value;
  };

  if (normalized.includes('百')) {
    const [hundredPart = '', rest = ''] = normalized.split('百');
    const hundreds = hundredPart.length === 0 ? 1 : parseSection(hundredPart);
    const restValue = rest.length === 0 ? 0 : (parseChineseOrdinal(rest) ?? 0);
    return hundreds * 100 + restValue;
  }

  if (normalized.includes('十')) {
    const [tenPart = '', rest = ''] = normalized.split('十');
    const tens = tenPart.length === 0 ? 1 : parseSection(tenPart);
    const ones = parseSection(rest);
    return tens * 10 + ones;
  }

  return parseSection(normalized);
};

const parseSectionOrdinal = (token: string): number | null => {
  if (token.length === 0) {
    return null;
  }

  if (/^\d+$/.test(token)) {
    const value = Number(token);
    if (Number.isInteger(value) && value > 0 && value < 300) {
      return value;
    }
    return null;
  }

  const romanValue = parseRomanOrdinal(token);
  if (romanValue !== null && romanValue < 300) {
    return romanValue;
  }

  const chineseValue = parseChineseOrdinal(token);
  if (chineseValue !== null && chineseValue > 0 && chineseValue < 300) {
    return chineseValue;
  }

  return null;
};

const toRomanNumeral = (value: number): string => {
  const table: Array<{ value: number; numeral: string }> = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' },
  ];

  let number = Math.max(1, Math.floor(value));
  let output = '';

  for (const entry of table) {
    while (number >= entry.value) {
      output += entry.numeral;
      number -= entry.value;
    }
  }

  return output;
};

const stripHeadingOrdinal = (input: string): { ordinal: number | null; title: string } => {
  const text = input.trim();
  if (text.length === 0) {
    return { ordinal: null, title: '' };
  }

  const matched = text.match(
    /^(?:section\s+)?(?:第\s*)?([0-9]{1,3}|[IVXLCDM]+|[一二三四五六七八九十百零〇兩]{1,6})(?:[.．、:：)\-])?\s*(.+)$/i,
  );
  if (matched === null) {
    return { ordinal: null, title: text };
  }

  const ordinal = parseSectionOrdinal(matched[1] ?? '');
  const title = (matched[2] ?? '').trim();
  if (ordinal === null || title.length === 0) {
    return { ordinal: null, title: text };
  }

  return { ordinal, title };
};

const normalizeJournalHeadings = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const headings = template.content.querySelectorAll('h1, h2');
  headings.forEach((heading) => {
    const raw = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (raw.length === 0) {
      return;
    }

    const parts = raw.split(/\s*\/\s*/).filter((part) => part.trim().length > 0);
    const primary = stripHeadingOrdinal(parts[0] ?? raw);
    const secondary = stripHeadingOrdinal(parts[1] ?? '');
    const ordinal = primary.ordinal ?? secondary.ordinal;
    const leftText = primary.title;
    const rightText = secondary.title;

    let english = '';
    let chinese = '';
    if (rightText.length > 0) {
      if (hasLatin(leftText) && hasCjk(rightText)) {
        english = leftText;
        chinese = rightText;
      } else if (hasCjk(leftText) && hasLatin(rightText)) {
        chinese = leftText;
        english = rightText;
      } else {
        english = leftText;
        chinese = rightText;
      }
    } else {
      if (hasLatin(leftText)) {
        english = leftText;
      }

      if (hasCjk(leftText)) {
        chinese = leftText;
      }

      if (english.length === 0 && chinese.length === 0) {
        english = leftText;
      }
    }

    const chunks: string[] = [];
    if (ordinal !== null) {
      chunks.push(
        `<span class="journal-heading-normalized__roman">${escapeHtml(toRomanNumeral(ordinal))}.</span>`,
      );
    }

    if (english.length > 0) {
      chunks.push(
        `<span class="journal-heading-normalized__en">${escapeHtml(english.toUpperCase())}</span>`,
      );
    }

    if (english.length > 0 && chinese.length > 0) {
      chunks.push('<span class="journal-heading-normalized__divider">/</span>');
    }

    if (chinese.length > 0) {
      chunks.push(`<span class="journal-heading-normalized__zh">${escapeHtml(chinese)}</span>`);
    }

    if (chunks.length === 0) {
      return;
    }

    heading.classList.add('journal-heading-normalized');
    heading.innerHTML = chunks.join(' ');
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
}

export const renderMarkdown = (source: string, options: RenderMarkdownOptions = {}): string => {
  const normalizedSource = normalizeMathInMarkdown(source);
  const rendered = markdown.render(normalizedSource);
  const normalizedDisplayMath = normalizeDisplayMathParagraph(rendered);
  const normalizedHeadingHtml = options.normalizeJournalHeadings
    ? normalizeJournalHeadings(normalizedDisplayMath)
    : normalizedDisplayMath;
  return sanitizeHtml(normalizedHeadingHtml);
};

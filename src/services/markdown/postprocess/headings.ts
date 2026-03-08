const appendixHeadingPattern = /^(appendix\b|part\s+[IVXLCDM]+\b|附录)/iu;

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

export const normalizeJournalHeadings = (html: string): string => {
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

    if (appendixHeadingPattern.test(raw)) {
      heading.classList.add('journal-heading-appendix');
      return;
    }

    let headingNumber = '';
    let headingText = raw;
    if (heading.tagName === 'H2') {
      level2 += 1;
      level3 = 0;
      level4 = 0;
      headingNumber = `${level2}`;
      headingText = stripHeadingOrdinal(raw, 1);
    } else if (heading.tagName === 'H3') {
      if (level2 === 0) {
        level2 = 1;
      }
      level3 += 1;
      level4 = 0;
      headingNumber = `${level2}.${level3}`;
      headingText = stripHeadingOrdinal(raw, 2);
    } else if (heading.tagName === 'H4') {
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

    const numberSpan = document.createElement('span');
    numberSpan.className = 'journal-heading-number';
    numberSpan.textContent = headingNumber;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'journal-heading-title';
    titleSpan.textContent = headingText;

    heading.classList.add('journal-heading-numbered');
    heading.replaceChildren(numberSpan, titleSpan);
  });

  return template.innerHTML;
};

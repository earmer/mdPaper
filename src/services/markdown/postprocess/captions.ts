const figureCaptionPattern = /^(?:figure|fig\.?|图)\s*(?:[A-Za-z]?\d+(?:[.\-]\d+)*)?\s*(?:[:：.．、\-])?\s*(.+)$/iu;

const extractCaption = (text: string, pattern: RegExp): string => {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const matched = normalized.match(pattern);
  return matched?.[1]?.trim() ?? '';
};

export const normalizeFigureAndTableCaptions = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

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

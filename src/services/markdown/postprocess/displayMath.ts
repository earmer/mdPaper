export const normalizeDisplayMathParagraph = (html: string): string => {
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

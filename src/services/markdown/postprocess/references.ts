import { stripReferenceMarker } from '@/services/document/citation';

export const normalizeReferenceLists = (html: string): string => {
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

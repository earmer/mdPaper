import DOMPurify from 'dompurify';

export const sanitizeHtml = (rawHtml: string): string =>
  DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: {
      html: true,
      mathMl: true,
      svg: true,
      svgFilters: true,
    },
    ADD_ATTR: ['style', 'class', 'xmlns', 'encoding'],
  });

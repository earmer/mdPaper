import DOMPurify from 'dompurify';

export const sanitizeHtml = (rawHtml: string): string =>
  DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: {
      html: true,
      svg: true,
      svgFilters: true,
    },
  });

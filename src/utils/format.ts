import dayjs from 'dayjs';
import type { Affiliation, Author } from '@/types/manuscript';

export const formatAuthorAffiliation = (
  authors: Author[],
  affiliations: Affiliation[],
  correspondingAuthorId: string,
): string[] => {
  const indexMap = new Map(affiliations.map((item, index) => [item.id, index + 1]));

  return authors.map((author) => {
    const affiliationSuperscript = author.affiliationIds
      .map((id) => indexMap.get(id))
      .filter((value): value is number => value !== undefined)
      .join(',');
    const correspondingMarker = author.id === correspondingAuthorId ? '*' : '';
    const superscript = `${affiliationSuperscript}${correspondingMarker}`;

    return superscript.length > 0 ? `${author.name}<sup>${superscript}</sup>` : author.name;
  });
};

export const formatAffiliationLine = (affiliation: Affiliation, index: number): string =>
  `${index + 1}. ${affiliation.org}，${affiliation.city}，${affiliation.country}`;

export const nowSlug = (): string => dayjs().format('YYYYMMDD-HHmmss');

export const defaultImageAlt = (): string => `image-${nowSlug()}`;

export const buildExportFileName = (title: string, prefix: string): string => {
  const baseTitle = title.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 48);
  const safeTitle = baseTitle.length > 0 ? baseTitle : prefix;
  return `${safeTitle}-${nowSlug()}.pdf`;
};

export const toInlineImageMarkdown = (alt: string, source: string): string =>
  `![${alt}](${source})`;

export const parseRemoteImageUrls = (markdown: string): string[] => {
  const regexp = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/gi;
  const result = new Set<string>();
  let match: RegExpExecArray | null = regexp.exec(markdown);

  while (match !== null) {
    if (match[1] !== undefined) {
      result.add(match[1]);
    }
    match = regexp.exec(markdown);
  }

  return Array.from(result);
};

import type { TypstManuscriptDocument } from '@/services/document/typstModel';
import {
  stringifyTypstArray,
  stringifyTypstAuthorArray,
  stringifyTypstValue,
} from '@/services/typst/escape';
import { formatAffiliationLine } from '@/utils/format';

export const buildFrontMatterCall = (document: TypstManuscriptDocument): string => {
  const { metadata } = document;
  const affiliationIndexMap = new Map(metadata.affiliations.map((item, index) => [item.id, index + 1]));
  const authors = metadata.authors.map((author) => {
    const markers = author.affiliationIds
      .map((id) => affiliationIndexMap.get(id))
      .filter((value): value is number => value !== undefined)
      .map((value) => String(value));
    if (author.id === metadata.correspondingAuthorId) {
      markers.push('*');
    }

    return {
      name: author.name.trim() || author.nameEn.trim(),
      markers: markers.join(','),
    };
  }).filter((author) => author.name.length > 0);
  const affiliations = metadata.affiliations
    .map((item, index) => formatAffiliationLine(item, index).trim())
    .filter((item) => item.length > 0);
  const correspondingAuthor = metadata.authors.find((author) => author.id === metadata.correspondingAuthorId);
  const correspondingName = correspondingAuthor === undefined
    ? ''
    : (correspondingAuthor.name.trim() || correspondingAuthor.nameEn.trim());
  const corresponding = correspondingName.length === 0
    ? ''
    : `${correspondingName}${metadata.correspondingAuthorContact.trim().length > 0 ? ` (${metadata.correspondingAuthorContact.trim()})` : ''}`;
  const funding = metadata.fundings
    .map((item) => item.text.trim())
    .filter((item) => item.length > 0)
    .join('；');
  const keywords = metadata.keywords
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return [
    '#mdp_frontmatter(',
    `  title: ${stringifyTypstValue(metadata.title.trim())},`,
    `  subtitle: ${stringifyTypstValue(metadata.subtitle.trim())},`,
    `  authors: ${stringifyTypstAuthorArray(authors)},`,
    `  affiliations: ${stringifyTypstArray(affiliations)},`,
    `  corresponding: ${stringifyTypstValue(corresponding)},`,
    `  funding: ${stringifyTypstValue(funding)},`,
    `  abstract: ${stringifyTypstValue(metadata.abstract.trim())},`,
    `  keywords: ${stringifyTypstArray(keywords)},`,
    ')',
  ].join('\n');
};

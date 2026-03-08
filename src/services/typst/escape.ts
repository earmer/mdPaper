export const escapeTypstText = (input: string): string => input
  .replace(/\\/gu, '\\\\')
  .replace(/#/gu, '\\#')
  .replace(/\[/gu, '\\[')
  .replace(/\]/gu, '\\]')
  .replace(/\*/gu, '\\*')
  .replace(/_/gu, '\\_');

export const trimParagraph = (input: string): string => input.replace(/\s+/gu, ' ').trim();

export const stringifyTypstValue = (value: string): string => JSON.stringify(value);

export const stringifyTypstArray = (values: string[]): string =>
  `(${values.map((value) => stringifyTypstValue(value)).join(', ')})`;

export const stringifyTypstAuthorArray = (authors: Array<{ name: string; markers: string }>): string =>
  `(${authors.map((author) => `(name: ${stringifyTypstValue(author.name)}, markers: ${stringifyTypstValue(author.markers)})`).join(', ')})`;

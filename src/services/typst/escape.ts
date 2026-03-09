export const escapeTypstText = (input: string): string => input
  .replace(/\\/gu, '\\\\')
  .replace(/#/gu, '\\#')
  .replace(/\[/gu, '\\[')
  .replace(/\]/gu, '\\]')
  .replace(/\*/gu, '\\*')
  .replace(/_/gu, '\\_');

const typstPlainTextEscapeMap: Record<string, string> = {
  '\\': '\\\\',
  '#': '\\#',
  '[': '\\[',
  ']': '\\]',
  '*': '\\*',
  '_': '\\_',
  '$': '\\$',
};

export const escapeTypstPlainText = (input: string): string =>
  input.replace(/[\\#\[\]\*_$]/gu, (character) => typstPlainTextEscapeMap[character] ?? character);

export const trimParagraph = (input: string): string => input.replace(/\s+/gu, ' ').trim();

export const stringifyTypstValue = (value: string): string => JSON.stringify(value);

export const stringifyTypstArray = (values: string[]): string =>
  `(${values.map((value) => stringifyTypstValue(value)).join(', ')})`;

export const stringifyTypstAuthorArray = (authors: Array<{ name: string; markers: string }>): string =>
  `(${authors.map((author) => `(name: ${stringifyTypstValue(author.name)}, markers: ${stringifyTypstValue(author.markers)})`).join(', ')})`;

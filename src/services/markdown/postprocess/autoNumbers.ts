export const normalizeAutoNumbers = (html: string): string => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const figures = template.content.querySelectorAll<HTMLElement>('.md-figure, figure');
  figures.forEach((figure, index) => {
    const number = String(index + 1);
    figure.setAttribute('data-figure-number', number);

    const caption = figure.querySelector<HTMLElement>('figcaption, .md-figure-caption');
    caption?.setAttribute('data-figure-number', number);
  });

  const tableCaptions = template.content.querySelectorAll<HTMLElement>('.md-table-caption, table > caption');
  tableCaptions.forEach((caption, index) => {
    caption.setAttribute('data-table-number', String(index + 1));
  });

  const displayMathBlocks = template.content.querySelectorAll<HTMLElement>('.katex-display-block');
  displayMathBlocks.forEach((block, index) => {
    block.setAttribute('data-equation-number', String(index + 1));
  });

  return template.innerHTML;
};

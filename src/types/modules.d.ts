declare module 'markdown-it-link-attributes';
declare module 'markdown-it-katex';
declare module 'markdown-it-footnote';

declare module 'pagedjs' {
  export type PagedStylesheet = string | Record<string, string>;

  export interface PreviewFlow {
    total: number;
    pages: unknown[];
    performance: number;
    size?: unknown;
  }

  export class Previewer {
    preview(
      content?: Node | DocumentFragment | HTMLElement | null,
      stylesheets?: PagedStylesheet[] | null,
      renderTo?: HTMLElement | null,
    ): Promise<PreviewFlow>;
  }
}

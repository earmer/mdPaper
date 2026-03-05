import {
  PAPER_HEADER_LEFT,
  PAPER_HEADER_RIGHT,
} from '@/constants/journal';
import type { ExportPayload } from '@/types/manuscript';

export const getPaperCssSize = (paper: 'A4' | 'Letter'): string =>
  paper === 'Letter' ? 'Letter' : 'A4';

export const applyLayoutVars = (payload: ExportPayload): void => {
  const { exportSetting, articleElement } = payload;
  articleElement.setAttribute('data-paper', exportSetting.paperSize);
  articleElement.style.setProperty('--paper-size', getPaperCssSize(exportSetting.paperSize));
  articleElement.style.setProperty('--paper-margin-top', `${exportSetting.margins.top}mm`);
  articleElement.style.setProperty('--paper-margin-right', `${exportSetting.margins.right}mm`);
  articleElement.style.setProperty('--paper-margin-bottom', `${exportSetting.margins.bottom}mm`);
  articleElement.style.setProperty('--paper-margin-left', `${exportSetting.margins.left}mm`);
  articleElement.style.setProperty('--body-font-size', `${exportSetting.fontSize}pt`);
  articleElement.style.setProperty('--body-line-height', `${exportSetting.lineHeight}`);
  articleElement.style.setProperty('--body-paragraph-indent', `${exportSetting.paragraphIndent}em`);
  articleElement.style.setProperty('--body-column-gap', `${exportSetting.columnGap}mm`);
};

export const buildHeaderLeftText = (payload: ExportPayload): string => {
  void payload;
  return PAPER_HEADER_LEFT;
};

export const buildHeaderRightText = (payload: ExportPayload): string => {
  void payload;
  return PAPER_HEADER_RIGHT;
};

export const buildFooterLeftText = (payload: ExportPayload): string => {
  void payload;
  return '';
};

export const buildFooterRightText = (payload: ExportPayload): string => {
  void payload;
  return '';
};

export const buildPageLabel = (
  locale: string,
  page: number,
  total: number,
): string => {
  if (locale === 'zh-CN') {
    return `第 ${page} / ${total} 页`;
  }

  return `Page ${page} of ${total}`;
};

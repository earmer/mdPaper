import {
  PAPER_HEADER_LEFT,
  PAPER_HEADER_RIGHT,
} from '@/constants/journal';
import type { ExportPayload } from '@/types/manuscript';

const FOOTER_LEFT_TEXT = 'R.U.B.B.I.S.H. Journal — an experimental publication.';
const FOOTER_RIGHT_TEXT = '© The Author(s)';

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
};

export const buildHeaderLeftText = (payload: ExportPayload): string => {
  if (
    !payload.exportSetting.headerFooter.showHeader
    || !payload.exportSetting.headerFooter.showJournalName
  ) {
    return '';
  }

  return PAPER_HEADER_LEFT;
};

export const buildHeaderRightText = (payload: ExportPayload): string => {
  if (!payload.exportSetting.headerFooter.showHeader) {
    return '';
  }

  return PAPER_HEADER_RIGHT;
};

export const buildFooterLeftText = (payload: ExportPayload): string => {
  if (!payload.exportSetting.headerFooter.showFooter) {
    return '';
  }

  return FOOTER_LEFT_TEXT;
};

export const buildFooterRightText = (payload: ExportPayload): string => {
  if (
    !payload.exportSetting.headerFooter.showFooter
    || !payload.exportSetting.headerFooter.showCopyright
  ) {
    return '';
  }

  return FOOTER_RIGHT_TEXT;
};

export const buildPageLabel = (
  locale: string,
  page: number,
  total: number,
): string => {
  void total;

  if (locale === 'zh-CN') {
    return `第 ${page} 页`;
  }

  return `Page ${page}`;
};

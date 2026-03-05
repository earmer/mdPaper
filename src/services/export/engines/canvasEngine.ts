import type { ExportPayload } from '@/types/manuscript';
import {
  applyLayoutVars,
  buildFooterLeftText,
  buildFooterRightText,
  buildHeaderLeftText,
  buildHeaderRightText,
  buildPageLabel,
  getPaperCssSize,
} from '@/services/export/helpers';
import {
  waitForExportRenderReady,
  withIsolatedExportRoot,
} from '@/services/export/exportRoot';
import { applySharedPaginationBreaks } from '@/services/pagination/sharedPagination';
import { withBodyClass } from '@/utils/dom';

interface Html2PdfWorker {
  set: (options: Record<string, unknown>) => Html2PdfWorker;
  from: (element: HTMLElement) => Html2PdfWorker;
  toPdf: () => Html2PdfWorker;
  get: (key: 'pdf') => Promise<any>;
  save: () => Promise<void>;
}

interface Html2PdfFactory {
  (): Html2PdfWorker;
}

const removeLeadingBlankPage = (pdf: any): void => {
  const pageCount = pdf.internal.getNumberOfPages();
  if (pageCount <= 1) {
    return;
  }

  const pages = (pdf.internal as { pages?: Record<number, unknown> }).pages;
  const firstPageOps = Array.isArray(pages?.[1]) ? pages[1].join('\n') : '';
  const secondPageOps = Array.isArray(pages?.[2]) ? pages[2].join('\n') : '';
  const firstHasRenderOps = /Do\b|BT\b|TJ\b|Tj\b/.test(firstPageOps);
  const secondHasRenderOps = /Do\b|BT\b|TJ\b|Tj\b/.test(secondPageOps);

  if (!firstHasRenderOps && secondHasRenderOps && typeof pdf.deletePage === 'function') {
    pdf.deletePage(1);
  }
};

const drawHeaderFooter = (pdf: any, payload: ExportPayload): void => {
  const { exportSetting, locale } = payload;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageCount = pdf.internal.getNumberOfPages();
  const headerTextY = Math.max(4.8, exportSetting.margins.top - 6.2);
  const headerLineY = Math.max(6.4, exportSetting.margins.top - 3.4);
  const footerLineY = pageHeight - Math.max(6.2, exportSetting.margins.bottom - 3.6);
  const footerTextY = Math.min(pageHeight - 3.8, footerLineY + 3.4);
  const lineLeft = exportSetting.margins.left;
  const lineRight = pageWidth - exportSetting.margins.right;
  const headerLeftText = buildHeaderLeftText(payload);
  const headerRightText = buildHeaderRightText(payload);
  const footerLeftText = buildFooterLeftText(payload);
  const footerRightText = buildFooterRightText(payload);

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('times', 'normal');

    if (
      exportSetting.headerFooter.showHeader &&
      (headerLeftText.length > 0 || headerRightText.length > 0)
    ) {
      pdf.setFontSize(8.8);
      if (headerLeftText.length > 0) {
        pdf.text(headerLeftText, exportSetting.margins.left, headerTextY, {
          maxWidth: pageWidth * 0.5,
        });
      }

      if (headerRightText.length > 0) {
        pdf.text(headerRightText, pageWidth - exportSetting.margins.right, headerTextY, {
          align: 'right',
          maxWidth: pageWidth * 0.55,
        });
      }

      pdf.setDrawColor(82, 82, 91);
      pdf.setLineWidth(0.1);
      pdf.line(lineLeft, headerLineY, lineRight, headerLineY);
    }

    if (exportSetting.headerFooter.showFooter) {
      pdf.setDrawColor(82, 82, 91);
      pdf.setLineWidth(0.1);
      pdf.line(lineLeft, footerLineY, lineRight, footerLineY);
    }

    pdf.setFontSize(8.5);
    if (exportSetting.headerFooter.showFooter && footerLeftText.length > 0) {
      pdf.text(footerLeftText, exportSetting.margins.left, footerTextY, {
        maxWidth: pageWidth * 0.65,
      });
    }

    if (exportSetting.headerFooter.showFooter && footerRightText.length > 0) {
      pdf.text(footerRightText, pageWidth - exportSetting.margins.right, footerTextY, {
        align: 'right',
      });
    }

    const pageText = buildPageLabel(locale, page, pageCount);
    if (exportSetting.headerFooter.showFooter && exportSetting.headerFooter.showPageNumber) {
      pdf.text(pageText, pageWidth / 2, footerTextY, {
        align: 'center',
      });
    }
  }
};

export const exportByCanvas = async (
  payload: ExportPayload,
  fileName: string,
): Promise<void> => {
  const module = await import('html2pdf.js');
  const html2pdf = (module.default ?? module) as Html2PdfFactory;
  const paper = getPaperCssSize(payload.exportSetting.paperSize).toLowerCase();

  await withIsolatedExportRoot(
    payload.articleElement,
    payload.exportSetting.paperSize,
    async (isolatedArticle) => {
      const isolatedPayload: ExportPayload = {
        ...payload,
        articleElement: isolatedArticle,
      };

      applyLayoutVars(isolatedPayload);
      await waitForExportRenderReady(isolatedArticle);
      applySharedPaginationBreaks({
        root: isolatedArticle,
        paperSize: isolatedPayload.exportSetting.paperSize,
        marginsTopMm: isolatedPayload.exportSetting.margins.top,
        marginsBottomMm: isolatedPayload.exportSetting.margins.bottom,
      });

      await withBodyClass('canvas-exporting', async () => {
        const worker = html2pdf()
          .set({
            margin: 0,
            filename: fileName,
            image: {
              type: 'jpeg',
              quality: 0.98,
            },
            html2canvas: {
              scale: 2,
              useCORS: true,
              allowTaint: false,
              backgroundColor: '#ffffff',
              scrollX: 0,
              scrollY: 0,
            },
            jsPDF: {
              unit: 'mm',
              format: paper,
              orientation: 'portrait',
            },
            pagebreak: {
              mode: ['css'],
            },
          })
          .from(isolatedArticle)
          .toPdf();

        const pdf = await worker.get('pdf');
        removeLeadingBlankPage(pdf);
        drawHeaderFooter(pdf, isolatedPayload);
        await worker.save();
      });
    },
  );
};

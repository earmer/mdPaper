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

const drawHeaderFooter = (pdf: any, payload: ExportPayload): void => {
  const { exportSetting, locale } = payload;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageCount = pdf.internal.getNumberOfPages();
  const headerLeftText = buildHeaderLeftText(payload);
  const headerRightText = buildHeaderRightText(payload);
  const footerLeftText = buildFooterLeftText(payload);
  const footerRightText = buildFooterRightText(payload);

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('times', 'normal');

    if (headerLeftText.length > 0 || headerRightText.length > 0) {
      pdf.setFontSize(8.8);
      if (headerLeftText.length > 0) {
        pdf.text(headerLeftText, exportSetting.margins.left, 8, {
          maxWidth: pageWidth * 0.5,
        });
      }

      if (headerRightText.length > 0) {
        pdf.text(headerRightText, pageWidth - exportSetting.margins.right, 8, {
          align: 'right',
        });
      }

      pdf.setDrawColor(156, 163, 175);
      pdf.setLineWidth(0.1);
      pdf.line(8, 10, pageWidth - 8, 10);
    }

    pdf.setDrawColor(156, 163, 175);
    pdf.setLineWidth(0.1);
    pdf.line(8, pageHeight - 10, pageWidth - 8, pageHeight - 10);

    pdf.setFontSize(8.5);
    if (footerLeftText.length > 0) {
      pdf.text(footerLeftText, exportSetting.margins.left, pageHeight - 6, {
        maxWidth: pageWidth * 0.65,
      });
    }

    if (footerRightText.length > 0) {
      pdf.text(footerRightText, pageWidth - exportSetting.margins.right, pageHeight - 6, {
        align: 'right',
      });
    }

    const pageText = buildPageLabel(locale, page, pageCount);
    pdf.text(pageText, pageWidth / 2, pageHeight - 6, {
      align: 'center',
    });
  }
};

export const exportByCanvas = async (
  payload: ExportPayload,
  fileName: string,
): Promise<void> => {
  applyLayoutVars(payload);

  const module = await import('html2pdf.js');
  const html2pdf = (module.default ?? module) as Html2PdfFactory;
  const paper = getPaperCssSize(payload.exportSetting.paperSize).toLowerCase();

  await withBodyClass('canvas-exporting', async () => {
    const worker = html2pdf()
      .set({
        margin: [
          payload.exportSetting.margins.top,
          payload.exportSetting.margins.right,
          payload.exportSetting.margins.bottom,
          payload.exportSetting.margins.left,
        ],
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
        },
        jsPDF: {
          unit: 'mm',
          format: paper,
          orientation: 'portrait',
        },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: [
            'p',
            'li',
            'blockquote',
            '.md-figure',
            '.katex-display-block',
            'pre',
            'table',
          ],
        },
      })
      .from(payload.articleElement)
      .toPdf();

    const pdf = await worker.get('pdf');
    drawHeaderFooter(pdf, payload);
    await worker.save();
  });
};

import { exportByBrowserPrintPdf } from '@/services/export/engines/browserPrintEngine';
import type {
  BrowserPrintPayload,
  ExportFilePayload,
} from '@/services/export/types';
import { buildExportFileName } from '@/utils/format';

const triggerDownload = (blobUrl: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.click();
};

export const buildPdfFileName = (payload: ExportFilePayload): string =>
  buildExportFileName(
    payload.metadata.title,
    payload.locale === 'zh-CN' ? '论文' : 'manuscript',
  );

export const exportTypstPdf = async (
  blobUrl: string,
  payload: ExportFilePayload,
): Promise<void> => {
  if (blobUrl.length === 0) {
    throw new Error('Missing Typst PDF artifact');
  }

  triggerDownload(blobUrl, buildPdfFileName(payload));
};

export const exportLegacyPdf = async (payload: BrowserPrintPayload): Promise<void> => {
  await exportByBrowserPrintPdf(payload, buildPdfFileName(payload));
};

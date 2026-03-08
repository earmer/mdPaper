import { exportByCanvas } from '@/services/export/engines/canvasEngine';
import type { ExportPayload } from '@/types/manuscript';
import { buildExportFileName } from '@/utils/format';

const triggerDownload = (blobUrl: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.click();
};

export const buildPdfFileName = (payload: Pick<ExportPayload, 'metadata' | 'locale'>): string =>
  buildExportFileName(
    payload.metadata.title,
    payload.locale === 'zh-CN' ? '论文' : 'manuscript',
  );

export const exportTypstPdf = async (
  blobUrl: string,
  payload: Pick<ExportPayload, 'metadata' | 'locale'>,
): Promise<void> => {
  if (blobUrl.length === 0) {
    throw new Error('Missing Typst PDF artifact');
  }

  triggerDownload(blobUrl, buildPdfFileName(payload));
};

export const exportLegacyPdf = async (payload: ExportPayload): Promise<void> => {
  await exportByCanvas(payload, buildPdfFileName(payload));
};

import type { ExportPayload } from '@/types/manuscript';
import { buildExportFileName } from '@/utils/format';

export const exportPdf = async (payload: ExportPayload): Promise<void> => {
  const fileName = buildExportFileName(
    payload.metadata.title,
    payload.locale === 'zh-CN' ? '论文' : 'manuscript',
  );
  const { exportByBrowserPrintPdf } = await import('@/services/export/engines/browserPrintEngine');

  await exportByBrowserPrintPdf(payload, fileName);
};

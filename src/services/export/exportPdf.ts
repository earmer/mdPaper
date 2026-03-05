import type { ExportPayload } from '@/types/manuscript';
import { buildExportFileName } from '@/utils/format';
import { exportByCanvas } from '@/services/export/engines/canvasEngine';

export const exportPdf = async (payload: ExportPayload): Promise<void> => {
  const fileName = buildExportFileName(
    payload.metadata.title,
    payload.locale === 'zh-CN' ? '论文' : 'manuscript',
  );

  await exportByCanvas(payload, fileName);
};

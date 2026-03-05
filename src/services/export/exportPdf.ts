import type { ExportPayload } from '@/types/manuscript';
import { buildExportFileName } from '@/utils/format';
import { exportByCanvas } from '@/services/export/engines/canvasEngine';
import { exportByPaged } from '@/services/export/engines/pagedEngine';

export const exportPdf = async (payload: ExportPayload): Promise<void> => {
  const fileName = buildExportFileName(
    payload.metadata.title,
    payload.locale === 'zh-CN' ? '论文' : 'manuscript',
  );

  if (payload.exportSetting.engine === 'canvas') {
    await exportByCanvas(payload, fileName);
    return;
  }

  await exportByPaged(payload);
};

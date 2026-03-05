import type { ExportPayload } from '@/types/manuscript';
import { nextAnimationFrame, withBodyClass } from '@/utils/dom';
import { applyLayoutVars } from '@/services/export/helpers';
import {
  waitForExportRenderReady,
  withIsolatedExportRoot,
} from '@/services/export/exportRoot';
import { applySharedPaginationBreaks } from '@/services/pagination/sharedPagination';

const waitForAfterPrint = (): Promise<void> =>
  new Promise((resolve) => {
    let settled = false;

    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    window.addEventListener('afterprint', done, { once: true });
    window.setTimeout(done, 1200);
  });

export const exportByPaged = async (payload: ExportPayload): Promise<void> => {
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

      await withBodyClass('print-preview', async () => {
        await nextAnimationFrame();

        const pagedModule = await import('pagedjs');
        void pagedModule;

        const pagedPolyfill = (window as Window & {
          PagedPolyfill?: { preview?: () => Promise<unknown> };
        }).PagedPolyfill;

        if (typeof pagedPolyfill?.preview === 'function') {
          await pagedPolyfill.preview();
        }

        window.print();
        await waitForAfterPrint();
      });
    },
  );
};

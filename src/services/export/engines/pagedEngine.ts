import type { ExportPayload } from '@/types/manuscript';
import { nextAnimationFrame, withBodyClass } from '@/utils/dom';
import { applyLayoutVars } from '@/services/export/helpers';

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
  applyLayoutVars(payload);

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
};

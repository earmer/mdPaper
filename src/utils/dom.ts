export const PRINT_ROOT_ID = 'journal-print-root';

export const getPrintRoot = (): HTMLElement | null =>
  document.getElementById(PRINT_ROOT_ID);

export const withBodyClass = async <T>(
  className: string,
  runner: () => Promise<T>,
): Promise<T> => {
  document.body.classList.add(className);
  try {
    return await runner();
  } finally {
    document.body.classList.remove(className);
  }
};

export const nextAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

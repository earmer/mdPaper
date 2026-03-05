export const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  wait = 300,
): ((...args: Parameters<T>) => void) => {
  let timer: number | undefined;

  return (...args: Parameters<T>) => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => fn(...args), wait);
  };
};

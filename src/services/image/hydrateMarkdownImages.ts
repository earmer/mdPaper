import { probeImageSource } from '@/services/image/resourceAccess';

interface HydrateMarkdownImagesOptions {
  unavailableLabel: string;
  unavailableHint: string;
}

const createPlaceholder = (
  documentRef: Document,
  alt: string,
  options: HydrateMarkdownImagesOptions,
): HTMLElement => {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'md-figure__placeholder';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', alt.length > 0 ? alt : options.unavailableLabel);

  const icon = documentRef.createElement('div');
  icon.className = 'md-figure__placeholder-icon';
  icon.textContent = '🖼️';

  const label = documentRef.createElement('div');
  label.className = 'md-figure__placeholder-label';
  label.textContent = options.unavailableLabel;

  const hint = documentRef.createElement('div');
  hint.className = 'md-figure__placeholder-hint';
  hint.textContent = options.unavailableHint;

  wrapper.append(icon, label, hint);
  return wrapper;
};

export const hydrateMarkdownImages = async (
  container: HTMLElement | null,
  options: HydrateMarkdownImagesOptions,
): Promise<void> => {
  if (container === null) {
    return;
  }

  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-md-image-src]'));
  await Promise.all(images.map(async (image) => {
    const source = image.dataset.mdImageSrc ?? '';
    const probe = await probeImageSource(source);
    const figure = image.closest('.md-figure');

    if (probe.status === 'ready') {
      image.src = probe.displaySrc;
      image.removeAttribute('data-md-image-src');
      if (figure instanceof HTMLElement) {
        figure.dataset.imageStatus = 'ready';
      }
      return;
    }

    if (figure instanceof HTMLElement) {
      figure.dataset.imageStatus = 'unavailable';
      image.replaceWith(createPlaceholder(container.ownerDocument, image.alt, options));
      return;
    }

    image.replaceWith(createPlaceholder(container.ownerDocument, image.alt, options));
  }));
};

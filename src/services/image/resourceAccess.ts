export interface ImageSourceProbeResult {
  status: 'ready' | 'unavailable';
  displaySrc: string;
  errorMessage: string;
}

const probeCache = new Map<string, Promise<ImageSourceProbeResult>>();

const isHttpUrl = (source: string): boolean => /^https?:\/\//u.test(source);
const isRootRelativePath = (source: string): boolean => source.startsWith('/');
const isDataUrl = (source: string): boolean => source.startsWith('data:');

const decodeDataUrl = (source: string): Uint8Array => {
  const matched = source.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/u);
  if (matched === null) {
    throw new Error('Invalid data URL');
  }

  const payload = matched[3] ?? '';
  if (matched[2] === ';base64') {
    const decoded = atob(payload);
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  }

  return new TextEncoder().encode(decodeURIComponent(payload));
};

const fetchResourceBlob = async (source: string): Promise<Blob> => {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource (${response.status})`);
  }

  return await response.blob();
};

const fetchBinaryResource = async (source: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetchResourceBlob(source)).arrayBuffer());

export const probeImageSource = async (source: string): Promise<ImageSourceProbeResult> => {
  const normalized = source.trim();
  if (normalized.length === 0) {
    return {
      status: 'unavailable',
      displaySrc: '',
      errorMessage: 'Empty image source',
    };
  }

  if (isDataUrl(normalized)) {
    try {
      decodeDataUrl(normalized);
      return {
        status: 'ready',
        displaySrc: normalized,
        errorMessage: '',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        displaySrc: '',
        errorMessage: error instanceof Error ? error.message : 'Invalid data URL',
      };
    }
  }

  if (!isHttpUrl(normalized) && !isRootRelativePath(normalized)) {
    return {
      status: 'unavailable',
      displaySrc: '',
      errorMessage: `Unsupported image source: ${normalized}`,
    };
  }

  const cached = probeCache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }

  const pending = (async (): Promise<ImageSourceProbeResult> => {
    try {
      const blob = await fetchResourceBlob(normalized);
      return {
        status: 'ready',
        displaySrc: URL.createObjectURL(blob),
        errorMessage: '',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        displaySrc: '',
        errorMessage: error instanceof Error ? error.message : 'Image fetch failed',
      };
    }
  })();

  probeCache.set(normalized, pending);
  return pending;
};

export const loadBinaryResource = async (source: string): Promise<Uint8Array> => {
  const normalized = source.trim();
  if (normalized.length === 0) {
    throw new Error('Empty resource source');
  }

  if (isDataUrl(normalized)) {
    return decodeDataUrl(normalized);
  }

  if (isHttpUrl(normalized) || isRootRelativePath(normalized)) {
    return await fetchBinaryResource(normalized);
  }

  throw new Error(`Unsupported resource source: ${normalized}`);
};

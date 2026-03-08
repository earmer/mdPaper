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

const fetchBinaryResource = async (source: string): Promise<Uint8Array> => {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource (${response.status})`);
  }

  return new Uint8Array(await response.arrayBuffer());
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
    return fetchBinaryResource(normalized);
  }

  throw new Error(`Unsupported resource source: ${normalized}`);
};

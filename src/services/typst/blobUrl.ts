export const createPdfBlobUrl = (pdfData: Uint8Array | null): string => {
  if (pdfData === null) {
    return '';
  }

  const arrayBuffer = pdfData.buffer.slice(
    pdfData.byteOffset,
    pdfData.byteOffset + pdfData.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const revokePdfBlobUrl = (pdfBlobUrl: string): void => {
  if (pdfBlobUrl.length === 0) {
    return;
  }

  URL.revokeObjectURL(pdfBlobUrl);
};

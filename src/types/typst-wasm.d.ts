declare module '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs' {
  export function setImportWasmModule(
    importer: (wasmName: string, url?: string) => Promise<ArrayBuffer>,
  ): void;
}

declare module '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs' {
  export function setImportWasmModule(
    importer: (wasmName: string, url?: string) => Promise<ArrayBuffer>,
  ): void;
}

declare module 'mitex-wasm/mitex_wasm_bg.js' {
  export function __wbg_set_wasm(value: WebAssembly.Exports): void;
  export function convert_math(input: string, spec: Uint8Array): string;
}

declare module 'mitex-wasm/mitex_wasm_bg.wasm?init' {
  const initWasm: (options?: WebAssembly.Imports) => Promise<WebAssembly.Instance>;
  export default initWasm;
}

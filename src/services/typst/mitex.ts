import initMiTexWasm from 'mitex-wasm/mitex_wasm_bg.wasm?init';
import * as miTexBindings from 'mitex-wasm/mitex_wasm_bg.js';

const defaultMiTexSpec = new Uint8Array();
const mathConversionCache = new Map<string, MiTexConversionResult>();
const miTexWasmImports = {
  './mitex_wasm_bg.js': miTexBindings,
} satisfies WebAssembly.Imports;

interface MiTexConversionBase {
  raw: string;
}

export interface MiTexConversionSuccess extends MiTexConversionBase {
  status: 'ok';
  code: string;
}

export interface MiTexConversionError extends MiTexConversionBase {
  status: 'error';
  error: string;
}

export type MiTexConversionResult = MiTexConversionSuccess | MiTexConversionError;

interface MiTexResultHolder {
  data?: {
    mitex?: unknown;
  } | null;
}

const cloneMiTexConversionResult = (result: MiTexConversionResult): MiTexConversionResult => ({
  ...result,
});

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return 'MiTeX conversion failed';
};

const isMiTexConversionResult = (value: unknown): value is MiTexConversionResult => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MiTexConversionResult>;
  return (candidate.status === 'ok' && typeof candidate.raw === 'string' && typeof candidate.code === 'string')
    || (candidate.status === 'error' && typeof candidate.raw === 'string' && typeof candidate.error === 'string');
};

const initializeMiTexWasm = async (): Promise<void> => {
  const instance = await initMiTexWasm(miTexWasmImports);
  miTexBindings.__wbg_set_wasm(instance.exports);
};

await initializeMiTexWasm();

export const convertLatexMathToTypst = (input: string): MiTexConversionResult => {
  const cached = mathConversionCache.get(input);
  if (cached !== undefined) {
    return cloneMiTexConversionResult(cached);
  }

  try {
    const code = miTexBindings.convert_math(input, defaultMiTexSpec);
    const result: MiTexConversionSuccess = {
      status: 'ok',
      raw: input,
      code,
    };
    mathConversionCache.set(input, result);
    return cloneMiTexConversionResult(result);
  } catch (error) {
    const result: MiTexConversionError = {
      status: 'error',
      raw: input,
      error: normalizeErrorMessage(error),
    };
    mathConversionCache.set(input, result);
    return cloneMiTexConversionResult(result);
  }
};

export const readMiTexConversionResult = (node: MiTexResultHolder): MiTexConversionResult | null => {
  const candidate = node.data?.mitex;
  return isMiTexConversionResult(candidate) ? cloneMiTexConversionResult(candidate) : null;
};

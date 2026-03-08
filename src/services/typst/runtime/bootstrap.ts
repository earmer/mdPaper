import { createTypstCompiler, preloadRemoteFonts } from '@myriaddreamin/typst.ts';
import { TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import type { TypstCompiler } from '@myriaddreamin/typst.ts';
import { setImportWasmModule as setCompilerWasmImporter } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import { setImportWasmModule as setRendererWasmImporter } from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import simsunUrl from '@/assets/fonts/simsun.woff2?url';
import stixMathUrl from '@/assets/fonts/stix2math.woff2?url';
import timesUrl from '@/assets/fonts/timesnewroman.woff2?url';
import timesItalicUrl from '@/assets/fonts/timesnewroman-italic.woff2?url';

const fontUrls = [timesUrl, timesItalicUrl, simsunUrl, stixMathUrl];
let compilerPromise: Promise<TypstCompiler> | null = null;
let wasmImporterInitialized = false;
let compileQueue: Promise<void> = Promise.resolve();
let snippetInstance: TypstSnippet | null = null;

const fetchWasmModule = async (wasmUrl: string): Promise<ArrayBuffer> => {
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load Wasm module: ${wasmUrl} (${response.status})`);
  }

  return await response.arrayBuffer();
};

export const ensureBrowserWasmImporters = (): void => {
  if (wasmImporterInitialized || typeof window === 'undefined') {
    return;
  }

  setCompilerWasmImporter(async (wasmName: string) => {
    if (wasmName !== 'typst_ts_web_compiler_bg.wasm') {
      throw new Error(`Unexpected compiler Wasm module: ${wasmName}`);
    }

    return await fetchWasmModule(compilerWasmUrl);
  });

  setRendererWasmImporter(async (wasmName: string) => {
    if (wasmName !== 'typst_ts_renderer_bg.wasm') {
      throw new Error(`Unexpected renderer Wasm module: ${wasmName}`);
    }

    return await fetchWasmModule(rendererWasmUrl);
  });

  wasmImporterInitialized = true;
};

export const withCompileQueue = async <T>(task: () => Promise<T>): Promise<T> => {
  const pending = compileQueue;
  let releaseQueue = (): void => {};
  compileQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await pending;

  try {
    return await task();
  } finally {
    releaseQueue();
  }
};

export const getCompiler = async (): Promise<TypstCompiler> => {
  if (compilerPromise !== null) {
    return compilerPromise;
  }

  compilerPromise = (async () => {
    const compiler = createTypstCompiler();
    await compiler.init({
      beforeBuild: [preloadRemoteFonts(fontUrls)],
    });
    return compiler;
  })();

  return compilerPromise;
};

export const getTypstSnippet = (): TypstSnippet => {
  if (snippetInstance !== null) {
    return snippetInstance;
  }

  snippetInstance = new TypstSnippet({
    compiler: async () => await getCompiler(),
  });

  return snippetInstance;
};

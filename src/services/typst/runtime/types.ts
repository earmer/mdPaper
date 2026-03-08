import type { TypstDiagnostic, TypstTemplateId } from '@/types/manuscript';

export interface TypstVirtualProject {
  mainFilePath: string;
  templateEntryPath: string;
  sourceFiles: Record<string, string>;
  shadowFiles: Record<string, Uint8Array>;
  importStatements: string[];
  resourceWarnings: string[];
}

export interface TypstCompileArtifacts {
  diagnostics: TypstDiagnostic[];
  errorMessage: string;
  generatedSource: string;
  svgContent: string;
  pdfData: Uint8Array | null;
  compiledAt: string;
  templateId: TypstTemplateId;
  virtualProjectSummary: string[];
}

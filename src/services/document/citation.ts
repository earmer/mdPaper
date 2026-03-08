import type { CitationEntry, TypstDiagnostic } from '@/types/manuscript';

export interface CitationRegistry {
  entries: CitationEntry[];
  entryMap: Map<string, CitationEntry>;
  sectionStartLine: number;
  sectionEndLine: number;
}

export interface CitationTokenMatch {
  raw: string;
  keys: string[];
  label: string;
  missingKeys: string[];
}

const referenceHeadingPattern = /^#{2,4}\s*(references|reference|参考文献)\s*$/iu;
const citationPattern = /\[@([^\]]+(?:;\s*@[A-Za-z0-9:_-]+)*)\]/gu;

const isHeading = (line: string): boolean => /^#{1,6}\s+/u.test(line);

export const normalizeCitationKeys = (raw: string): string[] =>
  raw
    .split(';')
    .map((part) => part.trim())
    .map((part) => (part.startsWith('@') ? part.slice(1) : part))
    .filter((part) => part.length > 0);

export const parseCitationRegistry = (source: string): CitationRegistry => {
  const lines = source.split(/\r?\n/u);
  const entries: CitationEntry[] = [];
  const entryMap = new Map<string, CitationEntry>();

  let inReferenceSection = false;
  let sectionDepth = 0;
  let sectionStartLine = -1;
  let sectionEndLine = -1;
  let currentKey = '';
  let currentContent: string[] = [];

  const flushCurrent = (): void => {
    if (currentKey.length === 0) {
      return;
    }

    const content = currentContent.join(' ').replace(/\s+/gu, ' ').trim();
    const entry: CitationEntry = {
      key: currentKey,
      order: entries.length + 1,
      content,
    };
    entries.push(entry);
    entryMap.set(currentKey, entry);
    currentKey = '';
    currentContent = [];
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const headingMatch = line.match(/^(#{1,6})\s+/u);
    if (referenceHeadingPattern.test(line.trim())) {
      flushCurrent();
      inReferenceSection = true;
      sectionDepth = headingMatch?.[1]?.length ?? 2;
      sectionStartLine = lineNo;
      sectionEndLine = lineNo;
      return;
    }

    if (inReferenceSection && isHeading(line) && (headingMatch?.[1]?.length ?? 0) <= sectionDepth) {
      flushCurrent();
      inReferenceSection = false;
      return;
    }

    if (!inReferenceSection) {
      return;
    }

    sectionEndLine = lineNo;
    const matched = line.match(/^\s*(?:[-*+]|\d+\.)\s+\[@([^\]]+)\]\s*(.*)$/u);
    if (matched !== null) {
      flushCurrent();
      currentKey = (matched[1] ?? '').trim();
      currentContent = [(matched[2] ?? '').trim()];
      return;
    }

    if (currentKey.length > 0) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        currentContent.push(trimmed);
      }
    }
  });

  flushCurrent();

  return { entries, entryMap, sectionStartLine, sectionEndLine };
};

export const getCitationDisplay = (
  keys: string[],
  registry: CitationRegistry,
): CitationTokenMatch => {
  const missingKeys = keys.filter((key) => !registry.entryMap.has(key));
  const numbers = keys
    .map((key) => registry.entryMap.get(key)?.order)
    .filter((value): value is number => value !== undefined);
  const label = numbers.length > 0 || missingKeys.length > 0
    ? `[${numbers.join(', ')}${numbers.length > 0 && missingKeys.length > 0 ? ', ' : ''}${missingKeys.map(() => '?').join(', ')}]`
    : '[?]';

  return {
    raw: `[@${keys.join('; @')}]`,
    keys,
    label,
    missingKeys,
  };
};

export const replaceCitationSyntax = (
  text: string,
  registry: CitationRegistry,
  formatter: (match: CitationTokenMatch) => string,
): string => text.replace(citationPattern, (_raw, rawKeys: string) => {
  const keys = normalizeCitationKeys(rawKeys);
  return formatter(getCitationDisplay(keys, registry));
});

export const collectCitationDiagnostics = (
  source: string,
  registry: CitationRegistry,
): TypstDiagnostic[] => {
  const diagnostics: TypstDiagnostic[] = [];
  const seen = new Set<string>();

  registry.entries.forEach((entry) => {
    if (seen.has(entry.key)) {
      diagnostics.push({
        severity: 'warning',
        message: `Duplicate reference key: @${entry.key}`,
        source: 'citation',
      });
      return;
    }

    seen.add(entry.key);
  });

  const found = source.matchAll(citationPattern);
  for (const item of found) {
    const rawKeys = item[1] ?? '';
    normalizeCitationKeys(rawKeys).forEach((key) => {
      if (!registry.entryMap.has(key)) {
        diagnostics.push({
          severity: 'warning',
          message: `Reference key not found: @${key}`,
          source: 'citation',
        });
      }
    });
  }

  return diagnostics;
};

export const stripReferenceMarker = (text: string): string =>
  text.replace(/^\s*\[@[^\]]+\]\s*/u, '').trim();

export const isWithinReferenceSection = (line: number, registry: CitationRegistry): boolean =>
  registry.sectionStartLine > 0
  && registry.sectionEndLine >= registry.sectionStartLine
  && line >= registry.sectionStartLine
  && line <= registry.sectionEndLine;

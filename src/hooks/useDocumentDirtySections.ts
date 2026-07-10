import { useCallback, useRef, useState } from 'react';
import { type DocumentSectionKey, trackedDocumentSections } from '../modules/documentSections';
import { stableStringify } from '../utils/projectDirty';

type SectionHashMap = Partial<Record<DocumentSectionKey, string>>;

function documentRecord(document: unknown): Record<string, unknown> {
  return document && typeof document === 'object' ? (document as Record<string, unknown>) : {};
}

function hashDocumentValue(value: unknown): string {
  return stableStringify(value) ?? 'undefined';
}

function hashDocumentSection(document: unknown, section: DocumentSectionKey): string {
  return hashDocumentValue(documentRecord(document)[section]);
}

function buildDocumentSectionHashes(document: unknown): SectionHashMap {
  return Object.fromEntries(
    trackedDocumentSections.map((section) => [section, hashDocumentSection(document, section)]),
  ) as SectionHashMap;
}

function calculateDirtySections(
  document: unknown,
  baselineHashes: SectionHashMap,
  currentDirtySections: Set<DocumentSectionKey>,
  changedSections?: Iterable<DocumentSectionKey>,
): Set<DocumentSectionKey> {
  const nextDirtySections = new Set(currentDirtySections);
  const sections = changedSections ? [...changedSections] : trackedDocumentSections;

  for (const section of sections) {
    const baselineHash = baselineHashes[section] ?? hashDocumentValue(undefined);
    const currentHash = hashDocumentSection(document, section);
    if (currentHash === baselineHash) {
      nextDirtySections.delete(section);
    } else {
      nextDirtySections.add(section);
    }
  }

  return nextDirtySections;
}

export function useDocumentDirtySections() {
  const baselineHashesRef = useRef<SectionHashMap>({});
  const dirtySectionsRef = useRef<Set<DocumentSectionKey>>(new Set());
  const [dirtySections, setDirtySections] = useState<Set<DocumentSectionKey>>(() => new Set());

  const replaceDirtySections = useCallback((next: Set<DocumentSectionKey>) => {
    dirtySectionsRef.current = next;
    setDirtySections(next);
    return next;
  }, []);

  const resetBaseline = useCallback(
    (document: unknown) => {
      baselineHashesRef.current = buildDocumentSectionHashes(document);
      replaceDirtySections(new Set());
    },
    [replaceDirtySections],
  );

  const clearDirtySections = useCallback(() => {
    replaceDirtySections(new Set());
  }, [replaceDirtySections]);

  const recalculateDirtySections = useCallback(
    (
      document: unknown,
      changedSections?: Iterable<DocumentSectionKey>,
      baselineOverride?: unknown,
    ) => {
      if (baselineOverride !== undefined) {
        baselineHashesRef.current = buildDocumentSectionHashes(baselineOverride);
      }
      return replaceDirtySections(
        calculateDirtySections(
          document,
          baselineHashesRef.current,
          dirtySectionsRef.current,
          changedSections,
        ),
      );
    },
    [replaceDirtySections],
  );

  return {
    clearDirtySections,
    dirtySections,
    recalculateDirtySections,
    resetBaseline,
  };
}

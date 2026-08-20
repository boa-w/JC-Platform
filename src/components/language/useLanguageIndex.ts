import { useMemo } from 'react';
import type { LanguageDocument } from '../../types/platform';
import { isLocaleNameKey } from './localizationAdapter.ts';

export interface LanguageIndex {
  externalKeys: string[];
  visibleLanguageKeys: string[];
  translationKeys: string[];
  searchTextByKey: Map<string, string>;
  progressByCode: Map<string, { translated: number; total: number }>;
}

function translationValues(document: LanguageDocument, key: string): Record<string, string> {
  return (document.list_translate[key] as Record<string, string> | undefined) ?? {};
}

export function buildLanguageIndex(document: LanguageDocument): LanguageIndex {
  const indexedKeys = new Set(document.list_inner);
  const languageNameKeys = new Set(Object.values(document.language_name_keys ?? {}));
  const externalKeys = Object.keys(document.list_translate).filter(
    (key) => !indexedKeys.has(key) && !languageNameKeys.has(key) && !isLocaleNameKey(key),
  );
  const visibleLanguageKeys = [...document.list_inner, ...externalKeys];
  const lockedKeyCount = document.editor_locked_key_count ?? document.list_code_language.length;
  const translationKeys = [...document.list_inner.slice(lockedKeyCount), ...externalKeys];
  const searchTextByKey = new Map<string, string>();
  const progressByCode = new Map<string, { translated: number; total: number }>();

  for (const code of document.list_code_language) {
    progressByCode.set(code, { translated: 0, total: translationKeys.length });
  }

  for (const key of visibleLanguageKeys) {
    const translations = translationValues(document, key);
    searchTextByKey.set(
      key,
      `${key} ${Object.values(translations)
        .filter((value): value is string => typeof value === 'string')
        .join(' ')}`.toLowerCase(),
    );
  }

  for (const key of translationKeys) {
    const translations = translationValues(document, key);
    for (const code of document.list_code_language) {
      const progress = progressByCode.get(code);
      if (progress && translations[code]?.trim()) {
        progress.translated += 1;
      }
    }
  }

  return {
    externalKeys,
    visibleLanguageKeys,
    translationKeys,
    searchTextByKey,
    progressByCode,
  };
}

export function useLanguageIndex(document: LanguageDocument): LanguageIndex {
  return useMemo(() => buildLanguageIndex(document), [document]);
}

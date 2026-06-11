import type { LanguageDocument } from '../../types/platform';

export interface LanguagePageProps {
  document: LanguageDocument;
  loaded: boolean;
  onUpdate: (document: LanguageDocument) => void;
}

export interface LanguageProgress {
  code: string;
  label: string;
  total: number;
  translated: number;
}

export type FilterMode = 'all' | 'translated' | 'untranslated' | 'modified';

export interface TranslationRow {
  key: string;
  index: number;
  isConfigKey: boolean;
  translations: Record<string, string>;
}

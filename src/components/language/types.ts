import type { LanguageDocument } from '../../types/platform';
import type {
  LocalizationScope,
  LocalizationScopeOption,
} from './localizationAdapter';

export interface LanguagePageProps {
  document: LanguageDocument;
  loaded: boolean;
  onUpdate: (document: LanguageDocument) => void;
  scope?: LocalizationScope;
  scopeOptions?: LocalizationScopeOption[];
  scopeDescription?: string;
  onScopeChange?: (scope: LocalizationScope) => void;
  allowLanguageManagement?: boolean;
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
  isInheritedKey?: boolean;
  isExternalKey?: boolean;
  translations: Record<string, string>;
}

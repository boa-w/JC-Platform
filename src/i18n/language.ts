import { getStorageItem, setStorageItem, type StorageLike } from '../utils/safeStorage';
import {
  defaultAppLanguage,
  supportedAppLanguages,
  type AppLanguage,
} from './resources';

export const appLanguageStorageKey = 'jc-platform.language';

function normalizeLanguage(value: string) {
  return value.trim().replace('_', '-').toLowerCase();
}

export function isSupportedAppLanguage(value: string): value is AppLanguage {
  const normalized = normalizeLanguage(value);
  return supportedAppLanguages.some((language) => normalizeLanguage(language) === normalized);
}

export function resolveAppLanguage(candidates: readonly string[]): AppLanguage | null {
  for (const candidate of candidates) {
    const match = supportedAppLanguages.find(
      (language) => normalizeLanguage(language) === normalizeLanguage(candidate),
    );
    if (match) return match;
  }
  return null;
}

export function readStoredAppLanguage(storage?: StorageLike | null): AppLanguage | null {
  const stored = getStorageItem(appLanguageStorageKey, storage);
  return stored && isSupportedAppLanguage(stored) ? resolveAppLanguage([stored]) : null;
}

export function persistAppLanguage(language: AppLanguage, storage?: StorageLike | null) {
  return setStorageItem(appLanguageStorageKey, language, storage);
}

export function detectInitialAppLanguage(options?: {
  storage?: StorageLike | null;
  navigatorLanguages?: readonly string[];
}): AppLanguage {
  const stored = readStoredAppLanguage(options?.storage);
  if (stored) return stored;

  const detected = resolveAppLanguage(
    options?.navigatorLanguages ??
      (typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]),
  );
  return detected ?? defaultAppLanguage;
}

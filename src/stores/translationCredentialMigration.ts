export interface TranslationCredentialStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const storageKey = 'jc-platform.translation-settings';
const legacyLanguageStorageKey = 'jc.language.baiduTranslateConfig';
const sensitiveKeys = ['baiduAppId', 'baiduAppKey', 'appId', 'appKey'] as const;

export interface LegacyTranslationSettings {
  baiduAppId: string;
  baiduAppKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrDefault(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeLegacyTranslationSettings(value: unknown): LegacyTranslationSettings {
  const root = isRecord(value) ? value : {};
  return {
    baiduAppId: stringOrDefault(root.baiduAppId, stringOrDefault(root.appId)),
    baiduAppKey: stringOrDefault(root.baiduAppKey, stringOrDefault(root.appKey)),
  };
}

function readStoredSettings(key: string, storage: TranslationCredentialStorage) {
  const stored = storage.getItem(key);
  if (!stored) return null;
  try {
    const settings = normalizeLegacyTranslationSettings(JSON.parse(stored));
    return settings.baiduAppId || settings.baiduAppKey ? settings : null;
  } catch {
    return null;
  }
}

export function readLegacyTranslationSettings(storage: TranslationCredentialStorage) {
  return (
    readStoredSettings(storageKey, storage) ?? readStoredSettings(legacyLanguageStorageKey, storage)
  );
}

export function clearLegacyTranslationSettings(storage: TranslationCredentialStorage) {
  storage.removeItem(storageKey);
  const legacy = storage.getItem(legacyLanguageStorageKey);
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy);
    if (!isRecord(parsed)) {
      storage.removeItem(legacyLanguageStorageKey);
      return;
    }
    for (const key of sensitiveKeys) delete parsed[key];
    if (Object.keys(parsed).length === 0) {
      storage.removeItem(legacyLanguageStorageKey);
    } else {
      storage.setItem(legacyLanguageStorageKey, JSON.stringify(parsed));
    }
  } catch {
    storage.removeItem(legacyLanguageStorageKey);
  }
}

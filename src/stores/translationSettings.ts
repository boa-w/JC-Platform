import { useEffect, useState } from 'react';

const STORAGE_KEY = 'jc-platform.translation-settings';
const LEGACY_LANGUAGE_STORAGE_KEY = 'jc.language.baiduTranslateConfig';

export interface TranslationSettings {
  baiduAppId: string;
  baiduAppKey: string;
}

const defaultTranslationSettings: TranslationSettings = {
  baiduAppId: '',
  baiduAppKey: '',
};

type TranslationSettingKey = keyof TranslationSettings;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTranslationSettings(value: unknown): TranslationSettings {
  const root = isRecord(value) ? value : {};
  return {
    baiduAppId: stringOrDefault(root.baiduAppId, stringOrDefault(root.appId, '')),
    baiduAppKey: stringOrDefault(root.baiduAppKey, stringOrDefault(root.appKey, '')),
  };
}

function loadLegacyTranslationSettings(): TranslationSettings | null {
  const stored = localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY);
  if (!stored) return null;
  try {
    const settings = normalizeTranslationSettings(JSON.parse(stored));
    return settings.baiduAppId || settings.baiduAppKey ? settings : null;
  } catch {
    return null;
  }
}

function getInitialTranslationSettings(): TranslationSettings {
  if (typeof window === 'undefined') return defaultTranslationSettings;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return normalizeTranslationSettings(JSON.parse(stored));
    } catch {
      return defaultTranslationSettings;
    }
  }
  return loadLegacyTranslationSettings() ?? defaultTranslationSettings;
}

export function useTranslationSettings() {
  const [settings, setSettings] = useState<TranslationSettings>(getInitialTranslationSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  function updateSetting(key: TranslationSettingKey, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function resetSettings() {
    setSettings(defaultTranslationSettings);
  }

  return { settings, updateSetting, resetSettings } as const;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearTranslationCredentials,
  getTranslationCredentialStatus,
  saveTranslationCredentials,
} from '../api/commands';
import {
  clearLegacyTranslationSettings,
  readLegacyTranslationSettings,
  type TranslationCredentialStorage,
} from './translationCredentialMigration';

export interface TranslationSettings {
  baiduAppId: string;
  baiduAppKey: string;
  hasStoredAppKey: boolean;
}

const defaultTranslationSettings: TranslationSettings = {
  baiduAppId: '',
  baiduAppKey: '',
  hasStoredAppKey: false,
};

type TranslationSettingKey = 'baiduAppId' | 'baiduAppKey';

function browserCredentialStorage(): TranslationCredentialStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useTranslationSettings() {
  const { t } = useTranslation();
  const desktopRuntime = isTauriRuntime();
  const [settings, setSettings] = useState<TranslationSettings>(defaultTranslationSettings);
  const [isLoading, setIsLoading] = useState(desktopRuntime);
  const [operation, setOperation] = useState<'save' | 'clear' | null>(null);
  const [message, setMessage] = useState<string | null>(
    desktopRuntime ? null : t('translationSettings.browserNotSaved'),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!desktopRuntime) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const storage = browserCredentialStorage();
        const legacy = storage ? readLegacyTranslationSettings(storage) : null;
        const status = legacy
          ? await saveTranslationCredentials({
              appId: legacy.baiduAppId.trim(),
              appKey: legacy.baiduAppKey.trim() || null,
            })
          : await getTranslationCredentialStatus();
        if (legacy && storage) clearLegacyTranslationSettings(storage);
        if (cancelled) return;
        setSettings({
          baiduAppId: status.appId,
          baiduAppKey: '',
          hasStoredAppKey: status.hasAppKey,
        });
        setMessage(legacy ? t('translationSettings.legacyMigrated') : null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, t]);

  const updateSetting = useCallback((key: TranslationSettingKey, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }, []);

  const saveSettings = useCallback(async () => {
    if (!desktopRuntime) {
      setMessage(t('translationSettings.browserNotSaved'));
      return false;
    }
    setOperation('save');
    setMessage(null);
    setError(null);
    try {
      const status = await saveTranslationCredentials({
        appId: settings.baiduAppId.trim(),
        appKey: settings.baiduAppKey.trim() || null,
      });
      setSettings({
        baiduAppId: status.appId,
        baiduAppKey: '',
        hasStoredAppKey: status.hasAppKey,
      });
      setMessage(t('translationSettings.saved'));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setOperation(null);
    }
  }, [desktopRuntime, settings.baiduAppId, settings.baiduAppKey, t]);

  const resetSettings = useCallback(async () => {
    setMessage(null);
    setError(null);
    if (desktopRuntime) {
      setOperation('clear');
      try {
        await clearTranslationCredentials();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setOperation(null);
        return false;
      }
      setOperation(null);
    }
    setSettings(defaultTranslationSettings);
    setMessage(
      desktopRuntime ? t('translationSettings.deleted') : t('translationSettings.browserCleared'),
    );
    const storage = browserCredentialStorage();
    if (storage) clearLegacyTranslationSettings(storage);
    return true;
  }, [desktopRuntime, t]);

  const isConfigured = useMemo(
    () => settings.baiduAppId.trim() !== '' && settings.hasStoredAppKey,
    [settings.baiduAppId, settings.hasStoredAppKey],
  );

  return {
    desktopRuntime,
    error,
    isBusy: operation !== null,
    isClearing: operation === 'clear',
    isConfigured,
    isLoading,
    isSaving: operation === 'save',
    message,
    resetSettings,
    saveSettings,
    settings,
    updateSetting,
  } as const;
}

export type TranslationSettingsController = ReturnType<typeof useTranslationSettings>;

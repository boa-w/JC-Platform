import { Save, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { featureModules } from '../../data/modules';
import { navGroups } from '../../data/navigation';
import { useAppLanguage } from '../../i18n';
import { type AppLanguage, appLanguageLabelKeys } from '../../i18n/resources';
import type { ModuleVisibilityController } from '../../stores/moduleVisibility';
import type { TranslationSettingsController } from '../../stores/translationSettings';
import './settings.css';

interface SettingsPageProps {
  translationController: TranslationSettingsController;
  moduleVisibility: ModuleVisibilityController;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}
export function SettingsPage({
  translationController,
  moduleVisibility,
  theme,
  onToggleTheme,
}: SettingsPageProps) {
  const { t } = useTranslation();
  const { language, supportedLanguages, changeLanguage } = useAppLanguage();
  const [pendingReset, setPendingReset] = useState<'translation' | null>(null);
  const credentialStatusId = useId();
  const {
    desktopRuntime,
    error: credentialError,
    isBusy: credentialBusy,
    isClearing: credentialClearing,
    isLoading: credentialLoading,
    isSaving: credentialSaving,
    message: credentialMessage,
    resetSettings: resetTranslationSettings,
    saveSettings: saveTranslationSettings,
    settings: translationSettings,
    updateSetting: updateTranslationSetting,
  } = translationController;

  const confirmReset = () => {
    if (pendingReset === 'translation') resetTranslationSettings();
    setPendingReset(null);
  };

  const credentialStatus =
    credentialError ??
    credentialMessage ??
    (credentialLoading
      ? t('settings.credentials.reading')
      : translationSettings.hasStoredAppKey
        ? t('settings.credentials.protected')
        : t('settings.credentials.notSaved'));
  const saveCredentialsDisabled =
    credentialLoading ||
    credentialBusy ||
    !desktopRuntime ||
    !translationSettings.baiduAppId.trim() ||
    (!translationSettings.hasStoredAppKey && !translationSettings.baiduAppKey.trim());
  const clearCredentialsDisabled =
    credentialLoading ||
    credentialBusy ||
    (!translationSettings.hasStoredAppKey &&
      !translationSettings.baiduAppId.trim() &&
      !translationSettings.baiduAppKey.trim());

  return (
    <>
      <section className="project-open-card">
        <div>
          <h2>{t('settings.title')}</h2>
          <p>{t('settings.description')}</p>
        </div>
        <strong className="section-label--muted">{t('settings.translation.sectionTitle')}</strong>
        <div className="settings-service-panel">
          <div className="settings-service-info">
            <span>{t('settings.translation.baidu')}</span>
            <small>{t('settings.translation.baiduDescription')}</small>
          </div>
          <label className="settings-field">
            <span>App ID</span>
            <input
              autoComplete="off"
              disabled={credentialLoading || credentialBusy}
              value={translationSettings.baiduAppId}
              onChange={(event) => updateTranslationSetting('baiduAppId', event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input
              aria-describedby={credentialStatusId}
              autoComplete="new-password"
              disabled={credentialLoading || credentialBusy}
              placeholder={
                translationSettings.hasStoredAppKey
                  ? t('settings.credentials.replacePlaceholder')
                  : t('settings.credentials.apiKeyPlaceholder')
              }
              type="password"
              value={translationSettings.baiduAppKey}
              onChange={(event) => updateTranslationSetting('baiduAppKey', event.target.value)}
            />
          </label>
          <div className="settings-option-footer settings-option-footer--compact">
            <span
              className={
                credentialError
                  ? 'settings-credential-status settings-credential-status--error'
                  : 'settings-credential-status'
              }
              id={credentialStatusId}
              role={credentialError ? 'alert' : 'status'}
            >
              <ShieldCheck aria-hidden="true" size={14} strokeWidth={1.8} />
              {credentialStatus}
            </span>
            <div className="settings-credential-actions">
              <button
                className="settings-primary-action"
                disabled={saveCredentialsDisabled}
                onClick={() => void saveTranslationSettings()}
                type="button"
              >
                <Save aria-hidden="true" size={14} strokeWidth={1.8} />
                {t(credentialSaving ? 'settings.credentials.saving' : 'settings.credentials.save')}
              </button>
              <button
                disabled={clearCredentialsDisabled}
                onClick={() => setPendingReset('translation')}
                type="button"
              >
                {t(
                  credentialClearing
                    ? 'settings.credentials.clearing'
                    : 'settings.credentials.clear',
                )}
              </button>
            </div>
          </div>
          <small className="settings-credential-privacy">{t('settings.credentials.privacy')}</small>
        </div>
        <strong className="section-label--muted">
          {t('settings.interfaceLanguage.sectionTitle')}
        </strong>
        <label className="settings-field">
          <span>{t('settings.interfaceLanguage.label')}</span>
          <select
            onChange={(event) => void changeLanguage(event.target.value as AppLanguage)}
            value={language}
          >
            {supportedLanguages.map((supportedLanguage) => (
              <option key={supportedLanguage} value={supportedLanguage}>
                {t(appLanguageLabelKeys[supportedLanguage])}
              </option>
            ))}
          </select>
          <small>{t('settings.interfaceLanguage.description')}</small>
        </label>
        <strong className="section-label--muted">{t('settings.functionPages.sectionTitle')}</strong>
        <div className="settings-function-pages">
          <div className="settings-function-pages-header">
            <small>{t('settings.functionPages.description')}</small>
            <button
              disabled={moduleVisibility.hiddenKeys.size === 0}
              onClick={moduleVisibility.showAllModules}
              type="button"
            >
              {t('settings.functionPages.showAll')}
            </button>
          </div>
          {navGroups.map((group) => {
            const groupModules = group.keys
              .map((key) => featureModules.find((module) => module.key === key))
              .filter(Boolean);
            if (groupModules.length === 0) return null;
            return (
              <div className="settings-function-group" key={group.id}>
                <span className="settings-function-group-label">{t(group.labelKey)}</span>
                {groupModules.map((module) => {
                  if (!module) return null;
                  const hidden = moduleVisibility.hiddenKeys.has(module.key);
                  const alwaysVisible = module.key === 'project';
                  return (
                    <label
                      className={
                        alwaysVisible ? 'settings-function-row--locked' : 'settings-function-row'
                      }
                      key={module.key}
                    >
                      <span className="settings-function-row-label">
                        {t(module.titleKey)}
                        {alwaysVisible ? (
                          <small>{t('settings.functionPages.alwaysVisible')}</small>
                        ) : null}
                      </span>
                      <button
                        aria-checked={!hidden}
                        aria-label={t(module.titleKey)}
                        className="theme-toggle-btn"
                        disabled={alwaysVisible}
                        onClick={() => moduleVisibility.setModuleVisible(module.key, hidden)}
                        role="switch"
                        type="button"
                      >
                        <span
                          className={`theme-toggle-track ${!hidden ? 'theme-toggle-track--dark' : ''}`}
                        >
                          <span className="theme-toggle-thumb" />
                        </span>
                      </button>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <strong className="section-label--muted">{t('settings.appearance.sectionTitle')}</strong>
        <div className="theme-toggle-row">
          <div className="theme-toggle-info">
            <span>{t('settings.appearance.themeMode')}</span>
            <small>
              {t(theme === 'dark' ? 'settings.appearance.dark' : 'settings.appearance.light')}
            </small>
          </div>
          <button
            aria-checked={theme === 'dark'}
            aria-label={t('settings.appearance.dark')}
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            role="switch"
            type="button"
          >
            <span
              className={`theme-toggle-track ${theme === 'dark' ? 'theme-toggle-track--dark' : ''}`}
            >
              <span className="theme-toggle-thumb" />
            </span>
          </button>
        </div>
      </section>
      {pendingReset ? (
        <ConfirmDialog
          confirmLabel={t('settings.credentials.clear')}
          danger
          message={t('settings.credentials.clearConfirmMessage')}
          onCancel={() => setPendingReset(null)}
          onConfirm={confirmReset}
          title={t('settings.credentials.clearConfirmTitle')}
        />
      ) : null}
    </>
  );
}

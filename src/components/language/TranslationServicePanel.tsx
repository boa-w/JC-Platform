type TranslateScope = 'empty' | 'filtered' | 'selected';
type TranslateLogLevel = 'info' | 'success' | 'warning' | 'error';

interface TranslationLanguageOption {
  code: string;
  label: string;
}

interface TranslateProgress {
  total: number;
  done: number;
  success: number;
  failed: number;
  currentKey: string;
}

interface TranslateLogEntry {
  id: number;
  level: TranslateLogLevel;
  message: string;
  key?: string;
  time: string;
}

interface TranslationServicePanelProps {
  languages: TranslationLanguageOption[];
  sourceLanguage: string;
  targetLanguage: string | null;
  scope: TranslateScope;
  status: string;
  isTranslating: boolean;
  disabled: boolean;
  configured: boolean;
  filteredCount: number;
  selectedCount: number;
  progress: TranslateProgress;
  logs: TranslateLogEntry[];
  showLogs: boolean;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string | null) => void;
  onScopeChange: (value: TranslateScope) => void;
  onTranslate: () => void;
  onCancelTranslate: () => void;
  onToggleLogs: () => void;
  onClearLogs: () => void;
}

export function TranslationServicePanel({
  languages,
  sourceLanguage,
  targetLanguage,
  scope,
  status,
  isTranslating,
  disabled,
  configured,
  filteredCount,
  selectedCount,
  progress,
  logs,
  showLogs,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onScopeChange,
  onTranslate,
  onCancelTranslate,
  onToggleLogs,
  onClearLogs,
}: TranslationServicePanelProps) {
  const { t } = useTranslation();
  const progressPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="lang-translate-panel">
      <div className="lang-translate-fields">
        <label className="lang-translate-field lang-translate-field--language">
          <span>{t('language.service.sourceLanguage')}</span>
          <select
            value={sourceLanguage}
            onChange={(event) => onSourceLanguageChange(event.target.value)}
          >
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label} ({language.code})
              </option>
            ))}
          </select>
        </label>
        <label className="lang-translate-field lang-translate-field--language">
          <span>{t('language.service.targetLanguage')}</span>
          <select
            value={targetLanguage ?? ''}
            onChange={(event) => onTargetLanguageChange(event.target.value || null)}
          >
            <option value="">{t('language.service.selectPlaceholder')}</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label} ({language.code})
              </option>
            ))}
          </select>
        </label>
        <label className="lang-translate-field lang-translate-field--scope">
          <span>{t('language.service.scope')}</span>
          <select
            value={scope}
            onChange={(event) => onScopeChange(event.target.value as TranslateScope)}
          >
            <option value="empty">{t('language.service.scopes.empty')}</option>
            <option value="filtered">{t('language.service.scopes.filtered')}</option>
            <option value="selected">{t('language.service.scopes.selected')}</option>
          </select>
        </label>
        <div className="lang-translate-selection-state">
          <span>{t('language.service.selected')}</span>
          <strong>{t('language.service.itemCount', { count: selectedCount })}</strong>
        </div>
        <div className="lang-translate-service-state">
          <span>{t('language.service.baidu')}</span>
          <strong className={configured ? 'ready' : 'missing'}>
            {t(configured ? 'language.service.configured' : 'language.service.notConfigured')}
          </strong>
        </div>
      </div>
      <div className="lang-translate-actions">
        <span aria-live="polite" className="lang-translate-status" role="status">
          {status}
        </span>
        {isTranslating ? (
          <button className="lang-btn lang-btn--ghost" onClick={onCancelTranslate} type="button">
            {t('common.actions.cancel')}
          </button>
        ) : null}
        <button
          className="lang-btn lang-btn--primary"
          disabled={
            disabled ||
            !configured ||
            isTranslating ||
            filteredCount === 0 ||
            (scope === 'selected' && selectedCount === 0)
          }
          onClick={onTranslate}
          type="button"
        >
          {t(isTranslating ? 'language.service.translating' : 'language.service.baidu')}
        </button>
      </div>
      {progress.total > 0 ? (
        <div className="lang-translate-progress">
          <div className="lang-translate-progress-header">
            <span>
              {progress.done}/{progress.total} ({progressPercent}%)
            </span>
            <span>
              {t('language.service.progressResult', {
                success: progress.success,
                failed: progress.failed,
              })}
              {progress.currentKey
                ? t('language.service.currentKey', { key: progress.currentKey })
                : ''}
            </span>
          </div>
          <div className="lang-translate-progress-bar">
            <div
              className="lang-translate-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="lang-translate-logbar">
        <button className="lang-btn lang-btn--ghost" onClick={onToggleLogs} type="button">
          {showLogs
            ? t('language.service.hideLogs')
            : t('language.service.logs', { count: logs.length })}
        </button>
        {logs.length > 0 ? (
          <button className="lang-btn lang-btn--ghost" onClick={onClearLogs} type="button">
            {t('language.service.clearLogs')}
          </button>
        ) : null}
      </div>
      {showLogs ? (
        <div className="lang-translate-log">
          {logs.length === 0 ? (
            <span className="lang-translate-log-empty">{t('language.service.noLogs')}</span>
          ) : (
            logs.map((entry) => (
              <div
                className={`lang-translate-log-entry ${entry.level}${entry.key ? '' : ' no-key'}`}
                key={entry.id}
              >
                <span className="lang-translate-log-time">{entry.time}</span>
                {entry.key ? <span className="lang-translate-log-key">{entry.key}</span> : null}
                <span className="lang-translate-log-message">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export type { TranslateLogEntry, TranslateLogLevel, TranslateProgress, TranslateScope };
import { useTranslation } from 'react-i18next';

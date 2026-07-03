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
  const progressPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="lang-translate-panel">
      <div className="lang-translate-fields">
        <label className="lang-translate-field lang-translate-field--language">
          <span>源语言</span>
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
          <span>目标语言</span>
          <select
            value={targetLanguage ?? ''}
            onChange={(event) => onTargetLanguageChange(event.target.value || null)}
          >
            <option value="">请选择</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label} ({language.code})
              </option>
            ))}
          </select>
        </label>
        <label className="lang-translate-field lang-translate-field--scope">
          <span>范围</span>
          <select
            value={scope}
            onChange={(event) => onScopeChange(event.target.value as TranslateScope)}
          >
            <option value="empty">仅空白目标列</option>
            <option value="filtered">当前筛选全部</option>
            <option value="selected">已选择条目</option>
          </select>
        </label>
        <div className="lang-translate-selection-state">
          <span>已选择</span>
          <strong>{selectedCount} 条</strong>
        </div>
        <div className="lang-translate-service-state">
          <span>百度翻译</span>
          <strong className={configured ? 'ready' : 'missing'}>
            {configured ? '已配置' : '未配置'}
          </strong>
        </div>
      </div>
      <div className="lang-translate-actions">
        <span className="lang-translate-status">{status}</span>
        {isTranslating ? (
          <button className="lang-btn lang-btn--ghost" onClick={onCancelTranslate} type="button">
            取消
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
          {isTranslating ? '翻译中...' : '百度翻译'}
        </button>
      </div>
      {progress.total > 0 ? (
        <div className="lang-translate-progress">
          <div className="lang-translate-progress-header">
            <span>
              {progress.done}/{progress.total} ({progressPercent}%)
            </span>
            <span>
              成功 {progress.success}，失败 {progress.failed}
              {progress.currentKey ? `，当前 ${progress.currentKey}` : ''}
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
          {showLogs ? '隐藏日志' : `翻译日志 (${logs.length})`}
        </button>
        {logs.length > 0 ? (
          <button className="lang-btn lang-btn--ghost" onClick={onClearLogs} type="button">
            清空日志
          </button>
        ) : null}
      </div>
      {showLogs ? (
        <div className="lang-translate-log">
          {logs.length === 0 ? (
            <span className="lang-translate-log-empty">暂无日志</span>
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

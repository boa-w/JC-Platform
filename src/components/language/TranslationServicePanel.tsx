type TranslateScope = 'empty' | 'filtered' | 'selected';

interface TranslationLanguageOption {
  code: string;
  label: string;
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
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string | null) => void;
  onScopeChange: (value: TranslateScope) => void;
  onTranslate: () => void;
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
  onSourceLanguageChange,
  onTargetLanguageChange,
  onScopeChange,
  onTranslate,
}: TranslationServicePanelProps) {
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
    </div>
  );
}

export type { TranslateScope };

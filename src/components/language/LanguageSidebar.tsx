import { useState } from 'react';
import type { LanguageDocument } from '../../types/platform';
import type { LanguageProgress } from './types';

interface LanguageSidebarProps {
  document: LanguageDocument;
  selectedLanguage: string | null;
  onSelectLanguage: (code: string | null) => void;
  onAddLanguage: (code: string, label: string) => void;
  onRemoveLanguage: (code: string) => void;
}

function computeProgress(document: LanguageDocument, code: string): { translated: number; total: number } {
  const keys = document.list_inner.slice(document.list_code_language.length);
  let translated = 0;
  for (const key of keys) {
    const translations = document.list_translate[key] as Record<string, string> | undefined;
    if (translations && translations[code] && translations[code].trim() !== '') {
      translated++;
    }
  }
  return { translated, total: keys.length };
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

export function LanguageSidebar({ document, selectedLanguage, onSelectLanguage, onAddLanguage, onRemoveLanguage }: LanguageSidebarProps) {
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const totalKeys = document.list_inner.length - document.list_code_language.length;

  const progressList: LanguageProgress[] = document.list_code_language.map((code) => {
    const { translated, total } = computeProgress(document, code);
    return { code, label: getLabel(document, code), total, translated };
  });

  function handleAdd() {
    if (newCode.trim() && newLabel.trim()) {
      onAddLanguage(newCode.trim(), newLabel.trim());
      setNewCode('');
      setNewLabel('');
      setShowAdd(false);
    }
  }

  return (
    <aside className="lang-sidebar">
      <div className="lang-sidebar-header">
        <h3>语言</h3>
        <button className="lang-btn lang-btn--icon" onClick={() => setShowAdd(!showAdd)} type="button" title="添加语言">
          {showAdd ? '×' : '+'}
        </button>
      </div>

      {showAdd ? (
        <div className="lang-sidebar-add">
          <input
            placeholder="代码 (en)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            placeholder="名称 (English)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="lang-btn lang-btn--primary" disabled={!newCode.trim() || !newLabel.trim()} onClick={handleAdd} type="button">
            添加
          </button>
        </div>
      ) : null}

      <div className="lang-sidebar-list">
        {progressList.map((lang) => {
          const pct = lang.total > 0 ? Math.round((lang.translated / lang.total) * 100) : 0;
          const isSelected = selectedLanguage === lang.code;
          const isZh = lang.code === 'zh';
          return (
            <button
              className={`lang-sidebar-item ${isSelected ? 'active' : ''} ${isZh ? 'lang-sidebar-item--zh' : ''}`}
              key={lang.code}
              onClick={() => onSelectLanguage(isSelected ? null : lang.code)}
              type="button"
            >
              <div className="lang-sidebar-item-header">
                <span className="lang-sidebar-code">{lang.code}</span>
                <span className="lang-sidebar-label">{lang.label}</span>
                {!isZh ? (
                  <button
                    className="lang-sidebar-remove"
                    onClick={(e) => { e.stopPropagation(); onRemoveLanguage(lang.code); }}
                    type="button"
                    title="删除语言"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="lang-sidebar-progress">
                <div className="lang-sidebar-progress-bar">
                  <div className="lang-sidebar-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="lang-sidebar-progress-text">{lang.translated}/{lang.total}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="lang-sidebar-footer">
        <span>{document.list_code_language.length} 种语言</span>
        <span>{totalKeys} 个翻译键</span>
      </div>
    </aside>
  );
}

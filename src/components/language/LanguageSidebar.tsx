import { useState } from 'react';
import type { LanguageDocument } from '../../types/platform';
import { ConfirmDialog } from '../ConfirmDialog';
import type { LanguageProgress } from './types';
import type { LanguageIndex } from './useLanguageIndex';

interface LanguageSidebarProps {
  document: LanguageDocument;
  languageIndex: LanguageIndex;
  selectedLanguage: string | null;
  onSelectLanguage: (code: string | null) => void;
  onAddLanguage: (code: string, label: string) => void;
  onUpdateLanguage: (oldCode: string, newCode: string, newLabel: string) => void;
  onRemoveLanguage: (code: string) => void;
}

const commonLanguages = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'pl', label: 'Polski' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'sv', label: 'Svenska' },
];

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

export function LanguageSidebar({
  document,
  languageIndex,
  selectedLanguage,
  onSelectLanguage,
  onAddLanguage,
  onUpdateLanguage,
  onRemoveLanguage,
}: LanguageSidebarProps) {
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingLang, setEditingLang] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const totalKeys = languageIndex.translationKeys.length;

  const progressList: LanguageProgress[] = document.list_code_language.map((code) => {
    const { translated, total } = languageIndex.progressByCode.get(code) ?? {
      translated: 0,
      total: totalKeys,
    };
    return { code, label: getLabel(document, code), total, translated };
  });

  const availableLanguages = commonLanguages.filter(
    (l) => !document.list_code_language.includes(l.code),
  );

  function handleAdd() {
    const code = newCode.trim().toLowerCase();
    const label = newLabel.trim();
    if (!code || !label) return;
    if (document.list_code_language.includes(code)) return;
    onAddLanguage(code, label);
    setNewCode('');
    setNewLabel('');
    setShowAdd(false);
  }

  function handleQuickAdd(code: string, label: string) {
    if (!document.list_code_language.includes(code)) {
      onAddLanguage(code, label);
    }
  }

  function handleConfirmDelete() {
    if (confirmDelete) {
      onRemoveLanguage(confirmDelete);
      setConfirmDelete(null);
    }
  }

  function startEditLang(code: string) {
    setEditingLang(code);
    setEditCode(code);
    setEditLabel(getLabel(document, code));
  }

  function commitEditLang() {
    if (!editingLang) return;
    const newCode = editCode.trim().toLowerCase();
    const newLabel = editLabel.trim();
    if (!newCode || !newLabel) {
      setEditingLang(null);
      return;
    }
    if (newCode !== editingLang || newLabel !== getLabel(document, editingLang)) {
      onUpdateLanguage(editingLang, newCode, newLabel);
    }
    setEditingLang(null);
  }

  const deleteTarget = confirmDelete ? getLabel(document, confirmDelete) : '';
  const deleteCount = confirmDelete
    ? (languageIndex.progressByCode.get(confirmDelete)?.translated ?? 0)
    : 0;

  return (
    <aside className="lang-sidebar">
      <div className="lang-sidebar-header">
        <h3>语言</h3>
        <button
          className="lang-btn lang-btn--icon"
          onClick={() => setShowAdd(!showAdd)}
          type="button"
          title="添加语言"
        >
          {showAdd ? '×' : '+'}
        </button>
      </div>

      {showAdd ? (
        <div className="lang-sidebar-add">
          <div className="lang-sidebar-add-common">
            <span className="lang-sidebar-add-label">常用语言：</span>
            <div className="lang-sidebar-add-chips">
              {availableLanguages.slice(0, 8).map((lang) => (
                <button
                  className="lang-sidebar-add-chip"
                  key={lang.code}
                  onClick={() => handleQuickAdd(lang.code, lang.label)}
                  type="button"
                  title={`${lang.label} (${lang.code})`}
                >
                  {lang.code}
                </button>
              ))}
            </div>
          </div>
          <div className="lang-sidebar-add-custom">
            <span className="lang-sidebar-add-label">自定义：</span>
            <div className="lang-sidebar-add-form">
              <input
                placeholder="代码"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                placeholder="名称"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button
                className="lang-btn lang-btn--primary"
                disabled={!newCode.trim() || !newLabel.trim()}
                onClick={handleAdd}
                type="button"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lang-sidebar-list">
        {progressList.map((lang) => {
          const pct = lang.total > 0 ? Math.round((lang.translated / lang.total) * 100) : 0;
          const isSelected = selectedLanguage === lang.code;
          const isZh = lang.code === 'zh';
          const isEditing = editingLang === lang.code;
          return (
            <button
              className={`lang-sidebar-item ${isSelected ? 'active' : ''} ${isZh ? 'lang-sidebar-item--zh' : ''}`}
              key={lang.code}
              onClick={() => {
                if (!isEditing) onSelectLanguage(isSelected ? null : lang.code);
              }}
              type="button"
            >
              <div className="lang-sidebar-item-header">
                {isEditing ? (
                  <>
                    <input
                      className="lang-sidebar-edit-input lang-sidebar-edit-code"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditLang();
                        if (e.key === 'Escape') setEditingLang(null);
                      }}
                      disabled={isZh}
                    />
                    <input
                      className="lang-sidebar-edit-input lang-sidebar-edit-label"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditLang();
                        if (e.key === 'Escape') setEditingLang(null);
                      }}
                      onBlur={commitEditLang}
                    />
                  </>
                ) : (
                  <>
                    <span className="lang-sidebar-code">{lang.code}</span>
                    <span className="lang-sidebar-label">{lang.label}</span>
                    <div className="lang-sidebar-item-actions">
                      {!isZh ? (
                        <button
                          className="lang-sidebar-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditLang(lang.code);
                          }}
                          type="button"
                          title="编辑语言"
                        >
                          ✎
                        </button>
                      ) : null}
                      {!isZh ? (
                        <button
                          className="lang-sidebar-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(lang.code);
                          }}
                          type="button"
                          title="删除语言"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              <div className="lang-sidebar-progress">
                <div className="lang-sidebar-progress-bar">
                  <div className="lang-sidebar-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="lang-sidebar-progress-text">
                  {lang.translated}/{lang.total}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="lang-sidebar-footer">
        <span>{document.list_code_language.length} 种语言</span>
        <span>{totalKeys} 个翻译键</span>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="删除语言"
          message={`确定要删除「${deleteTarget}」吗？${deleteCount > 0 ? `该语言已有 ${deleteCount} 条翻译将被移除。` : ''}`}
          confirmLabel="删除"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </aside>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <h3>{t('language.sidebar.title')}</h3>
        <button
          className="lang-btn lang-btn--icon"
          onClick={() => setShowAdd(!showAdd)}
          type="button"
          title={t('language.sidebar.addLanguage')}
        >
          {showAdd ? '×' : '+'}
        </button>
      </div>

      {showAdd ? (
        <div className="lang-sidebar-add">
          <div className="lang-sidebar-add-common">
            <span className="lang-sidebar-add-label">{t('language.sidebar.common')}</span>
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
            <span className="lang-sidebar-add-label">{t('language.sidebar.custom')}</span>
            <div className="lang-sidebar-add-form">
              <input
                aria-label={t('language.sidebar.newCodeLabel')}
                placeholder={t('language.sidebar.codePlaceholder')}
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                aria-label={t('language.sidebar.newNameLabel')}
                placeholder={t('language.sidebar.namePlaceholder')}
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
                {t('language.sidebar.add')}
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
            <div
              className={`lang-sidebar-item ${isSelected ? 'active' : ''} ${isZh ? 'lang-sidebar-item--zh' : ''}`}
              key={lang.code}
            >
              {isEditing ? (
                <div className="lang-sidebar-edit">
                  <div className="lang-sidebar-item-header">
                    <input
                      aria-label={t('language.sidebar.editCode', { language: lang.label })}
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
                      aria-label={t('language.sidebar.editName', { code: lang.code })}
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
                  </div>
                  <div className="lang-sidebar-progress">
                    <div className="lang-sidebar-progress-bar">
                      <div className="lang-sidebar-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="lang-sidebar-progress-text">
                      {lang.translated}/{lang.total}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    aria-pressed={isSelected}
                    className="lang-sidebar-select"
                    onClick={() => onSelectLanguage(isSelected ? null : lang.code)}
                    type="button"
                  >
                    <div className="lang-sidebar-item-header">
                      <span className="lang-sidebar-code">{lang.code}</span>
                      <span className="lang-sidebar-label">{lang.label}</span>
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
                  {!isZh ? (
                    <div className="lang-sidebar-item-actions">
                      <button
                        aria-label={t('language.sidebar.editLanguage', { language: lang.label })}
                        className="lang-sidebar-action-btn"
                        onClick={() => startEditLang(lang.code)}
                        type="button"
                        title={t('language.sidebar.editLanguageTitle')}
                      >
                        ✎
                      </button>
                      <button
                        aria-label={t('language.sidebar.deleteLanguage', { language: lang.label })}
                        className="lang-sidebar-remove"
                        onClick={() => setConfirmDelete(lang.code)}
                        type="button"
                        title={t('language.sidebar.deleteLanguageTitle')}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="lang-sidebar-footer">
        <span>{t('language.sidebar.languageCount', { count: document.list_code_language.length })}</span>
        <span>{t('language.sidebar.keyCount', { count: totalKeys })}</span>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={t('language.sidebar.deleteDialogTitle')}
          message={`${t('language.sidebar.deleteDialogMessage', { language: deleteTarget })}${
            deleteCount > 0 ? t('language.sidebar.deleteTranslationCount', { count: deleteCount }) : ''
          }`}
          confirmLabel={t('language.table.delete')}
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </aside>
  );
}

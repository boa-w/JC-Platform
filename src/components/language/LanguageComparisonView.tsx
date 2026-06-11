import { useState } from 'react';
import type { LanguageDocument } from '../../types/platform';

interface LanguageComparisonViewProps {
  document: LanguageDocument;
  onUpdate: (document: LanguageDocument) => void;
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

export function LanguageComparisonView({ document, onUpdate }: LanguageComparisonViewProps) {
  const [editingCell, setEditingCell] = useState<{ key: string; code: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const translationKeys = document.list_inner.slice(document.list_code_language.length);

  function handleStartEdit(key: string, code: string, currentValue: string) {
    setEditingCell({ key, code });
    setEditValue(currentValue);
  }

  function handleCommitEdit() {
    if (!editingCell) return;
    const { key, code } = editingCell;
    const translations = (document.list_translate[key] as Record<string, string>) ?? {};
    if (editValue !== (translations[code] ?? '')) {
      onUpdate({
        ...document,
        list_translate: {
          ...document.list_translate,
          [key]: { ...translations, [code]: editValue },
        },
      });
    }
    setEditingCell(null);
  }

  function handleRemoveKey(index: number) {
    const key = document.list_inner[index];
    const nextInner = document.list_inner.filter((_, i) => i !== index);
    const nextTranslate = { ...document.list_translate };
    delete nextTranslate[key];
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
  }

  function computeCompletionStats() {
    return document.list_code_language.map((code) => {
      let translated = 0;
      for (const key of translationKeys) {
        const translations = document.list_translate[key] as Record<string, string> | undefined;
        if (translations && translations[code] && translations[code].trim() !== '') {
          translated++;
        }
      }
      return { code, label: getLabel(document, code), translated, total: translationKeys.length };
    });
  }

  const stats = computeCompletionStats();

  return (
    <div className="lang-comparison">
      <div className="lang-comparison-header">
        <div className="lang-comparison-stats">
          {stats.map((stat) => {
            const pct = stat.total > 0 ? Math.round((stat.translated / stat.total) * 100) : 0;
            return (
              <div className="lang-comparison-stat" key={stat.code}>
                <span className="lang-comparison-stat-code">{stat.code}</span>
                <div className="lang-comparison-stat-bar">
                  <div className="lang-comparison-stat-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="lang-comparison-stat-text">{stat.translated}/{stat.total}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="lang-comparison-table-wrap">
        <table className="lang-comparison-table">
          <thead>
            <tr>
              <th className="lang-comparison-th-key">翻译键</th>
              {document.list_code_language.map((code) => (
                <th className="lang-comparison-th-lang" key={code}>
                  <span className="lang-comparison-th-code">{code}</span>
                  <span className="lang-comparison-th-label">{getLabel(document, code)}</span>
                </th>
              ))}
              <th className="lang-comparison-th-actions" />
            </tr>
          </thead>
          <tbody>
            {translationKeys.length === 0 ? (
              <tr>
                <td className="lang-comparison-empty" colSpan={document.list_code_language.length + 2}>
                  暂无翻译条目
                </td>
              </tr>
            ) : null}
            {translationKeys.map((key, rowIndex) => {
              const actualIndex = rowIndex + document.list_code_language.length;
              return (
                <tr key={`${key}-${rowIndex}`}>
                  <td className="lang-comparison-cell-key">
                    <span className="lang-comparison-key-text">{key}</span>
                  </td>
                  {document.list_code_language.map((code) => {
                    const translations = (document.list_translate[key] as Record<string, string>) ?? {};
                    const value = translations[code] ?? '';
                    const isEditing = editingCell?.key === key && editingCell?.code === code;
                    const isEmpty = !value || value.trim() === '';
                    return (
                      <td
                        className={`lang-comparison-cell ${isEmpty ? 'lang-comparison-cell--empty' : ''}`}
                        key={`${key}-${code}`}
                        onClick={() => !isEditing && handleStartEdit(key, code, value)}
                      >
                        {isEditing ? (
                          <input
                            className="lang-comparison-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="lang-comparison-value">{value || '—'}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="lang-comparison-cell-actions">
                    <button
                      className="lang-btn lang-btn--icon lang-btn--danger"
                      onClick={() => handleRemoveKey(actualIndex)}
                      type="button"
                      title="删除"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

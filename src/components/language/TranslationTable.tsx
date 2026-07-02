import { useState } from 'react';
import type { LanguageDocument } from '../../types/platform';
import type { TranslationRow } from './types';

interface TranslationTableProps {
  document: LanguageDocument;
  sourceLanguage: string;
  targetLanguage: string | null;
  rows: TranslationRow[];
  modifiedKeys: Set<string>;
  selectedKeys: Set<string>;
  onUpdateValue: (key: string, code: string, value: string) => void;
  onUpdateKey: (index: number, oldKey: string, newKey: string) => void;
  onRemoveKey: (index: number) => void;
  onRestoreKey: (key: string) => void;
  onToggleSelectedKey: (key: string, selected: boolean) => void;
  onToggleAllVisible: (selected: boolean) => void;
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

export function TranslationTable({
  document,
  sourceLanguage,
  targetLanguage,
  rows,
  modifiedKeys,
  selectedKeys,
  onUpdateValue,
  onUpdateKey,
  onRemoveKey,
  onRestoreKey,
  onToggleSelectedKey,
  onToggleAllVisible,
}: TranslationTableProps) {
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState('');

  function startEditKey(index: number, currentKey: string) {
    setEditingKeyIndex(index);
    setKeyDraft(currentKey);
  }

  function commitKeyEdit() {
    if (editingKeyIndex !== null && keyDraft.trim()) {
      const row = rows[editingKeyIndex];
      if (row && keyDraft !== row.key) {
        onUpdateKey(editingKeyIndex, row.key, keyDraft.trim());
      }
    }
    setEditingKeyIndex(null);
  }

  const selectableRows = rows.filter((row) => !row.isConfigKey);
  const allVisibleSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedKeys.has(row.key));
  const someVisibleSelected = selectableRows.some((row) => selectedKeys.has(row.key));

  return (
    <div className="lang-table-wrap">
      <table className="lang-table">
        <thead>
          <tr>
            <th className="lang-table-th-select">
              <input
                aria-label="选择当前筛选条目"
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={(event) => onToggleAllVisible(event.target.checked)}
                type="checkbox"
              />
            </th>
            <th className="lang-table-th-key">翻译键</th>
            <th className="lang-table-th-source">{getLabel(document, sourceLanguage)}</th>
            {targetLanguage && targetLanguage !== sourceLanguage ? (
              <th className="lang-table-th-target">{getLabel(document, targetLanguage)}</th>
            ) : null}
            <th className="lang-table-th-actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="lang-table-empty"
                colSpan={targetLanguage && targetLanguage !== sourceLanguage ? 5 : 4}
              >
                暂无翻译条目
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const sourceValue = String(
              (document.list_translate[row.key] as Record<string, string> | undefined)?.[
                sourceLanguage
              ] ?? '',
            );
            const targetValue = targetLanguage
              ? String(
                  (document.list_translate[row.key] as Record<string, string> | undefined)?.[
                    targetLanguage
                  ] ?? '',
                )
              : '';
            const isModified = modifiedKeys.has(row.key);
            const isSelected = selectedKeys.has(row.key);
            return (
              <tr
                className={isModified ? 'config-entry-modified' : undefined}
                key={`${row.key}-${row.index}`}
              >
                <td className="lang-table-cell-select">
                  <input
                    aria-label={`选择 ${row.key}`}
                    checked={isSelected}
                    disabled={row.isConfigKey}
                    onChange={(event) => onToggleSelectedKey(row.key, event.target.checked)}
                    type="checkbox"
                  />
                </td>
                <td className="lang-table-cell-key">
                  {editingKeyIndex === row.index ? (
                    <input
                      className="lang-table-key-input editing"
                      disabled={row.isConfigKey}
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      onBlur={commitKeyEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitKeyEdit();
                        if (e.key === 'Escape') setEditingKeyIndex(null);
                      }}
                    />
                  ) : (
                    <button
                      className={`lang-table-key-text ${row.isConfigKey ? 'config' : ''}`}
                      disabled={row.isConfigKey}
                      onClick={() => !row.isConfigKey && startEditKey(row.index, row.key)}
                      title={row.isConfigKey ? '配置键，不可编辑' : '点击编辑'}
                      type="button"
                    >
                      {row.key}
                    </button>
                  )}
                </td>
                <td className="lang-table-cell-source">
                  <span className="lang-table-text">{sourceValue}</span>
                </td>
                {targetLanguage && targetLanguage !== sourceLanguage ? (
                  <td className="lang-table-cell-target">
                    <input
                      className={`lang-table-input ${isModified ? 'modified' : ''}`}
                      value={targetValue}
                      onChange={(e) => onUpdateValue(row.key, targetLanguage, e.target.value)}
                    />
                  </td>
                ) : null}
                <td className="lang-table-cell-actions">
                  {isModified && !row.isConfigKey ? (
                    <button
                      className="lang-btn lang-btn--icon"
                      onClick={() => onRestoreKey(row.key)}
                      type="button"
                      title="恢复"
                    >
                      ↩
                    </button>
                  ) : null}
                  {!row.isConfigKey ? (
                    <button
                      className="lang-btn lang-btn--icon lang-btn--danger"
                      onClick={() => onRemoveKey(row.index)}
                      type="button"
                      title="删除"
                    >
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

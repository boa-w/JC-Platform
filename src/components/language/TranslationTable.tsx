import {
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { LanguageDocument } from '../../types/platform';
import { getLanguageDocumentLabel } from './localizationAdapter';
import { TranslationValueInput } from './TranslationValueInput';
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
  onReorderKeys: (keys: string[], targetIndex: number, position: 'before' | 'after') => void;
  onRestoreKey: (key: string) => void;
  onToggleSelectedKey: (key: string, selected: boolean, range: boolean) => void;
  onToggleAllVisible: (selected: boolean) => void;
  selectedDeletableCount: number;
  onRequestDeleteSelected: () => void;
}

function getLabel(document: LanguageDocument, code: string): string {
  return getLanguageDocumentLabel(document, code);
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
  onReorderKeys,
  onRestoreKey,
  onToggleSelectedKey,
  onToggleAllVisible,
  selectedDeletableCount,
  onRequestDeleteSelected,
}: TranslationTableProps) {
  const { t } = useTranslation();
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  const draggingKeysRef = useRef<string[]>([]);
  const dropTargetRef = useRef<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);

  function startEditKey(index: number, currentKey: string) {
    setEditingKeyIndex(index);
    setKeyDraft(currentKey);
  }

  function commitKeyEdit() {
    if (editingKeyIndex !== null && keyDraft.trim()) {
      const row = rows.find((item) => item.index === editingKeyIndex);
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

  const updateDropTarget = useCallback(
    (
      next: {
        index: number;
        position: 'before' | 'after';
      } | null,
    ) => {
      dropTargetRef.current = next;
      setDropTarget(next);
    },
    [],
  );

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, row: TranslationRow) {
    event.preventDefault();
    const selectedRows = rows.filter((item) => selectedKeys.has(item.key));
    const draggingKeys = selectedKeys.has(row.key)
      ? selectedRows.map((item) => item.key)
      : [row.key];
    draggingKeysRef.current = draggingKeys;
    draggingIndexRef.current = row.index;
    setDraggingIndex(row.index);
    updateDropTarget(null);
  }

  useEffect(() => {
    if (draggingIndex === null) return;

    const pageDocument = globalThis.document;
    const previousUserSelect = pageDocument.body.style.userSelect;
    pageDocument.body.style.userSelect = 'none';

    function handlePointerMove(event: PointerEvent) {
      const fromIndex = draggingIndexRef.current;
      if (fromIndex === null) return;

      const element = pageDocument.elementFromPoint(event.clientX, event.clientY);
      const row = element?.closest<HTMLTableRowElement>('tr[data-lang-row-index]');
      if (!row) {
        updateDropTarget(null);
        return;
      }

      const targetIndex = Number(row.dataset.langRowIndex);
      if (!Number.isFinite(targetIndex) || targetIndex === fromIndex) {
        updateDropTarget(null);
        return;
      }
      const targetKey = row.dataset.langRowKey;
      if (targetKey && draggingKeysRef.current.includes(targetKey)) {
        updateDropTarget(null);
        return;
      }

      const rect = row.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      updateDropTarget({ index: targetIndex, position });
    }

    function finishDrag() {
      const fromIndex = draggingIndexRef.current;
      const draggingKeys = draggingKeysRef.current;
      const target = dropTargetRef.current;
      if (fromIndex !== null && draggingKeys.length > 0 && target && fromIndex !== target.index) {
        onReorderKeys(draggingKeys, target.index, target.position);
      }
      draggingIndexRef.current = null;
      draggingKeysRef.current = [];
      setDraggingIndex(null);
      updateDropTarget(null);
    }

    pageDocument.addEventListener('pointermove', handlePointerMove);
    pageDocument.addEventListener('pointerup', finishDrag);
    pageDocument.addEventListener('pointercancel', finishDrag);

    return () => {
      pageDocument.body.style.userSelect = previousUserSelect;
      pageDocument.removeEventListener('pointermove', handlePointerMove);
      pageDocument.removeEventListener('pointerup', finishDrag);
      pageDocument.removeEventListener('pointercancel', finishDrag);
    };
  }, [draggingIndex, onReorderKeys, updateDropTarget]);

  function cancelNativeDrag(event: DragEvent<HTMLButtonElement>) {
    const fromIndex = draggingIndexRef.current;
    if (fromIndex !== null) event.preventDefault();
  }

  function isDraggingRow(row: TranslationRow) {
    return draggingKeysRef.current.includes(row.key) || draggingIndex === row.index;
  }

  function dragHandleTitle(row: TranslationRow) {
    const selectedRows = rows.filter((item) => selectedKeys.has(item.key));
    if (selectedKeys.has(row.key) && selectedRows.length > 1) {
      return t('language.table.dragMultiple', { count: selectedRows.length });
    }
    return t('language.table.drag');
  }

  function handleRowSelectionChange(event: ChangeEvent<HTMLInputElement>, row: TranslationRow) {
    const nativeEvent = event.nativeEvent as Event & { shiftKey?: boolean };
    onToggleSelectedKey(row.key, event.target.checked, Boolean(nativeEvent.shiftKey));
  }

  return (
    <div className="lang-table-wrap">
      {selectedKeys.size > 0 ? (
        <div className="lang-table-bulkbar">
          <span>
            <Trans
              components={{ strong: <strong /> }}
              i18nKey="language.table.selectedSummary"
              values={{ count: selectedKeys.size }}
            />
            {selectedDeletableCount !== selectedKeys.size
              ? t('language.table.deletableCount', { count: selectedDeletableCount })
              : ''}
          </span>
          <button
            className="lang-btn lang-btn--danger"
            disabled={selectedDeletableCount === 0}
            onClick={onRequestDeleteSelected}
            type="button"
          >
            {t('language.table.deleteSelected')}
          </button>
        </div>
      ) : null}
      <table className="lang-table">
        <thead>
          <tr>
            <th className="lang-table-th-select">
              <input
                aria-label={t('language.table.selectVisible')}
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={(event) => onToggleAllVisible(event.target.checked)}
                type="checkbox"
              />
            </th>
            <th className="lang-table-th-index">{t('language.table.index')}</th>
            <th className="lang-table-th-key">{t('language.table.translationKey')}</th>
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
                colSpan={targetLanguage && targetLanguage !== sourceLanguage ? 6 : 5}
              >
                {t('language.table.empty')}
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
            const isReadonlyKey = row.isConfigKey || row.isInheritedKey || row.isExternalKey;
            const rowClassName = [
              isModified ? 'config-entry-modified' : '',
              isDraggingRow(row) ? 'lang-row-dragging' : '',
              dropTarget?.index === row.index ? `lang-row-drop-${dropTarget.position}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                className={rowClassName || undefined}
                data-lang-row-index={row.index}
                data-lang-row-key={row.key}
                key={`${row.key}-${row.index}`}
              >
                <td className="lang-table-cell-select">
                  <input
                    aria-label={t('language.table.selectKey', { key: row.key })}
                    checked={isSelected}
                    disabled={row.isConfigKey}
                    onChange={(event) => handleRowSelectionChange(event, row)}
                    type="checkbox"
                  />
                </td>
                <td className="lang-table-cell-index">{row.index + 1}</td>
                <td className="lang-table-cell-key">
                  {editingKeyIndex === row.index ? (
                    <input
                      aria-label={t('language.table.editKey', { key: row.key })}
                      className="lang-table-key-input editing"
                      disabled={isReadonlyKey}
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
                      className={`lang-table-key-text ${isReadonlyKey ? 'config' : ''}`}
                      disabled={isReadonlyKey}
                      onClick={() => !isReadonlyKey && startEditKey(row.index, row.key)}
                      title={
                        row.isExternalKey
                          ? t('language.table.externalKeyTitle')
                          : row.isConfigKey
                            ? t('language.table.configKeyTitle')
                            : t('language.table.clickToEdit')
                      }
                      type="button"
                    >
                      {row.key}
                      {row.isExternalKey ? (
                        <span className="lang-key-badge">{t('language.table.referenceBadge')}</span>
                      ) : null}
                    </button>
                  )}
                </td>
                <td className="lang-table-cell-source">
                  <TranslationValueInput
                    ariaLabel={`${row.key} ${getLabel(document, sourceLanguage)}`}
                    modified={isModified}
                    value={sourceValue}
                    onCommit={(value) => onUpdateValue(row.key, sourceLanguage, value)}
                  />
                </td>
                {targetLanguage && targetLanguage !== sourceLanguage ? (
                  <td className="lang-table-cell-target">
                    <TranslationValueInput
                      ariaLabel={`${row.key} ${getLabel(document, targetLanguage)}`}
                      modified={isModified}
                      value={targetValue}
                      onCommit={(value) => onUpdateValue(row.key, targetLanguage, value)}
                    />
                  </td>
                ) : null}
                <td className="lang-table-cell-actions">
                  {isModified && !isReadonlyKey ? (
                    <button
                      className="lang-btn lang-btn--icon"
                      onClick={() => onRestoreKey(row.key)}
                      type="button"
                      title={t('common.actions.restore')}
                    >
                      ↩
                    </button>
                  ) : null}
                  {!isReadonlyKey ? (
                    <button
                      aria-label={t('language.table.dragKey', { key: row.key })}
                      className="lang-btn lang-btn--icon lang-drag-handle"
                      onDragStart={cancelNativeDrag}
                      onPointerDown={(event) => beginDrag(event, row)}
                      type="button"
                      title={dragHandleTitle(row)}
                    >
                      ↕
                    </button>
                  ) : null}
                  {!isReadonlyKey ? (
                    <button
                      className="lang-btn lang-btn--icon lang-btn--danger"
                      onClick={() => onRemoveKey(row.index)}
                      type="button"
                      title={t('language.table.delete')}
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

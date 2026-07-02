import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  onReorderKey: (fromIndex: number, targetIndex: number, position: 'before' | 'after') => void;
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
  onReorderKey,
  onRestoreKey,
  onToggleSelectedKey,
  onToggleAllVisible,
}: TranslationTableProps) {
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
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

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    draggingIndexRef.current = index;
    setDraggingIndex(index);
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

      const rect = row.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      updateDropTarget({ index: targetIndex, position });
    }

    function finishDrag() {
      const fromIndex = draggingIndexRef.current;
      const target = dropTargetRef.current;
      if (fromIndex !== null && target && fromIndex !== target.index) {
        onReorderKey(fromIndex, target.index, target.position);
      }
      draggingIndexRef.current = null;
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
  }, [draggingIndex, onReorderKey, updateDropTarget]);

  function cancelNativeDrag(event: DragEvent<HTMLButtonElement>) {
    const fromIndex = draggingIndexRef.current;
    if (fromIndex !== null) event.preventDefault();
  }

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
            const rowClassName = [
              isModified ? 'config-entry-modified' : '',
              draggingIndex === row.index ? 'lang-row-dragging' : '',
              dropTarget?.index === row.index ? `lang-row-drop-${dropTarget.position}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                className={rowClassName || undefined}
                data-lang-row-index={row.index}
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
                      aria-label={`拖动 ${row.key} 调整顺序`}
                      className="lang-btn lang-btn--icon lang-drag-handle"
                      onDragStart={cancelNativeDrag}
                      onPointerDown={(event) => beginDrag(event, row.index)}
                      type="button"
                      title="拖动排序"
                    >
                      ↕
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

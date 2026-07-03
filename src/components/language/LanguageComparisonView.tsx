import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { LanguageDocument } from '../../types/platform';

interface LanguageComparisonViewProps {
  document: LanguageDocument;
  onUpdate: (document: LanguageDocument) => void;
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

function externalTranslationKeys(document: LanguageDocument) {
  const indexedKeys = new Set(document.list_inner);
  return Object.keys(document.list_translate).filter((key) => !indexedKeys.has(key));
}

export function LanguageComparisonView({ document, onUpdate }: LanguageComparisonViewProps) {
  const [editingCell, setEditingCell] = useState<{ key: string; code: string } | null>(null);
  const [editValue, setEditValue] = useState('');
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

  const visibleLanguageKeys = [...document.list_inner, ...externalTranslationKeys(document)];
  const translationKeys = [
    ...document.list_inner.slice(document.list_code_language.length),
    ...externalTranslationKeys(document),
  ];

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

  function startEditKey(index: number, currentKey: string) {
    setEditingKeyIndex(index);
    setKeyDraft(currentKey);
  }

  function commitKeyEdit() {
    if (editingKeyIndex === null || !keyDraft.trim()) {
      setEditingKeyIndex(null);
      return;
    }
    const rowIndex = editingKeyIndex;
    if (rowIndex < document.list_code_language.length || rowIndex >= document.list_inner.length) {
      setEditingKeyIndex(null);
      return;
    }
    const oldKey = document.list_inner[rowIndex];
    if (!oldKey || keyDraft === oldKey) {
      setEditingKeyIndex(null);
      return;
    }
    if (document.list_inner.includes(keyDraft.trim())) {
      setEditingKeyIndex(null);
      return;
    }
    const nextInner = [...document.list_inner];
    nextInner[rowIndex] = keyDraft.trim();
    const nextTranslate = { ...document.list_translate };
    const oldTranslations = nextTranslate[oldKey];
    delete nextTranslate[oldKey];
    nextTranslate[keyDraft.trim()] = oldTranslations ?? {};
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
    setEditingKeyIndex(null);
  }

  function handleRemoveKey(index: number) {
    if (index < document.list_code_language.length || index >= document.list_inner.length) return;
    const key = document.list_inner[index];
    const nextInner = document.list_inner.filter((_, i) => i !== index);
    const nextTranslate = { ...document.list_translate };
    delete nextTranslate[key];
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
  }

  const handleReorderKey = useCallback(
    (fromIndex: number, targetIndex: number, position: 'before' | 'after') => {
      const minIndex = document.list_code_language.length;
      if (
        fromIndex < minIndex ||
        targetIndex < minIndex ||
        fromIndex >= document.list_inner.length ||
        targetIndex >= document.list_inner.length
      ) {
        return;
      }
      const nextInner = [...document.list_inner];
      const [movedKey] = nextInner.splice(fromIndex, 1);
      let insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(minIndex, Math.min(insertIndex, nextInner.length));
      if (nextInner[insertIndex] === movedKey) return;
      nextInner.splice(insertIndex, 0, movedKey);
      onUpdate({ ...document, list_inner: nextInner });
    },
    [document, onUpdate],
  );

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
      if (
        !Number.isFinite(targetIndex) ||
        targetIndex === fromIndex ||
        targetIndex < document.list_code_language.length ||
        targetIndex >= document.list_inner.length
      ) {
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
        handleReorderKey(fromIndex, target.index, target.position);
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
  }, [
    draggingIndex,
    handleReorderKey,
    updateDropTarget,
    document.list_code_language.length,
    document.list_inner.length,
  ]);

  function cancelNativeDrag(event: DragEvent<HTMLButtonElement>) {
    const fromIndex = draggingIndexRef.current;
    if (fromIndex !== null) event.preventDefault();
  }

  function computeCompletionStats() {
    return document.list_code_language.map((code) => {
      let translated = 0;
      for (const key of translationKeys) {
        const translations = document.list_translate[key] as Record<string, string> | undefined;
        if (translations?.[code] && translations[code].trim() !== '') {
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
                <span className="lang-comparison-stat-text">
                  {stat.translated}/{stat.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="lang-comparison-table-wrap">
        <table className="lang-comparison-table">
          <thead>
            <tr>
              <th className="lang-comparison-th-index">序号</th>
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
            {visibleLanguageKeys.length === 0 ? (
              <tr>
                <td
                  className="lang-comparison-empty"
                  colSpan={document.list_code_language.length + 3}
                >
                  暂无翻译条目
                </td>
              </tr>
            ) : null}
            {visibleLanguageKeys.map((key, actualIndex) => {
              const isConfigKey = actualIndex < document.list_code_language.length;
              const isExternalKey = actualIndex >= document.list_inner.length;
              const isReadonlyKey = isConfigKey || isExternalKey;
              const isEditingKey = editingKeyIndex === actualIndex;
              const rowClassName = [
                draggingIndex === actualIndex ? 'lang-row-dragging' : '',
                dropTarget?.index === actualIndex ? `lang-row-drop-${dropTarget.position}` : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr
                  className={rowClassName || undefined}
                  data-lang-row-index={actualIndex}
                  key={key}
                >
                  <td className="lang-comparison-cell-index">{actualIndex + 1}</td>
                  <td className="lang-comparison-cell-key">
                    {isEditingKey ? (
                      <input
                        className="lang-comparison-key-input"
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
                        className={`lang-comparison-key-text ${isReadonlyKey ? 'config' : ''}`}
                        disabled={isReadonlyKey}
                        onClick={() => !isReadonlyKey && startEditKey(actualIndex, key)}
                        title={
                          isExternalKey
                            ? '外部引用键，不写入 list_inner'
                            : isConfigKey
                              ? '语言名称配置键，不可编辑 key'
                              : '点击编辑'
                        }
                        type="button"
                      >
                        {key}
                        {isExternalKey ? <span className="lang-key-badge">引用</span> : null}
                      </button>
                    )}
                  </td>
                  {document.list_code_language.map((code) => {
                    const translations =
                      (document.list_translate[key] as Record<string, string>) ?? {};
                    const value = translations[code] ?? '';
                    const isEditing = editingCell?.key === key && editingCell?.code === code;
                    const isEmpty = !value || value.trim() === '';
                    return (
                      <td
                        className={`lang-comparison-cell ${isEmpty ? 'lang-comparison-cell--empty' : ''}`}
                        key={`${key}-${code}`}
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
                          />
                        ) : (
                          <button
                            className="lang-comparison-value"
                            onClick={() => handleStartEdit(key, code, value)}
                            type="button"
                          >
                            {value || '—'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="lang-comparison-cell-actions">
                    {!isReadonlyKey ? (
                      <button
                        aria-label={`拖动 ${key} 调整顺序`}
                        className="lang-btn lang-btn--icon lang-drag-handle"
                        onDragStart={cancelNativeDrag}
                        onPointerDown={(event) => beginDrag(event, actualIndex)}
                        type="button"
                        title="拖动排序"
                      >
                        ↕
                      </button>
                    ) : null}
                    {!isReadonlyKey ? (
                      <button
                        className="lang-btn lang-btn--icon lang-btn--danger"
                        onClick={() => handleRemoveKey(actualIndex)}
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
    </div>
  );
}

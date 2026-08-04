import { json } from '@codemirror/lang-json';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { Braces, Pencil, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GitWorktreeFileContent } from '../../types/platform';
import { formatJsonText } from '../../utils/jsonFormat';
import { lineDiffChanges } from './lineDiff';

interface GitWorktreeDiffEditorProps {
  file: GitWorktreeFileContent;
  busy: boolean;
  error: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => void | Promise<void>;
  onCancel: () => void;
}

export function GitWorktreeDiffEditor({
  file,
  busy,
  error,
  onDirtyChange,
  onSave,
  onCancel,
}: GitWorktreeDiffEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const saveRef = useRef(onSave);
  const dirtyChangeRef = useRef(onDirtyChange);
  const busyRef = useRef(busy);
  const [lineCount, setLineCount] = useState(file.current_content.split('\n').length);
  const [dirty, setDirty] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    saveRef.current = onSave;
    dirtyChangeRef.current = onDirtyChange;
    busyRef.current = busy;
  }, [busy, onDirtyChange, onSave]);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const setDirtyState = (nextDirty: boolean) => {
      setDirty(nextDirty);
      dirtyChangeRef.current(nextDirty);
    };
    const sharedExtensions = [
      basicSetup,
      json(),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
      }),
    ];
    if (document.documentElement.dataset.theme === 'dark') sharedExtensions.push(oneDark);

    const merge = new MergeView({
      a: {
        doc: file.original_content,
        extensions: [
          ...sharedExtensions,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ 'aria-label': `${file.path} HEAD 原始版本` }),
        ],
      },
      b: {
        doc: file.current_content,
        extensions: [
          ...sharedExtensions,
          EditorView.contentAttributes.of({ 'aria-label': `${file.path} 当前工作区内容` }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: (view) => {
                const content = view.state.doc.toString();
                if (!busyRef.current && content !== file.current_content) {
                  void saveRef.current(content);
                }
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const content = update.state.doc.toString();
            setLineCount(update.state.doc.lines);
            setDirtyState(content !== file.current_content);
            setFormatError(null);
          }),
        ],
      },
      collapseUnchanged: { margin: 3, minSize: 5 },
      diffConfig: { override: lineDiffChanges },
      gutter: true,
      highlightChanges: true,
      orientation: 'a-b',
      parent,
      renderRevertControl: () => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'git-review-revert-chunk';
        button.textContent = '→';
        button.title = '使用左侧版本替换此差异块';
        button.setAttribute('aria-label', '回退此差异块');
        return button;
      },
      revertControls: 'a-to-b',
    });
    mergeRef.current = merge;
    merge.b.focus();
    return () => {
      merge.destroy();
      mergeRef.current = null;
      dirtyChangeRef.current(false);
    };
  }, [file]);

  function formatFile() {
    const view = mergeRef.current?.b;
    if (!view) return;
    try {
      const formatted = formatJsonText(view.state.doc.toString());
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
      setFormatError(null);
    } catch (cause) {
      setFormatError(`JSON 格式错误：${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function saveFile() {
    const content = mergeRef.current?.b.state.doc.toString();
    if (!busy && dirty && content !== undefined) void onSave(content);
  }

  return (
    <section aria-label={`对照编辑 ${file.path}`} className="git-review-file-editor">
      <header>
        <div>
          <Pencil aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>
            <strong>{file.path}</strong>
            <small>
              {lineCount} 行{dirty ? ' · 尚未保存' : ' · 已同步'}
            </small>
          </span>
        </div>
        <div className="git-review-editor-actions">
          <button disabled={busy} onClick={formatFile} type="button">
            <Braces aria-hidden="true" size={15} strokeWidth={1.8} />
            格式化
          </button>
          <button disabled={busy} onClick={onCancel} type="button">
            取消
          </button>
          <button
            className="git-review-editor-save"
            disabled={!dirty || busy}
            onClick={saveFile}
            type="button"
          >
            <Save aria-hidden="true" size={15} strokeWidth={1.8} />
            {busy ? '保存中...' : '保存文件'}
          </button>
        </div>
      </header>
      <div className="git-review-editor-labels" aria-hidden="true">
        <span>HEAD 原始版本</span>
        <span>当前工作区（可编辑）</span>
      </div>
      <div className="git-review-merge-editor" ref={hostRef} />
      {error || formatError ? <p role="alert">{error ?? formatError}</p> : null}
    </section>
  );
}

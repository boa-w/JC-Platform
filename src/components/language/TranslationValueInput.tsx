import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface TranslationValueInputProps {
  value: string;
  modified: boolean;
  onCommit: (value: string) => void;
}

export function TranslationValueInput({ value, modified, onCommit }: TranslationValueInputProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const cancelCommitRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  function commit() {
    if (draft !== value) {
      onCommit(draft);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      cancelCommitRef.current = true;
      setDraft(value);
      event.currentTarget.blur();
    }
  }

  return (
    <input
      className={`lang-table-input ${modified ? 'modified' : ''}`}
      value={draft}
      onBlur={() => {
        focusedRef.current = false;
        if (cancelCommitRef.current) {
          cancelCommitRef.current = false;
          return;
        }
        commit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

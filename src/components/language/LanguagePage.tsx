import { useMemo, useState } from 'react';
import type { LanguageDocument } from '../../types/platform';
import type { FilterMode, TranslationRow } from './types';
import { LanguageSidebar } from './LanguageSidebar';
import { TranslationToolbar } from './TranslationToolbar';
import { TranslationTable } from './TranslationTable';
import { LanguageComparisonView } from './LanguageComparisonView';

interface LanguagePageProps {
  document: LanguageDocument;
  baseline: LanguageDocument | null;
  loaded: boolean;
  onUpdate: (document: LanguageDocument) => void;
}

type ViewMode = 'editor' | 'comparison';

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

function computeTranslationCount(document: LanguageDocument, code: string): { translated: number; total: number } {
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

function normalizeDocument(document: LanguageDocument, codes: string[], labels?: Record<string, string>): LanguageDocument {
  const nextLabels = labels ?? document.language_labels ?? {};
  const nextTranslate: Record<string, unknown> = {};
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const oldCode = document.list_code_language[i];
    if (oldCode && oldCode !== code) {
      const oldTranslations = document.list_translate[oldCode] as Record<string, string> | undefined;
      if (oldTranslations) {
        nextLabels[code] = nextLabels[code] ?? nextLabels[oldCode] ?? code;
        delete nextLabels[oldCode];
      }
    }
  }
  for (const key of document.list_inner) {
    nextTranslate[key] = document.list_translate[key] ?? {};
  }
  return { list_code_language: codes, list_inner: document.list_inner, list_translate: nextTranslate, language_labels: nextLabels };
}

export function LanguagePage({ document, baseline, loaded, onUpdate }: LanguagePageProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(() => {
    const codes = document.list_code_language;
    return codes.length > 1 ? codes[1] : codes[0] ?? null;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [newKeyInput, setNewKeyInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  const sourceLanguage = document.list_code_language[0] ?? 'zh';

  const translationKeys = useMemo(() => {
    return document.list_inner.slice(document.list_code_language.length);
  }, [document.list_inner, document.list_code_language]);

  const modifiedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!baseline || !selectedLanguage) return keys;
    for (let i = document.list_code_language.length; i < document.list_inner.length; i++) {
      const key = document.list_inner[i];
      const baselineKey = baseline.list_inner[i];
      const currentTranslations = (document.list_translate[key] as Record<string, string>) ?? {};
      const baselineTranslations = (baseline.list_translate[baselineKey] as Record<string, string>) ?? {};
      const currentValue = currentTranslations[selectedLanguage] ?? '';
      const baselineValue = baselineTranslations[selectedLanguage] ?? '';
      if (currentValue !== baselineValue) {
        keys.add(key);
      }
    }
    return keys;
  }, [document, baseline, selectedLanguage]);

  const rows: TranslationRow[] = useMemo(() => {
    let filtered = translationKeys.map((key, i) => ({
      key,
      index: i + document.list_code_language.length,
      isConfigKey: false,
      translations: ((document.list_translate[key] as Record<string, string>) ?? {}),
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((row) =>
        row.key.toLowerCase().includes(q) ||
        Object.values(row.translations).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    if (filterMode === 'translated' && selectedLanguage) {
      filtered = filtered.filter((row) => {
        const val = row.translations[selectedLanguage];
        return val && String(val).trim() !== '';
      });
    } else if (filterMode === 'untranslated' && selectedLanguage) {
      filtered = filtered.filter((row) => {
        const val = row.translations[selectedLanguage];
        return !val || String(val).trim() === '';
      });
    }

    return filtered;
  }, [translationKeys, document.list_code_language.length, document.list_translate, searchQuery, filterMode, selectedLanguage]);

  function handleAddLanguage(code: string, label: string) {
    if (document.list_code_language.includes(code)) return;
    const nextTranslate: Record<string, unknown> = { ...document.list_translate };
    for (const key of document.list_inner) {
      const existing = (nextTranslate[key] as Record<string, string>) ?? {};
      nextTranslate[key] = { ...existing, [code]: '' };
    }
    const nextLabels = { ...(document.language_labels ?? {}), [code]: label };
    onUpdate(normalizeDocument({ ...document, list_translate: nextTranslate, language_labels: nextLabels }, [...document.list_code_language, code], nextLabels));
  }

  function handleRemoveLanguage(code: string) {
    if (code === 'zh' || document.list_code_language.length <= 1) return;
    const nextCodes = document.list_code_language.filter((c) => c !== code);
    const nextLabels = { ...(document.language_labels ?? {}) };
    delete nextLabels[code];
    onUpdate(normalizeDocument({ ...document, language_labels: nextLabels }, nextCodes, nextLabels));
  }

  function handleUpdateLanguage(oldCode: string, newCode: string, newLabel: string) {
    if (oldCode === newCode && newLabel === getLabel(document, oldCode)) return;
    if (oldCode !== newCode && document.list_code_language.includes(newCode)) return;
    const nextCodes = document.list_code_language.map((c) => c === oldCode ? newCode : c);
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (oldCode !== newCode) {
      delete nextLabels[oldCode];
    }
    nextLabels[newCode] = newLabel;
    const nextTranslate = { ...document.list_translate };
    if (oldCode !== newCode) {
      for (const key of document.list_inner) {
        const translations = (nextTranslate[key] as Record<string, string>) ?? {};
        if (oldCode in translations) {
          const value = translations[oldCode];
          delete translations[oldCode];
          translations[newCode] = value;
          nextTranslate[key] = translations;
        }
      }
    }
    onUpdate(normalizeDocument({ ...document, list_translate: nextTranslate, language_labels: nextLabels }, nextCodes, nextLabels));
  }

  function handleUpdateValue(key: string, code: string, value: string) {
    const translations = (document.list_translate[key] as Record<string, string>) ?? {};
    onUpdate({
      ...document,
      list_translate: {
        ...document.list_translate,
        [key]: { ...translations, [code]: value },
      },
    });
  }

  function handleUpdateKey(index: number, _oldKey: string, newKey: string) {
    if (document.list_inner.includes(newKey)) return;
    const nextInner = [...document.list_inner];
    nextInner[index] = newKey;
    const nextTranslate = { ...document.list_translate };
    const oldTranslations = nextTranslate[_oldKey];
    delete nextTranslate[_oldKey];
    nextTranslate[newKey] = oldTranslations ?? {};
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
  }

  function handleRemoveKey(index: number) {
    const key = document.list_inner[index];
    const nextInner = document.list_inner.filter((_, i) => i !== index);
    const nextTranslate = { ...document.list_translate };
    delete nextTranslate[key];
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
  }

  function handleAddKey() {
    const key = newKeyInput.trim();
    if (!key || document.list_inner.includes(key)) return;
    const translations: Record<string, string> = {};
    for (const code of document.list_code_language) {
      translations[code] = '';
    }
    onUpdate({
      ...document,
      list_inner: [...document.list_inner, key],
      list_translate: { ...document.list_translate, [key]: translations },
    });
    setNewKeyInput('');
  }

  if (!loaded) {
    return (
      <section className="lang-page">
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <p>请先在项目管理中打开 .jcpro 项目文件</p>
        </div>
      </section>
    );
  }

  const { translated, total } = selectedLanguage ? computeTranslationCount(document, selectedLanguage) : { translated: 0, total: translationKeys.length };

  return (
    <section className="lang-page">
      <LanguageSidebar
        document={document}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={setSelectedLanguage}
        onAddLanguage={handleAddLanguage}
        onUpdateLanguage={handleUpdateLanguage}
        onRemoveLanguage={handleRemoveLanguage}
      />
      <div className="lang-main">
        <div className="lang-view-toggle">
          <button
            className={`lang-view-toggle-btn ${viewMode === 'editor' ? 'active' : ''}`}
            onClick={() => setViewMode('editor')}
            type="button"
          >
            编辑模式
          </button>
          <button
            className={`lang-view-toggle-btn ${viewMode === 'comparison' ? 'active' : ''}`}
            onClick={() => setViewMode('comparison')}
            type="button"
          >
            全语言对比
          </button>
        </div>
        {viewMode === 'editor' ? (
          <>
            <TranslationToolbar
              searchQuery={searchQuery}
              filterMode={filterMode}
              sourceLanguage={sourceLanguage}
              targetLanguage={selectedLanguage}
              totalKeys={translationKeys.length}
              filteredCount={rows.length}
              onSearch={setSearchQuery}
              onFilter={setFilterMode}
              onAddKey={(key) => { setNewKeyInput(key); handleAddKey(); }}
              onSyncKeys={() => {}}
            />
            <TranslationTable
              document={document}
              sourceLanguage={sourceLanguage}
              targetLanguage={selectedLanguage}
              rows={rows}
              modifiedKeys={modifiedKeys}
              onUpdateValue={handleUpdateValue}
              onUpdateKey={handleUpdateKey}
              onRemoveKey={handleRemoveKey}
              onRestoreKey={(key) => {
                const original = document.list_translate[key];
                if (original) onUpdate({ ...document, list_translate: { ...document.list_translate } });
              }}
            />
            <div className="lang-footer">
              <div className="lang-footer-add">
                <input
                  placeholder="新增翻译键..."
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                />
                <button className="lang-btn lang-btn--primary" disabled={!newKeyInput.trim()} onClick={handleAddKey} type="button">
                  添加键
                </button>
              </div>
              <div className="lang-footer-progress">
                {selectedLanguage ? (
                  <span>{getLabel(document, selectedLanguage)}: {translated}/{total} 已翻译 ({total > 0 ? Math.round((translated / total) * 100) : 0}%)</span>
                ) : (
                  <span>请选择目标语言</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <LanguageComparisonView document={document} onUpdate={onUpdate} />
        )}
      </div>
    </section>
  );
}

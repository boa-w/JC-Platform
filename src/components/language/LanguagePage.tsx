import { useEffect, useMemo, useRef, useState } from 'react';
import { translateBaiduText } from '../../api/commands';
import { useTranslationSettings } from '../../stores/translationSettings';
import type { LanguageDocument } from '../../types/platform';
import { LanguageComparisonView } from './LanguageComparisonView';
import { LanguageSidebar } from './LanguageSidebar';
import { type TranslateScope, TranslationServicePanel } from './TranslationServicePanel';
import { TranslationTable } from './TranslationTable';
import { TranslationToolbar } from './TranslationToolbar';
import type { FilterMode, TranslationRow } from './types';

interface LanguagePageProps {
  document: LanguageDocument;
  baseline: LanguageDocument | null;
  loaded: boolean;
  onUpdate: (document: LanguageDocument) => void;
}

type ViewMode = 'editor' | 'comparison';

const TRANSLATE_SCOPE_STORAGE_KEY = 'jc.language.translateScope';
const TRANSLATE_OPTIONS_STORAGE_KEY = 'jc.language.translateOptions';
const LEGACY_BAIDU_TRANSLATE_STORAGE_KEY = 'jc.language.baiduTranslateConfig';

interface SavedTranslateOptions {
  scope?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

function readSavedTranslateOptions(): SavedTranslateOptions {
  if (typeof window === 'undefined') return {};
  for (const key of [
    TRANSLATE_OPTIONS_STORAGE_KEY,
    TRANSLATE_SCOPE_STORAGE_KEY,
    LEGACY_BAIDU_TRANSLATE_STORAGE_KEY,
  ]) {
    const saved = window.localStorage.getItem(key);
    if (!saved) continue;
    try {
      return JSON.parse(saved) as SavedTranslateOptions;
    } catch {
      window.localStorage.removeItem(key);
    }
  }
  return {};
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

function computeTranslationCount(
  document: LanguageDocument,
  code: string,
): { translated: number; total: number } {
  const keys = document.list_inner.slice(document.list_code_language.length);
  let translated = 0;
  for (const key of keys) {
    const translations = document.list_translate[key] as Record<string, string> | undefined;
    if (translations?.[code] && translations[code].trim() !== '') {
      translated++;
    }
  }
  return { translated, total: keys.length };
}

function normalizeDocument(
  document: LanguageDocument,
  codes: string[],
  labels?: Record<string, string>,
): LanguageDocument {
  const nextLabels = labels ?? document.language_labels ?? {};
  const nextTranslate: Record<string, unknown> = {};
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const oldCode = document.list_code_language[i];
    if (oldCode && oldCode !== code) {
      const oldTranslations = document.list_translate[oldCode] as
        | Record<string, string>
        | undefined;
      if (oldTranslations) {
        nextLabels[code] = nextLabels[code] ?? nextLabels[oldCode] ?? code;
        delete nextLabels[oldCode];
      }
    }
  }
  for (const key of document.list_inner) {
    nextTranslate[key] = document.list_translate[key] ?? {};
  }
  return {
    list_code_language: codes,
    list_inner: document.list_inner,
    list_translate: nextTranslate,
    language_labels: nextLabels,
  };
}

export function LanguagePage({ document, baseline, loaded, onUpdate }: LanguagePageProps) {
  const langMainRef = useRef<HTMLDivElement | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(() => {
    const codes = document.list_code_language;
    const savedTarget = readSavedTranslateOptions().targetLanguage;
    if (savedTarget && codes.includes(savedTarget)) return savedTarget;
    return codes.length > 1 ? codes[1] : (codes[0] ?? null);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [newKeyInput, setNewKeyInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [translateSourceLanguage, setTranslateSourceLanguage] = useState(() => {
    const codes = document.list_code_language;
    const savedSource = readSavedTranslateOptions().sourceLanguage;
    return savedSource && codes.includes(savedSource) ? savedSource : (codes[0] ?? 'zh');
  });
  const [translateScope, setTranslateScope] = useState<TranslateScope>(() => {
    const savedScope = readSavedTranslateOptions().scope;
    return savedScope === 'filtered' || savedScope === 'empty' || savedScope === 'selected'
      ? savedScope
      : 'empty';
  });
  const [translateStatus, setTranslateStatus] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedTranslationKeys, setSelectedTranslationKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const { settings: translationSettings } = useTranslationSettings();

  const isBaiduTranslateConfigured =
    translationSettings.baiduAppId.trim() !== '' && translationSettings.baiduAppKey.trim() !== '';
  const languageOptions = useMemo(
    () =>
      document.list_code_language.map((code) => ({
        code,
        label: getLabel(document, code),
      })),
    [document],
  );

  useEffect(() => {
    const codes = document.list_code_language;
    if (codes.length === 0) {
      setSelectedLanguage(null);
      return;
    }
    setTranslateSourceLanguage((current) => (codes.includes(current) ? current : codes[0]));
    setSelectedLanguage((current) => {
      if (current && codes.includes(current)) return current;
      return codes.find((code) => code !== translateSourceLanguage) ?? codes[0];
    });
  }, [document.list_code_language, translateSourceLanguage]);

  useEffect(() => {
    window.localStorage.setItem(
      TRANSLATE_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        sourceLanguage: translateSourceLanguage,
        targetLanguage: selectedLanguage,
        scope: translateScope,
      }),
    );
  }, [translateSourceLanguage, selectedLanguage, translateScope]);

  useEffect(() => {
    const availableKeys = new Set(document.list_inner.slice(document.list_code_language.length));
    setSelectedTranslationKeys((current) => {
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [document.list_inner, document.list_code_language.length]);

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
      const baselineTranslations =
        (baseline.list_translate[baselineKey] as Record<string, string>) ?? {};
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
      translations: (document.list_translate[key] as Record<string, string>) ?? {},
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.key.toLowerCase().includes(q) ||
          Object.values(row.translations).some((v) => String(v).toLowerCase().includes(q)),
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
    } else if (filterMode === 'modified') {
      filtered = filtered.filter((row) => modifiedKeys.has(row.key));
    }

    return filtered;
  }, [
    translationKeys,
    document.list_code_language.length,
    document.list_translate,
    modifiedKeys,
    searchQuery,
    filterMode,
    selectedLanguage,
  ]);

  function handleAddLanguage(code: string, label: string) {
    if (document.list_code_language.includes(code)) return;
    const nextTranslate: Record<string, unknown> = { ...document.list_translate };
    for (const key of document.list_inner) {
      const existing = (nextTranslate[key] as Record<string, string>) ?? {};
      nextTranslate[key] = { ...existing, [code]: '' };
    }
    const nextLabels = { ...(document.language_labels ?? {}), [code]: label };
    onUpdate(
      normalizeDocument(
        { ...document, list_translate: nextTranslate, language_labels: nextLabels },
        [...document.list_code_language, code],
        nextLabels,
      ),
    );
  }

  function handleRemoveLanguage(code: string) {
    if (code === 'zh' || document.list_code_language.length <= 1) return;
    const nextCodes = document.list_code_language.filter((c) => c !== code);
    const nextLabels = { ...(document.language_labels ?? {}) };
    delete nextLabels[code];
    onUpdate(
      normalizeDocument({ ...document, language_labels: nextLabels }, nextCodes, nextLabels),
    );
  }

  function handleUpdateLanguage(oldCode: string, newCode: string, newLabel: string) {
    if (oldCode === newCode && newLabel === getLabel(document, oldCode)) return;
    if (oldCode !== newCode && document.list_code_language.includes(newCode)) return;
    const nextCodes = document.list_code_language.map((c) => (c === oldCode ? newCode : c));
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
    onUpdate(
      normalizeDocument(
        { ...document, list_translate: nextTranslate, language_labels: nextLabels },
        nextCodes,
        nextLabels,
      ),
    );
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

  function handleReorderKey(fromIndex: number, targetIndex: number, position: 'before' | 'after') {
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
  }

  function handleAddKey() {
    const key = newKeyInput.trim();
    if (!key || document.list_inner.includes(key)) return;
    const translations: Record<string, string> = {};
    for (const code of document.list_code_language) {
      translations[code] = '';
    }
    if (document.list_code_language.includes('zh')) {
      translations.zh = key;
    }
    if (document.list_code_language.includes(translateSourceLanguage)) {
      translations[translateSourceLanguage] = translations[translateSourceLanguage] || key;
    }
    onUpdate({
      ...document,
      list_inner: [...document.list_inner, key],
      list_translate: { ...document.list_translate, [key]: translations },
    });
    setNewKeyInput('');
  }

  function handleToggleSelectedKey(key: string, selected: boolean) {
    setSelectedTranslationKeys((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function handleToggleAllVisible(selected: boolean) {
    setSelectedTranslationKeys((current) => {
      const next = new Set(current);
      for (const row of rows) {
        if (row.isConfigKey) continue;
        if (selected) {
          next.add(row.key);
        } else {
          next.delete(row.key);
        }
      }
      return next;
    });
  }

  async function handleTranslateRows() {
    if (!selectedLanguage) {
      setTranslateStatus('请选择目标语言');
      return;
    }
    if (selectedLanguage === translateSourceLanguage) {
      setTranslateStatus('目标语言需不同于源语言');
      return;
    }
    if (!isBaiduTranslateConfigured) {
      setTranslateStatus('请先在软件设置中配置百度翻译 App ID 和 API Key');
      return;
    }

    const candidates = rows.filter((row) => {
      if (translateScope === 'selected' && !selectedTranslationKeys.has(row.key)) return false;
      const translations =
        (document.list_translate[row.key] as Record<string, string> | undefined) ?? {};
      const sourceValue = String(translations[translateSourceLanguage] ?? '').trim();
      const targetValue = String(translations[selectedLanguage] ?? '').trim();
      if (!sourceValue) return false;
      return translateScope === 'filtered' || translateScope === 'selected' || !targetValue;
    });

    if (candidates.length === 0) {
      setTranslateStatus(
        translateScope === 'selected' ? '请选择需要翻译的条目' : '没有需要翻译的条目',
      );
      return;
    }

    setIsTranslating(true);
    setTranslateStatus(`正在翻译 ${candidates.length} 条...`);
    try {
      const response = await translateBaiduText({
        appId: translationSettings.baiduAppId.trim(),
        appKey: translationSettings.baiduAppKey.trim(),
        from: translateSourceLanguage,
        to: selectedLanguage,
        texts: candidates.map((row) => {
          const translations =
            (document.list_translate[row.key] as Record<string, string> | undefined) ?? {};
          return String(translations[translateSourceLanguage] ?? '');
        }),
      });

      const nextTranslate: Record<string, unknown> = { ...document.list_translate };
      let updated = 0;
      for (let index = 0; index < candidates.length; index++) {
        const translated = response.translations[index] ?? '';
        if (!translated.trim()) continue;
        const row = candidates[index];
        const translations = (nextTranslate[row.key] as Record<string, string> | undefined) ?? {};
        nextTranslate[row.key] = { ...translations, [selectedLanguage]: translated };
        updated++;
      }

      onUpdate({ ...document, list_translate: nextTranslate });
      setTranslateStatus(`已翻译 ${updated} 条`);
    } catch (error) {
      setTranslateStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTranslating(false);
    }
  }

  function handleScrollToTop() {
    const root = langMainRef.current;
    root
      ?.querySelectorAll<HTMLElement>('.lang-table-wrap, .lang-comparison-table-wrap')
      .forEach((element) => {
        element.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      });
    root?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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

  const { translated, total } = selectedLanguage
    ? computeTranslationCount(document, selectedLanguage)
    : { translated: 0, total: translationKeys.length };

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
      <div className="lang-main" ref={langMainRef}>
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
              sourceLanguage={translateSourceLanguage}
              targetLanguage={selectedLanguage}
              totalKeys={translationKeys.length}
              filteredCount={rows.length}
              onSearch={setSearchQuery}
              onFilter={setFilterMode}
              onAddKey={(key) => {
                setNewKeyInput(key);
                handleAddKey();
              }}
              onSyncKeys={() => {}}
            />
            <TranslationServicePanel
              languages={languageOptions}
              sourceLanguage={translateSourceLanguage}
              targetLanguage={selectedLanguage}
              scope={translateScope}
              status={translateStatus}
              isTranslating={isTranslating}
              disabled={!selectedLanguage || selectedLanguage === translateSourceLanguage}
              configured={isBaiduTranslateConfigured}
              filteredCount={rows.length}
              selectedCount={selectedTranslationKeys.size}
              onSourceLanguageChange={setTranslateSourceLanguage}
              onTargetLanguageChange={setSelectedLanguage}
              onScopeChange={setTranslateScope}
              onTranslate={handleTranslateRows}
            />
            <TranslationTable
              document={document}
              sourceLanguage={translateSourceLanguage}
              targetLanguage={selectedLanguage}
              rows={rows}
              modifiedKeys={modifiedKeys}
              selectedKeys={selectedTranslationKeys}
              onUpdateValue={handleUpdateValue}
              onUpdateKey={handleUpdateKey}
              onRemoveKey={handleRemoveKey}
              onReorderKey={handleReorderKey}
              onRestoreKey={(key) => {
                const original = document.list_translate[key];
                if (original)
                  onUpdate({ ...document, list_translate: { ...document.list_translate } });
              }}
              onToggleSelectedKey={handleToggleSelectedKey}
              onToggleAllVisible={handleToggleAllVisible}
            />
            <div className="lang-footer">
              <div className="lang-footer-add">
                <input
                  placeholder="新增翻译键..."
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                />
                <button
                  className="lang-btn lang-btn--primary"
                  disabled={!newKeyInput.trim()}
                  onClick={handleAddKey}
                  type="button"
                >
                  添加键
                </button>
              </div>
              <div className="lang-footer-progress">
                {selectedLanguage ? (
                  <span>
                    {getLabel(document, selectedLanguage)}: {translated}/{total} 已翻译 (
                    {total > 0 ? Math.round((translated / total) * 100) : 0}%)
                  </span>
                ) : (
                  <span>请选择目标语言</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <LanguageComparisonView document={document} onUpdate={onUpdate} />
        )}
        <button
          aria-label="回到顶部"
          className="lang-scroll-top"
          onClick={handleScrollToTop}
          title="回到顶部"
          type="button"
        >
          ↑
        </button>
      </div>
    </section>
  );
}

import { open } from '@tauri-apps/plugin-dialog';
import {
  type MouseEvent,
  type PointerEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { importSingleLanguageCsv, translateBaiduText } from '../../api/commands';
import { useOperationGuard } from '../../hooks/useOperationGuard';
import type { LanguageDocument } from '../../types/platform';
import { getStorageItem, removeStorageItem, setStorageItem } from '../../utils/safeStorage';
import { runSystemDialog } from '../../utils/systemDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../EmptyState';
import { LanguageComparisonView } from './LanguageComparisonView';
import { LanguageSidebar } from './LanguageSidebar';
import {
  type TranslateLogEntry,
  type TranslateLogLevel,
  type TranslateProgress,
  type TranslateScope,
  TranslationServicePanel,
} from './TranslationServicePanel';
import { TranslationTable } from './TranslationTable';
import { TranslationToolbar } from './TranslationToolbar';
import type { FilterMode, TranslationRow } from './types';
import { useLanguageIndex } from './useLanguageIndex';
import './language.css';

interface LanguagePageProps {
  document: LanguageDocument;
  baseline: LanguageDocument | null;
  loaded: boolean;
  translationConfigured: boolean;
  onUpdate: (document: LanguageDocument) => void;
}

type ViewMode = 'editor' | 'comparison';

const TRANSLATE_SCOPE_STORAGE_KEY = 'jc.language.translateScope';
const TRANSLATE_OPTIONS_STORAGE_KEY = 'jc.language.translateOptions';
const LEGACY_BAIDU_TRANSLATE_STORAGE_KEY = 'jc.language.baiduTranslateConfig';
const SCROLL_TOP_POSITION_STORAGE_KEY = 'jc.language.scrollTopPosition';
const SCROLL_TOP_BUTTON_WIDTH = 92;
const SCROLL_TOP_BUTTON_HEIGHT = 34;
const SCROLL_TOP_BUTTON_MARGIN = 12;
const TRANSLATION_UPDATE_BATCH_SIZE = 20;

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface SavedTranslateOptions {
  scope?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

interface FloatingButtonPosition {
  left: number;
  top: number;
}

interface FloatingButtonDragState {
  startX: number;
  startY: number;
  initialLeft: number;
  initialTop: number;
  moved: boolean;
}

const initialTranslateProgress: TranslateProgress = {
  total: 0,
  done: 0,
  success: 0,
  failed: 0,
  currentKey: '',
};

function clampFloatingButtonPosition(
  position: FloatingButtonPosition,
  width = SCROLL_TOP_BUTTON_WIDTH,
  height = SCROLL_TOP_BUTTON_HEIGHT,
): FloatingButtonPosition {
  if (typeof window === 'undefined') return position;
  const maxLeft = Math.max(
    SCROLL_TOP_BUTTON_MARGIN,
    window.innerWidth - width - SCROLL_TOP_BUTTON_MARGIN,
  );
  const maxTop = Math.max(
    SCROLL_TOP_BUTTON_MARGIN,
    window.innerHeight - height - SCROLL_TOP_BUTTON_MARGIN,
  );
  return {
    left: Math.min(Math.max(position.left, SCROLL_TOP_BUTTON_MARGIN), maxLeft),
    top: Math.min(Math.max(position.top, SCROLL_TOP_BUTTON_MARGIN), maxTop),
  };
}

function getDefaultScrollTopPosition(): FloatingButtonPosition {
  if (typeof window === 'undefined') {
    return { left: 0, top: 0 };
  }
  return clampFloatingButtonPosition({
    left: window.innerWidth - SCROLL_TOP_BUTTON_WIDTH - 28,
    top: Math.round(window.innerHeight * 0.72),
  });
}

function readSavedScrollTopPosition(): FloatingButtonPosition {
  if (typeof window === 'undefined') return getDefaultScrollTopPosition();
  const saved = getStorageItem(SCROLL_TOP_POSITION_STORAGE_KEY);
  if (!saved) return getDefaultScrollTopPosition();
  try {
    const parsed = JSON.parse(saved) as Partial<FloatingButtonPosition>;
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return clampFloatingButtonPosition({ left: parsed.left, top: parsed.top });
    }
  } catch {
    removeStorageItem(SCROLL_TOP_POSITION_STORAGE_KEY);
  }
  return getDefaultScrollTopPosition();
}

function readSavedTranslateOptions(): SavedTranslateOptions {
  if (typeof window === 'undefined') return {};
  for (const key of [
    TRANSLATE_OPTIONS_STORAGE_KEY,
    TRANSLATE_SCOPE_STORAGE_KEY,
    LEGACY_BAIDU_TRANSLATE_STORAGE_KEY,
  ]) {
    const saved = getStorageItem(key);
    if (!saved) continue;
    try {
      return JSON.parse(saved) as SavedTranslateOptions;
    } catch {
      removeStorageItem(key);
    }
  }
  return {};
}

function getLabel(document: LanguageDocument, code: string): string {
  return document.language_labels?.[code] ?? code;
}

function externalTranslationKeys(document: LanguageDocument) {
  const indexedKeys = new Set(document.list_inner);
  return Object.keys(document.list_translate).filter((key) => !indexedKeys.has(key));
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
  for (const key of externalTranslationKeys(document)) {
    nextTranslate[key] = document.list_translate[key] ?? {};
  }
  return {
    list_code_language: codes,
    list_inner: document.list_inner,
    list_translate: nextTranslate,
    language_labels: nextLabels,
  };
}

export function LanguagePage({
  document,
  baseline,
  loaded,
  translationConfigured,
  onUpdate,
}: LanguagePageProps) {
  const langMainRef = useRef<HTMLDivElement | null>(null);
  const scrollTopButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollTopDragRef = useRef<FloatingButtonDragState | null>(null);
  const suppressScrollTopClickRef = useRef(false);
  const cancelTranslateRef = useRef(false);
  const translateLogIdRef = useRef(0);
  const lastSelectedTranslationKeyRef = useRef<string | null>(null);
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
  const [translateProgress, setTranslateProgress] =
    useState<TranslateProgress>(initialTranslateProgress);
  const [translateLogs, setTranslateLogs] = useState<TranslateLogEntry[]>([]);
  const [showTranslateLogs, setShowTranslateLogs] = useState(false);
  const [singleLanguageImportStatus, setSingleLanguageImportStatus] = useState<string | null>(null);
  const [isImportingSingleLanguage, setIsImportingSingleLanguage] = useState(false);
  const [scrollTopPosition, setScrollTopPosition] = useState<FloatingButtonPosition>(
    readSavedScrollTopPosition,
  );
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [selectedTranslationKeys, setSelectedTranslationKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const languageIndex = useLanguageIndex(document);
  const importGuard = useOperationGuard(document);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const isBaiduTranslateConfigured = translationConfigured;
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
    setStorageItem(
      TRANSLATE_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        sourceLanguage: translateSourceLanguage,
        targetLanguage: selectedLanguage,
        scope: translateScope,
      }),
    );
  }, [translateSourceLanguage, selectedLanguage, translateScope]);

  useEffect(() => {
    const availableKeys = new Set(languageIndex.translationKeys);
    if (
      lastSelectedTranslationKeyRef.current &&
      !availableKeys.has(lastSelectedTranslationKeyRef.current)
    ) {
      lastSelectedTranslationKeyRef.current = null;
    }
    setSelectedTranslationKeys((current) => {
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [languageIndex.translationKeys]);

  useEffect(() => {
    function handleResize() {
      const rect = scrollTopButtonRef.current?.getBoundingClientRect();
      setScrollTopPosition((current) =>
        clampFloatingButtonPosition(current, rect?.width, rect?.height),
      );
    }

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const translationKeys = languageIndex.translationKeys;
  const visibleLanguageKeys = languageIndex.visibleLanguageKeys;

  const selectedDeletableKeys = useMemo(() => {
    const minIndex = document.list_code_language.length;
    return document.list_inner.slice(minIndex).filter((key) => selectedTranslationKeys.has(key));
  }, [document.list_code_language.length, document.list_inner, selectedTranslationKeys]);

  const modifiedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!baseline || !selectedLanguage) return keys;
    for (const key of visibleLanguageKeys) {
      const currentTranslations = (document.list_translate[key] as Record<string, string>) ?? {};
      const baselineTranslations = (baseline.list_translate[key] as Record<string, string>) ?? {};
      const currentValue = currentTranslations[selectedLanguage] ?? '';
      const baselineValue = baselineTranslations[selectedLanguage] ?? '';
      if (currentValue !== baselineValue) {
        keys.add(key);
      }
    }
    return keys;
  }, [document, baseline, selectedLanguage, visibleLanguageKeys]);

  const rows: TranslationRow[] = useMemo(() => {
    let filtered = visibleLanguageKeys.map((key, i) => ({
      key,
      index: i,
      isConfigKey: i < document.list_code_language.length,
      isExternalKey: i >= document.list_inner.length,
      translations: (document.list_translate[key] as Record<string, string>) ?? {},
    }));

    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.key.toLowerCase().includes(q) ||
          Boolean(languageIndex.searchTextByKey.get(row.key)?.includes(q)),
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
    visibleLanguageKeys,
    languageIndex.searchTextByKey,
    document.list_code_language.length,
    document.list_inner.length,
    document.list_translate,
    modifiedKeys,
    deferredSearchQuery,
    filterMode,
    selectedLanguage,
  ]);

  function handleAddLanguage(code: string, label: string) {
    if (document.list_code_language.includes(code)) return;
    setSingleLanguageImportStatus(null);
    const nextTranslate: Record<string, unknown> = { ...document.list_translate };
    for (const key of visibleLanguageKeys) {
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

  function handleSelectLanguage(code: string | null) {
    setSingleLanguageImportStatus(null);
    setSelectedLanguage(code);
  }

  function handleRemoveLanguage(code: string) {
    if (code === 'zh' || document.list_code_language.length <= 1) return;
    setSingleLanguageImportStatus(null);
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
    setSingleLanguageImportStatus(null);
    const nextCodes = document.list_code_language.map((c) => (c === oldCode ? newCode : c));
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (oldCode !== newCode) {
      delete nextLabels[oldCode];
    }
    nextLabels[newCode] = newLabel;
    const nextTranslate = { ...document.list_translate };
    if (oldCode !== newCode) {
      for (const key of visibleLanguageKeys) {
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

  async function handleImportSingleLanguage() {
    if (!selectedLanguage) {
      setSingleLanguageImportStatus('请先选择目标语言。');
      return;
    }
    if (!isTauriRuntime()) {
      setSingleLanguageImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = importGuard.begin();
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '单语言翻译 CSV', extensions: ['csv'] }],
        }),
      (message) => {
        if (importGuard.isCurrent(operation)) setSingleLanguageImportStatus(message);
      },
    );
    if (typeof selected !== 'string' || !importGuard.isCurrent(operation)) return;

    setIsImportingSingleLanguage(true);
    setSingleLanguageImportStatus(null);
    try {
      const report = await importSingleLanguageCsv({
        path: selected,
        language_code: selectedLanguage,
        document,
      });
      if (!importGuard.isCurrent(operation)) return;
      if (!report.valid || !report.document) {
        setSingleLanguageImportStatus(report.errors.join('；') || '单语言 CSV 导入失败。');
        return;
      }
      if (report.filled > 0) onUpdate(report.document);
      setSingleLanguageImportStatus(
        `${getLabel(document, selectedLanguage)}：填充 ${report.filled} 条；跳过已有 ${report.skipped_existing}、未知 key ${report.skipped_unknown}、空值 ${report.skipped_empty}、重复 ${report.skipped_duplicate}。`,
      );
    } catch (error) {
      if (importGuard.isCurrent(operation)) {
        setSingleLanguageImportStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (importGuard.isCurrent(operation)) setIsImportingSingleLanguage(false);
    }
  }

  function handleUpdateKey(index: number, _oldKey: string, newKey: string) {
    if (document.list_inner.includes(newKey) || document.list_translate[newKey] !== undefined)
      return;
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

  function handleConfirmDeleteSelected() {
    if (selectedDeletableKeys.length === 0) {
      setConfirmDeleteSelected(false);
      return;
    }

    const deleteKeySet = new Set(selectedDeletableKeys);
    const nextInner = document.list_inner.filter((key) => !deleteKeySet.has(key));
    const nextTranslate = { ...document.list_translate };
    for (const key of deleteKeySet) {
      delete nextTranslate[key];
    }

    lastSelectedTranslationKeyRef.current = null;
    setSelectedTranslationKeys(new Set());
    setConfirmDeleteSelected(false);
    onUpdate({ ...document, list_inner: nextInner, list_translate: nextTranslate });
  }

  function handleReorderKeys(keys: string[], targetIndex: number, position: 'before' | 'after') {
    const minIndex = document.list_code_language.length;
    if (keys.length === 0 || targetIndex < minIndex || targetIndex >= document.list_inner.length) {
      return;
    }

    const configKeys = document.list_inner.slice(0, minIndex);
    const translationKeys = document.list_inner.slice(minIndex);
    const movingKeySet = new Set(keys);
    const targetKey = document.list_inner[targetIndex];
    if (!targetKey || movingKeySet.has(targetKey)) return;

    const movingKeys = translationKeys.filter((key) => movingKeySet.has(key));
    if (movingKeys.length === 0) return;

    const remainingKeys = translationKeys.filter((key) => !movingKeySet.has(key));
    const remainingTargetIndex = remainingKeys.indexOf(targetKey);
    if (remainingTargetIndex < 0) return;

    const insertIndex = position === 'after' ? remainingTargetIndex + 1 : remainingTargetIndex;
    const nextTranslationKeys = [
      ...remainingKeys.slice(0, insertIndex),
      ...movingKeys,
      ...remainingKeys.slice(insertIndex),
    ];

    onUpdate({ ...document, list_inner: [...configKeys, ...nextTranslationKeys] });
  }

  function handleAddKey() {
    const key = newKeyInput.trim();
    if (!key || document.list_inner.includes(key) || document.list_translate[key] !== undefined)
      return;
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

  function handleToggleSelectedKey(key: string, selected: boolean, range: boolean) {
    const selectableRows = rows.filter((row) => !row.isConfigKey);
    const targetIndex = selectableRows.findIndex((row) => row.key === key);
    const anchorKey = lastSelectedTranslationKeyRef.current;
    const anchorIndex =
      range && anchorKey ? selectableRows.findIndex((row) => row.key === anchorKey) : -1;

    setSelectedTranslationKeys((current) => {
      const next = new Set(current);

      if (range && anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        for (const row of selectableRows.slice(start, end + 1)) {
          if (selected) {
            next.add(row.key);
          } else {
            next.delete(row.key);
          }
        }
      } else {
        if (selected) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });

    if (targetIndex >= 0) {
      lastSelectedTranslationKeyRef.current = key;
    }
  }

  function handleToggleAllVisible(selected: boolean) {
    lastSelectedTranslationKeyRef.current = null;
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

  function addTranslateLog(level: TranslateLogLevel, message: string, key?: string) {
    translateLogIdRef.current += 1;
    const time = new Date().toLocaleTimeString();
    const entry: TranslateLogEntry = {
      id: translateLogIdRef.current,
      level,
      message,
      key,
      time,
    };
    setTranslateLogs((current) => [entry, ...current].slice(0, 300));
  }

  function resetTranslateRun(total: number) {
    cancelTranslateRef.current = false;
    setTranslateProgress({ ...initialTranslateProgress, total });
    setShowTranslateLogs(true);
  }

  function handleCancelTranslate() {
    cancelTranslateRef.current = true;
    setTranslateStatus('正在取消，等待当前条目完成...');
    addTranslateLog('warning', '用户请求取消翻译');
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
    resetTranslateRun(candidates.length);
    setTranslateStatus(`正在翻译 0/${candidates.length} 条...`);
    addTranslateLog(
      'info',
      `开始翻译 ${candidates.length} 条，${translateSourceLanguage} → ${selectedLanguage}`,
    );
    const nextTranslate: Record<string, unknown> = { ...document.list_translate };
    let pendingUpdates = 0;
    const flushTranslationUpdates = () => {
      if (pendingUpdates === 0) return;
      onUpdate({ ...document, list_translate: { ...nextTranslate } });
      pendingUpdates = 0;
    };
    try {
      let success = 0;
      let failed = 0;
      let done = 0;

      for (let index = 0; index < candidates.length; index++) {
        if (cancelTranslateRef.current) {
          addTranslateLog('warning', `已取消，剩余 ${candidates.length - index} 条未翻译`);
          break;
        }

        const row = candidates[index];
        const sourceTranslations =
          (document.list_translate[row.key] as Record<string, string> | undefined) ?? {};
        const sourceText = String(sourceTranslations[translateSourceLanguage] ?? '');

        setTranslateProgress((current) => ({ ...current, currentKey: row.key }));
        setTranslateStatus(`正在翻译 ${index + 1}/${candidates.length}: ${row.key}`);

        try {
          const response = await translateBaiduText({
            from: translateSourceLanguage,
            to: selectedLanguage,
            texts: [sourceText],
          });

          const translated = response.translations[0] ?? '';
          if (!translated.trim()) {
            addTranslateLog('warning', '返回空结果，未写入', row.key);
            failed += 1;
            done += 1;
            setTranslateProgress((current) => ({ ...current, done, failed }));
            continue;
          }

          const translations = (nextTranslate[row.key] as Record<string, string> | undefined) ?? {};
          nextTranslate[row.key] = { ...translations, [selectedLanguage]: translated };
          pendingUpdates += 1;
          if (pendingUpdates >= TRANSLATION_UPDATE_BATCH_SIZE) {
            flushTranslationUpdates();
          }
          addTranslateLog('success', '翻译成功', row.key);
          success += 1;
          done += 1;
          setTranslateProgress((current) => ({ ...current, done, success }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addTranslateLog('error', message, row.key);
          failed += 1;
          done += 1;
          setTranslateProgress((current) => ({ ...current, done, failed }));
        }
      }

      flushTranslationUpdates();
      const wasCancelled = cancelTranslateRef.current;
      setTranslateProgress((current) => ({ ...current, currentKey: '' }));
      setTranslateStatus(
        wasCancelled
          ? `已取消：成功 ${success} 条，失败 ${failed} 条`
          : `翻译完成：成功 ${success} 条，失败 ${failed} 条`,
      );
      addTranslateLog(
        wasCancelled ? 'warning' : 'info',
        wasCancelled
          ? `翻译取消：成功 ${success} 条，失败 ${failed} 条`
          : `翻译完成：成功 ${success} 条，失败 ${failed} 条`,
      );
    } catch (error) {
      flushTranslationUpdates();
      const message = error instanceof Error ? error.message : String(error);
      setTranslateStatus(message);
      addTranslateLog('error', message);
    } finally {
      cancelTranslateRef.current = false;
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

  function handleScrollTopPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollTopDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialLeft: scrollTopPosition.left,
      initialTop: scrollTopPosition.top,
      moved: false,
    };
  }

  function handleScrollTopPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const dragState = scrollTopDragRef.current;
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) > 3) {
      dragState.moved = true;
    }

    if (!dragState.moved) return;
    event.preventDefault();
    const rect = scrollTopButtonRef.current?.getBoundingClientRect();
    setScrollTopPosition(
      clampFloatingButtonPosition(
        {
          left: dragState.initialLeft + deltaX,
          top: dragState.initialTop + deltaY,
        },
        rect?.width,
        rect?.height,
      ),
    );
  }

  function handleScrollTopPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const dragState = scrollTopDragRef.current;
    if (!dragState) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.moved) {
      suppressScrollTopClickRef.current = true;
      const rect = scrollTopButtonRef.current?.getBoundingClientRect();
      const nextPosition = clampFloatingButtonPosition(
        {
          left: dragState.initialLeft + event.clientX - dragState.startX,
          top: dragState.initialTop + event.clientY - dragState.startY,
        },
        rect?.width,
        rect?.height,
      );
      setScrollTopPosition(nextPosition);
      setStorageItem(SCROLL_TOP_POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      window.setTimeout(() => {
        suppressScrollTopClickRef.current = false;
      }, 0);
    }

    scrollTopDragRef.current = null;
  }

  function handleScrollTopPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrollTopDragRef.current = null;
  }

  function handleScrollTopClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressScrollTopClickRef.current) {
      event.preventDefault();
      suppressScrollTopClickRef.current = false;
      return;
    }
    handleScrollToTop();
  }

  if (!loaded) {
    return (
      <section className="lang-page">
        <EmptyState>请先在项目管理中打开 .jcpro 项目文件</EmptyState>
      </section>
    );
  }

  const { translated, total } = selectedLanguage
    ? (languageIndex.progressByCode.get(selectedLanguage) ?? {
        translated: 0,
        total: translationKeys.length,
      })
    : { translated: 0, total: translationKeys.length };

  return (
    <section className="lang-page">
      <LanguageSidebar
        document={document}
        languageIndex={languageIndex}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={handleSelectLanguage}
        onAddLanguage={handleAddLanguage}
        onUpdateLanguage={handleUpdateLanguage}
        onRemoveLanguage={handleRemoveLanguage}
      />
      <div className="lang-main" ref={langMainRef}>
        <div className="lang-view-toggle">
          <div className="lang-view-toggle-tabs">
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
            <form
              className="lang-editor-add"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddKey();
              }}
            >
              <input
                aria-label="新增翻译键"
                placeholder="新增翻译键..."
                value={newKeyInput}
                onChange={(event) => setNewKeyInput(event.target.value)}
              />
              <button
                className="lang-btn lang-btn--primary"
                disabled={!newKeyInput.trim()}
                type="submit"
              >
                添加键
              </button>
            </form>
          ) : null}
        </div>
        {viewMode === 'editor' ? (
          <>
            <TranslationToolbar
              searchQuery={searchQuery}
              filterMode={filterMode}
              sourceLanguage={translateSourceLanguage}
              targetLanguage={selectedLanguage}
              totalKeys={visibleLanguageKeys.length}
              filteredCount={rows.length}
              importStatus={singleLanguageImportStatus}
              isImporting={isImportingSingleLanguage}
              onSearch={setSearchQuery}
              onFilter={setFilterMode}
              onSyncKeys={() => {}}
              onImportSingleLanguage={() => void handleImportSingleLanguage()}
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
              progress={translateProgress}
              logs={translateLogs}
              showLogs={showTranslateLogs}
              onSourceLanguageChange={setTranslateSourceLanguage}
              onTargetLanguageChange={handleSelectLanguage}
              onScopeChange={setTranslateScope}
              onTranslate={handleTranslateRows}
              onCancelTranslate={handleCancelTranslate}
              onToggleLogs={() => setShowTranslateLogs((current) => !current)}
              onClearLogs={() => setTranslateLogs([])}
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
              onReorderKeys={handleReorderKeys}
              onRestoreKey={(key) => {
                const original = document.list_translate[key];
                if (original)
                  onUpdate({ ...document, list_translate: { ...document.list_translate } });
              }}
              onToggleSelectedKey={handleToggleSelectedKey}
              onToggleAllVisible={handleToggleAllVisible}
              selectedDeletableCount={selectedDeletableKeys.length}
              onRequestDeleteSelected={() => setConfirmDeleteSelected(true)}
            />
            <div className="lang-footer lang-footer--status">
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
          <LanguageComparisonView
            document={document}
            languageIndex={languageIndex}
            onUpdate={onUpdate}
          />
        )}
        <button
          aria-label="回到顶部"
          className="lang-scroll-top"
          onClick={handleScrollTopClick}
          onPointerDown={handleScrollTopPointerDown}
          onPointerMove={handleScrollTopPointerMove}
          onPointerCancel={handleScrollTopPointerCancel}
          onPointerUp={handleScrollTopPointerUp}
          ref={scrollTopButtonRef}
          style={{ left: scrollTopPosition.left, top: scrollTopPosition.top }}
          title="回到顶部"
          type="button"
        >
          <span className="lang-scroll-top-icon">↑</span>
          <span>顶部</span>
        </button>
        {confirmDeleteSelected ? (
          <ConfirmDialog
            title="删除已选条目"
            message={`确定要删除已选的 ${selectedDeletableKeys.length} 个翻译条目吗？此操作会同时移除这些条目的所有语言翻译。${
              selectedTranslationKeys.size > selectedDeletableKeys.length
                ? `另外 ${selectedTranslationKeys.size - selectedDeletableKeys.length} 个已选条目不可删除，将不会被移除。`
                : ''
            }`}
            confirmLabel="删除"
            danger
            onConfirm={handleConfirmDeleteSelected}
            onCancel={() => setConfirmDeleteSelected(false)}
          />
        ) : null}
      </div>
    </section>
  );
}

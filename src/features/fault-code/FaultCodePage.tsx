import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { loadTextFile, saveTextFile } from '../../api/commands';
import type {
  FaultCodeInfo,
  FaultCodeItem,
  FaultCodeSource,
  LanguageDocument,
  LoadedProject,
} from '../../types/platform';
import {
  csvToFaultCodes,
  csvToFaultSources,
  faultCodesToCsv,
  faultSourcesToCsv,
} from '../../utils/faultCodeCsv';

interface FaultCodePageProps {
  loadedProject: LoadedProject | null;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

const sourceLabels: Record<number, string> = {
  1: 'T 牵引',
  2: 'P 油泵',
  3: 'S 转向',
  4: 'Z 助力转向',
  5: 'L 锂电池',
  6: 'V VCU',
};

const sourcePresets: Record<number, { key: string; name: string; type: string }> = {
  1: { key: 'traction', name: '牵引', type: 'T' },
  2: { key: 'pump', name: '油泵', type: 'P' },
  3: { key: 'steering', name: '转向', type: 'S' },
  4: { key: 'power_steering', name: '助力转向', type: 'Z' },
  5: { key: 'lithium_battery', name: '锂电池', type: 'L' },
  6: { key: 'vcu', name: 'VCU', type: 'V' },
};

const typeChars: Record<number, string> = {
  1: 'T',
  2: 'P',
  3: 'S',
  4: 'Z',
  5: 'L',
  6: 'V',
};

const severityOptions = [
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'fault', label: '故障' },
  { value: 'critical', label: '严重' },
];

const maxVisibleI18nOptions = 80;

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let faultCodeRowKeySeed = 0;

function createFaultCodeRowKey() {
  faultCodeRowKeySeed += 1;
  return `fault-code-row-${faultCodeRowKeySeed}`;
}

function fallbackFaultCodeRowKey(item: FaultCodeItem) {
  return `fault-code-${item.source_key ?? item.source_id ?? 'source'}-${item.type_char ?? 'type'}-${
    item.code ?? 'code'
  }-${item.severity ?? 'severity'}`;
}

function defaultFaultCodeInfo(): FaultCodeInfo {
  return {
    schema_version: 1,
    enabled: true,
    version: 1,
    sources: [
      {
        source_key: 'traction',
        source_id: 1,
        type_char: 'T',
        name: '牵引',
        can_id: 648,
        frame_type: 0,
        code_byte: 2,
        clear_code: 0,
        invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
        enabled: true,
      },
      {
        source_key: 'pump',
        source_id: 2,
        type_char: 'P',
        name: '油泵',
        can_id: 660,
        frame_type: 0,
        code_byte: 2,
        clear_code: 0,
        invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
        enabled: true,
      },
    ],
    codes: [],
  };
}

function defaultLanguageDocument(): LanguageDocument {
  return {
    list_code_language: ['zh', 'en'],
    language_labels: { zh: '中文', en: '英文' },
    list_inner: ['中文', '英文'],
    list_translate: {},
  };
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hexOrDecimal(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
}

function clampFaultCode(value: number) {
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function parseCodeList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item.startsWith('0x') || item.startsWith('0X') ? Number.parseInt(item, 16) : Number(item),
    )
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(255, Math.trunc(item))));
}

function codeListText(values: number[] | undefined) {
  return (values ?? []).join(', ');
}

function sourceKeyFor(source: Pick<FaultCodeSource, 'source_key' | 'source_id'>) {
  return source.source_key || sourcePresets[source.source_id]?.key || `source_${source.source_id}`;
}

function sourceOptionLabel(source: FaultCodeSource) {
  const name = source.name || sourceKeyFor(source);
  const type = source.type_char || typeChars[source.source_id] || '-';
  const canId =
    typeof source.can_id === 'number' && Number.isFinite(source.can_id)
      ? hexOrDecimal(source.can_id)
      : '-';
  return `${name} (${type}, ${canId})`;
}

function normalizeSource(source: FaultCodeSource): FaultCodeSource {
  const preset = sourcePresets[source.source_id];
  return {
    ...source,
    source_key: source.source_key || preset?.key || `source_${source.source_id}`,
    type_char: source.type_char || preset?.type || typeChars[source.source_id] || 'X',
    name:
      source.name ||
      preset?.name ||
      sourceLabels[source.source_id] ||
      source.source_key ||
      '故障来源',
    enabled: source.enabled ?? true,
  };
}

function findSourceForCode(item: FaultCodeItem, sources: FaultCodeSource[]) {
  if (item.source_key) {
    const byKey = sources.find((source) => sourceKeyFor(source) === item.source_key);
    if (byKey) return byKey;
  }
  if (item.source_id !== undefined) {
    const byId = sources.find((source) => source.source_id === item.source_id);
    if (byId) return byId;
  }
  return sources[0];
}

function codePatchForSource(source: FaultCodeSource): Partial<FaultCodeItem> {
  return {
    source_key: sourceKeyFor(source),
    source_id: source.source_id,
    type_char: source.type_char,
  };
}

function normalizeCode(item: FaultCodeItem, sources: FaultCodeSource[]): FaultCodeItem {
  const source = findSourceForCode(item, sources);
  const plainItem = { ...item };
  delete plainItem.generated_from_group;
  delete plainItem.group_key;
  return {
    ...plainItem,
    source_key: item.source_key || (source ? sourceKeyFor(source) : undefined),
    source_id: item.source_id ?? source?.source_id,
    type_char: source?.type_char || item.type_char,
    enabled: item.enabled ?? true,
  };
}

function normalizeFaultDocument(value: unknown): FaultCodeInfo {
  const root = typeof value === 'object' && value !== null ? (value as Partial<FaultCodeInfo>) : {};
  const fallback = defaultFaultCodeInfo();
  const sources = (Array.isArray(root.sources) ? root.sources : (fallback.sources ?? [])).map(
    normalizeSource,
  );
  return {
    schema_version: root.schema_version ?? fallback.schema_version,
    enabled: root.enabled ?? fallback.enabled,
    version: root.version ?? fallback.version,
    sources,
    codes: (Array.isArray(root.codes) ? root.codes : (fallback.codes ?? [])).map((item) =>
      normalizeCode(item, sources),
    ),
  };
}

function messageKeyFor(
  item: Pick<FaultCodeItem, 'source_key' | 'type_char' | 'source_id' | 'code'>,
) {
  const sourceKey =
    item.source_key ||
    sourcePresets[item.source_id ?? 0]?.key ||
    item.type_char?.toLowerCase() ||
    'unknown';
  return `fault.${sourceKey}.${String(item.code).padStart(3, '0')}`;
}

function isAutoMessageKey(
  item: Pick<
    FaultCodeItem,
    'source_key' | 'type_char' | 'source_id' | 'code' | 'message_key' | 'name_key'
  >,
) {
  const currentKey = item.message_key || item.name_key || '';
  return !currentKey || currentKey === messageKeyFor(item);
}

function ensureLanguageEntry(
  language: LanguageDocument,
  key: string,
  zhText = '',
): LanguageDocument {
  if (!key.trim()) return language;
  const listInner = language.list_inner.includes(key)
    ? language.list_inner
    : [...language.list_inner, key];
  const existing = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
  const nextValues = Object.fromEntries(
    language.list_code_language.map((code) => [
      code,
      existing[code] ?? (code === 'zh' ? zhText : ''),
    ]),
  );
  return {
    ...language,
    list_inner: listInner,
    list_translate: {
      ...language.list_translate,
      [key]: nextValues,
    },
  };
}

function cloneLanguageEntry(
  language: LanguageDocument,
  fromKey: string,
  toKey: string,
  fallbackZh = '',
): LanguageDocument {
  if (!toKey.trim()) return language;
  const listInner = language.list_inner.includes(toKey)
    ? language.list_inner
    : [...language.list_inner, toKey];
  const sourceValues =
    (language.list_translate[fromKey] as Record<string, string> | undefined) ?? {};
  const existingValues =
    (language.list_translate[toKey] as Record<string, string> | undefined) ?? {};
  const nextValues = Object.fromEntries(
    language.list_code_language.map((code) => [
      code,
      existingValues[code] ?? sourceValues[code] ?? (code === 'zh' ? fallbackZh : ''),
    ]),
  );
  return {
    ...language,
    list_inner: listInner,
    list_translate: {
      ...language.list_translate,
      [toKey]: nextValues,
    },
  };
}

function languageText(language: LanguageDocument, key: string) {
  return (language.list_translate[key] as Record<string, string> | undefined)?.zh ?? '';
}

function languageEntryKeys(language: LanguageDocument) {
  return language.list_inner
    .slice(language.list_code_language.length)
    .filter((key) => typeof key === 'string' && key.trim().length > 0);
}

function languageOptionLabel(language: LanguageDocument, key: string) {
  const zhText = languageText(language, key);
  return zhText ? `${key} - ${zhText}` : key;
}

function languageSearchText(language: LanguageDocument, key: string) {
  const values = language.list_translate[key];
  const translations =
    values && typeof values === 'object'
      ? Object.values(values as Record<string, unknown>)
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
      : '';
  return `${key} ${translations}`.toLowerCase();
}

function filterLanguageEntryKeys(language: LanguageDocument, keys: string[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return keys;
  return keys.filter((key) => languageSearchText(language, key).includes(keyword));
}

function sourceCanIdForCode(item: FaultCodeItem, sources: FaultCodeSource[]): number | null {
  const source = findSourceForCode(item, sources);
  return typeof source?.can_id === 'number' && Number.isFinite(source.can_id)
    ? source.can_id
    : null;
}

function buildDuplicateFaultCodeHints(sources: FaultCodeSource[], codes: FaultCodeItem[]) {
  const groups = new Map<string, { canId: number; code: number; indexes: number[] }>();

  codes.forEach((item, index) => {
    const canId = sourceCanIdForCode(item, sources);
    if (canId === null || !Number.isFinite(item.code)) return;
    const code = Math.max(0, Math.min(255, Math.trunc(item.code)));
    const key = `${canId}:${code}`;
    const group = groups.get(key) ?? { canId, code, indexes: [] };
    group.indexes.push(index);
    groups.set(key, group);
  });

  const duplicateIndexes = new Set<number>();
  const messages: string[] = [];

  for (const group of groups.values()) {
    if (group.indexes.length <= 1) continue;
    for (const index of group.indexes) duplicateIndexes.add(index);
    messages.push(
      `${hexOrDecimal(group.canId)} 下故障码 ${group.code} 重复 ${group.indexes.length} 次`,
    );
  }

  return { duplicateIndexes, messages };
}

function buildDuplicateMessageKeyHints(codes: FaultCodeItem[], drafts: Record<number, string>) {
  const groups = new Map<string, { key: string; indexes: number[] }>();

  codes.forEach((item, index) => {
    const messageKey = (
      drafts[index] ??
      item.message_key ??
      item.name_key ??
      messageKeyFor(item)
    ).trim();
    if (!messageKey) return;
    const normalizedKey = messageKey.toLowerCase();
    const group = groups.get(normalizedKey) ?? { key: messageKey, indexes: [] };
    group.indexes.push(index);
    groups.set(normalizedKey, group);
  });

  const duplicateIndexes = new Set<number>();
  const messages: string[] = [];

  for (const group of groups.values()) {
    if (group.indexes.length <= 1) continue;
    for (const index of group.indexes) duplicateIndexes.add(index);
    messages.push(`文案 Key "${group.key}" 重复 ${group.indexes.length} 次`);
  }

  return { duplicateIndexes, messages };
}

export function FaultCodePage({ loadedProject, onUpdateSections }: FaultCodePageProps) {
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [isCsvBusy, setIsCsvBusy] = useState(false);
  const document = (loadedProject?.document as Record<string, unknown> | undefined) ?? {};
  const faultCode = normalizeFaultDocument(document.fault_code_info);
  const language =
    (document.language_info as LanguageDocument | undefined) ?? defaultLanguageDocument();
  const sources = faultCode.sources ?? [];
  const codes = faultCode.codes ?? [];
  const [i18nSearchByRow, setI18nSearchByRow] = useState<Record<number, string>>({});
  const [messageKeyDraftByRow, setMessageKeyDraftByRow] = useState<Record<number, string>>({});
  const [cloneSourceByRow, setCloneSourceByRow] = useState<Record<number, string>>({});
  const [sourceFilter, setSourceFilter] = useState('all');
  const [codeRowKeys, setCodeRowKeys] = useState(() => codes.map(createFaultCodeRowKey));
  const duplicateFaultCodes = buildDuplicateFaultCodeHints(sources, codes);
  const duplicateMessageKeys = buildDuplicateMessageKeyHints(codes, messageKeyDraftByRow);
  const i18nKeys = languageEntryKeys(language);
  const sourceFilterKeys = new Set(sources.map(sourceKeyFor));
  const effectiveSourceFilter = sourceFilterKeys.has(sourceFilter) ? sourceFilter : 'all';
  const codeCountBySource = codes.reduce((counts, item) => {
    const source = findSourceForCode(item, sources);
    const key = source ? sourceKeyFor(source) : item.source_key || '';
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const visibleCodeRows = codes
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (effectiveSourceFilter === 'all') return true;
      const source = findSourceForCode(item, sources);
      return source
        ? sourceKeyFor(source) === effectiveSourceFilter
        : item.source_key === effectiveSourceFilter;
    });

  useEffect(() => {
    setCodeRowKeys((current) => {
      if (current.length === codes.length) return current;
      if (current.length > codes.length) return current.slice(0, codes.length);
      return [
        ...current,
        ...Array.from({ length: codes.length - current.length }, createFaultCodeRowKey),
      ];
    });
  }, [codes.length]);

  function updateFaultCode(next: FaultCodeInfo, nextLanguage = language) {
    onUpdateSections({
      fault_code_info: { ...next, schema_version: next.schema_version ?? 1 },
      language_info: nextLanguage,
    });
  }

  function updateRoot(field: keyof FaultCodeInfo, value: unknown) {
    updateFaultCode({ ...faultCode, [field]: value });
  }

  function updateSource(index: number, patch: Partial<FaultCodeSource>) {
    const oldSource = sources[index];
    const oldSourceKey = oldSource ? sourceKeyFor(oldSource) : '';
    const nextSources = sources.map((source, currentIndex) => {
      if (currentIndex !== index) return source;
      const next = { ...source, ...patch };
      if (patch.source_id !== undefined && patch.type_char === undefined) {
        const preset = sourcePresets[patch.source_id];
        next.type_char = preset?.type ?? typeChars[patch.source_id] ?? next.type_char;
        next.source_key = preset?.key ?? next.source_key;
        next.name = preset?.name ?? next.name;
      }
      return normalizeSource(next);
    });
    const nextSource = nextSources[index];
    const nextCodes =
      nextSource && oldSourceKey
        ? codes.map((code) =>
            code.source_key === oldSourceKey ||
            (!code.source_key && oldSource && code.source_id === oldSource.source_id)
              ? { ...code, ...codePatchForSource(nextSource) }
              : code,
          )
        : codes;
    updateFaultCode({ ...faultCode, sources: nextSources, codes: nextCodes });
  }

  function addSource() {
    const usedIds = new Set(sources.map((source) => source.source_id));
    const sourceId =
      Object.keys(sourcePresets)
        .map(Number)
        .find((id) => !usedIds.has(id)) ?? sources.length + 1;
    const preset = sourcePresets[sourceId];
    updateFaultCode({
      ...faultCode,
      sources: [
        ...sources,
        {
          source_key: preset?.key ?? `source_${sourceId}`,
          source_id: sourceId,
          type_char: preset?.type ?? typeChars[sourceId] ?? 'X',
          name: preset?.name ?? '新来源',
          can_id: 0,
          frame_type: 0,
          code_byte: 2,
          clear_code: 0,
          invalid_codes: [],
          enabled: true,
        },
      ],
    });
  }

  function removeSource(index: number) {
    updateFaultCode({
      ...faultCode,
      sources: sources.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateCode(index: number, patch: Partial<FaultCodeItem>) {
    let nextLanguage = language;
    const nextCodes = codes.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      const shouldRefreshAutoKey =
        isAutoMessageKey(item) &&
        (patch.source_id !== undefined ||
          patch.source_key !== undefined ||
          patch.type_char !== undefined ||
          patch.code !== undefined);
      const next = { ...item, ...patch };
      if (patch.source_id !== undefined && patch.type_char === undefined) {
        const source = sources.find((candidate) => candidate.source_id === patch.source_id);
        if (source) {
          Object.assign(next, codePatchForSource(source));
        } else {
          next.type_char = typeChars[patch.source_id] ?? next.type_char;
        }
      }
      if (patch.source_key !== undefined && patch.type_char === undefined) {
        const source = sources.find((candidate) => sourceKeyFor(candidate) === patch.source_key);
        if (source) {
          Object.assign(next, codePatchForSource(source));
        }
      }
      if (shouldRefreshAutoKey) {
        next.message_key = messageKeyFor(next);
      }
      if (!next.message_key) {
        next.message_key = messageKeyFor(next);
      }
      nextLanguage = ensureLanguageEntry(nextLanguage, next.message_key, next.name ?? '');
      return next;
    });
    updateFaultCode(
      { ...faultCode, codes: nextCodes.map((item) => normalizeCode(item, sources)) },
      nextLanguage,
    );
  }

  function updateCodeText(index: number, text: string) {
    const item = codes[index];
    if (!item) return;
    const key = item.message_key || item.name_key || messageKeyFor(item);
    const values = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
    const nextLanguage = ensureLanguageEntry(
      {
        ...language,
        list_translate: {
          ...language.list_translate,
          [key]: { ...values, zh: text },
        },
      },
      key,
      text,
    );
    onUpdateSections({
      fault_code_info: {
        ...faultCode,
        schema_version: faultCode.schema_version ?? 1,
        codes: codes.map((code, currentIndex) =>
          currentIndex === index ? { ...code, message_key: key, name: text } : code,
        ),
      },
      language_info: nextLanguage,
    });
  }

  function bindCodeMessageKey(index: number, key: string) {
    const item = codes[index];
    if (!item || !key) return;

    const zhText = languageText(language, key);
    setI18nSearchByRow((current) => ({ ...current, [index]: '' }));
    setMessageKeyDraftByRow((current) => ({ ...current, [index]: key }));
    updateFaultCode({
      ...faultCode,
      codes: codes.map((code, currentIndex) =>
        currentIndex === index ? { ...code, message_key: key, name: zhText || code.name } : code,
      ),
    });
  }

  function commitMessageKeyDraft(index: number) {
    const item = codes[index];
    if (!item) return;

    const currentKey = item.message_key || item.name_key || messageKeyFor(item);
    const nextKey = (messageKeyDraftByRow[index] ?? currentKey).trim();
    if (!nextKey || nextKey === currentKey) {
      setMessageKeyDraftByRow((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
      return;
    }

    updateCode(index, { message_key: nextKey });
    setMessageKeyDraftByRow((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  function cancelMessageKeyDraft(index: number) {
    setMessageKeyDraftByRow((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  function addCode() {
    const source = sources.find((item) => item.enabled ?? true) ?? sources[0];
    const sourceId = source?.source_id ?? 1;
    const item: FaultCodeItem = {
      source_key: source ? sourceKeyFor(source) : sourcePresets[sourceId]?.key,
      source_id: sourceId,
      type_char: source?.type_char ?? typeChars[sourceId] ?? 'T',
      code: 1,
      severity: 'fault',
      enabled: true,
    };
    item.message_key = messageKeyFor(item);
    const nextLanguage = ensureLanguageEntry(language, item.message_key, '新故障');
    setCodeRowKeys((current) => [...current, createFaultCodeRowKey()]);
    updateFaultCode({ ...faultCode, codes: [...codes, { ...item, name: '新故障' }] }, nextLanguage);
  }

  function cloneCodeToSource(index: number) {
    const item = codes[index];
    if (!item) return;

    const currentSource = findSourceForCode(item, sources);
    const currentSourceKey = currentSource ? sourceKeyFor(currentSource) : '';
    const selectedSourceKey = cloneSourceByRow[index] || '';
    const fallbackTargetSource = sources.find(
      (source) => sourceKeyFor(source) !== currentSourceKey,
    );
    const targetSource =
      sources.find((source) => sourceKeyFor(source) === selectedSourceKey) ?? fallbackTargetSource;
    if (!targetSource) {
      setCsvStatus('请先选择要复制到的故障来源');
      return;
    }
    if (currentSource && sourceKeyFor(currentSource) === sourceKeyFor(targetSource)) {
      setCsvStatus('目标来源不能与当前来源相同');
      return;
    }

    const code = clampFaultCode(numberValue(item.code));
    const targetCanId = targetSource.can_id;
    const duplicatedInTarget = codes.some((candidate) => {
      const source = findSourceForCode(candidate, sources);
      return source?.can_id === targetCanId && clampFaultCode(numberValue(candidate.code)) === code;
    });
    if (duplicatedInTarget) {
      setCsvStatus(`${sourceOptionLabel(targetSource)} 已存在故障码 ${code}`);
      return;
    }

    const sourceKey = item.message_key || item.name_key || messageKeyFor(item);
    const nextItem: FaultCodeItem = {
      ...item,
      ...codePatchForSource(targetSource),
      code,
    };
    nextItem.message_key = messageKeyFor(nextItem);
    const zhText = languageText(language, sourceKey) || item.name || '';
    nextItem.name = zhText;
    const nextLanguage = cloneLanguageEntry(language, sourceKey, nextItem.message_key, zhText);
    const insertIndex = index + 1;
    const nextCodes = [...codes.slice(0, insertIndex), nextItem, ...codes.slice(insertIndex)];

    setI18nSearchByRow({});
    setMessageKeyDraftByRow({});
    setCloneSourceByRow({});
    setCodeRowKeys((current) => [
      ...current.slice(0, insertIndex),
      createFaultCodeRowKey(),
      ...current.slice(insertIndex),
    ]);
    updateFaultCode({ ...faultCode, codes: nextCodes }, nextLanguage);
    setCsvStatus(`已将故障码 ${code} 复制到 ${sourceOptionLabel(targetSource)}`);
  }

  function removeCode(index: number) {
    setI18nSearchByRow({});
    setMessageKeyDraftByRow({});
    setCloneSourceByRow({});
    setCodeRowKeys((current) => current.filter((_, currentIndex) => currentIndex !== index));
    updateFaultCode({
      ...faultCode,
      codes: codes.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function exportSourcesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await save({
      filters: [{ name: '故障来源 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsCsvBusy(true);
    try {
      await saveTextFile(selected, `\uFEFF${faultSourcesToCsv(sources)}`);
      setCsvStatus(`来源规则 CSV 已导出：${selected}`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function importSourcesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: '故障来源 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsCsvBusy(true);
    try {
      const text = await loadTextFile(selected);
      const { sources: nextSources, errors } = csvToFaultSources(text);
      if (errors.length > 0) {
        setCsvStatus(`导入来源规则 CSV 出错：${errors.join('；')}`);
        return;
      }
      updateFaultCode({ ...faultCode, sources: nextSources.map(normalizeSource) });
      setCsvStatus(`已导入 ${nextSources.length} 条来源规则`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function exportCodesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await save({
      filters: [{ name: '故障码 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsCsvBusy(true);
    try {
      await saveTextFile(selected, `\uFEFF${faultCodesToCsv(codes, sources, language)}`);
      setCsvStatus(`故障码 CSV 已导出：${selected}`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function importCodesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: '故障码 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsCsvBusy(true);
    try {
      const text = await loadTextFile(selected);
      const { codes: nextCodes, language: nextLanguage, errors } = csvToFaultCodes(text, language);
      if (errors.length > 0) {
        setCsvStatus(`导入故障码 CSV 出错：${errors.join('；')}`);
        return;
      }
      updateFaultCode(
        { ...faultCode, codes: nextCodes.map((item) => normalizeCode(item, sources)) },
        nextLanguage,
      );
      setCsvStatus(`已导入 ${nextCodes.length} 条故障码，并同步多语言文案`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  if (!loadedProject) {
    return (
      <section className="table-spec-card">
        <div>
          <h2>故障代码</h2>
          <p>打开项目后可编辑故障来源帧、故障码和多语言文案绑定。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="fault-code-page">
      <section className="table-spec-card">
        <div className="fault-code-header">
          <div>
            <h2>故障代码</h2>
            <p>配置会随项目导出写入 data.bin，设备端优先读取动态配置。</p>
          </div>
          <label className="settings-check">
            <input
              checked={faultCode.enabled}
              onChange={(event) => updateRoot('enabled', event.target.checked)}
              type="checkbox"
            />
            <span>启用</span>
          </label>
        </div>
        <div className="structured-list fault-code-meta">
          <label>
            结构版本
            <input readOnly value={faultCode.schema_version ?? 1} />
          </label>
          <label>
            二进制版本
            <input
              min={1}
              type="number"
              value={faultCode.version ?? 1}
              onChange={(event) => updateRoot('version', numberValue(event.target.value, 1))}
            />
          </label>
          <label>
            来源数量
            <input readOnly value={sources.length} />
          </label>
          <label>
            故障码数量
            <input readOnly value={codes.length} />
          </label>
        </div>
        {csvStatus ? <p className="fault-code-csv-status">{csvStatus}</p> : null}
      </section>

      <section className="table-spec-card">
        <div className="config-table-toolbar">
          <strong>来源规则</strong>
          <div className="fault-code-toolbar-actions">
            <button type="button" onClick={addSource}>
              新增来源
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void exportSourcesCsv()}>
              导出 CSV
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void importSourcesCsv()}>
              导入 CSV
            </button>
          </div>
        </div>
        <div className="config-table-frame">
          <table className="config-table fault-code-source-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>来源 Key</th>
                <th>名称</th>
                <th>来源 ID</th>
                <th>类型</th>
                <th>CAN ID</th>
                <th>帧类型</th>
                <th>取码字节</th>
                <th>清除码</th>
                <th>无效码</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source, index) => (
                <tr key={`${sourceKeyFor(source)}-${source.source_id}-${source.can_id}`}>
                  <td>
                    <input
                      checked={source.enabled ?? true}
                      type="checkbox"
                      onChange={(event) => updateSource(index, { enabled: event.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      value={sourceKeyFor(source)}
                      onChange={(event) =>
                        updateSource(index, { source_key: event.target.value.trim() })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={source.name ?? ''}
                      onChange={(event) => updateSource(index, { name: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      min={1}
                      type="number"
                      value={source.source_id}
                      onChange={(event) =>
                        updateSource(index, { source_id: numberValue(event.target.value, 1) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      maxLength={1}
                      value={source.type_char}
                      onChange={(event) =>
                        updateSource(index, {
                          type_char: event.target.value.slice(0, 1).toUpperCase(),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={source.can_id}
                      onChange={(event) =>
                        updateSource(index, { can_id: numberValue(event.target.value) })
                      }
                    />
                    <small>{hexOrDecimal(source.can_id)}</small>
                  </td>
                  <td>
                    <select
                      value={source.frame_type ?? source.type ?? 0}
                      onChange={(event) =>
                        updateSource(index, { frame_type: numberValue(event.target.value) })
                      }
                    >
                      <option value={0}>标准帧</option>
                      <option value={1}>扩展帧</option>
                    </select>
                  </td>
                  <td>
                    <input
                      min={0}
                      max={7}
                      type="number"
                      value={source.code_byte ?? source.code_offset ?? 2}
                      onChange={(event) =>
                        updateSource(index, { code_byte: numberValue(event.target.value, 2) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      min={0}
                      max={255}
                      type="number"
                      value={source.clear_code ?? 0}
                      onChange={(event) =>
                        updateSource(index, { clear_code: numberValue(event.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={codeListText(source.invalid_codes)}
                      onChange={(event) =>
                        updateSource(index, { invalid_codes: parseCodeList(event.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <button className="danger" type="button" onClick={() => removeSource(index)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-spec-card">
        <div className="config-table-toolbar">
          <strong>故障码</strong>
          <div className="fault-code-toolbar-actions">
            <label className="fault-code-source-filter">
              来源
              <select
                value={effectiveSourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <option value="all">全部来源 ({codes.length})</option>
                {sources.map((source) => {
                  const key = sourceKeyFor(source);
                  return (
                    <option key={key} value={key}>
                      {sourceOptionLabel(source)} ({codeCountBySource.get(key) ?? 0})
                    </option>
                  );
                })}
              </select>
            </label>
            <button type="button" onClick={addCode}>
              新增故障码
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void exportCodesCsv()}>
              导出 CSV
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void importCodesCsv()}>
              导入 CSV
            </button>
          </div>
        </div>
        {duplicateFaultCodes.messages.length > 0 || duplicateMessageKeys.messages.length > 0 ? (
          <div className="fault-code-duplicate-alert">
            {[...duplicateFaultCodes.messages, ...duplicateMessageKeys.messages].join('；')}
          </div>
        ) : null}
        <div className="config-table-frame">
          <table className="config-table fault-code-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>来源</th>
                <th>CAN ID</th>
                <th>类型</th>
                <th>取码字节</th>
                <th>Code</th>
                <th>等级</th>
                <th>文案 Key</th>
                <th>中文文案</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleCodeRows.map(({ item, index }) => {
                const key = item.message_key || item.name_key || messageKeyFor(item);
                const codeSource = findSourceForCode(item, sources);
                const codeSourceKey = codeSource ? sourceKeyFor(codeSource) : '';
                const codeTypeChar = codeSource?.type_char ?? item.type_char ?? '';
                const codeCanId =
                  typeof codeSource?.can_id === 'number' && Number.isFinite(codeSource.can_id)
                    ? hexOrDecimal(codeSource.can_id)
                    : '-';
                const codeByte = codeSource?.code_byte ?? codeSource?.code_offset ?? '-';
                const duplicateCanId = sourceCanIdForCode(item, sources);
                const isDuplicate = duplicateFaultCodes.duplicateIndexes.has(index);
                const isDuplicateMessageKey = duplicateMessageKeys.duplicateIndexes.has(index);
                const selectedI18nKey = i18nKeys.includes(key) ? key : '';
                const i18nSearchText = i18nSearchByRow[index] ?? '';
                const filteredI18nKeys = filterLanguageEntryKeys(
                  language,
                  i18nKeys,
                  i18nSearchText,
                );
                const limitedI18nKeys = filteredI18nKeys.slice(0, maxVisibleI18nOptions);
                const visibleI18nKeys = [
                  ...(selectedI18nKey && !limitedI18nKeys.includes(selectedI18nKey)
                    ? [selectedI18nKey]
                    : []),
                  ...limitedI18nKeys,
                ];
                const isI18nResultLimited = filteredI18nKeys.length > limitedI18nKeys.length;
                const cloneSourceOptions = sources.filter(
                  (source) => sourceKeyFor(source) !== codeSourceKey,
                );
                const defaultCloneSource = cloneSourceOptions[0];
                const selectedCloneSource =
                  cloneSourceByRow[index] ??
                  (defaultCloneSource ? sourceKeyFor(defaultCloneSource) : '');
                return (
                  <tr
                    className={
                      isDuplicate || isDuplicateMessageKey ? 'fault-code-duplicate-row' : undefined
                    }
                    key={codeRowKeys[index] ?? fallbackFaultCodeRowKey(item)}
                  >
                    <td>
                      <input
                        checked={item.enabled ?? true}
                        type="checkbox"
                        onChange={(event) => updateCode(index, { enabled: event.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        value={item.source_key ?? codeSourceKey}
                        onChange={(event) => updateCode(index, { source_key: event.target.value })}
                      >
                        {sources.map((source) => (
                          <option key={sourceKeyFor(source)} value={sourceKeyFor(source)}>
                            {sourceOptionLabel(source)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="fault-code-readonly-value" title="CAN ID 由来源规则决定">
                        {codeCanId}
                      </span>
                    </td>
                    <td>
                      <span className="fault-code-readonly-value" title="类型由来源规则决定">
                        {codeTypeChar || '-'}
                      </span>
                    </td>
                    <td>
                      <span className="fault-code-readonly-value" title="取码字节由来源规则决定">
                        {codeByte}
                      </span>
                    </td>
                    <td>
                      <input
                        min={0}
                        max={255}
                        type="number"
                        value={item.code}
                        onChange={(event) =>
                          updateCode(index, { code: numberValue(event.target.value) })
                        }
                      />
                      {isDuplicate && duplicateCanId !== null ? (
                        <small className="fault-code-duplicate-hint">
                          {hexOrDecimal(duplicateCanId)} 来源下已存在相同故障码
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <select
                        value={item.severity ?? 'fault'}
                        onChange={(event) => updateCode(index, { severity: event.target.value })}
                      >
                        {severityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="fault-code-i18n-cell">
                        <div className="fault-code-i18n-search-row">
                          <input
                            disabled={i18nKeys.length === 0}
                            placeholder="搜索 i18n key / 文案"
                            type="search"
                            value={i18nSearchText}
                            onChange={(event) =>
                              setI18nSearchByRow((current) => ({
                                ...current,
                                [index]: event.target.value,
                              }))
                            }
                          />
                          {i18nSearchText ? (
                            <button
                              title="清空搜索"
                              type="button"
                              onClick={() =>
                                setI18nSearchByRow((current) => ({ ...current, [index]: '' }))
                              }
                            >
                              清空
                            </button>
                          ) : null}
                        </div>
                        <select
                          disabled={i18nKeys.length === 0}
                          value={selectedI18nKey}
                          onChange={(event) => bindCodeMessageKey(index, event.target.value)}
                        >
                          <option value="">
                            {i18nKeys.length === 0
                              ? '暂无可绑定 i18n'
                              : filteredI18nKeys.length === 0
                                ? '无匹配 i18n'
                                : '选择已有 i18n'}
                          </option>
                          {visibleI18nKeys.map((entryKey) => (
                            <option key={entryKey} value={entryKey}>
                              {languageOptionLabel(language, entryKey)}
                            </option>
                          ))}
                        </select>
                        <small className="fault-code-i18n-meta">
                          {i18nKeys.length === 0
                            ? '请先在语言表中添加条目'
                            : `${filteredI18nKeys.length}/${i18nKeys.length} 个匹配${
                                isI18nResultLimited ? `，仅显示前 ${maxVisibleI18nOptions} 个` : ''
                              }`}
                        </small>
                        <input
                          value={messageKeyDraftByRow[index] ?? key}
                          onBlur={() => commitMessageKeyDraft(index)}
                          onChange={(event) =>
                            setMessageKeyDraftByRow((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === 'Enter') {
                              event.currentTarget.blur();
                            }
                            if (event.key === 'Escape') {
                              cancelMessageKeyDraft(index);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        {isDuplicateMessageKey ? (
                          <small className="fault-code-duplicate-hint">已存在相同文案 Key</small>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <input
                        value={languageText(language, key) || item.name || ''}
                        onChange={(event) => updateCodeText(index, event.target.value)}
                      />
                    </td>
                    <td>
                      <div className="fault-code-row-actions">
                        <select
                          disabled={cloneSourceOptions.length === 0}
                          value={selectedCloneSource}
                          onChange={(event) =>
                            setCloneSourceByRow((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))
                          }
                        >
                          {cloneSourceOptions.length === 0 ? (
                            <option value="">无其他来源</option>
                          ) : null}
                          {cloneSourceOptions.map((source) => (
                            <option key={sourceKeyFor(source)} value={sourceKeyFor(source)}>
                              {sourceOptionLabel(source)}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={cloneSourceOptions.length === 0}
                          type="button"
                          onClick={() => cloneCodeToSource(index)}
                        >
                          复制到来源
                        </button>
                        <button className="danger" type="button" onClick={() => removeCode(index)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleCodeRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="fault-code-empty-filter">当前来源下没有故障码</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

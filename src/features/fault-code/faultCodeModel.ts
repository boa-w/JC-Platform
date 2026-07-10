import type {
  FaultCodeInfo,
  FaultCodeItem,
  FaultCodeSource,
  LanguageDocument,
} from '../../types/platform';

const sourceLabels: Record<number, string> = {
  1: 'T 牵引',
  2: 'P 油泵',
  3: 'S 转向',
  4: 'Z 助力转向',
  5: 'L 锂电池',
  6: 'V VCU',
};

export const sourcePresets: Record<number, { key: string; name: string; type: string }> = {
  1: { key: 'traction', name: '牵引', type: 'T' },
  2: { key: 'pump', name: '油泵', type: 'P' },
  3: { key: 'steering', name: '转向', type: 'S' },
  4: { key: 'power_steering', name: '助力转向', type: 'Z' },
  5: { key: 'lithium_battery', name: '锂电池', type: 'L' },
  6: { key: 'vcu', name: 'VCU', type: 'V' },
};

export const typeChars: Record<number, string> = {
  1: 'T',
  2: 'P',
  3: 'S',
  4: 'Z',
  5: 'L',
  6: 'V',
};

export function defaultFaultCodeInfo(): FaultCodeInfo {
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

export function defaultLanguageDocument(): LanguageDocument {
  return {
    list_code_language: ['zh', 'en'],
    language_labels: { zh: '中文', en: '英文' },
    list_inner: ['中文', '英文'],
    list_translate: {},
  };
}

export function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function hexOrDecimal(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
}

export function clampFaultCode(value: number) {
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

export function parseCodeList(value: string) {
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

export function codeListText(values: number[] | undefined) {
  return (values ?? []).join(', ');
}

export function sourceKeyFor(source: Pick<FaultCodeSource, 'source_key' | 'source_id'>) {
  return source.source_key || sourcePresets[source.source_id]?.key || `source_${source.source_id}`;
}

export function sourceOptionLabel(source: FaultCodeSource) {
  const name = source.name || sourceKeyFor(source);
  const type = source.type_char || typeChars[source.source_id] || '-';
  const canId =
    typeof source.can_id === 'number' && Number.isFinite(source.can_id)
      ? hexOrDecimal(source.can_id)
      : '-';
  return `${name} (${type}, ${canId})`;
}

export function sourceLabelForKey(sources: FaultCodeSource[], key: string) {
  const source = sources.find((item) => sourceKeyFor(item) === key);
  return source ? sourceOptionLabel(source) : key || '未选择来源';
}

export function normalizeSource(source: FaultCodeSource): FaultCodeSource {
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

export function findSourceForCode(item: FaultCodeItem, sources: FaultCodeSource[]) {
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

export function codePatchForSource(source: FaultCodeSource): Partial<FaultCodeItem> {
  return {
    source_key: sourceKeyFor(source),
    source_id: source.source_id,
    type_char: source.type_char,
  };
}

export function normalizeCode(item: FaultCodeItem, sources: FaultCodeSource[]): FaultCodeItem {
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

export function normalizeFaultDocument(value: unknown): FaultCodeInfo {
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

export function messageKeyFor(
  item: Pick<FaultCodeItem, 'source_key' | 'type_char' | 'source_id' | 'code'>,
) {
  const sourceKey =
    item.source_key ||
    sourcePresets[item.source_id ?? 0]?.key ||
    item.type_char?.toLowerCase() ||
    'unknown';
  return `fault.${sourceKey}.${String(item.code).padStart(3, '0')}`;
}

export function isAutoMessageKey(
  item: Pick<
    FaultCodeItem,
    'source_key' | 'type_char' | 'source_id' | 'code' | 'message_key' | 'name_key'
  >,
) {
  const currentKey = item.message_key || item.name_key || '';
  return !currentKey || currentKey === messageKeyFor(item);
}

export function ensureLanguageEntry(
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

export function cloneLanguageEntry(
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

export function languageText(language: LanguageDocument, key: string) {
  return (language.list_translate[key] as Record<string, string> | undefined)?.zh ?? '';
}

export function languageEntryKeys(language: LanguageDocument) {
  return language.list_inner
    .slice(language.list_code_language.length)
    .filter((key) => typeof key === 'string' && key.trim().length > 0);
}

export function languageOptionLabel(language: LanguageDocument, key: string) {
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

export function filterLanguageEntryKeys(language: LanguageDocument, keys: string[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return keys;
  return keys.filter((key) => languageSearchText(language, key).includes(keyword));
}

export function sourceCanIdForCode(item: FaultCodeItem, sources: FaultCodeSource[]): number | null {
  const source = findSourceForCode(item, sources);
  return typeof source?.can_id === 'number' && Number.isFinite(source.can_id)
    ? source.can_id
    : null;
}

export function buildDuplicateFaultCodeHints(sources: FaultCodeSource[], codes: FaultCodeItem[]) {
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

export function buildDuplicateMessageKeyHints(
  codes: FaultCodeItem[],
  drafts: Record<number, string>,
) {
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

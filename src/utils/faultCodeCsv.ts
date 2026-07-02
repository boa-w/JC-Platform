import type { FaultCodeItem, FaultCodeSource, LanguageDocument } from '../types/platform';

const typeChars: Record<number, string> = {
  1: 'T',
  2: 'P',
  3: 'S',
  4: 'Z',
  5: 'L',
  6: 'V',
};

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseCsv(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map(parseCsvLine);
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed =
    value.startsWith('0x') || value.startsWith('0X') ? Number.parseInt(value, 16) : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function parseBoolean(value: string | undefined, fallback = true): boolean {
  if (!value) return fallback;
  const text = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', '启用'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off', '禁用'].includes(text)) return false;
  return fallback;
}

function parseCodeList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(/[,|;，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => clampByte(parseNumber(item)))
    .filter((item, index, items) => items.indexOf(item) === index);
}

function messageKeyFor(item: Pick<FaultCodeItem, 'type_char' | 'source_id' | 'code'>): string {
  const type = item.type_char || typeChars[item.source_id ?? 0] || 'X';
  return `fault.${type.toLowerCase()}.${String(item.code).padStart(3, '0')}`;
}

function languageText(language: LanguageDocument, key: string, code: string): string {
  return (language.list_translate[key] as Record<string, string> | undefined)?.[code] ?? '';
}

function ensureLanguageEntry(
  language: LanguageDocument,
  key: string,
  values: Record<string, string>,
): LanguageDocument {
  if (!key.trim()) return language;
  const listInner = language.list_inner.includes(key)
    ? language.list_inner
    : [...language.list_inner, key];
  const existing = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
  const nextValues = Object.fromEntries(
    language.list_code_language.map((code) => [code, values[code] ?? existing[code] ?? '']),
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

export function faultSourcesToCsv(sources: FaultCodeSource[]): string {
  const header = 'source_id,type_char,can_id,frame_type,code_byte,clear_code,invalid_codes';
  const rows = sources.map((source) =>
    [
      String(source.source_id),
      source.type_char ?? '',
      `0x${source.can_id.toString(16).toUpperCase()}`,
      String(source.frame_type ?? source.type ?? 0),
      String(source.code_byte ?? source.code_offset ?? 2),
      String(source.clear_code ?? 0),
      escapeCsvField((source.invalid_codes ?? []).join('|')),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToFaultSources(text: string): {
  sources: FaultCodeSource[];
  errors: string[];
} {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const sources: FaultCodeSource[] = [];
  const header = rows[0];
  if (header?.[0] !== 'source_id') {
    return { sources: [], errors: ['CSV 首列必须为 source_id'] };
  }

  const indexByName = Object.fromEntries(header.map((name, index) => [name, index]));
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sourceId = parseNumber(row[indexByName.source_id]);
    const canId = parseNumber(row[indexByName.can_id], -1);
    if (sourceId <= 0) {
      errors.push(`第 ${i + 1} 行来源 ID 无效`);
      continue;
    }
    if (canId < 0) {
      errors.push(`第 ${i + 1} 行 CAN ID 无效`);
      continue;
    }
    sources.push({
      source_id: sourceId,
      type_char:
        row[indexByName.type_char]?.slice(0, 1).toUpperCase() || typeChars[sourceId] || 'X',
      can_id: canId,
      frame_type: parseNumber(row[indexByName.frame_type]),
      code_byte: Math.max(0, Math.min(7, parseNumber(row[indexByName.code_byte], 2))),
      clear_code: clampByte(parseNumber(row[indexByName.clear_code])),
      invalid_codes: parseCodeList(row[indexByName.invalid_codes]),
    });
  }
  return { sources, errors };
}

export function faultCodesToCsv(codes: FaultCodeItem[], language: LanguageDocument): string {
  const languageHeaders = language.list_code_language.map((code) => `text_${code}`);
  const header = [
    'enabled',
    'source_id',
    'type_char',
    'code',
    'severity',
    'message_key',
    'name',
    ...languageHeaders,
  ];
  const rows = codes.map((item) => {
    const key = item.message_key || item.name_key || messageKeyFor(item);
    return [
      (item.enabled ?? true) ? '1' : '0',
      String(item.source_id ?? ''),
      item.type_char ?? typeChars[item.source_id ?? 0] ?? '',
      String(item.code),
      item.severity ?? 'fault',
      key,
      escapeCsvField(item.name ?? ''),
      ...language.list_code_language.map((code) =>
        escapeCsvField(languageText(language, key, code)),
      ),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export function csvToFaultCodes(
  text: string,
  language: LanguageDocument,
): {
  codes: FaultCodeItem[];
  language: LanguageDocument;
  errors: string[];
} {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const codes: FaultCodeItem[] = [];
  let nextLanguage = language;
  const header = rows[0];
  if (header?.[0] !== 'enabled') {
    return { codes: [], language, errors: ['CSV 首列必须为 enabled'] };
  }

  const indexByName = Object.fromEntries(header.map((name, index) => [name, index]));
  const languageColumns = header
    .map((name, index) => ({ name, index }))
    .filter((item) => item.name.startsWith('text_'))
    .map((item) => ({ code: item.name.slice('text_'.length), index: item.index }))
    .filter((item) => language.list_code_language.includes(item.code));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = parseNumber(row[indexByName.code], -1);
    if (code < 0 || code > 255) {
      errors.push(`第 ${i + 1} 行故障码无效`);
      continue;
    }
    const sourceId = parseNumber(row[indexByName.source_id]);
    const item: FaultCodeItem = {
      enabled: parseBoolean(row[indexByName.enabled]),
      source_id: sourceId || undefined,
      type_char:
        row[indexByName.type_char]?.slice(0, 1).toUpperCase() || typeChars[sourceId] || 'X',
      code,
      severity: row[indexByName.severity] || 'fault',
      message_key: row[indexByName.message_key] || undefined,
      name: row[indexByName.name] || undefined,
    };
    if (!item.message_key) {
      item.message_key = messageKeyFor(item);
    }

    const values = Object.fromEntries(
      languageColumns.map((column) => [column.code, row[column.index] ?? '']),
    );
    nextLanguage = ensureLanguageEntry(nextLanguage, item.message_key, values);
    codes.push(item);
  }

  return { codes, language: nextLanguage, errors };
}

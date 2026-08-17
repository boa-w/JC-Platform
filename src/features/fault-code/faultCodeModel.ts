import type { FaultCodeSource } from '../../types/platform';

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

export function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function hexOrDecimal(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
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

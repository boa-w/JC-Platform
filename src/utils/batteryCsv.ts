import type {
  BatteryMonitorFrame,
  BatteryMonitorItem,
  BatteryMonitorSignal,
} from '../types/platform';

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
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
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
  return fields;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

function numberValue(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: string | undefined, fallback: number) {
  return Math.trunc(numberValue(value, fallback));
}

function parseUnsigned(value: string | undefined, fallback: number) {
  const text = (value ?? '').trim();
  if (/^0x[0-9a-f]+$/i.test(text)) {
    const parsed = Number.parseInt(text.slice(2), 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return integerValue(text, fallback);
}

export function framesToCsv(frames: BatteryMonitorFrame[]): string {
  const header = 'frame_key,can_id,frame_type,dlc,desc,timeout_ticks';
  const rows = frames.map((frame) =>
    [
      frame.frame_key,
      `0x${frame.can_id.toString(16).toUpperCase().padStart(3, '0')}`,
      String(frame.frame_type),
      String(frame.dlc),
      escapeCsvField(frame.desc ?? ''),
      String(frame.timeout_ticks),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToFrames(text: string): { frames: BatteryMonitorFrame[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const frames: BatteryMonitorFrame[] = [];
  const header = rows[0];
  if (header?.[0] !== 'frame_key') {
    return { frames, errors: ['CSV 首列必须为 frame_key'] };
  }
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.length < 6) {
      errors.push(`第 ${index + 1} 行列数不足`);
      continue;
    }
    const canId = parseUnsigned(row[1], -1);
    if (canId < 0) {
      errors.push(`第 ${index + 1} 行帧 ID 无效：${row[1]}`);
      continue;
    }
    frames.push({
      frame_key: row[0],
      can_id: canId,
      frame_type: integerValue(row[2], 0),
      dlc: Math.max(1, Math.min(8, integerValue(row[3], 8))),
      desc: row[4] ?? '',
      timeout_ticks: Math.max(0, integerValue(row[5], 200)),
    });
  }
  return { frames, errors };
}

export function signalsToCsv(signals: BatteryMonitorSignal[]): string {
  const header =
    'signal_key,name,inner,frame_key,pos,len,byte_order,raw_offset,raw_type,value_type,parse_resolution,parse_offset,parse_mask,parse_shift,receiver,comment';
  const rows = signals.map((signal) =>
    [
      signal.signal_key,
      escapeCsvField(signal.name),
      String(signal.inner),
      signal.frame_key,
      String(signal.pos),
      String(signal.len),
      signal.byte_order,
      String(signal.raw_offset),
      signal.raw_type,
      signal.value_type,
      String(signal.parse_resolution),
      String(signal.parse_offset),
      `0x${signal.parse_mask.toString(16).toUpperCase()}`,
      String(signal.parse_shift),
      escapeCsvField(signal.receiver ?? ''),
      escapeCsvField(signal.comment ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToSignals(text: string): { signals: BatteryMonitorSignal[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const signals: BatteryMonitorSignal[] = [];
  const header = rows[0];
  if (header?.[0] !== 'signal_key') {
    return { signals, errors: ['CSV 首列必须为 signal_key'] };
  }
  if (header[1] === 'param_id') {
    return { signals, errors: ['Battery V2 信号 CSV 不支持 param_id，请使用 signal_key,name 列'] };
  }
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.length < 16) {
      errors.push(`第 ${index + 1} 行列数不足`);
      continue;
    }
    signals.push({
      signal_key: row[0],
      name: row[1] ?? '',
      inner: integerValue(row[2], -1),
      frame_key: row[3] ?? '',
      pos: Math.max(0, integerValue(row[4], 0)),
      len: Math.max(1, integerValue(row[5], 8)),
      byte_order: (row[6] === 'big_endian' ? 'big_endian' : 'little_endian'),
      raw_offset: Math.max(0, integerValue(row[7], 0)),
      raw_type: (row[8] || 'u8') as BatteryMonitorSignal['raw_type'],
      value_type: (row[9] || 'u8') as BatteryMonitorSignal['value_type'],
      parse_resolution: numberValue(row[10], 1),
      parse_offset: numberValue(row[11], 0),
      parse_mask: parseUnsigned(row[12], 0xffffffff),
      parse_shift: Math.max(0, integerValue(row[13], 0)),
      receiver: row[14] ?? '',
      comment: row[15] ?? '',
    });
  }
  return { signals, errors };
}

export function itemsToCsv(items: BatteryMonitorItem[]): string {
  const header =
    'item_key,enabled,order,signal_key,name_key,fallback_name,unit,formatter_kind,formatter_offset,scale_num,scale_den,decimals,display_base,validity_mode,validity_frame_key,validity_empty_text,timeout_ticks';
  const rows = items.map((item) =>
    [
      item.item_key,
      item.enabled ? '1' : '0',
      String(item.order),
      item.signal_key,
      item.name_key,
      escapeCsvField(item.fallback_name ?? ''),
      escapeCsvField(item.unit ?? ''),
      item.formatter?.kind ?? 'linear',
      String(item.formatter?.offset ?? 0),
      String(item.formatter?.scale_num ?? 1),
      String(item.formatter?.scale_den ?? 1),
      String(item.formatter?.decimals ?? 0),
      String(item.formatter?.display_base ?? 10),
      item.validity?.mode ?? 'frame_timeout',
      item.validity?.frame_key ?? '',
      escapeCsvField(item.validity?.empty_text ?? ''),
      item.validity?.timeout_ticks === undefined ? '' : String(item.validity.timeout_ticks),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToItems(text: string): { items: BatteryMonitorItem[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const items: BatteryMonitorItem[] = [];
  const header = rows[0];
  if (header?.[0] !== 'item_key') {
    return { items, errors: ['CSV 首列必须为 item_key'] };
  }
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.length < 16) {
      errors.push(`第 ${index + 1} 行列数不足`);
      continue;
    }
    const timeout = row[16]?.trim();
    items.push({
      item_key: row[0],
      enabled: row[1] === '1',
      order: Math.max(0, integerValue(row[2], 0)),
      signal_key: row[3] ?? '',
      name_key: row[4] ?? '',
      fallback_name: row[5] ?? '',
      unit: row[6] ?? '',
      formatter: {
        kind: row[7] || 'linear',
        offset: numberValue(row[8], 0),
        scale_num: numberValue(row[9], 1),
        scale_den: numberValue(row[10], 1),
        decimals: Math.max(0, integerValue(row[11], 0)),
        display_base: Math.max(2, integerValue(row[12], 10)),
        true_text: '',
        false_text: '',
      },
      validity: {
        mode: row[13] || 'frame_timeout',
        frame_key: row[14] ?? '',
        empty_text: row[15] ?? '',
        ...(timeout ? { timeout_ticks: Math.max(0, integerValue(timeout, 200)) } : {}),
      },
    });
  }
  return { items, errors };
}

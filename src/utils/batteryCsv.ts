import type { BatteryMonitorFrame, BatteryMonitorSignal, BatteryMonitorItem } from '../types/platform';

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
  return fields;
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map(parseCsvLine);
}

export function framesToCsv(frames: BatteryMonitorFrame[]): string {
  const header = 'frame_key,can_id,type,desc,timeout_ticks';
  const rows = frames.map((f) =>
    [f.frame_key, `0x${f.can_id.toString(16).toUpperCase().padStart(3, '0')}`, String(f.type), escapeCsvField(f.desc ?? ''), String(f.timeout_ticks ?? '')].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToFrames(text: string): { frames: BatteryMonitorFrame[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const frames: BatteryMonitorFrame[] = [];
  const header = rows[0];
  if (!header || header.length === 0 || header[0] !== 'frame_key') {
    return { frames: [], errors: ['CSV 首列必须为 frame_key'] };
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) {
      errors.push(`第 ${i + 1} 行列数不足`);
      continue;
    }
    const canId = parseInt(row[1], 16);
    if (isNaN(canId)) {
      errors.push(`第 ${i + 1} 行帧 ID 无效：${row[1]}`);
      continue;
    }
    frames.push({
      frame_key: row[0],
      can_id: canId,
      type: Number(row[2]) || 0,
      desc: row[3] ?? '',
      timeout_ticks: Number(row[4]) || 200,
    });
  }
  return { frames, errors };
}

export function signalsToCsv(signals: BatteryMonitorSignal[]): string {
  const header = 'signal_key,param_id,name,inner,type,def,frame_key,pos,len,show_type,handle,handle_param,factor,offset,min,max,unit,receiver,comment';
  const rows = signals.map((s) =>
    [
      s.signal_key, s.param_id, escapeCsvField(s.name), String(s.inner), String(s.type),
      s.def ?? '0', s.frame_key, String(s.pos), String(s.len), String(s.show_type),
      String(s.handle ?? 0), escapeCsvField(s.handle_param ?? ''),
      String(s.factor ?? 1), String(s.offset ?? 0), String(s.min ?? 0), String(s.max ?? 0),
      escapeCsvField(s.unit ?? ''), escapeCsvField(s.receiver ?? 'dbc_export'),
      escapeCsvField(s.comment ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToSignals(text: string): { signals: BatteryMonitorSignal[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const signals: BatteryMonitorSignal[] = [];
  const header = rows[0];
  if (!header || header.length === 0 || header[0] !== 'signal_key') {
    return { signals: [], errors: ['CSV 首列必须为 signal_key'] };
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10) {
      errors.push(`第 ${i + 1} 行列数不足`);
      continue;
    }
    signals.push({
      signal_key: row[0],
      param_id: row[1],
      name: row[2],
      inner: Number(row[3]) || -1,
      type: Number(row[4]) || 0,
      def: row[5] ?? '0',
      frame_key: row[6] ?? '',
      pos: Number(row[7]) || 0,
      len: Number(row[8]) || 8,
      show_type: Number(row[9]) || 0,
      handle: row[10] ? Number(row[10]) : 0,
      handle_param: row[11] ?? '',
      factor: row[12] ? Number(row[12]) : 1,
      offset: row[13] ? Number(row[13]) : 0,
      min: row[14] ? Number(row[14]) : 0,
      max: row[15] ? Number(row[15]) : 0,
      unit: row[16] ?? '',
      receiver: row[17] ?? 'dbc_export',
      comment: row[18] ?? '',
    });
  }
  return { signals, errors };
}

export function itemsToCsv(items: BatteryMonitorItem[]): string {
  const header = 'item_key,enabled,order,signal_key,name_key,unit,formatter_kind,offset,scale_num,scale_den,decimals,validity_mode,validity_frame_key,validity_empty_text';
  const rows = items.map((item) =>
    [
      item.item_key, item.enabled ? '1' : '0', String(item.order), item.signal_key,
      item.name_key, escapeCsvField(item.unit ?? ''),
      item.formatter?.kind ?? 'linear', String(item.formatter?.offset ?? 0),
      String(item.formatter?.scale_num ?? 1), String(item.formatter?.scale_den ?? 1),
      String(item.formatter?.decimals ?? 0),
      item.validity?.mode ?? 'frame_timeout', item.validity?.frame_key ?? '',
      escapeCsvField(item.validity?.empty_text ?? ' '),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvToItems(text: string): { items: BatteryMonitorItem[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const items: BatteryMonitorItem[] = [];
  const header = rows[0];
  if (!header || header.length === 0 || header[0] !== 'item_key') {
    return { items: [], errors: ['CSV 首列必须为 item_key'] };
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10) {
      errors.push(`第 ${i + 1} 行列数不足`);
      continue;
    }
    items.push({
      item_key: row[0],
      enabled: row[1] === '1',
      order: Number(row[2]) || 0,
      signal_key: row[3] ?? '',
      name_key: row[4] ?? '',
      unit: row[5] ?? '',
      formatter: {
        kind: row[6] as BatteryMonitorItem['formatter']['kind'],
        offset: Number(row[7]) || 0,
        scale_num: Number(row[8]) || 1,
        scale_den: Number(row[9]) || 1,
        decimals: Number(row[10]) || 0,
      },
      validity: {
        mode: (row[11] ?? 'frame_timeout') as BatteryMonitorItem['validity']['mode'],
        frame_key: row[12] ?? '',
        empty_text: row[13] ?? ' ',
      },
    });
  }
  return { items, errors };
}

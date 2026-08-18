import type { PdoAdvancedSignal, PdoSimpleSignalDocument } from '../../types/platform';

export type PdoReadMode = 0 | 1 | 2;

export interface PdoSignalLayout {
  mode: PdoReadMode;
  positionUnit: 'byte' | 'bit';
  position: number;
  bit: number | null;
  lengthUnit: 'bytes' | 'bits';
  length: number;
}

export interface NormalizedPdoSignalFields {
  show_type: PdoReadMode;
  pos: number;
  len: number;
}

/**
 * 将协议文件中的取数方式限制到当前二进制 ABI 支持的三个值。
 */
export function normalizePdoReadMode(value: number): PdoReadMode {
  if (value === 1) return 1;
  if (value === 2) return 2;
  return 0;
}

/**
 * 将用户输入的起始位和长度规整到一个 CAN 数据帧的 64 bit 范围内。
 * 字节模式必须按完整字节对齐；其它模式保留 bit 精度。
 */
export function normalizePdoSignalFields(
  showType: number,
  pos: number,
  len: number,
): NormalizedPdoSignalFields {
  const mode = normalizePdoReadMode(showType);
  let normalizedPos = clampInteger(pos, 0, 63);
  let normalizedLen = Math.max(1, Math.floor(finiteOr(len, 1)));

  if (mode === 0) {
    normalizedPos = Math.floor(normalizedPos / 8) * 8;
    const maxBytes = Math.max(1, Math.floor((64 - normalizedPos) / 8));
    normalizedLen = clampInteger(Math.ceil(normalizedLen / 8), 1, maxBytes) * 8;
  } else {
    normalizedLen = clampInteger(normalizedLen, 1, 64 - normalizedPos);
  }

  return { show_type: mode, pos: normalizedPos, len: normalizedLen };
}

/**
 * 将内部 bit 偏移转换为面向用户的 byte/bit 位置和 bytes/bits 长度。
 */
export function pdoSignalLayout(
  signal: Pick<PdoAdvancedSignal | PdoSimpleSignalDocument, 'show_type' | 'pos' | 'len'>,
): PdoSignalLayout {
  const fields = normalizePdoSignalFields(signal.show_type, signal.pos, signal.len);
  if (fields.show_type === 0) {
    return {
      mode: 0,
      positionUnit: 'byte',
      position: fields.pos / 8,
      bit: null,
      lengthUnit: 'bytes',
      length: fields.len / 8,
    };
  }

  if (fields.show_type === 1) {
    return {
      mode: 1,
      positionUnit: 'byte',
      position: Math.floor(fields.pos / 8),
      bit: fields.pos % 8,
      lengthUnit: 'bits',
      length: fields.len,
    };
  }

  return {
    mode: 2,
    positionUnit: 'bit',
    position: fields.pos,
    bit: null,
    lengthUnit: 'bits',
    length: fields.len,
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(finiteOr(value, min))));
}

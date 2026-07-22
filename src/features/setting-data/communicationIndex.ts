import type { CommunicationIndexRadix } from './types';

export function formatCommunicationIndex(
  value: number | undefined,
  radix: CommunicationIndexRadix,
  hexWidth = 0,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const normalized = Math.max(0, Math.trunc(value));
  if (radix === 'decimal') return String(normalized);
  return `0x${normalized.toString(16).toUpperCase().padStart(hexWidth, '0')}`;
}

export function parseCommunicationIndex(value: string, radix: CommunicationIndexRadix) {
  const normalized = value.trim();
  const pattern = radix === 'hexadecimal' ? /^(?:0x)?[0-9a-f]+$/i : /^\d+$/;
  if (!pattern.test(normalized)) return null;
  const digits = radix === 'hexadecimal' ? normalized.replace(/^0x/i, '') : normalized;
  const parsed = Number.parseInt(digits, radix === 'hexadecimal' ? 16 : 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

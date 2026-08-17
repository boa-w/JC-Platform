export type NodeIdDisplayBase = 'decimal' | 'hexadecimal';

const MIN_NODE_ID = 1;
const MAX_NODE_ID = 127;

export function formatNodeId(value: number | undefined, base: NodeIdDisplayBase): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  const normalized = Math.trunc(value);
  return base === 'hexadecimal'
    ? `0x${normalized.toString(16).toUpperCase().padStart(2, '0')}`
    : String(normalized);
}

export function parseNodeId(value: unknown, base: NodeIdDisplayBase): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= MIN_NODE_ID && value <= MAX_NODE_ID
      ? value
      : undefined;
  }
  if (typeof value !== 'string') return undefined;

  const text = value.trim();
  if (!text) return undefined;
  const explicitHex = /^0x[0-9a-f]+$/i.test(text);
  const valid = explicitHex
    ? true
    : base === 'hexadecimal'
      ? /^[0-9a-f]+$/i.test(text)
      : /^\d+$/.test(text);
  if (!valid) return undefined;

  const parsed = explicitHex
    ? Number.parseInt(text.slice(2), 16)
    : Number.parseInt(text, base === 'hexadecimal' ? 16 : 10);
  return Number.isInteger(parsed) && parsed >= MIN_NODE_ID && parsed <= MAX_NODE_ID
    ? parsed
    : undefined;
}

export function formatNodeIds(value: number[], base: NodeIdDisplayBase): string {
  return value.map((nodeId) => formatNodeId(nodeId, base)).join(', ');
}

export function parseNodeIds(value: string, base: NodeIdDisplayBase): number[] {
  return [
    ...new Set(
      value
        .split(/[,，\s]+/)
        .map((item) => parseNodeId(item, base))
        .filter((nodeId): nodeId is number => nodeId !== undefined),
    ),
  ];
}

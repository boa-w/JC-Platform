export type JcproVersion = 'jc001' | 'jc002' | 'unknown';

export function getJcproVersion(document: unknown): JcproVersion {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return 'unknown';
  const version = (document as Record<string, unknown>).config_version;
  return version === 'jc001' || version === 'jc002' ? version : 'unknown';
}

export function getJcproVersionValue(document: unknown) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const version = (document as Record<string, unknown>).config_version;
  return typeof version === 'string' && version.trim() !== '' ? version : null;
}

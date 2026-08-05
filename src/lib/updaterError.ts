export function normalizeUpdaterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('plugin updater not found') ||
    normalized.includes('updater not found') ||
    message.includes('REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY') ||
    normalized.includes('invalid public key')
  ) {
    return 'updater.errors.invalidSignature';
  }
  if (
    normalized.includes('404') ||
    normalized.includes('status code 404') ||
    normalized.includes('release not found')
  ) {
    return 'updater.errors.noRelease';
  }
  if (
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('failed to connect') ||
    normalized.includes('network')
  ) {
    return 'updater.errors.network';
  }
  return message || 'updater.errors.checkFailed';
}

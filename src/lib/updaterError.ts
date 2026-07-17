export function normalizeUpdaterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('plugin updater not found') ||
    normalized.includes('updater not found') ||
    message.includes('REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY') ||
    normalized.includes('invalid public key')
  ) {
    return '更新签名配置无效，请联系软件维护人员。';
  }
  if (
    normalized.includes('404') ||
    normalized.includes('status code 404') ||
    normalized.includes('release not found')
  ) {
    return '当前更新通道尚未发布可用版本。';
  }
  if (
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('failed to connect') ||
    normalized.includes('network')
  ) {
    return '无法连接更新服务，请检查网络后重试。';
  }
  return message || '检查更新失败';
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranslationCredentialStorage } from '../src/stores/translationCredentialMigration.ts';
import {
  clearLegacyTranslationSettings,
  readLegacyTranslationSettings,
} from '../src/stores/translationCredentialMigration.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: TranslationCredentialStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  return { storage, values };
}

test('reads and removes the current plaintext translation credentials', () => {
  const { storage, values } = memoryStorage({
    'jc-platform.translation-settings': JSON.stringify({
      baiduAppId: 'legacy-app',
      baiduAppKey: 'legacy-secret',
    }),
  });

  assert.deepEqual(readLegacyTranslationSettings(storage), {
    baiduAppId: 'legacy-app',
    baiduAppKey: 'legacy-secret',
  });
  clearLegacyTranslationSettings(storage);
  assert.equal(values.has('jc-platform.translation-settings'), false);
});

test('scrubs credentials while preserving legacy translation preferences', () => {
  const { storage, values } = memoryStorage({
    'jc.language.baiduTranslateConfig': JSON.stringify({
      appId: 'legacy-app',
      appKey: 'legacy-secret',
      scope: 'empty',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
    }),
  });

  assert.equal(readLegacyTranslationSettings(storage)?.baiduAppKey, 'legacy-secret');
  clearLegacyTranslationSettings(storage);
  const remaining = JSON.parse(values.get('jc.language.baiduTranslateConfig') ?? '{}');
  assert.deepEqual(remaining, {
    scope: 'empty',
    sourceLanguage: 'zh',
    targetLanguage: 'en',
  });
  assert.equal(JSON.stringify(remaining).includes('legacy-secret'), false);
});

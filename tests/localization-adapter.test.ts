import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localizationToLanguageDocument,
  updateLocalizationFromLanguageDocument,
} from '../src/components/language/localizationAdapter.ts';
import { buildLanguageIndex } from '../src/components/language/useLanguageIndex.ts';
import type { LocalizationDocument } from '../src/types/platform.ts';

function localization(): LocalizationDocument {
  return {
    default_locale: 'zh',
    locale_order: ['zh', 'en'],
    locales: {
      zh: {
        enabled: true,
        direction: 'ltr',
        translations: {
          'menu.root': '菜单',
          'fault.count': { one: '%d 个故障', other: '%d 个故障' },
        },
      },
      en: {
        enabled: true,
        direction: 'ltr',
        translations: {
          'menu.root': 'Menu',
          'fault.count': { one: '%d fault', other: '%d faults' },
        },
      },
    },
  };
}

test('adapts jc002 localization without v1 placeholder rows', () => {
  const view = localizationToLanguageDocument(localization());

  assert.deepEqual(view.list_code_language, ['zh', 'en']);
  assert.deepEqual(view.list_inner, ['menu.root', 'fault.count']);
  assert.equal(view.editor_locked_key_count, 0);
  assert.deepEqual(view.list_translate['fault.count'], {
    zh: '%d 个故障',
    en: '%d faults',
  });
  assert.equal(buildLanguageIndex(view).translationKeys.length, 2);
});

test('writes language edits back to jc002 and preserves plural forms', () => {
  const source = localization();
  const previous = localizationToLanguageDocument(source);
  const next = {
    ...previous,
    list_code_language: ['zh-CN', 'en'],
    list_inner: ['menu.home', 'fault.count'],
    list_translate: {
      'menu.home': { 'zh-CN': '首页', en: 'Home' },
      'fault.count': { 'zh-CN': '%d 项故障', en: '%d total faults' },
    },
  };

  const updated = updateLocalizationFromLanguageDocument(source, previous, next);

  assert.equal(updated.default_locale, 'zh-CN');
  assert.deepEqual(updated.locale_order, ['zh-CN', 'en']);
  assert.equal(updated.locales.zh, undefined);
  assert.equal(updated.locales['zh-CN'].translations['menu.home'], '首页');
  assert.deepEqual(updated.locales.en.translations['fault.count'], {
    one: '%d fault',
    other: '%d total faults',
  });
  assert.equal(updated.locales.en.translations['menu.root'], undefined);
});

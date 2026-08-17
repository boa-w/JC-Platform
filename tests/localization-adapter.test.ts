import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localizationForScope,
  localizationToLanguageDocument,
  updateLocalizationFromLanguageDocument,
  updateLocalizationScopeFromLanguageDocument,
  updateLocalizationScopeText,
} from '../src/components/language/localizationAdapter.ts';
import { buildLanguageIndex } from '../src/components/language/useLanguageIndex.ts';
import type { LocalizationDocument, ProtocolProfilesDocument } from '../src/types/platform.ts';

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

test('merges common catalog and Profile overlay while keeping common keys locked', () => {
  const source = localization();
  const profiles = {
    schema_version: 2,
    active_controller_profile_id: 'acm',
    controller_profiles: [
      {
        profile_id: 'acm',
        controller_family: 'ACM',
        controller_revision: '1.x',
        localization_overlay: {
          locales: {
            zh: {
              translations: {
                'menu.root': 'ACM 菜单',
                'controller.acm.only': 'ACM 专属',
              },
            },
            en: {
              translations: {
                'menu.root': 'ACM menu',
                'controller.acm.only': 'ACM only',
              },
            },
          },
        },
        protocol: {
          pdo_global_param: [],
          pdo_condition: [],
          pdo_recv: [],
          pdo_send: [],
          sdo_info: { type: 0, children: [] },
        },
      },
    ],
    battery_profiles: [],
    fault_code_profiles: [],
  } as unknown as ProtocolProfilesDocument;

  const effective = localizationForScope(source, profiles, {
    kind: 'controller',
    profileId: 'acm',
  });
  assert.equal(effective.locales.zh.translations['menu.root'], 'ACM 菜单');
  assert.equal(effective.locales.en.translations['controller.acm.only'], 'ACM only');

  const commonView = localizationToLanguageDocument(source);
  const profileView = localizationToLanguageDocument(effective, {
    keyOrder: commonView.list_inner,
    protectedKeys: commonView.list_inner,
  });
  assert.equal(profileView.editor_locked_key_count, 0);
  assert.deepEqual(profileView.editor_protected_keys, ['menu.root', 'fault.count']);
  assert.deepEqual(profileView.list_inner, ['menu.root', 'fault.count', 'controller.acm.only']);

  const next = {
    ...profileView,
    list_translate: {
      ...profileView.list_translate,
      'menu.root': { zh: 'ACM 菜单改', en: 'ACM menu' },
      'controller.acm.only': { zh: '专属改', en: 'ACM only' },
    },
  };
  const updated = updateLocalizationScopeFromLanguageDocument(
    source,
    profiles,
    { kind: 'controller', profileId: 'acm' },
    profileView,
    next,
  );

  assert.equal(updated.localization.locales.zh.translations['menu.root'], '菜单');
  assert.equal(
    updated.protocolProfiles?.controller_profiles[0].localization_overlay?.locales.zh.translations[
      'menu.root'
    ],
    'ACM 菜单改',
  );
  assert.equal(
    updated.protocolProfiles?.controller_profiles[0].localization_overlay?.locales.zh.translations[
      'controller.acm.only'
    ],
    '专属改',
  );
});

test('writes fault-code message edits to the selected fault Profile overlay', () => {
  const source = localization();
  const profiles = {
    schema_version: 2,
    active_controller_profile_id: 'controller.default',
    active_fault_code_profile_id: 'fault.inmotion',
    controller_profiles: [],
    battery_profiles: [],
    fault_code_profiles: [
      {
        profile_id: 'fault.inmotion',
        fault_family: 'Inmotion',
        fault_revision: '6.x',
        protocol: {
          fault_code_info: {
            schema_version: 2,
            enabled: true,
            version: 2,
            sources: [],
            definitions: [],
            bindings: [],
          },
        },
      },
    ],
  } satisfies ProtocolProfilesDocument;

  const updated = updateLocalizationScopeText(
    source,
    profiles,
    { kind: 'fault', profileId: 'fault.inmotion' },
    'zh',
    'fault.count',
    'Inmotion 故障数',
  );
  assert.equal(updated.localization.locales.zh.translations['fault.count'].other, '%d 个故障');
  assert.equal(
    updated.protocolProfiles?.fault_code_profiles[0].localization_overlay?.locales.zh.translations[
      'fault.count'
    ],
    'Inmotion 故障数',
  );
});

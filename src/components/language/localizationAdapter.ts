import type {
  BatteryProtocolProfile,
  ControllerProtocolProfile,
  FaultCodeProfile,
  LanguageDocument,
  LocalizationDocument,
  LocalizationMessage,
  LocalizationOverlayDocument,
  LocalizationOverlayLocale,
  ProtocolProfilesDocument,
} from '../../types/platform';

export type LocalizationScope =
  | { kind: 'common' }
  | { kind: 'controller'; profileId: string }
  | { kind: 'battery'; profileId: string }
  | { kind: 'fault'; profileId: string };

export interface LocalizationScopeOption {
  id: string;
  scope: LocalizationScope;
  label: string;
  description: string;
  overlayKeyCount: number;
}

export interface LocalizationScopeUpdate {
  localization: LocalizationDocument;
  protocolProfiles?: ProtocolProfilesDocument;
}

export const LOCALE_NAME_KEY_PREFIX = 'language.name.';

/** Return the reserved, deterministic message key for one locale's display name. */
export function localeNameKey(locale: string): string {
  return `${LOCALE_NAME_KEY_PREFIX}${locale}`;
}

/** Return whether a key belongs to the v2 language-name namespace. */
export function isLocaleNameKey(key: string): boolean {
  return key.startsWith(LOCALE_NAME_KEY_PREFIX);
}

/** Resolve a language document label through the same v2 message catalog as other text. */
export function getLanguageDocumentLabel(document: LanguageDocument, code: string): string {
  const nameKey = document.language_name_keys?.[code];
  const displayLocale = document.default_locale ?? document.list_code_language[0];
  if (nameKey && displayLocale) {
    const values = document.list_translate[nameKey] as Record<string, string> | undefined;
    const text = values?.[displayLocale]?.trim();
    if (text) return text;
  }
  if (document.language_name_keys) return code;
  return document.language_labels?.[code] ?? code;
}

function messageText(value: LocalizationMessage | undefined): string {
  if (typeof value === 'string') return value;
  return value?.other ?? '';
}

function updatedMessage(original: LocalizationMessage | undefined, text: string) {
  return original && typeof original === 'object' ? { ...original, other: text } : text;
}

function localizationKeys(localization: LocalizationDocument): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const locale of localization.locale_order) {
    for (const key of Object.keys(localization.locales[locale]?.translations ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

function overlayKeyCount(overlay: LocalizationOverlayDocument | undefined): number {
  const keys = new Set<string>();
  for (const locale of Object.values(overlay?.locales ?? {})) {
    for (const key of Object.keys(locale.translations ?? {})) keys.add(key);
  }
  return keys.size;
}

function profileOverlay(
  profile: ControllerProtocolProfile | BatteryProtocolProfile | FaultCodeProfile | undefined,
): LocalizationOverlayDocument | undefined {
  return profile?.localization_overlay;
}

function profileForScope(
  profiles: ProtocolProfilesDocument | undefined,
  scope: LocalizationScope,
): ControllerProtocolProfile | BatteryProtocolProfile | FaultCodeProfile | undefined {
  if (!profiles || scope.kind === 'common') return undefined;
  const collection =
    scope.kind === 'controller'
      ? profiles.controller_profiles
      : scope.kind === 'battery'
        ? profiles.battery_profiles
        : profiles.fault_code_profiles;
  return collection.find((profile) => profile.profile_id === scope.profileId);
}

/** Apply one partial Profile catalog without changing the public locale directory. */
export function applyLocalizationOverlay(
  localization: LocalizationDocument,
  overlay: LocalizationOverlayDocument | undefined,
): LocalizationDocument {
  if (!overlay) return localization;
  const locales = { ...localization.locales };
  for (const locale of localization.locale_order) {
    const sourceLocale = localization.locales[locale];
    const overlayLocale = overlay.locales[locale];
    if (!overlayLocale) continue;
    const overlayTranslations = Object.fromEntries(
      Object.entries(overlayLocale.translations ?? {}).filter(
        ([key]) => !isLocaleNameKey(key),
      ),
    );
    locales[locale] = {
      ...(sourceLocale ?? { translations: {} }),
      translations: {
        ...(sourceLocale?.translations ?? {}),
        ...overlayTranslations,
      },
    };
  }
  return { ...localization, locales };
}

/** Return the effective catalog for the selected common/controller/battery/fault scope. */
export function localizationForScope(
  localization: LocalizationDocument,
  profiles: ProtocolProfilesDocument | undefined,
  scope: LocalizationScope,
): LocalizationDocument {
  if (scope.kind === 'common') return localization;
  const profile = profileForScope(profiles, scope);
  return applyLocalizationOverlay(localization, profileOverlay(profile));
}

export function localizationScopeId(scope: LocalizationScope): string {
  return scope.kind === 'common' ? 'common' : `${scope.kind}:${scope.profileId}`;
}

export function localizationScopeOptions(
  profiles: ProtocolProfilesDocument | undefined,
  labels: {
    common: string;
    controller: (profile: ControllerProtocolProfile) => string;
    battery: (profile: BatteryProtocolProfile) => string;
    fault: (profile: FaultCodeProfile) => string;
    commonDescription: string;
    overlayDescription: (profileId: string) => string;
  },
): LocalizationScopeOption[] {
  const options: LocalizationScopeOption[] = [
    {
      id: 'common',
      scope: { kind: 'common' },
      label: labels.common,
      description: labels.commonDescription,
      overlayKeyCount: 0,
    },
  ];
  for (const profile of profiles?.controller_profiles ?? []) {
    options.push({
      id: localizationScopeId({ kind: 'controller', profileId: profile.profile_id }),
      scope: { kind: 'controller', profileId: profile.profile_id },
      label: labels.controller(profile),
      description: labels.overlayDescription(profile.profile_id),
      overlayKeyCount: overlayKeyCount(profile.localization_overlay),
    });
  }
  for (const profile of profiles?.battery_profiles ?? []) {
    options.push({
      id: localizationScopeId({ kind: 'battery', profileId: profile.profile_id }),
      scope: { kind: 'battery', profileId: profile.profile_id },
      label: labels.battery(profile),
      description: labels.overlayDescription(profile.profile_id),
      overlayKeyCount: overlayKeyCount(profile.localization_overlay),
    });
  }
  for (const profile of profiles?.fault_code_profiles ?? []) {
    options.push({
      id: localizationScopeId({ kind: 'fault', profileId: profile.profile_id }),
      scope: { kind: 'fault', profileId: profile.profile_id },
      label: labels.fault(profile),
      description: labels.overlayDescription(profile.profile_id),
      overlayKeyCount: overlayKeyCount(profile.localization_overlay),
    });
  }
  return options;
}

export function localizationToLanguageDocument(
  localization: LocalizationDocument,
  options: { keyOrder?: string[]; lockedKeys?: string[]; protectedKeys?: string[] } = {},
): LanguageDocument {
  const availableKeys = new Set(localizationKeys(localization));
  const languageNameKeys = Object.fromEntries(
    localization.locale_order.map((locale) => [locale, localeNameKey(locale)]),
  );
  const keys: string[] = [];
  const seen = new Set<string>();
  const append = (key: string) => {
    if (availableKeys.has(key) && !isLocaleNameKey(key) && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };
  for (const key of options.lockedKeys ?? []) append(key);
  for (const key of options.keyOrder ?? []) append(key);
  for (const key of localizationKeys(localization)) append(key);

  const lockedKeySet = new Set(options.lockedKeys ?? []);
  const orderedLockedKeys = keys.filter((key) => lockedKeySet.has(key));
  const orderedEditableKeys = keys.filter((key) => !lockedKeySet.has(key));
  const orderedKeys = [...orderedLockedKeys, ...orderedEditableKeys];
  const orderedMessageKeys = [
    ...Object.values(languageNameKeys).filter((key) => availableKeys.has(key)),
    ...orderedKeys,
  ];

  return {
    list_code_language: [...localization.locale_order],
    default_locale: localization.default_locale,
    language_name_keys: languageNameKeys,
    list_inner: orderedKeys,
    list_translate: Object.fromEntries(
      orderedMessageKeys.map((key) => [
        key,
        Object.fromEntries(
          localization.locale_order.map((locale) => [
            locale,
            messageText(localization.locales[locale]?.translations[key]),
          ]),
        ),
      ]),
    ),
    editor_locked_key_count: orderedLockedKeys.length,
    ...(options.protectedKeys ? { editor_protected_keys: [...options.protectedKeys] } : {}),
  };
}

function nextLanguageKeys(next: LanguageDocument): string[] {
  return [
    ...next.list_inner,
    ...Object.keys(next.list_translate).filter((key) => !next.list_inner.includes(key)),
  ].filter((key, index, keys) => keys.indexOf(key) === index);
}

function languageNameKeysForUpdate(previous: LanguageDocument, next: LanguageDocument): string[] {
  if (!previous.language_name_keys && !next.language_name_keys) return [];
  return next.list_code_language.map(localeNameKey);
}

export function updateLocalizationFromLanguageDocument(
  localization: LocalizationDocument,
  previous: LanguageDocument,
  next: LanguageDocument,
): LocalizationDocument {
  const previousCodes = previous.list_code_language;
  const previousKeys = previous.list_inner;
  const reservedNameKeys = languageNameKeysForUpdate(previous, next);
  const nextKeys = [
    ...nextLanguageKeys(next).filter(
      (key) => !isLocaleNameKey(key) || reservedNameKeys.includes(key),
    ),
    ...reservedNameKeys,
  ].filter((key, index, keys) => keys.indexOf(key) === index);
  const locales = Object.fromEntries(
    next.list_code_language.map((code, localeIndex) => {
      const sourceCode = localization.locales[code]
        ? code
        : previousCodes[localeIndex] && localization.locales[previousCodes[localeIndex]]
          ? previousCodes[localeIndex]
          : null;
      const sourceLocale = sourceCode ? localization.locales[sourceCode] : undefined;
      const translations = Object.fromEntries(
        nextKeys.map((key, keyIndex) => {
          let sourceKey =
            sourceLocale?.translations[key] !== undefined
              ? key
              : previousKeys[keyIndex] &&
                  sourceLocale?.translations[previousKeys[keyIndex]] !== undefined
                ? previousKeys[keyIndex]
                : key;
          if (
            isLocaleNameKey(key) &&
            sourceLocale?.translations[sourceKey] === undefined
          ) {
            const previousCode = previousCodes[localeIndex];
            if (previousCode) {
              const previousNameKey = localeNameKey(previousCode);
              if (sourceLocale?.translations[previousNameKey] !== undefined) {
                sourceKey = previousNameKey;
              }
            }
          }
          const row = next.list_translate[key] as Record<string, string> | undefined;
          const text =
            row?.[code] ??
            (isLocaleNameKey(key) ? messageText(sourceLocale?.translations[sourceKey]) : '');
          return [key, updatedMessage(sourceLocale?.translations[sourceKey], text)];
        }),
      );
      return [
        code,
        {
          ...(sourceLocale ?? {}),
          enabled: true,
          direction: sourceLocale?.direction ?? (code === 'ar' ? 'rtl' : 'ltr'),
          translations,
        },
      ];
    }),
  );
  const defaultIndex = previousCodes.indexOf(localization.default_locale);
  const defaultLocale =
    next.list_code_language[defaultIndex] ??
    (next.list_code_language.includes(localization.default_locale)
      ? localization.default_locale
      : (next.list_code_language[0] ?? ''));
  return {
    ...localization,
    default_locale: defaultLocale,
    locale_order: [...next.list_code_language],
    locales,
  };
}

function overlayLocale(
  overlay: LocalizationOverlayDocument,
  code: string,
): LocalizationOverlayLocale {
  return overlay.locales[code] ?? { translations: {} };
}

function remapOverlayLocales(
  overlay: LocalizationOverlayDocument | undefined,
  previousCodes: string[],
  nextCodes: string[],
): LocalizationOverlayDocument | undefined {
  if (!overlay) return undefined;
  const locales: Record<string, LocalizationOverlayLocale> = {};
  for (const [index, nextCode] of nextCodes.entries()) {
    const previousCode = previousCodes[index] ?? nextCode;
    const source = overlay.locales[nextCode] ?? overlay.locales[previousCode];
    if (source) locales[nextCode] = source;
  }
  return { ...overlay, locales };
}

function remapProfileOverlayLocales(
  profiles: ProtocolProfilesDocument,
  previousCodes: string[],
  nextCodes: string[],
): ProtocolProfilesDocument {
  return {
    ...profiles,
    controller_profiles: profiles.controller_profiles.map((profile) => ({
      ...profile,
      ...(profile.localization_overlay
        ? {
            localization_overlay: remapOverlayLocales(
              profile.localization_overlay,
              previousCodes,
              nextCodes,
            ),
          }
        : {}),
    })),
    battery_profiles: profiles.battery_profiles.map((profile) => ({
      ...profile,
      ...(profile.localization_overlay
        ? {
            localization_overlay: remapOverlayLocales(
              profile.localization_overlay,
              previousCodes,
              nextCodes,
            ),
          }
        : {}),
    })),
    fault_code_profiles: profiles.fault_code_profiles.map((profile) => ({
      ...profile,
      ...(profile.localization_overlay
        ? {
            localization_overlay: remapOverlayLocales(
              profile.localization_overlay,
              previousCodes,
              nextCodes,
            ),
          }
        : {}),
    })),
  };
}

function updateProfileOverlay(
  localization: LocalizationDocument,
  profile: ControllerProtocolProfile | BatteryProtocolProfile | FaultCodeProfile,
  next: LanguageDocument,
): LocalizationOverlayDocument {
  const commonKeys = new Set(localizationKeys(localization));
  const nextKeys = nextLanguageKeys(next).filter((key) => !isLocaleNameKey(key));
  const previousOverlay = profile.localization_overlay ?? { locales: {} };
  const locales: Record<string, LocalizationOverlayLocale> = {};

  for (const code of next.list_code_language) {
    const baseLocale = localization.locales[code];
    const previousLocale = overlayLocale(previousOverlay, code);
    const translations: Record<string, LocalizationMessage> = {};
    for (const key of nextKeys) {
      const row = next.list_translate[key] as Record<string, string> | undefined;
      const nextText = row?.[code] ?? '';
      const baseText = messageText(baseLocale?.translations[key]);
      const oldOverlayValue = previousLocale.translations[key];
      if (commonKeys.has(key)) {
        if (nextText !== baseText) {
          translations[key] = updatedMessage(
            oldOverlayValue ?? baseLocale?.translations[key],
            nextText,
          );
        }
      } else {
        translations[key] = updatedMessage(oldOverlayValue, nextText);
      }
    }
    if (Object.keys(translations).length > 0) {
      locales[code] = { translations };
    }
  }
  return { locales };
}

/** Write an editor change to either the public catalog or the selected Profile overlay. */
export function updateLocalizationScopeFromLanguageDocument(
  localization: LocalizationDocument,
  profiles: ProtocolProfilesDocument | undefined,
  scope: LocalizationScope,
  previous: LanguageDocument,
  next: LanguageDocument,
): LocalizationScopeUpdate {
  if (scope.kind === 'common' || !profiles) {
    const nextLocalization = updateLocalizationFromLanguageDocument(localization, previous, next);
    return {
      localization: nextLocalization,
      ...(profiles
        ? {
            protocolProfiles: remapProfileOverlayLocales(
              profiles,
              previous.list_code_language,
              next.list_code_language,
            ),
          }
        : {}),
    };
  }
  const collection =
    scope.kind === 'controller'
      ? profiles.controller_profiles
      : scope.kind === 'battery'
        ? profiles.battery_profiles
        : profiles.fault_code_profiles;
  const profile = collection.find((item) => item.profile_id === scope.profileId);
  if (!profile) {
    return {
      localization: updateLocalizationFromLanguageDocument(localization, previous, next),
      protocolProfiles: profiles,
    };
  }
  const nextOverlay = updateProfileOverlay(localization, profile, next);
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    controller_profiles:
      scope.kind === 'controller'
        ? profiles.controller_profiles.map((item) =>
            item.profile_id === scope.profileId
              ? { ...item, localization_overlay: nextOverlay }
              : item,
          )
        : profiles.controller_profiles,
    battery_profiles:
      scope.kind === 'battery'
        ? profiles.battery_profiles.map((item) =>
            item.profile_id === scope.profileId
              ? { ...item, localization_overlay: nextOverlay }
              : item,
          )
        : profiles.battery_profiles,
    fault_code_profiles:
      scope.kind === 'fault'
        ? profiles.fault_code_profiles.map((item) =>
            item.profile_id === scope.profileId
              ? { ...item, localization_overlay: nextOverlay }
              : item,
          )
        : profiles.fault_code_profiles,
  };
  return { localization, protocolProfiles: nextProfiles };
}

/** Update one message in the selected Profile overlay without flattening it into common i18n. */
export function updateLocalizationScopeText(
  localization: LocalizationDocument,
  profiles: ProtocolProfilesDocument | undefined,
  scope: LocalizationScope,
  locale: string,
  key: string,
  text: string,
): LocalizationScopeUpdate {
  if (scope.kind === 'common' || !profiles) {
    const sourceLocale = localization.locales[locale] ?? { translations: {} };
    return {
      localization: {
        ...localization,
        locales: {
          ...localization.locales,
          [locale]: {
            ...sourceLocale,
            translations: {
              ...sourceLocale.translations,
              [key]: updatedMessage(sourceLocale.translations[key], text),
            },
          },
        },
      },
    };
  }

  const profile = profileForScope(profiles, scope);
  if (!profile) return { localization, protocolProfiles: profiles };
  if (isLocaleNameKey(key)) return { localization, protocolProfiles: profiles };
  const baseText = messageText(localization.locales[locale]?.translations[key]);
  const previousOverlay = profile.localization_overlay ?? { locales: {} };
  const previousLocale = overlayLocale(previousOverlay, locale);
  const translations = { ...previousLocale.translations };
  if (text === baseText) delete translations[key];
  else translations[key] = updatedMessage(previousLocale.translations[key], text);
  const nextOverlay: LocalizationOverlayDocument = {
    ...previousOverlay,
    locales: {
      ...previousOverlay.locales,
      [locale]: { ...previousLocale, translations },
    },
  };
  const updateProfile = <
    T extends ControllerProtocolProfile | BatteryProtocolProfile | FaultCodeProfile,
  >(
    item: T,
  ): T =>
    item.profile_id === scope.profileId
      ? ({ ...item, localization_overlay: nextOverlay } as T)
      : item;
  return {
    localization,
    protocolProfiles: {
      ...profiles,
      controller_profiles: profiles.controller_profiles.map(updateProfile),
      battery_profiles: profiles.battery_profiles.map(updateProfile),
      fault_code_profiles: profiles.fault_code_profiles.map(updateProfile),
    },
  };
}

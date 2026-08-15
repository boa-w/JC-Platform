import type {
  LanguageDocument,
  LocalizationDocument,
  LocalizationMessage,
} from '../../types/platform';

const localeLabels: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
};

function messageText(value: LocalizationMessage | undefined) {
  if (typeof value === 'string') return value;
  return value?.other ?? '';
}

function updatedMessage(original: LocalizationMessage | undefined, text: string) {
  return original && typeof original === 'object' ? { ...original, other: text } : text;
}

export function localizationToLanguageDocument(
  localization: LocalizationDocument,
): LanguageDocument {
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
  return {
    list_code_language: [...localization.locale_order],
    language_labels: Object.fromEntries(
      localization.locale_order.map((locale) => [locale, localeLabels[locale] ?? locale]),
    ),
    list_inner: keys,
    list_translate: Object.fromEntries(
      keys.map((key) => [
        key,
        Object.fromEntries(
          localization.locale_order.map((locale) => [
            locale,
            messageText(localization.locales[locale]?.translations[key]),
          ]),
        ),
      ]),
    ),
    editor_locked_key_count: 0,
  };
}

export function updateLocalizationFromLanguageDocument(
  localization: LocalizationDocument,
  previous: LanguageDocument,
  next: LanguageDocument,
): LocalizationDocument {
  const previousCodes = previous.list_code_language;
  const previousKeys = previous.list_inner;
  const nextKeys = [
    ...next.list_inner,
    ...Object.keys(next.list_translate).filter((key) => !next.list_inner.includes(key)),
  ];
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
          const sourceKey = sourceLocale?.translations[key]
            ? key
            : previousKeys[keyIndex] && sourceLocale?.translations[previousKeys[keyIndex]]
              ? previousKeys[keyIndex]
              : key;
          const row = next.list_translate[key] as Record<string, string> | undefined;
          return [key, updatedMessage(sourceLocale?.translations[sourceKey], row?.[code] ?? '')];
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

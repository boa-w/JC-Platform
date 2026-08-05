import i18n from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import type { PropsWithChildren } from 'react';
import { detectInitialAppLanguage, persistAppLanguage } from './language';
import {
  appI18nResources,
  supportedAppLanguages,
  type AppLanguage,
} from './resources';

const initialLanguage = detectInitialAppLanguage();

void i18n.use(initReactI18next).init({
  resources: appI18nResources,
  lng: initialLanguage,
  supportedLngs: supportedAppLanguages,
  fallbackLng: false,
  load: 'currentOnly',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  returnEmptyString: false,
});

function synchronizeDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
}

synchronizeDocumentLanguage(initialLanguage);
i18n.on('languageChanged', (language) => {
  if (!supportedAppLanguages.includes(language as AppLanguage)) return;
  persistAppLanguage(language as AppLanguage);
  synchronizeDocumentLanguage(language);
});

export function AppI18nProvider({ children }: PropsWithChildren) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useAppLanguage() {
  const { i18n: currentI18n } = useTranslation();
  const language = currentI18n.resolvedLanguage as AppLanguage;

  async function changeLanguage(nextLanguage: AppLanguage) {
    if (!supportedAppLanguages.includes(nextLanguage)) return false;
    await currentI18n.changeLanguage(nextLanguage);
    return true;
  }

  return {
    language,
    supportedLanguages: supportedAppLanguages,
    changeLanguage,
  } as const;
}

export { i18n as appI18n };
export type { AppLanguage } from './resources';

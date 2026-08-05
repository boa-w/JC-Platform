import zhCN from './locales/zh-CN.json';

export const appI18nResources = {
  'zh-CN': {
    translation: zhCN,
  },
} as const;

export type AppLanguage = keyof typeof appI18nResources;

export const appLanguageLabelKeys: Record<AppLanguage, string> = {
  'zh-CN': 'settings.interfaceLanguage.options.zhCN',
};

export const supportedAppLanguages = Object.freeze(
  Object.keys(appI18nResources) as AppLanguage[],
);

export const defaultAppLanguage: AppLanguage = 'zh-CN';

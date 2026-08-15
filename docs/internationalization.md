# Internationalization

This document covers the React application UI only. Device project localization is a separate contract:

- `jc001`: [data-format.md](data-format.md)
- `jc002`: [data-format-v2.md](data-format-v2.md)
- v2 firmware runtime: [firmware-i18n-v2.md](firmware-i18n-v2.md)

Do not copy React locale resources into a device project and do not treat device `localization` as the application's `i18next` resource registry.

The application UI uses `i18next` and `react-i18next`. Locale resources live in `src/i18n/locales/<language>.json`, and `src/i18n/resources.ts` is the only language registration point.

The current release registers only `zh-CN`. `fallbackLng` is deliberately `false`: an unregistered or incomplete language must not silently display Chinese. Add a language only after its JSON has the same leaf-key set as `zh-CN.json`, then register its label in `resources.ts`.

Keep application UI text in locale JSON and use `t('...')` in components and hooks. Interpolated values such as paths, counts, and backend report details belong in the translation string. Do not translate persisted device/project data, protocol names, language-table values, test fixtures, or `.jcpro` field values; those are part of the project contract rather than application UI.

When migrating a page, also migrate status/error messages, dialog labels, tooltips, placeholders, and ARIA labels. Prefer explicit status tones or machine-readable state over inspecting translated text to determine behavior.

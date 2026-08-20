import { useTranslation } from 'react-i18next';
import type { LanguageDocument } from '../../types/platform';
import { getLanguageDocumentLabel } from './localizationAdapter';
import { TranslationValueInput } from './TranslationValueInput';

interface LanguageNameTableProps {
  document: LanguageDocument;
  onUpdateValue: (key: string, code: string, value: string) => void;
}

/** Edit the reserved locale-name messages without mixing them into business keys. */
export function LanguageNameTable({ document, onUpdateValue }: LanguageNameTableProps) {
  const { t } = useTranslation();
  const entries = document.list_code_language
    .map((code) => ({ code, key: document.language_name_keys?.[code] }))
    .filter((item): item is { code: string; key: string } => Boolean(item.key));

  if (entries.length === 0) return null;

  return (
    <section className="lang-name-table-wrap">
      <div className="lang-name-table-header">
        <div>
          <h3>{t('language.names.title')}</h3>
          <p>{t('language.names.description')}</p>
        </div>
        <span className="lang-name-table-badge">{t('language.names.locked')}</span>
      </div>
      <div className="lang-name-table-scroll">
        <table className="lang-table lang-name-table">
          <thead>
            <tr>
              <th className="lang-table-th-key">{t('language.table.translationKey')}</th>
              {document.list_code_language.map((code) => (
                <th className="lang-table-th-source" key={code}>
                  <span>{code}</span>
                  <small>{getLanguageDocumentLabel(document, code)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(({ code, key }) => {
              const translations = (document.list_translate[key] as Record<string, string>) ?? {};
              return (
                <tr key={key}>
                  <td className="lang-table-cell-key">
                    <span className="lang-name-key">{key}</span>
                    <small>{getLanguageDocumentLabel(document, code)}</small>
                  </td>
                  {document.list_code_language.map((displayLocale) => (
                    <td className="lang-table-cell-source" key={`${key}-${displayLocale}`}>
                      <TranslationValueInput
                        ariaLabel={`${key} ${displayLocale}`}
                        modified={false}
                        value={translations[displayLocale] ?? ''}
                        onCommit={(value) => onUpdateValue(key, displayLocale, value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

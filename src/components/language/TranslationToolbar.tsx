import { FileSpreadsheet, FileUp, Info } from 'lucide-react';
import { useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { FilterMode } from './types';

interface TranslationToolbarProps {
  searchQuery: string;
  filterMode: FilterMode;
  sourceLanguage: string;
  targetLanguage: string | null;
  totalKeys: number;
  filteredCount: number;
  importStatus: string | null;
  fullImportStatus: string | null;
  isImportingSingleLanguage: boolean;
  isImportingFullLanguage: boolean;
  canImportFullLanguage: boolean;
  onSearch: (query: string) => void;
  onFilter: (mode: FilterMode) => void;
  onSyncKeys: () => void;
  onImportSingleLanguage: () => void;
  onImportFullLanguage: () => void;
}

const filterOptions: { labelKey: string; value: FilterMode }[] = [
  { labelKey: 'language.toolbar.filters.all', value: 'all' },
  { labelKey: 'language.toolbar.filters.translated', value: 'translated' },
  { labelKey: 'language.toolbar.filters.untranslated', value: 'untranslated' },
  { labelKey: 'language.toolbar.filters.modified', value: 'modified' },
];

export function TranslationToolbar({
  searchQuery,
  filterMode,
  sourceLanguage,
  targetLanguage,
  totalKeys,
  filteredCount,
  importStatus,
  fullImportStatus,
  isImportingSingleLanguage,
  isImportingFullLanguage,
  canImportFullLanguage,
  onSearch,
  onFilter,
  onSyncKeys,
  onImportSingleLanguage,
  onImportFullLanguage,
}: TranslationToolbarProps) {
  const { t } = useTranslation();
  const visibleImportStatus = importStatus ?? fullImportStatus;
  const importHelpId = useId();
  const [showImportHelp, setShowImportHelp] = useState(false);

  return (
    <div className="lang-toolbar">
      <div className="lang-toolbar-left">
        <div className="lang-toolbar-search">
          <span className="lang-toolbar-search-icon">🔍</span>
          <input
            placeholder={t('language.toolbar.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searchQuery ? (
            <button
              className="lang-toolbar-search-clear"
              onClick={() => onSearch('')}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="lang-toolbar-filters">
          {filterOptions.map((opt) => (
            <button
              className={`lang-toolbar-filter ${filterMode === opt.value ? 'active' : ''}`}
              key={opt.value}
              onClick={() => onFilter(opt.value)}
              type="button"
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="lang-toolbar-right">
        <span className="lang-toolbar-count">
          {filteredCount === totalKeys
            ? t('language.toolbar.totalCount', { count: totalKeys })
            : t('language.toolbar.filteredCount', { filtered: filteredCount, total: totalKeys })}
        </span>
        <span className="lang-toolbar-lang-pair">
          {sourceLanguage} → {targetLanguage ?? '—'}
        </span>
        {visibleImportStatus ? (
          <span className="lang-import-status" role="status" title={visibleImportStatus}>
            {visibleImportStatus}
          </span>
        ) : null}
        <button
          className="lang-btn lang-btn--ghost"
          disabled={!targetLanguage || isImportingSingleLanguage || isImportingFullLanguage}
          onClick={onImportSingleLanguage}
          title={t(
            targetLanguage
              ? 'language.toolbar.singleImportTitle'
              : 'language.toolbar.selectTargetFirst',
          )}
          type="button"
        >
          <FileUp aria-hidden="true" size={14} />
          {t(
            isImportingSingleLanguage
              ? 'language.toolbar.importing'
              : 'language.toolbar.importSingle',
          )}
        </button>
        <button
          className="lang-btn lang-btn--ghost"
          disabled={!canImportFullLanguage || isImportingFullLanguage || isImportingSingleLanguage}
          onClick={onImportFullLanguage}
          title={t('language.toolbar.fullImportTitle')}
          type="button"
        >
          <FileSpreadsheet aria-hidden="true" size={14} />
          {t(
            isImportingFullLanguage
              ? 'language.toolbar.importing'
              : 'language.toolbar.importFull',
          )}
        </button>
        <div className="lang-import-help">
          <button
            aria-controls={importHelpId}
            aria-expanded={showImportHelp}
            aria-label={t('language.toolbar.importHelpLabel')}
            className="lang-import-help-trigger"
            onClick={() => setShowImportHelp((visible) => !visible)}
            title={t('language.toolbar.importHelpLabel')}
            type="button"
          >
            <Info aria-hidden="true" size={15} />
          </button>
          {showImportHelp ? (
            <div className="lang-import-help-popover" id={importHelpId} role="note">
              <strong>{t('language.toolbar.importHelpTitle')}</strong>
              <p>
                <Trans
                  components={{ bold: <b />, code: <code /> }}
                  i18nKey="language.toolbar.singleImportHelp"
                />
              </p>
              <p>
                <Trans
                  components={{ bold: <b />, codeIndex: <code />, codeAuto: <code /> }}
                  i18nKey="language.toolbar.fullImportHelp"
                />
              </p>
              <p>{t('language.toolbar.singleImportGuarantee')}</p>
            </div>
          ) : null}
        </div>
        <button className="lang-btn lang-btn--ghost" onClick={onSyncKeys} type="button">
          {t('language.toolbar.syncKeys')}
        </button>
      </div>
    </div>
  );
}

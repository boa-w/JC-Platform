import { useTranslation } from 'react-i18next';
import {
  type TableConfigController,
  tableConfigSections,
  tableConfigTitleKeys,
} from './useTableConfigController';

interface TableConfigStatusPanelProps {
  controller: TableConfigController;
}

export function TableConfigStatusPanel({ controller }: TableConfigStatusPanelProps) {
  const { t } = useTranslation();
  const kind = controller.currentKind;
  if (!kind) return null;

  return (
    <section className="table-spec-card">
      <div>
        <h2>{t(tableConfigTitleKeys[kind])}</h2>
      </div>
      {kind !== 'language' && controller.importError ? (
        <p className="project-open-error" role="alert">
          {controller.importError}
        </p>
      ) : null}
      {kind !== 'language' && controller.importReport ? (
        <div className="table-io-result">
          <div className="table-io-result-row">
            <span>{t('tableConfig.importValidation')}</span>
            <strong className={controller.importReport.valid ? 'text-success' : 'text-danger'}>
              {t(controller.importReport.valid ? 'tableConfig.passed' : 'tableConfig.hasIssues')}
            </strong>
          </div>
          <div className="table-io-result-row">
            <span>{t('tableConfig.headerCount')}</span>
            <strong>{controller.importReport.table.actual_headers.length}</strong>
          </div>
          <div className="table-io-result-row">
            <span>{t('tableConfig.targetSection')}</span>
            <strong>{tableConfigSections[kind]}</strong>
          </div>
        </div>
      ) : null}
      {controller.exportStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {controller.exportStatus}
        </p>
      ) : null}
    </section>
  );
}

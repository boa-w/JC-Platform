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
            <strong>
              {kind === 'pdoSimple'
                ? controller.pdoUsesAdvancedTarget
                  ? t('tableConfig.targets.advancedPdo')
                  : tableConfigSections[kind]
                : tableConfigSections[kind]}
            </strong>
          </div>
          {kind === 'pdoSimple' && controller.pdoConversionReport ? (
            <>
              <div className="table-io-result-row">
                <span>{t('tableConfig.conversionValidation')}</span>
                <strong
                  className={
                    controller.pdoConversionReport.valid ? 'text-success' : 'text-danger'
                  }
                >
                  {t(
                    controller.pdoConversionReport.valid
                      ? 'tableConfig.passed'
                      : 'tableConfig.hasIssues',
                  )}
                </strong>
              </div>
              <div className="table-io-result-row">
                <span>{t('tableConfig.convertedFrames')}</span>
                <strong>{controller.pdoConversionReport.source_frame_total}</strong>
              </div>
              <div className="table-io-result-row">
                <span>{t('tableConfig.convertedSignals')}</span>
                <strong>{controller.pdoConversionReport.source_signal_total}</strong>
              </div>
              <div className="table-io-result-row">
                <span>{t('tableConfig.generatedParameters')}</span>
                <strong>{controller.pdoConversionReport.generated_param_total}</strong>
              </div>
              {controller.pdoConversionReport.warnings.length > 0 ? (
                <p className="config-helper-text">
                  {controller.pdoConversionReport.warnings.join(
                    t('common.punctuation.semicolon'),
                  )}
                </p>
              ) : null}
            </>
          ) : null}
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

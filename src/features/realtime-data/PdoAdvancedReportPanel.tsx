import type { PdoAdvancedReportController } from './usePdoAdvancedReport';
import { useTranslation } from 'react-i18next';

export function PdoAdvancedReportPanel({
  controller,
}: {
  controller: PdoAdvancedReportController;
}) {
  const { t } = useTranslation();
  return (
    <section className="table-spec-card">
      <div>
        <h2>{t('pdoAdvancedReport.title')}</h2>
        <p>{t('pdoAdvancedReport.description')}</p>
      </div>
      <button
        className="path-open-button"
        disabled={!controller.canParse || controller.isParsing}
        onClick={() => void controller.parse()}
        type="button"
      >
        {t(controller.isParsing ? 'pdoAdvancedReport.parsing' : 'pdoAdvancedReport.parse')}
      </button>
      {controller.report ? (
        <div className="project-open-report">
          <article>
            <span>{t('pdoAdvancedReport.globalParameters')}</span>
            <strong>{controller.report.document?.pdo_global_param.length ?? 0}</strong>
          </article>
          <article>
            <span>{t('pdoAdvancedReport.conditions')}</span>
            <strong>{controller.report.document?.pdo_condition.length ?? 0}</strong>
          </article>
          <article>
            <span>{t('pdoAdvancedReport.receiveFrames')}</span>
            <strong>{controller.report.document?.pdo_recv.length ?? 0}</strong>
          </article>
          <article>
            <span>{t('pdoAdvancedReport.sendFrames')}</span>
            <strong>{controller.report.document?.pdo_send.length ?? 0}</strong>
          </article>
        </div>
      ) : null}
      {controller.error ? (
        <p className="project-open-error" role="alert">
          {controller.error}
        </p>
      ) : null}
    </section>
  );
}

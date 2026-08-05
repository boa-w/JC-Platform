import { FileArchive, FileCode2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import type { LoadedProject } from '../../types/platform';
import { useCanopenExport } from './useCanopenExport';

interface CanopenExportPageProps {
  loadedProject: LoadedProject | null;
}

export function CanopenExportPage({ loadedProject }: CanopenExportPageProps) {
  const { t } = useTranslation();
  const canopenExport = useCanopenExport(loadedProject);
  const report = canopenExport.report;

  return (
    <section className="project-open-card">
      <div className="config-table-toolbar">
        <div>
          <h2>{t('canopenExport.title')}</h2>
          <p>{t('canopenExport.description')}</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || canopenExport.isExporting}
            onClick={() => void canopenExport.exportPackage()}
            type="button"
          >
            {t(canopenExport.isExporting ? 'common.status.exporting' : 'canopenExport.exportPackage')}
          </button>
          {canopenExport.exportDir ? (
            <button onClick={() => void canopenExport.openExportDir()} type="button">
              {t('canopenExport.openDirectory')}
            </button>
          ) : null}
        </div>
      </div>
      {loadedProject ? (
        <>
          <div className="project-open-report">
            <article>
              <span>{t('canopenExport.firmwareProtocol')}</span>
              <strong>{t('canopenExport.unchanged')}</strong>
            </article>
            <article>
              <span>{t('canopenExport.sdoRequestRule')}</span>
              <strong>0x600 + Node-ID</strong>
            </article>
            <article>
              <span>{t('canopenExport.exportDirectory')}</span>
              <strong>{canopenExport.exportDir ?? t('canopenExport.notExported')}</strong>
            </article>
            <article>
              <span>{t('canopenExport.outputFiles')}</span>
              <strong>{report?.files.length ?? 0}</strong>
            </article>
          </div>
          <div className="config-summary-strip" style={{ marginTop: 8 }}>
            <article>
              <span>{t('canopenExport.nodes')}</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>{t('canopenExport.edsFiles')}</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>{t('canopenExport.pdoCount')}</span>
              <strong>
                {report?.nodes.reduce((total, node) => total + node.pdoCount, 0) ?? 0}
              </strong>
            </article>
            <article>
              <span>{t('canopenExport.bitfieldMappings')}</span>
              <strong>
                {report?.nodes.reduce((total, node) => total + node.bitfieldCount, 0) ?? 0}
              </strong>
            </article>
            <article>
              <span>{t('canopenExport.conversionWarnings')}</span>
              <strong>{report?.warnings.length ?? 0}</strong>
            </article>
          </div>
          {canopenExport.status ? (
            <p
              aria-live="polite"
              className={
                canopenExport.statusTone === 'success' ? 'text-success' : 'project-open-error'
              }
              role="status"
              style={{ marginTop: 8 }}
            >
              {canopenExport.status}
            </p>
          ) : null}
          {report && report.nodes.length > 0 ? (
            <section className="pdo-frame-section">
              <div className="config-table-toolbar">
                <strong>{t('canopenExport.nodeSummary')}</strong>
              </div>
              <div className="config-table-frame">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Node-ID</th>
                      <th>{t('canopenExport.sdoRequestCobId')}</th>
                      <th>{t('canopenExport.sdoResponseCobId')}</th>
                      <th>{t('canopenExport.objectCount')}</th>
                      <th>{t('canopenExport.pdoCount')}</th>
                      <th>{t('canopenExport.bitfieldExtensions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.nodes.map((node) => (
                      <tr key={node.nodeId}>
                        <td>{node.nodeId}</td>
                        <td>
                          <code>0x{node.sdoRxCobId.toString(16).toUpperCase()}</code>
                        </td>
                        <td>
                          <code>0x{node.sdoTxCobId.toString(16).toUpperCase()}</code>
                        </td>
                        <td>{node.objectCount}</td>
                        <td>{node.pdoCount}</td>
                        <td>{node.bitfieldCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <EmptyState icon={FileArchive}>
              {t('canopenExport.emptyReport')}
            </EmptyState>
          )}
          {report && report.warnings.length > 0 ? (
            <div
              aria-live="polite"
              className="project-open-error"
              role="status"
              style={{ marginTop: 8 }}
            >
              {report.warnings.slice(0, 5).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {report.warnings.length > 5 ? (
                <p>
                  {t('canopenExport.moreWarnings', { count: report.warnings.length - 5 })}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState icon={FileCode2}>{t('canopenExport.openProjectPageFirst')}</EmptyState>
      )}
    </section>
  );
}

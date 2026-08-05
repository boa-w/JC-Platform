import { FileDown, FileUp, WandSparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import type { useCanTestData } from '../../hooks/useCanTestData';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { CanTestProfile, LoadedProject } from '../../types/platform';

type CanTestDataController = ReturnType<typeof useCanTestData>;

interface CanTestDataPageProps {
  loadedProject: LoadedProject | null;
  canTestData: CanTestDataController;
}

export function CanTestDataPage({ loadedProject, canTestData }: CanTestDataPageProps) {
  const { t } = useTranslation();
  const stableKeys = useStableCollectionKeys();
  const settingEntryKeys = stableKeys(
    'can-test-setting-entries',
    canTestData.canTestSettingEntries,
  );
  const frameKeys = stableKeys('can-test-frames', canTestData.canTestFrames);

  return (
    <section className="table-spec-card">
      <div>
        <h2>{t('canTestData.title')}</h2>
        <p>{t('canTestData.description')}</p>
      </div>
      {loadedProject ? (
        <div className="pdo-simple-editor">
          <div className="config-summary-strip">
            <article>
              <span>{t('canTestData.summary.frames')}</span>
              <strong>{canTestData.canTestFrames.length}</strong>
            </article>
            <article>
              <span>{t('canTestData.summary.testCases')}</span>
              <strong>
                {canTestData.canTestCoverage?.caseCount ?? canTestData.canTestCases.length}
              </strong>
            </article>
            <article>
              <span>{t('canTestData.summary.signals')}</span>
              <strong>{canTestData.canTestCoverage?.signalCount ?? 0}</strong>
            </article>
            <article>
              <span>{t('canTestData.summary.settingEntries')}</span>
              <strong>
                {canTestData.canTestCoverage?.settingEntryCount ??
                  canTestData.canTestSettingEntries.length}
              </strong>
            </article>
            <article>
              <span>{t('canTestData.summary.defaultCycle')}</span>
              <strong>{canTestData.canTestDefaultCycle} ms</strong>
            </article>
          </div>
          <div className="pdo-frame-grid">
            <label>
              {t('canTestData.fields.profile')}
              <select
                value={canTestData.canTestProfile}
                onChange={(e) => canTestData.setCanTestProfile(e.target.value as CanTestProfile)}
              >
                <option value="smoke">{t('canTestData.profiles.smoke')}</option>
                <option value="boundary">{t('canTestData.profiles.boundary')}</option>
                <option value="fault">{t('canTestData.profiles.fault')}</option>
                <option value="regression">{t('canTestData.profiles.regression')}</option>
              </select>
            </label>
            <label>
              {t('canTestData.fields.defaultCycleMs')}
              <input
                type="number"
                value={canTestData.canTestDefaultCycle}
                onChange={(e) => canTestData.setCanTestDefaultCycle(Number(e.target.value))}
              />
            </label>
            {canTestData.canTestCases.length > 0 ? (
              <label>
                {t('canTestData.fields.currentCase')}
                <select
                  value={canTestData.selectedCanTestCaseIndex}
                  onChange={(e) => canTestData.selectCanTestCase(Number(e.target.value))}
                >
                  {canTestData.canTestCases.map((testCase, index) => (
                    <option key={testCase.caseId} value={index}>
                      {testCase.caseId} · {testCase.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="config-table-toolbar" style={{ gap: 8 }}>
            <button
              disabled={canTestData.isGeneratingCanTest}
              onClick={() => void canTestData.generate(loadedProject)}
              type="button"
            >
              <WandSparkles aria-hidden="true" size={14} strokeWidth={1.8} />
              {canTestData.isGeneratingCanTest
                ? t('canTestData.actions.generating')
                : t('canTestData.actions.generate')}
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportTxt(loadedProject)}
              type="button"
            >
              <FileUp aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('canTestData.actions.exportTxt')}
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportCsv(loadedProject)}
              type="button"
            >
              <FileUp aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('canTestData.actions.exportCsv')}
            </button>
            <span className="action-bar-sep" />
            <button onClick={() => void canTestData.importConfig()} type="button">
              <FileDown aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('canTestData.actions.importConfig')}
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportConfig()}
              type="button"
            >
              <FileUp aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('canTestData.actions.exportConfig')}
            </button>
          </div>
          {canTestData.canTestCoverage ? (
            <div className="config-table-toolbar" style={{ gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                {t('canTestData.coverage.scenarios', {
                  value:
                    canTestData.canTestCoverage.coveredScenarios.join(' / ') ||
                    t('canTestData.coverage.none'),
                })}
              </span>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                {t('canTestData.coverage.generatedFrames', {
                  count: canTestData.canTestCoverage.generatedFrameCount,
                })}
              </span>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                {t('canTestData.coverage.generatedSettingEntries', {
                  count: canTestData.canTestCoverage.generatedSettingEntryCount,
                })}
              </span>
            </div>
          ) : null}
          {canTestData.canTestWarnings.length > 0 ? (
            <div
              aria-live="polite"
              className="project-open-error"
              role="status"
              style={{ marginTop: 8 }}
            >
              {canTestData.canTestWarnings.slice(0, 3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {canTestData.canTestWarnings.length > 3 ? (
                <p>
                  {t('canTestData.warnings.more', {
                    count: canTestData.canTestWarnings.length - 3,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          {canTestData.canTestFrames.length > 0 || canTestData.canTestSettingEntries.length > 0 ? (
            <>
              {canTestData.canTestSettingEntries.length > 0 ? (
                <div className="config-table-frame" style={{ marginBottom: 10 }}>
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>{t('canTestData.settingTable.item')}</th>
                        <th>{t('canTestData.settingTable.menuPath')}</th>
                        <th>{t('canTestData.settingTable.frameId')}</th>
                        <th>{t('canTestData.settingTable.index')}</th>
                        <th>{t('canTestData.settingTable.subindex')}</th>
                        <th>{t('canTestData.settingTable.access')}</th>
                        <th>{t('canTestData.settingTable.type')}</th>
                        <th>{t('canTestData.settingTable.position')}</th>
                        <th>{t('canTestData.settingTable.role')}</th>
                        <th>{t('canTestData.settingTable.testValue')}</th>
                        <th>{t('canTestData.settingTable.range')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canTestData.canTestSettingEntries.map((entry, entryIndex) => (
                        <tr key={settingEntryKeys[entryIndex]}>
                          <td>{entry.name}</td>
                          <td>{entry.menuPath || '-'}</td>
                          <td>
                            <code>0x{entry.frameId.toString(16).toUpperCase()}</code>
                          </td>
                          <td>
                            <code>0x{entry.index.toString(16).toUpperCase()}</code>
                          </td>
                          <td>{entry.subindex}</td>
                          <td>{entry.access}</td>
                          <td>{entry.dataType}</td>
                          <td>
                            {entry.pos}/{entry.len}
                          </td>
                          <td>{entry.role}</td>
                          <td>{entry.value}</td>
                          <td>
                            {entry.minValue ?? '-'} / {entry.maxValue ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="config-table-toolbar" style={{ gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                  {t('canTestData.signalFill.label')}
                </span>
                <button
                  onClick={() => canTestData.fillSignals('min')}
                  type="button"
                  title={t('canTestData.signalFill.minTitle')}
                >
                  {t('canTestData.signalFill.min')}
                </button>
                <button
                  onClick={() => canTestData.fillSignals('max')}
                  type="button"
                  title={t('canTestData.signalFill.maxTitle')}
                >
                  {t('canTestData.signalFill.max')}
                </button>
                <button
                  onClick={() => canTestData.fillSignals('random')}
                  type="button"
                  title={t('canTestData.signalFill.randomTitle')}
                >
                  {t('canTestData.signalFill.random')}
                </button>
                <span className="action-bar-sep" />
                <button
                  onClick={() => canTestData.fillSignals('zero')}
                  type="button"
                  title={t('canTestData.signalFill.zeroTitle')}
                >
                  {t('canTestData.signalFill.zero')}
                </button>
                <button
                  onClick={() => canTestData.fillSignals('ff')}
                  type="button"
                  title={t('canTestData.signalFill.ffTitle')}
                >
                  {t('canTestData.signalFill.ff')}
                </button>
              </div>
              {canTestData.canTestFrames.map((frame, frameIndex) => {
                const frameKey = frameKeys[frameIndex];
                const signalKeys = stableKeys(`can-test-signals-${frameKey}`, frame.signals);
                return (
                  <section className="pdo-frame-section" key={frameKey}>
                    <div className="pdo-frame-card">
                      <div className="pdo-frame-grid">
                        <div className="pdo-frame-field">
                          CAN ID
                          <code style={{ fontSize: '1.1em' }}>
                            0x{frame.id.toString(16).toUpperCase().padStart(3, '0')}
                          </code>
                        </div>
                        <div className="pdo-frame-field">
                          {t('canTestData.frame.type')}
                          <span>
                            {frame.frameType === 0
                              ? t('canTestData.frame.standard')
                              : t('canTestData.frame.extended')}
                          </span>
                        </div>
                        <label>
                          {t('canTestData.frame.name')}
                          <input
                            value={frame.name}
                            onChange={(e) =>
                              canTestData.updateFrame(frameIndex, 'name', e.target.value)
                            }
                          />
                        </label>
                        <div className="pdo-frame-field">
                          {t('canTestData.frame.scenario')}
                          <span>{frame.scenario ?? 'manual'}</span>
                        </div>
                        <div className="pdo-frame-field">
                          {t('canTestData.frame.source')}
                          <span>{frame.source ?? '-'}</span>
                        </div>
                        <div className="pdo-frame-field">
                          DLC<span>{frame.dlc}</span>
                        </div>
                        <label>
                          {t('canTestData.frame.cycleMs')}
                          <input
                            type="number"
                            style={{ width: 80 }}
                            value={frame.cycleMs}
                            onChange={(e) =>
                              canTestData.updateFrame(frameIndex, 'cycleMs', Number(e.target.value))
                            }
                          />
                        </label>
                        <div className="pdo-frame-field">
                          HEX<code style={{ fontSize: '0.85em' }}>{frame.data}</code>
                        </div>
                      </div>
                    </div>
                    {frame.signals.length > 0 ? (
                      <div className="config-table-frame" style={{ marginTop: 6 }}>
                        <table className="config-table">
                          <thead>
                            <tr>
                              <th>{t('canTestData.signalTable.name')}</th>
                              <th>{t('canTestData.signalTable.value')}</th>
                              <th>{t('canTestData.signalTable.unit')}</th>
                              <th>{t('canTestData.signalTable.position')}</th>
                              <th>{t('canTestData.signalTable.length')}</th>
                              <th>{t('canTestData.signalTable.scale')}</th>
                              <th>{t('canTestData.signalTable.offset')}</th>
                              <th>{t('canTestData.signalTable.range')}</th>
                              <th>{t('canTestData.signalTable.role')}</th>
                              <th>{t('canTestData.signalTable.rawValue')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {frame.signals.map((sig, sigIndex) => (
                              <tr key={signalKeys[sigIndex]}>
                                <td>{sig.name}</td>
                                <td>
                                  <input
                                    type="number"
                                    step={sig.scaleDen > 1 ? 1 / sig.scaleDen : 'any'}
                                    style={{ width: 90 }}
                                    value={sig.displayValue}
                                    onChange={(e) =>
                                      canTestData.updateSignalDisplayValue(
                                        frameIndex,
                                        sigIndex,
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td>{sig.unit}</td>
                                <td>{sig.pos}</td>
                                <td>{sig.len}</td>
                                <td>
                                  {sig.scaleNum}/{sig.scaleDen}
                                </td>
                                <td>{sig.offset}</td>
                                <td>
                                  {sig.minValue ?? '-'} / {sig.maxValue ?? '-'}
                                </td>
                                <td>{sig.testRole ?? 'manual'}</td>
                                <td>
                                  <code>0x{sig.rawValue.toString(16).toUpperCase()}</code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </>
          ) : canTestData.canTestStatusTone === 'success' ? null : (
            <EmptyState icon={WandSparkles}>{t('canTestData.empty')}</EmptyState>
          )}
          {canTestData.canTestStatus ? (
            <p
              aria-live="polite"
              className={
                canTestData.canTestStatusTone === 'success'
                  ? 'text-success'
                  : canTestData.canTestStatusTone === 'error'
                    ? 'project-open-error'
                    : undefined
              }
              role="status"
              style={{ marginTop: 8 }}
            >
              {canTestData.canTestStatus}
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState>{t('canTestData.openProjectFirst')}</EmptyState>
      )}
    </section>
  );
}

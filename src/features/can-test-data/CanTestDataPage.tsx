import type { useCanTestData } from '../../hooks/useCanTestData';
import type { CanTestProfile, LoadedProject } from '../../types/platform';

type CanTestDataController = ReturnType<typeof useCanTestData>;

interface CanTestDataPageProps {
  loadedProject: LoadedProject | null;
  canTestData: CanTestDataController;
}

export function CanTestDataPage({ loadedProject, canTestData }: CanTestDataPageProps) {
  return (
    <section className="table-spec-card">
      <div>
        <h2>CAN 测试数据构建</h2>
        <p>从当前项目 PDO/锂电配置中提取 CAN 帧，生成测试数据并导出为 TXT 文件。</p>
      </div>
      {loadedProject ? (
        <div className="pdo-simple-editor">
          <div className="config-summary-strip">
            <article>
              <span>已生成帧</span>
              <strong>{canTestData.canTestFrames.length}</strong>
            </article>
            <article>
              <span>测试用例</span>
              <strong>
                {canTestData.canTestCoverage?.caseCount ?? canTestData.canTestCases.length}
              </strong>
            </article>
            <article>
              <span>信号覆盖</span>
              <strong>{canTestData.canTestCoverage?.signalCount ?? 0}</strong>
            </article>
            <article>
              <span>设置条目</span>
              <strong>
                {canTestData.canTestCoverage?.settingEntryCount ??
                  canTestData.canTestSettingEntries.length}
              </strong>
            </article>
            <article>
              <span>默认周期</span>
              <strong>{canTestData.canTestDefaultCycle} ms</strong>
            </article>
          </div>
          <div className="pdo-frame-grid">
            <label>
              生成模式
              <select
                value={canTestData.canTestProfile}
                onChange={(e) => canTestData.setCanTestProfile(e.target.value as CanTestProfile)}
              >
                <option value="smoke">快速冒烟</option>
                <option value="boundary">边界覆盖</option>
                <option value="fault">异常注入</option>
                <option value="regression">全量回归</option>
              </select>
            </label>
            <label>
              默认周期(ms)
              <input
                type="number"
                value={canTestData.canTestDefaultCycle}
                onChange={(e) => canTestData.setCanTestDefaultCycle(Number(e.target.value))}
              />
            </label>
            {canTestData.canTestCases.length > 0 ? (
              <label>
                当前用例
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
              {canTestData.isGeneratingCanTest ? '生成中...' : '⚡ 生成'}
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportTxt(loadedProject)}
              type="button"
            >
              📤 导出纯帧 TXT
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportCsv(loadedProject)}
              type="button"
            >
              📤 导出 CSV
            </button>
            <span className="action-bar-sep" />
            <button onClick={() => void canTestData.importConfig()} type="button">
              📥 导入配置
            </button>
            <button
              disabled={canTestData.canTestFrames.length === 0}
              onClick={() => void canTestData.exportConfig()}
              type="button"
            >
              📤 导出说明 JSON
            </button>
          </div>
          {canTestData.canTestCoverage ? (
            <div className="config-table-toolbar" style={{ gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                场景：{canTestData.canTestCoverage.coveredScenarios.join(' / ') || '无'}
              </span>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                帧次：{canTestData.canTestCoverage.generatedFrameCount}
              </span>
              <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                设置条目次：{canTestData.canTestCoverage.generatedSettingEntryCount}
              </span>
            </div>
          ) : null}
          {canTestData.canTestWarnings.length > 0 ? (
            <div className="project-open-error" style={{ marginTop: 8 }}>
              {canTestData.canTestWarnings.slice(0, 3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {canTestData.canTestWarnings.length > 3 ? (
                <p>还有 {canTestData.canTestWarnings.length - 3} 条警告，已写入导出配置。</p>
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
                        <th>设置项</th>
                        <th>菜单路径</th>
                        <th>帧ID</th>
                        <th>主索引</th>
                        <th>子索引</th>
                        <th>权限</th>
                        <th>类型</th>
                        <th>位置</th>
                        <th>角色</th>
                        <th>测试值</th>
                        <th>范围</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canTestData.canTestSettingEntries.map((entry, entryIndex) => (
                        <tr key={`${entry.index}-${entry.subindex}-${entry.role}-${entryIndex}`}>
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
                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>信号填充：</span>
                <button
                  onClick={() => canTestData.fillSignals('min')}
                  type="button"
                  title="所有信号填最小值 0"
                >
                  最小值
                </button>
                <button
                  onClick={() => canTestData.fillSignals('max')}
                  type="button"
                  title="所有信号填最大值（对应位宽全 1）"
                >
                  最大值
                </button>
                <button
                  onClick={() => canTestData.fillSignals('random')}
                  type="button"
                  title="所有信号填随机值"
                >
                  随机值
                </button>
                <span className="action-bar-sep" />
                <button
                  onClick={() => canTestData.fillSignals('zero')}
                  type="button"
                  title="所有信号填 0"
                >
                  清零
                </button>
                <button
                  onClick={() => canTestData.fillSignals('ff')}
                  type="button"
                  title="所有信号原始值填 FF"
                >
                  全 FF
                </button>
              </div>
              {canTestData.canTestFrames.map((frame, frameIndex) => (
                <section className="pdo-frame-section" key={`${frame.id}-${frameIndex}`}>
                  <div className="pdo-frame-card">
                    <div className="pdo-frame-grid">
                      <div className="pdo-frame-field">
                        CAN ID
                        <code style={{ fontSize: '1.1em' }}>
                          0x{frame.id.toString(16).toUpperCase().padStart(3, '0')}
                        </code>
                      </div>
                      <div className="pdo-frame-field">
                        类型<span>{frame.frameType === 0 ? '标准帧' : '扩展帧'}</span>
                      </div>
                      <label>
                        名称
                        <input
                          value={frame.name}
                          onChange={(e) => canTestData.updateFrame(frameIndex, 'name', e.target.value)}
                        />
                      </label>
                      <div className="pdo-frame-field">
                        场景<span>{frame.scenario ?? 'manual'}</span>
                      </div>
                      <div className="pdo-frame-field">
                        来源<span>{frame.source ?? '-'}</span>
                      </div>
                      <div className="pdo-frame-field">
                        DLC<span>{frame.dlc}</span>
                      </div>
                      <label>
                        周期(ms)
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
                            <th>信号名称</th>
                            <th>值</th>
                            <th>单位</th>
                            <th>位置</th>
                            <th>长度</th>
                            <th>缩放</th>
                            <th>偏移</th>
                            <th>范围</th>
                            <th>角色</th>
                            <th>原始值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {frame.signals.map((sig, sigIndex) => (
                            <tr key={`${sig.name}-${sigIndex}`}>
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
              ))}
            </>
          ) : canTestData.canTestStatus?.startsWith('已生成') ? null : (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <p>点击「⚡ 生成」从项目配置中构建 CAN 测试数据</p>
            </div>
          )}
          {canTestData.canTestStatus ? (
            <p
              className={
                canTestData.canTestStatus.startsWith('已') ? 'text-success' : 'project-open-error'
              }
              style={{ marginTop: 8 }}
            >
              {canTestData.canTestStatus}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <p>请先在项目管理中打开 .jcpro 项目文件</p>
        </div>
      )}
    </section>
  );
}

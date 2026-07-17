import { FileArchive, FileCode2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import type { LoadedProject } from '../../types/platform';
import { useCanopenExport } from './useCanopenExport';

interface CanopenExportPageProps {
  loadedProject: LoadedProject | null;
}

export function CanopenExportPage({ loadedProject }: CanopenExportPageProps) {
  const canopenExport = useCanopenExport(loadedProject);
  const report = canopenExport.report;

  return (
    <section className="project-open-card">
      <div className="config-table-toolbar">
        <div>
          <h2>CANopen 导出</h2>
          <p>
            基于「数据 / 设置数据」生成 SDO 对象，纳入能匹配 CANopen 默认 PDO 连接集的实时
            PDO，并导出覆盖 SDO 通道与 PDO 帧的协议 DBC；无法归属到 Node-ID 的自定义实时帧会被排除。
          </p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || canopenExport.isExporting}
            onClick={() => void canopenExport.exportPackage()}
            type="button"
          >
            {canopenExport.isExporting ? '导出中...' : '导出 CANopen 包'}
          </button>
          {canopenExport.exportDir ? (
            <button onClick={() => void canopenExport.openExportDir()} type="button">
              打开 CANopen 目录
            </button>
          ) : null}
        </div>
      </div>
      {loadedProject ? (
        <>
          <div className="project-open-report">
            <article>
              <span>固件协议</span>
              <strong>保持不变</strong>
            </article>
            <article>
              <span>SDO 请求规则</span>
              <strong>0x600 + Node-ID</strong>
            </article>
            <article>
              <span>导出目录</span>
              <strong>{canopenExport.exportDir ?? '尚未导出'}</strong>
            </article>
            <article>
              <span>输出文件</span>
              <strong>{report?.files.length ?? 0}</strong>
            </article>
          </div>
          <div className="config-summary-strip" style={{ marginTop: 8 }}>
            <article>
              <span>CANopen 节点</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>EDS 文件</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>PDO 数</span>
              <strong>
                {report?.nodes.reduce((total, node) => total + node.pdoCount, 0) ?? 0}
              </strong>
            </article>
            <article>
              <span>位域映射</span>
              <strong>
                {report?.nodes.reduce((total, node) => total + node.bitfieldCount, 0) ?? 0}
              </strong>
            </article>
            <article>
              <span>转换提示</span>
              <strong>{report?.warnings.length ?? 0}</strong>
            </article>
          </div>
          {canopenExport.status ? (
            <p
              className={
                canopenExport.status.startsWith('已') ? 'text-success' : 'project-open-error'
              }
              style={{ marginTop: 8 }}
            >
              {canopenExport.status}
            </p>
          ) : null}
          {report && report.nodes.length > 0 ? (
            <section className="pdo-frame-section">
              <div className="config-table-toolbar">
                <strong>节点转换摘要</strong>
              </div>
              <div className="config-table-frame">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Node-ID</th>
                      <th>SDO 请求 COB-ID</th>
                      <th>SDO 响应 COB-ID</th>
                      <th>对象数</th>
                      <th>PDO 数</th>
                      <th>位域扩展</th>
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
              点击「导出 CANopen 包」生成 EDS、model、vendor 扩展、协议 DBC、SDO
              对象映射、位域映射和 SDO/PDO 测试帧。
            </EmptyState>
          )}
          {report && report.warnings.length > 0 ? (
            <div className="project-open-error" style={{ marginTop: 8 }}>
              {report.warnings.slice(0, 5).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {report.warnings.length > 5 ? (
                <p>还有 {report.warnings.length - 5} 条提示，详见 conversion_report.json。</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState icon={FileCode2}>请先在项目管理中打开 .jcpro 项目文件。</EmptyState>
      )}
    </section>
  );
}

import type { PdoAdvancedReportController } from './usePdoAdvancedReport';

export function PdoAdvancedReportPanel({
  controller,
}: {
  controller: PdoAdvancedReportController;
}) {
  return (
    <section className="table-spec-card">
      <div>
        <h2>PDO 高级配置校验</h2>
        <p>解析全局变量、条件表、PDO 接收帧和发送帧，展示结构统计与引用校验错误。</p>
      </div>
      <button
        className="path-open-button"
        disabled={!controller.canParse || controller.isParsing}
        onClick={() => void controller.parse()}
        type="button"
      >
        {controller.isParsing ? '解析中...' : '解析当前高级 PDO 配置'}
      </button>
      {controller.report ? (
        <div className="project-open-report">
          <article>
            <span>全局变量</span>
            <strong>{controller.report.document?.pdo_global_param.length ?? 0}</strong>
          </article>
          <article>
            <span>条件表</span>
            <strong>{controller.report.document?.pdo_condition.length ?? 0}</strong>
          </article>
          <article>
            <span>接收帧</span>
            <strong>{controller.report.document?.pdo_recv.length ?? 0}</strong>
          </article>
          <article>
            <span>发送帧</span>
            <strong>{controller.report.document?.pdo_send.length ?? 0}</strong>
          </article>
        </div>
      ) : null}
      {controller.error ? <p className="project-open-error">{controller.error}</p> : null}
    </section>
  );
}

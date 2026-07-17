import type { LegacyTableSpec } from '../../types/platform';
import {
  type TableConfigController,
  tableConfigSections,
  tableConfigTitles,
} from './useTableConfigController';

interface TableConfigStatusPanelProps {
  controller: TableConfigController;
}

export function TableConfigStatusPanel({ controller }: TableConfigStatusPanelProps) {
  const kind = controller.currentKind;
  if (!kind) return null;

  return (
    <section className="table-spec-card">
      <div>
        <h2>{tableConfigTitles[kind]}</h2>
        <p>导入/导出操作请使用顶部工具栏按钮。支持 CSV、XLS、XLSX、XML 格式。</p>
      </div>
      {controller.specs
        .filter((spec) => spec.kind === kind)
        .map((spec) => (
          <TableFormat
            key={spec.kind}
            spec={spec}
            title={`表头格式（${spec.headers.length} 列）`}
          />
        ))}
      {controller.importError ? (
        <p className="project-open-error" role="alert">
          {controller.importError}
        </p>
      ) : null}
      {controller.importReport ? (
        <div className="table-io-result">
          <div className="table-io-result-row">
            <span>导入校验</span>
            <strong className={controller.importReport.valid ? 'text-success' : 'text-danger'}>
              {controller.importReport.valid ? '通过' : '存在问题'}
            </strong>
          </div>
          <div className="table-io-result-row">
            <span>表头列数</span>
            <strong>{controller.importReport.table.actual_headers.length}</strong>
          </div>
          <div className="table-io-result-row">
            <span>写回段落</span>
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

interface TableFormatReferenceProps {
  specs: LegacyTableSpec[];
}

export function TableFormatReference({ specs }: TableFormatReferenceProps) {
  return (
    <section className="table-spec-card">
      <div>
        <h2>表格格式参考</h2>
        <p>SDO、PDO 简化表和多语言表的表头定义，导入前可快速确认目标格式。</p>
      </div>
      {specs.map((spec) => (
        <TableFormat key={spec.kind} spec={spec} title={tableSpecTitle(spec)} />
      ))}
    </section>
  );
}

function tableSpecTitle(spec: LegacyTableSpec) {
  const name =
    spec.kind === 'sdo' ? 'SDO 参数表' : spec.kind === 'pdoSimple' ? 'PDO 简化表' : '多语言表';
  return `${name}（${spec.headers.length} 列）`;
}

interface TableFormatProps {
  spec: LegacyTableSpec;
  title: string;
}

function TableFormat({ spec, title }: TableFormatProps) {
  return (
    <div className="table-format-ref">
      <strong>{title}</strong>
      <div className="table-format-chips">
        {spec.headers.map((header) => (
          <span className="table-format-chip" key={header}>
            {header}
          </span>
        ))}
      </div>
    </div>
  );
}

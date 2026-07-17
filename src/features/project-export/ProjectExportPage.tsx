import type { ProjectExportController } from './useProjectExport';

interface ProjectExportPageProps {
  controller: ProjectExportController;
}

export function ProjectExportPage({ controller }: ProjectExportPageProps) {
  const {
    outputDir: exportOutputDir,
    setOutputDir: setExportOutputDir,
    manifestFilename: exportManifestFilename,
    setManifestFilename: setExportManifestFilename,
    binaryFilename: exportBinaryFilename,
    setBinaryFilename: setExportBinaryFilename,
    exportReport,
    imageCopyReport,
    binaryReport,
    binaryCompareReport,
    error: exportError,
    isExporting,
    copyUiImages: handleCopyUiImages,
    buildBinaryReport: handleBuildBinaryReport,
    compareBinary: handleCompareBinary,
    selectOutputDir: handleSelectExportDir,
    exportPackage: handleExportPackage,
    openExportDir: handleOpenExportDir,
  } = controller;

  return (
    <section className="export-card">
      <div className="export-header">
        <div>
          <h2>项目导出</h2>
          <p>
            生成 jc_export、ConfigUpdate.json、UI 图片资源和 pdo_sdo_data.bin，用于设备配置发布。
          </p>
        </div>
        {exportReport ? (
          <button
            className="path-open-button"
            type="button"
            onClick={() => void handleOpenExportDir(exportReport.export_root)}
          >
            打开导出目录
          </button>
        ) : null}
      </div>
      <div className="export-form">
        <label>
          导出目录
          <input
            value={exportOutputDir}
            onChange={(event) => setExportOutputDir(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => void handleSelectExportDir()} disabled={isExporting}>
          选择目录
        </button>
        <button
          type="button"
          onClick={handleExportPackage}
          disabled={isExporting || exportOutputDir.trim() === ''}
        >
          {isExporting ? '导出中...' : '执行项目导出'}
        </button>
      </div>
      <div className="export-filename-grid">
        <label>
          JSON 文件名
          <input
            value={exportManifestFilename}
            onChange={(event) => setExportManifestFilename(event.target.value)}
            placeholder="ConfigUpdate.json"
          />
        </label>
        <label>
          Bin 文件名
          <input
            value={exportBinaryFilename}
            onChange={(event) => setExportBinaryFilename(event.target.value)}
            placeholder="pdo_sdo_data.bin"
          />
        </label>
      </div>
      {exportError ? (
        <p className="export-error" role="alert">
          {exportError}
        </p>
      ) : null}
      {exportReport ? (
        <section className="export-result-panel">
          <div className="export-result-header">
            <strong className="section-label--muted">导出结果</strong>
            <span>{exportReport.valid ? '有效' : '存在问题'}</span>
          </div>
          <div className="export-report export-report--primary">
            <article>
              <span>二进制大小 / CRC</span>
              <strong>
                {exportReport.binary.file_size} bytes / {exportReport.binary.crc}
              </strong>
            </article>
            <article>
              <span>图片复制</span>
              <strong>{exportReport.copied_images.length} 个文件</strong>
            </article>
            <article className="export-report__wide">
              <span>导出根目录</span>
              <strong>{exportReport.export_root}</strong>
            </article>
            <article className="export-report__wide">
              <span>JSON 文件</span>
              <strong>{exportReport.manifest_path}</strong>
            </article>
            <article className="export-report__wide">
              <span>Bin 文件</span>
              <strong>{exportReport.binary_path}</strong>
            </article>
          </div>
          {exportReport.errors.length > 0 ? (
            <p className="export-error export-message" role="alert">
              {exportReport.errors.join('；')}
            </p>
          ) : null}
          {exportReport.warnings.length > 0 ? (
            <p className="export-warning export-message">{exportReport.warnings.join('；')}</p>
          ) : null}
        </section>
      ) : null}
      <div className="section-divider" />
      <section className="export-tools-section">
        <div className="export-tools-header">
          <strong className="section-label--muted">辅助工具</strong>
          <div className="sample-actions">
            <button type="button" onClick={() => void handleCopyUiImages()}>
              仅复制 UI 图片
            </button>
            <button type="button" onClick={() => void handleBuildBinaryReport()}>
              生成二进制报告
            </button>
            <button type="button" onClick={() => void handleCompareBinary()}>
              选择参考 bin 对比
            </button>
          </div>
        </div>
        <div className="export-tool-grid">
          {imageCopyReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>图片复制</strong>
                <button
                  type="button"
                  onClick={() => void handleOpenExportDir(imageCopyReport.export_root)}
                >
                  打开目录
                </button>
              </div>
              <div className="export-report">
                <article>
                  <span>有效</span>
                  <strong>{imageCopyReport.valid ? '是' : '否'}</strong>
                </article>
                <article>
                  <span>复制数量</span>
                  <strong>{imageCopyReport.copied_files.length}</strong>
                </article>
                <article className="export-report__wide">
                  <span>导出根目录</span>
                  <strong>{imageCopyReport.export_root}</strong>
                </article>
              </div>
              {imageCopyReport.warnings.length > 0 ? (
                <p className="export-warning export-message">
                  {imageCopyReport.warnings.join('；')}
                </p>
              ) : null}
            </section>
          ) : null}
          {binaryReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>二进制报告</strong>
                <span>{binaryReport.valid ? '有效' : '存在问题'}</span>
              </div>
              <div className="export-report">
                <article>
                  <span>大小</span>
                  <strong>{binaryReport.file_size} bytes</strong>
                </article>
                <article>
                  <span>CRC</span>
                  <strong>{binaryReport.crc}</strong>
                </article>
                <article>
                  <span>语言数量</span>
                  <strong>{binaryReport.data_description.language_code.length}</strong>
                </article>
              </div>
              {binaryReport.warnings.length > 0 ? (
                <p className="export-warning export-message">{binaryReport.warnings.join('；')}</p>
              ) : null}
            </section>
          ) : null}
          {binaryCompareReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>参考 bin 对比</strong>
                <span>{binaryCompareReport.same ? '一致' : '不一致'}</span>
              </div>
              <div className="export-report">
                <article>
                  <span>生成/参考大小</span>
                  <strong>
                    {binaryCompareReport.generated_size} / {binaryCompareReport.legacy_size}
                  </strong>
                </article>
                <article>
                  <span>首个差异偏移</span>
                  <strong>{binaryCompareReport.first_diff_offset ?? '-'}</strong>
                </article>
                <article>
                  <span>生成/参考字节</span>
                  <strong>
                    {binaryCompareReport.generated_byte ?? '-'} /{' '}
                    {binaryCompareReport.legacy_byte ?? '-'}
                  </strong>
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </section>
  );
}

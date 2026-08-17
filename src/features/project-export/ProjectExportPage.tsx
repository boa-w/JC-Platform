import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectExportController } from './useProjectExport';
import './project-export.css';

interface ProjectExportPageProps {
  controller: ProjectExportController;
}

export function ProjectExportPage({ controller }: ProjectExportPageProps) {
  const { t } = useTranslation();
  const {
    outputDir: exportOutputDir,
    setOutputDir: setExportOutputDir,
    folderName: exportFolderName,
    setFolderName: setExportFolderName,
    manifestFilename: exportManifestFilename,
    setManifestFilename: setExportManifestFilename,
    binaryFilename: exportBinaryFilename,
    setBinaryFilename: setExportBinaryFilename,
    batteryMonitorExport,
    faultCodeExport,
    protocolProfiles,
    supportsV2Extensions,
    updateExportTarget,
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
    resetExportNaming: handleResetExportNaming,
    resetExportSettings: handleResetExportSettings,
    exportPackage: handleExportPackage,
    openExportDir: handleOpenExportDir,
  } = controller;

  return (
    <section className="export-card">
      <div className="export-header">
        <div>
          <h2>{t('projectExport.title')}</h2>
          <p>{t('projectExport.description')}</p>
        </div>
        {exportReport ? (
          <button
            className="path-open-button"
            type="button"
            onClick={() => void handleOpenExportDir(exportReport.export_root)}
          >
            {t('projectExport.openDirectory')}
          </button>
        ) : null}
      </div>
      <div className="export-form">
        <label>
          {t('projectExport.basePath')}
          <input
            value={exportOutputDir}
            onChange={(event) => setExportOutputDir(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => void handleSelectExportDir()} disabled={isExporting}>
          {t('projectExport.selectBasePath')}
        </button>
        <button
          type="button"
          onClick={handleExportPackage}
          disabled={isExporting || exportOutputDir.trim() === ''}
        >
          {t(isExporting ? 'common.status.exporting' : 'projectExport.execute')}
        </button>
      </div>
      {protocolProfiles ? (
        <div className="export-profile-summary" role="status">
          <strong>{t('projectExport.protocolProfile.title')}</strong>
          <span>
            {t('projectExport.protocolProfile.controllerActive', {
              id: protocolProfiles.active_controller_profile_id,
            })}
          </span>
          <span>
            {t('projectExport.protocolProfile.controllerCount', {
              count: protocolProfiles.controller_profiles.length,
            })}
          </span>
          <span>
            {t('projectExport.protocolProfile.batteryActive', {
              id: protocolProfiles.active_battery_profile_id ?? t('protocolProfiles.notConfigured'),
            })}
          </span>
          <span>
            {t('projectExport.protocolProfile.batteryCount', {
              count: protocolProfiles.battery_profiles.length,
            })}
          </span>
          <span>
            {t('projectExport.protocolProfile.faultActive', {
              id:
                protocolProfiles.active_fault_code_profile_id ??
                t('protocolProfiles.notConfigured'),
            })}
          </span>
          <span>
            {t('projectExport.protocolProfile.faultCount', {
              count: protocolProfiles.fault_code_profiles.length,
            })}
          </span>
          <small>{t('projectExport.protocolProfile.buildHint')}</small>
        </div>
      ) : null}
      <div className="export-filename-grid">
        <label>
          {t('projectExport.folderName')}
          <input
            value={exportFolderName}
            onChange={(event) => setExportFolderName(event.target.value)}
            placeholder="jc_export"
          />
        </label>
        <label>
          {t('projectExport.jsonFilename')}
          <input
            value={exportManifestFilename}
            onChange={(event) => setExportManifestFilename(event.target.value)}
            placeholder="ConfigUpdate.json"
          />
        </label>
        <label>
          {t('projectExport.binFilename')}
          <input
            value={exportBinaryFilename}
            onChange={(event) => setExportBinaryFilename(event.target.value)}
            placeholder="pdo_sdo_data.bin"
          />
        </label>
        <button
          className="export-naming-reset"
          type="button"
          onClick={handleResetExportNaming}
          disabled={isExporting}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {t('projectExport.restoreDefaultNames')}
        </button>
      </div>
      {supportsV2Extensions ? (
        <section className="export-write-controls">
          <div className="export-write-controls__header">
            <div>
              <strong className="section-label--muted">
                {t('projectExport.writeControls.title')}
              </strong>
              <p>{t('projectExport.writeControls.description')}</p>
            </div>
            <button
              className="export-naming-reset"
              type="button"
              onClick={handleResetExportSettings}
              disabled={isExporting}
            >
              {t('projectExport.restoreAllDefaults')}
            </button>
          </div>
          <div className="export-option-grid">
            <div className="export-option-grid__head">{t('projectExport.writeControls.item')}</div>
            <div className="export-option-grid__head">
              {t('projectExport.writeControls.writeConfig')}
            </div>
            <div className="export-option-grid__head">
              {t('projectExport.writeControls.writeBin')}
            </div>
            <div className="export-option-info">
              <span>{t('navigation.modules.batteryMonitor.title')}</span>
              <small>{t('projectExport.writeControls.batteryDescription')}</small>
            </div>
            <label className="export-check">
              <input
                aria-label={t('projectExport.writeControls.batteryConfigAria')}
                checked={batteryMonitorExport.config}
                disabled={isExporting}
                onChange={(event) =>
                  updateExportTarget('battery_monitor', 'config', event.target.checked)
                }
                type="checkbox"
              />
              <span>{t('projectExport.writeControls.configFile')}</span>
            </label>
            <label className="export-check">
              <input
                aria-label={t('projectExport.writeControls.batteryBinAria')}
                checked={batteryMonitorExport.bin}
                disabled={isExporting}
                onChange={(event) =>
                  updateExportTarget('battery_monitor', 'bin', event.target.checked)
                }
                type="checkbox"
              />
              <span>{t('projectExport.writeControls.binFile')}</span>
            </label>
            <div className="export-option-info">
              <span>{t('projectExport.writeControls.faultCodes')}</span>
              <small>{t('projectExport.writeControls.faultDescription')}</small>
            </div>
            <label className="export-check">
              <input
                aria-label={t('projectExport.writeControls.faultConfigAria')}
                checked={faultCodeExport.config}
                disabled={isExporting}
                onChange={(event) =>
                  updateExportTarget('fault_code_info', 'config', event.target.checked)
                }
                type="checkbox"
              />
              <span>{t('projectExport.writeControls.configFile')}</span>
            </label>
            <label className="export-check">
              <input
                aria-label={t('projectExport.writeControls.faultBinAria')}
                checked={faultCodeExport.bin}
                disabled={isExporting}
                onChange={(event) =>
                  updateExportTarget('fault_code_info', 'bin', event.target.checked)
                }
                type="checkbox"
              />
              <span>{t('projectExport.writeControls.binFile')}</span>
            </label>
          </div>
        </section>
      ) : null}
      {exportError ? (
        <p className="export-error" role="alert">
          {exportError}
        </p>
      ) : null}
      {exportReport ? (
        <section className="export-result-panel">
          <div className="export-result-header">
            <strong className="section-label--muted">{t('projectExport.result.title')}</strong>
            <span>{t(exportReport.valid ? 'projectExport.valid' : 'projectExport.hasIssues')}</span>
          </div>
          <div className="export-report export-report--primary">
            <article>
              <span>{t('projectExport.result.binarySizeCrc')}</span>
              <strong>
                {exportReport.binary.file_size} bytes / {exportReport.binary.crc}
              </strong>
            </article>
            <article>
              <span>{t('projectExport.imageCopy')}</span>
              <strong>
                {t('dashboard.gitSummary.fileCount', { count: exportReport.copied_images.length })}
              </strong>
            </article>
            <article className="export-report__wide">
              <span>{t('projectExport.exportRoot')}</span>
              <strong>{exportReport.export_root}</strong>
            </article>
            <article className="export-report__wide">
              <span>{t('projectExport.jsonFile')}</span>
              <strong>{exportReport.manifest_path}</strong>
            </article>
            <article className="export-report__wide">
              <span>{t('projectExport.binFile')}</span>
              <strong>{exportReport.binary_path}</strong>
            </article>
          </div>
          {exportReport.errors.length > 0 ? (
            <p className="export-error export-message" role="alert">
              {exportReport.errors.join(t('common.punctuation.semicolon'))}
            </p>
          ) : null}
          {exportReport.warnings.length > 0 ? (
            <p className="export-warning export-message">
              {exportReport.warnings.join(t('common.punctuation.semicolon'))}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="section-divider" />
      <section className="export-tools-section">
        <div className="export-tools-header">
          <strong className="section-label--muted">{t('projectExport.tools.title')}</strong>
          <div className="sample-actions">
            <button type="button" onClick={() => void handleCopyUiImages()}>
              {t('projectExport.tools.copyImages')}
            </button>
            <button type="button" onClick={() => void handleBuildBinaryReport()}>
              {t('projectExport.tools.binaryReport')}
            </button>
            <button type="button" onClick={() => void handleCompareBinary()}>
              {t('projectExport.tools.compareBin')}
            </button>
          </div>
        </div>
        <div className="export-tool-grid">
          {imageCopyReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>{t('projectExport.imageCopy')}</strong>
                <button
                  type="button"
                  onClick={() => void handleOpenExportDir(imageCopyReport.export_root)}
                >
                  {t('projectExport.openDirectoryShort')}
                </button>
              </div>
              <div className="export-report">
                <article>
                  <span>{t('projectManagement.parseReport.valid')}</span>
                  <strong>
                    {t(
                      imageCopyReport.valid
                        ? 'projectManagement.parseReport.yes'
                        : 'projectManagement.parseReport.no',
                    )}
                  </strong>
                </article>
                <article>
                  <span>{t('projectExport.copyCount')}</span>
                  <strong>{imageCopyReport.copied_files.length}</strong>
                </article>
                <article className="export-report__wide">
                  <span>{t('projectExport.exportRoot')}</span>
                  <strong>{imageCopyReport.export_root}</strong>
                </article>
              </div>
              {imageCopyReport.warnings.length > 0 ? (
                <p className="export-warning export-message">
                  {imageCopyReport.warnings.join(t('common.punctuation.semicolon'))}
                </p>
              ) : null}
            </section>
          ) : null}
          {binaryReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>{t('projectExport.tools.binaryReport')}</strong>
                <span>
                  {t(binaryReport.valid ? 'projectExport.valid' : 'projectExport.hasIssues')}
                </span>
              </div>
              <div className="export-report">
                <article>
                  <span>{t('projectExport.size')}</span>
                  <strong>{binaryReport.file_size} bytes</strong>
                </article>
                <article>
                  <span>CRC</span>
                  <strong>{binaryReport.crc}</strong>
                </article>
                <article>
                  <span>{t('projectExport.languageCount')}</span>
                  <strong>
                    {binaryReport.data_description.i18n_locale_total ??
                      binaryReport.data_description.language_code?.length ??
                      0}
                  </strong>
                </article>
              </div>
              {binaryReport.warnings.length > 0 ? (
                <p className="export-warning export-message">
                  {binaryReport.warnings.join(t('common.punctuation.semicolon'))}
                </p>
              ) : null}
            </section>
          ) : null}
          {binaryCompareReport ? (
            <section className="export-result-panel">
              <div className="export-result-header">
                <strong>{t('projectExport.tools.referenceCompare')}</strong>
                <span>
                  {t(binaryCompareReport.same ? 'projectExport.same' : 'projectExport.different')}
                </span>
              </div>
              <div className="export-report">
                <article>
                  <span>{t('projectExport.generatedReferenceSize')}</span>
                  <strong>
                    {binaryCompareReport.generated_size} / {binaryCompareReport.legacy_size}
                  </strong>
                </article>
                <article>
                  <span>{t('projectExport.firstDiffOffset')}</span>
                  <strong>{binaryCompareReport.first_diff_offset ?? '-'}</strong>
                </article>
                <article>
                  <span>{t('projectExport.generatedReferenceByte')}</span>
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

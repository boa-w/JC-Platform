import { Save, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { TranslationSettingsController } from '../../stores/translationSettings';
import type { ExportBatteryOptions } from '../../types/platform';
import './settings.css';

interface SettingsPageProps {
  exportOptions: ExportBatteryOptions;
  onUpdateExportOption: (
    section: keyof ExportBatteryOptions,
    target: 'config' | 'bin',
    value: boolean,
  ) => void;
  onResetExportOptions: () => void;
  translationController: TranslationSettingsController;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}
export function SettingsPage({
  exportOptions: exportBatteryOptions,
  onUpdateExportOption: updateExportBatteryOption,
  onResetExportOptions: resetExportBatteryOptions,
  translationController,
  theme,
  onToggleTheme,
}: SettingsPageProps) {
  const [pendingReset, setPendingReset] = useState<'export' | 'translation' | null>(null);
  const credentialStatusId = useId();
  const {
    desktopRuntime,
    error: credentialError,
    isBusy: credentialBusy,
    isClearing: credentialClearing,
    isLoading: credentialLoading,
    isSaving: credentialSaving,
    message: credentialMessage,
    resetSettings: resetTranslationSettings,
    saveSettings: saveTranslationSettings,
    settings: translationSettings,
    updateSetting: updateTranslationSetting,
  } = translationController;

  const confirmReset = () => {
    if (pendingReset === 'export') resetExportBatteryOptions();
    if (pendingReset === 'translation') resetTranslationSettings();
    setPendingReset(null);
  };

  const credentialStatus =
    credentialError ??
    credentialMessage ??
    (credentialLoading
      ? '正在读取系统凭据库...'
      : translationSettings.hasStoredAppKey
        ? 'API Key 已由系统凭据库保护。'
        : '尚未保存翻译凭据。');
  const saveCredentialsDisabled =
    credentialLoading ||
    credentialBusy ||
    !desktopRuntime ||
    !translationSettings.baiduAppId.trim() ||
    (!translationSettings.hasStoredAppKey && !translationSettings.baiduAppKey.trim());
  const clearCredentialsDisabled =
    credentialLoading ||
    credentialBusy ||
    (!translationSettings.hasStoredAppKey &&
      !translationSettings.baiduAppId.trim() &&
      !translationSettings.baiduAppKey.trim());

  return (
    <>
      <section className="project-open-card">
        <div>
          <h2>软件设置</h2>
          <p>管理导出写入控制、外观主题等软件级偏好设置。</p>
        </div>
        <strong className="section-label--muted">导出写入控制</strong>
        <div className="settings-option-grid">
          <div className="settings-option-grid__head">配置项</div>
          <div className="settings-option-grid__head">写入 ConfigUpdate.json</div>
          <div className="settings-option-grid__head">写入 pdo_sdo_data.bin</div>
          <div className="settings-option-info">
            <span>锂电监控协议</span>
            <small>统一控制 battery_monitor 是否写入 ConfigUpdate.json 和 pdo_sdo_data.bin。</small>
          </div>
          <label className="settings-check">
            <input
              aria-label="锂电监控协议：写入 ConfigUpdate.json"
              checked={exportBatteryOptions.battery_monitor.config}
              onChange={(event) =>
                updateExportBatteryOption('battery_monitor', 'config', event.target.checked)
              }
              type="checkbox"
            />
            <span>配置文件</span>
          </label>
          <label className="settings-check">
            <input
              aria-label="锂电监控协议：写入 pdo_sdo_data.bin"
              checked={exportBatteryOptions.battery_monitor.bin}
              onChange={(event) =>
                updateExportBatteryOption('battery_monitor', 'bin', event.target.checked)
              }
              type="checkbox"
            />
            <span>bin 文件</span>
          </label>
          <div className="settings-option-info">
            <span>故障码配置</span>
            <small>控制 fault_code_info 是否写入导出清单描述和 fault code 二进制段。</small>
          </div>
          <label className="settings-check">
            <input
              aria-label="故障码配置：写入 ConfigUpdate.json"
              checked={exportBatteryOptions.fault_code_info.config}
              onChange={(event) =>
                updateExportBatteryOption('fault_code_info', 'config', event.target.checked)
              }
              type="checkbox"
            />
            <span>配置文件</span>
          </label>
          <label className="settings-check">
            <input
              aria-label="故障码配置：写入 pdo_sdo_data.bin"
              checked={exportBatteryOptions.fault_code_info.bin}
              onChange={(event) =>
                updateExportBatteryOption('fault_code_info', 'bin', event.target.checked)
              }
              type="checkbox"
            />
            <span>bin 文件</span>
          </label>
        </div>
        <div className="settings-option-footer">
          <span>该设置影响项目导出、二进制报告和 bin 对比。</span>
          <button type="button" onClick={() => setPendingReset('export')}>
            恢复默认
          </button>
        </div>
        <strong className="section-label--muted">翻译服务</strong>
        <div className="settings-service-panel">
          <div className="settings-service-info">
            <span>百度翻译</span>
            <small>用于多国语言管理页的一键条目翻译。</small>
          </div>
          <label className="settings-field">
            <span>App ID</span>
            <input
              autoComplete="off"
              disabled={credentialLoading || credentialBusy}
              value={translationSettings.baiduAppId}
              onChange={(event) => updateTranslationSetting('baiduAppId', event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input
              aria-describedby={credentialStatusId}
              autoComplete="new-password"
              disabled={credentialLoading || credentialBusy}
              placeholder={
                translationSettings.hasStoredAppKey ? '已安全保存；输入新值可替换' : '输入 API Key'
              }
              type="password"
              value={translationSettings.baiduAppKey}
              onChange={(event) => updateTranslationSetting('baiduAppKey', event.target.value)}
            />
          </label>
          <div className="settings-option-footer settings-option-footer--compact">
            <span
              className={
                credentialError
                  ? 'settings-credential-status settings-credential-status--error'
                  : 'settings-credential-status'
              }
              id={credentialStatusId}
              role={credentialError ? 'alert' : 'status'}
            >
              <ShieldCheck aria-hidden="true" size={14} strokeWidth={1.8} />
              {credentialStatus}
            </span>
            <div className="settings-credential-actions">
              <button
                className="settings-primary-action"
                disabled={saveCredentialsDisabled}
                onClick={() => void saveTranslationSettings()}
                type="button"
              >
                <Save aria-hidden="true" size={14} strokeWidth={1.8} />
                {credentialSaving ? '保存中' : '保存凭据'}
              </button>
              <button
                disabled={clearCredentialsDisabled}
                onClick={() => setPendingReset('translation')}
                type="button"
              >
                {credentialClearing ? '清空中' : '清空配置'}
              </button>
            </div>
          </div>
          <small className="settings-credential-privacy">
            桌面端使用 Windows 凭据管理器或 macOS Keychain，不写入项目和浏览器存储。
          </small>
        </div>
        <strong className="section-label--muted">外观</strong>
        <div className="theme-toggle-row">
          <div className="theme-toggle-info">
            <span>主题模式</span>
            <small>{theme === 'dark' ? '深色模式' : '浅色模式'}</small>
          </div>
          <button
            aria-checked={theme === 'dark'}
            aria-label="深色模式"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            role="switch"
            type="button"
          >
            <span
              className={`theme-toggle-track ${theme === 'dark' ? 'theme-toggle-track--dark' : ''}`}
            >
              <span className="theme-toggle-thumb" />
            </span>
          </button>
        </div>
      </section>
      {pendingReset ? (
        <ConfirmDialog
          confirmLabel={pendingReset === 'translation' ? '清空配置' : '恢复默认'}
          danger={pendingReset === 'translation'}
          message={
            pendingReset === 'translation'
              ? '将从本机删除百度翻译 App ID 和 API Key。此操作无法撤销。'
              : '将恢复所有导出写入控制的默认值。此操作不会修改当前项目内容。'
          }
          onCancel={() => setPendingReset(null)}
          onConfirm={confirmReset}
          title={pendingReset === 'translation' ? '清空翻译配置？' : '恢复导出默认设置？'}
        />
      ) : null}
    </>
  );
}

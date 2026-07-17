import type { ExportBatteryOptions } from '../../types/platform';
import type { TranslationSettings } from '../../stores/translationSettings';

interface SettingsPageProps {
  exportOptions: ExportBatteryOptions;
  onUpdateExportOption: (
    section: keyof ExportBatteryOptions,
    target: 'config' | 'bin',
    value: boolean,
  ) => void;
  onResetExportOptions: () => void;
  translationSettings: TranslationSettings;
  onUpdateTranslationSetting: (key: keyof TranslationSettings, value: string) => void;
  onResetTranslationSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}
export function SettingsPage({
  exportOptions: exportBatteryOptions,
  onUpdateExportOption: updateExportBatteryOption,
  onResetExportOptions: resetExportBatteryOptions,
  translationSettings,
  onUpdateTranslationSetting: updateTranslationSetting,
  onResetTranslationSettings: resetTranslationSettings,
  theme,
  onToggleTheme,
}: SettingsPageProps) {
  return (
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
                <span>锂电协议</span>
                <small>控制 battery_protocol 是否随完整导出写入配置文件或设备 bin。</small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_protocol.config}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_protocol', 'config', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_protocol.bin}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_protocol', 'bin', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
              <div className="settings-option-info">
                <span>锂电协议监控</span>
                <small>
                  控制 battery_monitor_info 是否写入导出清单描述和 battery monitor 二进制段。
                </small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.config}
                  onChange={(event) =>
                    updateExportBatteryOption(
                      'battery_monitor_info',
                      'config',
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.bin}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_monitor_info', 'bin', event.target.checked)
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
              <button type="button" onClick={resetExportBatteryOptions}>
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
                  value={translationSettings.baiduAppId}
                  onChange={(event) => updateTranslationSetting('baiduAppId', event.target.value)}
                />
              </label>
              <label className="settings-field">
                <span>API Key</span>
                <input
                  autoComplete="new-password"
                  type="password"
                  value={translationSettings.baiduAppKey}
                  onChange={(event) => updateTranslationSetting('baiduAppKey', event.target.value)}
                />
              </label>
              <div className="settings-option-footer settings-option-footer--compact">
                <span>配置保存在本机软件设置中，不写入项目文件。</span>
                <button type="button" onClick={resetTranslationSettings}>
                  清空配置
                </button>
              </div>
            </div>
            <strong className="section-label--muted">外观</strong>
            <div className="theme-toggle-row">
              <div className="theme-toggle-info">
                <span>主题模式</span>
                <small>{theme === 'dark' ? '深色模式' : '浅色模式'}</small>
              </div>
              <button className="theme-toggle-btn" onClick={onToggleTheme} type="button">
                <span
                  className={`theme-toggle-track ${theme === 'dark' ? 'theme-toggle-track--dark' : ''}`}
                >
                  <span className="theme-toggle-thumb" />
                </span>
              </button>
            </div>
          </section>
  );
}

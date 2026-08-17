import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileJson,
  GripVertical,
  Import,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import {
  localizationForScope,
  localizationToLanguageDocument,
} from '../../components/language/localizationAdapter';
import { ProtocolProfileBar } from '../../components/protocol/ProtocolProfileBar';
import type {
  LanguageDocument,
  LoadedProject,
  LocalizationDocument,
  LocalizationMessage,
} from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { readProtocolProfiles } from '../protocol-profiles/protocolProfiles';
import type { BatteryValidationIssue } from './batteryMonitorValidation';
import type { BatteryMonitorController } from './useBatteryMonitorController';
import './BatteryMonitorPage.css';

type BatteryWorkspace = 'overview' | 'frames' | 'signals' | 'items' | 'validation';

const rawTypeOptions = [
  ['u8', 'batteryMonitor.rawTypes.u8'],
  ['u16_le', 'batteryMonitor.rawTypes.u16Le'],
  ['u32_le', 'batteryMonitor.rawTypes.u32Le'],
  ['datetime_ymdhms', 'batteryMonitor.rawTypes.datetimeYmdhms'],
] as const;

const valueTypeOptions = [
  ['u8', 'batteryMonitor.valueTypes.u8'],
  ['u16', 'batteryMonitor.valueTypes.u16'],
  ['u32', 'batteryMonitor.valueTypes.u32'],
  ['f32', 'batteryMonitor.valueTypes.f32'],
  ['datetime', 'batteryMonitor.valueTypes.datetime'],
] as const;

const formatterOptions = [
  ['linear', 'batteryMonitor.formatters.linear'],
  ['linear_u8_wrap', 'batteryMonitor.formatters.linearU8Wrap'],
  ['bool_text', 'batteryMonitor.formatters.boolText'],
  ['hex', 'batteryMonitor.formatters.hex'],
  ['packed_time_0p1h', 'batteryMonitor.formatters.packedTime'],
  ['packed_time_legacy_discharge_0p1h', 'batteryMonitor.formatters.packedTimeLegacyDischarge'],
  ['datetime', 'batteryMonitor.formatters.datetime'],
] as const;

const localeLabels: Record<string, string> = {
  zh: '中文',
  'zh-CN': '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
};

function parseMask(value: string) {
  const text = value.trim();
  const parsed = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(0xffffffff, Math.trunc(parsed)))
    : 0xffffffff;
}

function languageDocumentFor(project: LoadedProject | null): LanguageDocument {
  const localization = localizationFor(project);
  if (localization) return localizationToLanguageDocument(localization);
  return { list_code_language: [], list_inner: [], list_translate: {} };
}

function localizationFor(project: LoadedProject | null) {
  const document = project?.document as Record<string, unknown> | undefined;
  const localization = document?.localization as LocalizationDocument | undefined;
  if (!localization) return undefined;
  const profiles = readProtocolProfiles(document);
  const profileId = profiles?.active_battery_profile_id;
  return localizationForScope(
    localization,
    profiles ?? undefined,
    profileId ? { kind: 'battery', profileId } : { kind: 'common' },
  );
}

function localizedValue(value: LocalizationMessage | undefined) {
  if (typeof value === 'string') return value;
  return value?.other ?? '';
}

function localizedText(
  project: LoadedProject | null,
  key: string,
  locale: string,
  fallback: string,
) {
  const localization = localizationFor(project);
  if (localization) {
    const value = localization.locales[locale]?.translations[key];
    return localizedValue(value) || fallback;
  }
  return fallback;
}

function confirmDelete(message: string) {
  return typeof window === 'undefined' || window.confirm(message);
}

function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`battery-field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  icon,
  disabled,
  danger,
  title,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      className={`battery-tool-button${danger ? ' battery-tool-button--danger' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function IssueRow({
  issue,
  message,
  onClick,
}: {
  issue: BatteryValidationIssue;
  message: string;
  onClick?: () => void;
}) {
  const Icon = issue.severity === 'error' ? CircleAlert : AlertTriangle;
  return (
    <button
      className={`battery-validation-issue battery-validation-issue--${issue.severity}`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={15} />
      <span>{message}</span>
      {onClick ? <ChevronRight aria-hidden="true" size={15} /> : null}
    </button>
  );
}

interface BatteryMonitorPageProps {
  loadedProject: LoadedProject | null;
  controller: BatteryMonitorController;
}

export function BatteryMonitorPage({ loadedProject, controller }: BatteryMonitorPageProps) {
  const { t } = useTranslation();
  const {
    currentBatteryMonitorDocument,
    onUpdateSections,
    batteryValidation,
    isBatteryMonitorSupported,
    hasBatteryMonitor,
    batteryMonitorExportStatus,
    batteryMonitorImportStatus,
    batteryCsvStatus,
    batteryDbcStatus,
    isExportingBatteryMonitor,
    isImportingBatteryMonitor,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    isExportingBatteryDbc,
    isImportingBatteryDbc,
    handleExportBatteryMonitor,
    handleImportBatteryMonitor,
    handleExportBatteryFramesCsv,
    handleImportBatteryFramesCsv,
    handleExportBatterySignalsCsv,
    handleImportBatterySignalsCsv,
    handleExportBatteryItemsCsv,
    handleImportBatteryItemsCsv,
    handleExportBatteryDbc,
    handleImportBatteryDbc,
    updateBatteryMonitorField,
    initializeBatteryMonitor,
    updateBatteryFrame,
    updateBatteryFrameId,
    addBatteryFrame,
    removeBatteryFrame,
    updateBatterySignal,
    addBatterySignal,
    removeBatterySignal,
    updateBatteryItem,
    updateBatteryItemFormatter,
    updateBatteryItemValidity,
    updateBatteryItemLanguage,
    addBatteryItem,
    removeBatteryItem,
    moveBatteryItem,
    formatFrameId,
    isModifiedPath,
    restoreModifiedPath,
  } = controller;
  const [workspace, setWorkspace] = useState<BatteryWorkspace>('overview');
  const [frameIndex, setFrameIndex] = useState(0);
  const [signalIndex, setSignalIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [frameQuery, setFrameQuery] = useState('');
  const [signalQuery, setSignalQuery] = useState('');
  const [signalFrameFilter, setSignalFrameFilter] = useState('all');
  const [itemQuery, setItemQuery] = useState('');
  const [selectedLocale, setSelectedLocale] = useState('zh');
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const language = useMemo(() => languageDocumentFor(loadedProject), [loadedProject]);
  const localization = localizationFor(loadedProject);
  const localeOrder = localization?.locale_order ?? language.list_code_language;
  const selectedFrame = currentBatteryMonitorDocument.frames[frameIndex];
  const selectedItem = currentBatteryMonitorDocument.items[itemIndex];
  const issueMessage = (issue: BatteryValidationIssue) =>
    t(`batteryMonitor.validation.messages.${issue.code}`, issue.values);

  useEffect(() => {
    if (frameIndex >= currentBatteryMonitorDocument.frames.length) setFrameIndex(0);
    if (signalIndex >= currentBatteryMonitorDocument.signals.length) setSignalIndex(0);
    if (itemIndex >= currentBatteryMonitorDocument.items.length) setItemIndex(0);
  }, [
    currentBatteryMonitorDocument.frames.length,
    currentBatteryMonitorDocument.signals.length,
    currentBatteryMonitorDocument.items.length,
    frameIndex,
    signalIndex,
    itemIndex,
  ]);

  useEffect(() => {
    if (!localeOrder.includes(selectedLocale)) setSelectedLocale(localeOrder[0] ?? 'zh');
  }, [localeOrder, selectedLocale]);

  if (!loadedProject) {
    return (
      <section className="table-spec-card">
        <EmptyState>{t('batteryMonitor.openProjectFirst')}</EmptyState>
      </section>
    );
  }

  if (!isBatteryMonitorSupported) {
    return (
      <section className="table-spec-card">
        <EmptyState>{t('batteryMonitor.unsupportedProject')}</EmptyState>
      </section>
    );
  }

  const frames = currentBatteryMonitorDocument.frames;
  const signals = currentBatteryMonitorDocument.signals;
  const items = currentBatteryMonitorDocument.items;
  const filteredFrames = frames.filter((frame) =>
    `${frame.frame_key} ${formatFrameId(frame.can_id)} ${frame.desc}`
      .toLowerCase()
      .includes(frameQuery.trim().toLowerCase()),
  );
  const filteredSignals = signals
    .map((signal, index) => ({ signal, index }))
    .filter(({ signal }) => signalFrameFilter === 'all' || signal.frame_key === signalFrameFilter)
    .filter(({ signal }) =>
      `${signal.signal_key} ${signal.name}`
        .toLowerCase()
        .includes(signalQuery.trim().toLowerCase()),
    );
  const filteredItems = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.order - right.item.order || left.index - right.index)
    .filter(({ item }) =>
      `${item.item_key} ${item.name_key} ${item.fallback_name} ${item.signal_key}`
        .toLowerCase()
        .includes(itemQuery.trim().toLowerCase()),
    );
  const selectedItemText = selectedItem
    ? localizedText(
        loadedProject,
        selectedItem.name_key,
        selectedLocale,
        selectedItem.fallback_name || selectedItem.item_key,
      )
    : '';
  const selectedItemHasTranslation = Boolean(
    localization?.locales[selectedLocale]?.translations[selectedItem?.name_key ?? ''],
  );

  function goToIssue(issue: BatteryValidationIssue) {
    const section = issue.path[1];
    const index = Number(issue.path[2]);
    if (section === 'frames') {
      setFrameIndex(Number.isInteger(index) ? index : 0);
      setWorkspace('frames');
    } else if (section === 'signals') {
      setSignalIndex(Number.isInteger(index) ? index : 0);
      setWorkspace('signals');
    } else if (section === 'items') {
      setItemIndex(Number.isInteger(index) ? index : 0);
      setWorkspace('items');
    } else {
      setWorkspace('overview');
    }
  }

  function handleDeleteFrame() {
    if (
      selectedFrame &&
      confirmDelete(t('batteryMonitor.confirmDelete.frame', { key: selectedFrame.frame_key }))
    )
      removeBatteryFrame(frameIndex);
  }

  function handleDeleteItem() {
    if (
      selectedItem &&
      confirmDelete(t('batteryMonitor.confirmDelete.item', { key: selectedItem.item_key }))
    )
      removeBatteryItem(itemIndex);
  }

  function renderValidationSummary() {
    const issues = [...batteryValidation.errors, ...batteryValidation.warnings].slice(0, 5);
    return (
      <div className="battery-validation-summary">
        <div className="battery-validation-summary-header">
          <div>
            <span className="battery-kicker">{t('batteryMonitor.validation.kicker')}</span>
            <strong>
              {batteryValidation.valid
                ? t('batteryMonitor.validation.valid')
                : t('batteryMonitor.validation.invalid')}
            </strong>
          </div>
          <button onClick={() => setWorkspace('validation')} type="button">
            {t('batteryMonitor.validation.viewAll')}
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
        {issues.length > 0 ? (
          <div className="battery-validation-list">
            {issues.map((issue) => (
              <IssueRow
                issue={issue}
                key={`${issue.code}-${issue.path.join('.')}-${JSON.stringify(issue.values ?? {})}`}
                message={issueMessage(issue)}
                onClick={() => goToIssue(issue)}
              />
            ))}
          </div>
        ) : (
          <p className="battery-validation-empty">
            <Check aria-hidden="true" size={15} />
            {t('batteryMonitor.validation.noIssues')}
          </p>
        )}
      </div>
    );
  }

  function renderOverview() {
    return (
      <div className="battery-overview-grid">
        <section className="battery-overview-panel battery-overview-panel--wide">
          <div className="battery-panel-heading">
            <div>
              <span className="battery-kicker">{t('batteryMonitor.overview.contractKicker')}</span>
              <h3>{t('batteryMonitor.overview.contractTitle')}</h3>
            </div>
            <span className="battery-version-badge battery-version-badge--v2">
              JCPro V2 / Battery V2
            </span>
          </div>
          <div className="battery-contract-grid">
            <div>
              <span>{t('batteryMonitor.overview.schema')}</span>
              <strong>schema_version = 2</strong>
            </div>
            <div>
              <span>{t('batteryMonitor.overview.binary')}</span>
              <strong>version = 2</strong>
            </div>
            <div>
              <span>{t('batteryMonitor.overview.languageSource')}</span>
              <strong>localization</strong>
            </div>
            <div>
              <span>{t('batteryMonitor.overview.configState')}</span>
              <strong>
                {hasBatteryMonitor
                  ? t('batteryMonitor.overview.configured')
                  : t('batteryMonitor.overview.notConfigured')}
              </strong>
            </div>
          </div>
          {!hasBatteryMonitor ? (
            <div className="battery-setup-callout">
              <Database aria-hidden="true" size={18} />
              <div>
                <strong>{t('batteryMonitor.setup.title')}</strong>
                <p>{t('batteryMonitor.setup.message')}</p>
              </div>
              <ActionButton
                icon={<Plus aria-hidden="true" size={15} />}
                onClick={initializeBatteryMonitor}
              >
                {t('batteryMonitor.setup.initialize')}
              </ActionButton>
            </div>
          ) : null}
        </section>
        <section className="battery-overview-panel">
          <div className="battery-panel-heading">
            <div>
              <span className="battery-kicker">{t('batteryMonitor.overview.runtimeKicker')}</span>
              <h3>{t('batteryMonitor.overview.runtimeTitle')}</h3>
            </div>
            <Settings2 aria-hidden="true" size={18} />
          </div>
          <div className="battery-runtime-form">
            <Field label={t('batteryMonitor.enabled')}>
              <select
                value={currentBatteryMonitorDocument.enabled ? 1 : 0}
                onChange={(event) =>
                  updateBatteryMonitorField('enabled', Number(event.target.value) === 1)
                }
              >
                <option value={1}>{t('batteryMonitor.enabled')}</option>
                <option value={0}>{t('batteryMonitor.disabled')}</option>
              </select>
            </Field>
            <Field label={t('batteryMonitor.fields.defaultTimeout')}>
              <input
                min={0}
                type="number"
                value={currentBatteryMonitorDocument.default_timeout_ticks}
                onChange={(event) =>
                  updateBatteryMonitorField('default_timeout_ticks', Number(event.target.value))
                }
              />
            </Field>
            <Field label={t('batteryMonitor.fields.pageSize')}>
              <input
                max={64}
                min={1}
                type="number"
                value={currentBatteryMonitorDocument.page_size}
                onChange={(event) =>
                  updateBatteryMonitorField('page_size', Number(event.target.value))
                }
              />
            </Field>
          </div>
          <p className="battery-panel-note">{t('batteryMonitor.overview.runtimeNote')}</p>
        </section>
        <section className="battery-overview-panel battery-overview-panel--wide">
          <div className="battery-panel-heading">
            <div>
              <span className="battery-kicker">{t('batteryMonitor.overview.workflowKicker')}</span>
              <h3>{t('batteryMonitor.overview.workflowTitle')}</h3>
            </div>
          </div>
          <div className="battery-workflow-grid">
            {(['frames', 'signals', 'items', 'validation'] as const).map((key, index) => (
              <button
                className="battery-workflow-card"
                key={key}
                onClick={() => setWorkspace(key)}
                type="button"
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{t(`batteryMonitor.workspaces.${key}`)}</strong>
                  <small>{t(`batteryMonitor.workflow.${key}`)}</small>
                </div>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            ))}
          </div>
        </section>
        <div className="battery-overview-panel battery-overview-panel--wide">
          {renderValidationSummary()}
        </div>
      </div>
    );
  }

  function renderFrameEditor() {
    if (!selectedFrame)
      return <div className="battery-detail-empty">{t('batteryMonitor.frames.select')}</div>;
    return (
      <div className="battery-detail-panel">
        <div className="battery-detail-heading">
          <div>
            <span className="battery-kicker">{t('batteryMonitor.frames.detailKicker')}</span>
            <h3>{selectedFrame.frame_key}</h3>
          </div>
          <div className="battery-detail-actions">
            {isModifiedPath(['battery_monitor', 'frames', frameIndex]) ? (
              <ActionButton
                icon={<RotateCcw aria-hidden="true" size={15} />}
                onClick={() => restoreModifiedPath(['battery_monitor', 'frames', frameIndex])}
              >
                {t('common.actions.restore')}
              </ActionButton>
            ) : null}
            <ActionButton
              danger
              icon={<Trash2 aria-hidden="true" size={15} />}
              onClick={handleDeleteFrame}
            >
              {t('common.actions.delete')}
            </ActionButton>
          </div>
        </div>
        <div className="battery-form-grid">
          <Field label="frame_key">
            <input
              value={selectedFrame.frame_key}
              onChange={(event) => updateBatteryFrame(frameIndex, 'frame_key', event.target.value)}
            />
          </Field>
          <Field label="CAN ID" hint={t('batteryMonitor.frames.canIdHint')}>
            <input
              value={formatFrameId(selectedFrame.can_id)}
              onChange={(event) => updateBatteryFrameId(frameIndex, event.target.value)}
            />
          </Field>
          <Field label={t('batteryMonitor.frames.type')}>
            <select
              value={selectedFrame.frame_type}
              onChange={(event) =>
                updateBatteryFrame(frameIndex, 'frame_type', Number(event.target.value))
              }
            >
              <option value={0}>{t('batteryMonitor.frameTypes.standard')}</option>
              <option value={1}>{t('batteryMonitor.frameTypes.extended')}</option>
            </select>
          </Field>
          <Field label="DLC">
            <input
              max={8}
              min={1}
              type="number"
              value={selectedFrame.dlc}
              onChange={(event) =>
                updateBatteryFrame(frameIndex, 'dlc', Number(event.target.value))
              }
            />
          </Field>
          <Field className="battery-form-grid__wide" label={t('batteryMonitor.frames.description')}>
            <input
              value={selectedFrame.desc}
              onChange={(event) => updateBatteryFrame(frameIndex, 'desc', event.target.value)}
            />
          </Field>
          <Field label={t('batteryMonitor.frames.timeout')}>
            <input
              min={0}
              type="number"
              value={selectedFrame.timeout_ticks}
              onChange={(event) =>
                updateBatteryFrame(frameIndex, 'timeout_ticks', Number(event.target.value))
              }
            />
          </Field>
        </div>
        <div className="battery-detail-footer">
          <span>
            {t('batteryMonitor.frames.signalCount', {
              count: signals.filter((signal) => signal.frame_key === selectedFrame.frame_key)
                .length,
            })}
          </span>
          <button
            onClick={() => {
              setSignalFrameFilter(selectedFrame.frame_key);
              setWorkspace('signals');
            }}
            type="button"
          >
            {t('batteryMonitor.frames.viewSignals')}
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderFrames() {
    return (
      <div className="battery-editor-split">
        <aside className="battery-collection-panel">
          <div className="battery-collection-header">
            <div>
              <strong>{t('batteryMonitor.frames.title', { count: frames.length })}</strong>
              <small>{t('batteryMonitor.frames.collectionHint')}</small>
            </div>
            <button
              aria-label={t('batteryMonitor.actions.addFrame')}
              onClick={addBatteryFrame}
              title={t('batteryMonitor.actions.addFrame')}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
          <label className="battery-search-field">
            <Search aria-hidden="true" size={15} />
            <input
              value={frameQuery}
              onChange={(event) => setFrameQuery(event.target.value)}
              placeholder={t('batteryMonitor.frames.search')}
            />
            {frameQuery ? (
              <button
                aria-label={t('common.actions.clear')}
                onClick={() => setFrameQuery('')}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            ) : null}
          </label>
          <div className="battery-collection-list">
            {filteredFrames.map((frame) => {
              const index = frames.indexOf(frame);
              const frameSignals = signals.filter(
                (signal) => signal.frame_key === frame.frame_key,
              ).length;
              return (
                <button
                  className={`battery-collection-row${frameIndex === index ? ' is-selected' : ''}`}
                  key={`${frame.frame_key}-${index}`}
                  onClick={() => setFrameIndex(index)}
                  type="button"
                >
                  <span className="battery-collection-status" />
                  <span className="battery-collection-copy">
                    <strong>{frame.frame_key || t('batteryMonitor.frames.unnamed')}</strong>
                    <small>
                      {formatFrameId(frame.can_id)} · DLC {frame.dlc} ·{' '}
                      {t('batteryMonitor.frames.signalCount', { count: frameSignals })}
                    </small>
                  </span>
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              );
            })}
            {filteredFrames.length === 0 ? (
              <p className="battery-collection-empty">{t('batteryMonitor.frames.noMatch')}</p>
            ) : null}
          </div>
        </aside>
        {renderFrameEditor()}
      </div>
    );
  }

  function renderSignals() {
    const signalHeader = (code: string, label: string, description?: string) => (
      <span className="battery-signal-header" title={description}>
        <span className="battery-signal-header-code">{code}</span>
        <span className="battery-signal-header-label">{label}</span>
        {description ? <span className="visually-hidden">{description}</span> : null}
      </span>
    );

    return (
      <div className="battery-signal-workspace">
        <div className="battery-signal-table-toolbar">
          <div>
            <strong>{t('batteryMonitor.signals.title', { count: signals.length })}</strong>
            <small>{t('batteryMonitor.signals.collectionHint')}</small>
          </div>
          <div className="battery-signal-table-controls">
            <label className="battery-search-field">
              <Search aria-hidden="true" size={15} />
              <input
                value={signalQuery}
                onChange={(event) => setSignalQuery(event.target.value)}
                placeholder={t('batteryMonitor.signals.search')}
              />
              {signalQuery ? (
                <button
                  aria-label={t('common.actions.clear')}
                  onClick={() => setSignalQuery('')}
                  type="button"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              ) : null}
            </label>
            <select
              className="battery-collection-filter"
              value={signalFrameFilter}
              onChange={(event) => setSignalFrameFilter(event.target.value)}
              aria-label={t('batteryMonitor.signals.allFrames')}
            >
              <option value="all">{t('batteryMonitor.signals.allFrames')}</option>
              {frames.map((frame) => (
                <option key={frame.frame_key} value={frame.frame_key}>
                  {frame.frame_key}
                </option>
              ))}
            </select>
            <button
              aria-label={t('batteryMonitor.actions.addSignal')}
              className="battery-table-add-button"
              onClick={addBatterySignal}
              title={t('batteryMonitor.actions.addSignal')}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              <span>{t('batteryMonitor.actions.addSignal')}</span>
            </button>
          </div>
        </div>
        <div className="config-table-frame battery-signal-table-frame">
          <table className="config-table battery-monitor-signal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>
                  {signalHeader(
                    'signal_key',
                    t('batteryMonitor.signalHeaders.signalKey'),
                    t('batteryMonitor.signalHeaders.signalKeyHint'),
                  )}
                </th>
                <th>
                  {signalHeader(
                    'name',
                    t('batteryMonitor.signalHeaders.name'),
                    t('batteryMonitor.signalHeaders.nameHint'),
                  )}
                </th>
                <th>{signalHeader('frame_key', t('batteryMonitor.signalHeaders.frame'))}</th>
                <th>{signalHeader('pos / len', t('batteryMonitor.signalHeaders.posLen'))}</th>
                <th>{signalHeader('raw_offset', t('batteryMonitor.signalHeaders.rawOffset'))}</th>
                <th>{signalHeader('raw_type', t('batteryMonitor.signalHeaders.rawType'))}</th>
                <th>{signalHeader('value_type', t('batteryMonitor.signalHeaders.valueType'))}</th>
                <th>{signalHeader('byte_order', t('batteryMonitor.signalHeaders.byteOrder'))}</th>
                <th>{signalHeader('resolution', t('batteryMonitor.signalHeaders.resolution'))}</th>
                <th>{signalHeader('offset', t('batteryMonitor.signalHeaders.offset'))}</th>
                <th>{signalHeader('mask / shift', t('batteryMonitor.signalHeaders.mask'))}</th>
                <th>{signalHeader('receiver / comment', t('batteryMonitor.signals.receiver'))}</th>
                <th>{t('protocol.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSignals.map(({ signal, index }) => {
                const signalPath = ['battery_monitor', 'signals', index] as JsonPath;
                const modified = isModifiedPath(signalPath);
                return (
                  <tr
                    className={
                      [
                        signalIndex === index ? 'battery-signal-row-selected' : '',
                        modified ? 'config-entry-modified' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    key={`${signal.signal_key}-${index}`}
                    onClick={() => setSignalIndex(index)}
                  >
                    <td className="battery-signal-index">{index + 1}</td>
                    <td>
                      <input
                        aria-label={`signal ${index + 1} signal_key`}
                        className="battery-table-input battery-table-input--key"
                        value={signal.signal_key}
                        onChange={(event) =>
                          updateBatterySignal(index, 'signal_key', event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`signal ${index + 1} name`}
                        className="battery-table-input"
                        value={signal.name}
                        onChange={(event) => updateBatterySignal(index, 'name', event.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`signal ${index + 1} frame_key`}
                        className="battery-table-input"
                        value={signal.frame_key}
                        onChange={(event) =>
                          updateBatterySignal(index, 'frame_key', event.target.value)
                        }
                      >
                        {frames.map((frame) => (
                          <option key={frame.frame_key} value={frame.frame_key}>
                            {frame.frame_key}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="battery-table-dual-inputs">
                        <input
                          aria-label={`signal ${index + 1} pos`}
                          className="battery-table-input"
                          min={0}
                          type="number"
                          value={signal.pos}
                          onChange={(event) =>
                            updateBatterySignal(index, 'pos', Number(event.target.value))
                          }
                        />
                        <span>/</span>
                        <input
                          aria-label={`signal ${index + 1} len`}
                          className="battery-table-input"
                          min={1}
                          type="number"
                          value={signal.len}
                          onChange={(event) =>
                            updateBatterySignal(index, 'len', Number(event.target.value))
                          }
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        aria-label={`signal ${index + 1} raw_offset`}
                        className="battery-table-input"
                        min={0}
                        type="number"
                        value={signal.raw_offset}
                        onChange={(event) =>
                          updateBatterySignal(index, 'raw_offset', Number(event.target.value))
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`signal ${index + 1} raw_type`}
                        className="battery-table-input"
                        value={signal.raw_type}
                        onChange={(event) =>
                          updateBatterySignal(index, 'raw_type', event.target.value)
                        }
                      >
                        {rawTypeOptions.map(([value, key]) => (
                          <option key={value} value={value}>
                            {t(key)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`signal ${index + 1} value_type`}
                        className="battery-table-input"
                        value={signal.value_type}
                        onChange={(event) =>
                          updateBatterySignal(index, 'value_type', event.target.value)
                        }
                      >
                        {valueTypeOptions.map(([value, key]) => (
                          <option key={value} value={value}>
                            {t(key)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`signal ${index + 1} byte_order`}
                        className="battery-table-input"
                        value={signal.byte_order}
                        onChange={(event) =>
                          updateBatterySignal(index, 'byte_order', event.target.value)
                        }
                      >
                        <option value="little_endian">
                          {t('batteryMonitor.byteOrder.little')}
                        </option>
                        <option value="big_endian">{t('batteryMonitor.byteOrder.big')}</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`signal ${index + 1} parse_resolution`}
                        className="battery-table-input"
                        step="any"
                        type="number"
                        value={signal.parse_resolution}
                        onChange={(event) =>
                          updateBatterySignal(index, 'parse_resolution', Number(event.target.value))
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`signal ${index + 1} parse_offset`}
                        className="battery-table-input"
                        step="any"
                        type="number"
                        value={signal.parse_offset}
                        onChange={(event) =>
                          updateBatterySignal(index, 'parse_offset', Number(event.target.value))
                        }
                      />
                    </td>
                    <td>
                      <div className="battery-table-dual-inputs">
                        <input
                          aria-label={`signal ${index + 1} parse_mask`}
                          className="battery-table-input"
                          value={`0x${signal.parse_mask.toString(16).toUpperCase()}`}
                          onChange={(event) =>
                            updateBatterySignal(index, 'parse_mask', parseMask(event.target.value))
                          }
                        />
                        <span>/</span>
                        <input
                          aria-label={`signal ${index + 1} parse_shift`}
                          className="battery-table-input"
                          min={0}
                          type="number"
                          value={signal.parse_shift}
                          onChange={(event) =>
                            updateBatterySignal(index, 'parse_shift', Number(event.target.value))
                          }
                        />
                      </div>
                    </td>
                    <td>
                      <div className="battery-table-stack">
                        <input
                          aria-label={`signal ${index + 1} receiver`}
                          className="battery-table-input"
                          value={signal.receiver ?? ''}
                          onChange={(event) =>
                            updateBatterySignal(index, 'receiver', event.target.value)
                          }
                        />
                        <input
                          aria-label={`signal ${index + 1} comment`}
                          className="battery-table-input"
                          value={signal.comment ?? ''}
                          onChange={(event) =>
                            updateBatterySignal(index, 'comment', event.target.value)
                          }
                        />
                      </div>
                    </td>
                    <td>
                      <div className="battery-table-actions">
                        {modified ? (
                          <button
                            className="config-restore-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              restoreModifiedPath(signalPath);
                            }}
                            type="button"
                          >
                            {t('common.actions.restore')}
                          </button>
                        ) : null}
                        <button
                          className="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (
                              confirmDelete(
                                t('batteryMonitor.confirmDelete.signal', {
                                  key: signal.signal_key,
                                }),
                              )
                            ) {
                              removeBatterySignal(index);
                            }
                          }}
                          type="button"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSignals.length === 0 ? (
                <tr>
                  <td className="battery-table-empty" colSpan={15}>
                    {t('batteryMonitor.signals.noMatch')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  function renderItemEditor() {
    if (!selectedItem)
      return <div className="battery-detail-empty">{t('batteryMonitor.items.select')}</div>;
    const selectedItemTranslation = selectedItemText;
    return (
      <div className="battery-detail-panel">
        <div className="battery-detail-heading">
          <div>
            <span className="battery-kicker">{t('batteryMonitor.items.detailKicker')}</span>
            <h3>{selectedItem.item_key}</h3>
          </div>
          <div className="battery-detail-actions">
            {isModifiedPath(['battery_monitor', 'items', itemIndex]) ? (
              <ActionButton
                icon={<RotateCcw aria-hidden="true" size={15} />}
                onClick={() => restoreModifiedPath(['battery_monitor', 'items', itemIndex])}
              >
                {t('common.actions.restore')}
              </ActionButton>
            ) : null}
            <ActionButton
              danger
              icon={<Trash2 aria-hidden="true" size={15} />}
              onClick={handleDeleteItem}
            >
              {t('common.actions.delete')}
            </ActionButton>
          </div>
        </div>
        <div className="battery-form-grid">
          <Field label={t('batteryMonitor.items.enabled')}>
            <select
              value={selectedItem.enabled ? 1 : 0}
              onChange={(event) =>
                updateBatteryItem(itemIndex, 'enabled', Number(event.target.value) === 1)
              }
            >
              <option value={1}>{t('batteryMonitor.enabled')}</option>
              <option value={0}>{t('batteryMonitor.disabled')}</option>
            </select>
          </Field>
          <Field label={t('batteryMonitor.items.order')} hint={t('batteryMonitor.items.orderHint')}>
            <input
              min={0}
              type="number"
              value={selectedItem.order}
              onChange={(event) =>
                updateBatteryItem(itemIndex, 'order', Number(event.target.value))
              }
            />
          </Field>
          <Field label="item_key">
            <input
              value={selectedItem.item_key}
              onChange={(event) => updateBatteryItem(itemIndex, 'item_key', event.target.value)}
            />
          </Field>
          <Field label={t('batteryMonitor.items.signal')}>
            <select
              value={selectedItem.signal_key}
              onChange={(event) => updateBatteryItem(itemIndex, 'signal_key', event.target.value)}
            >
              {signals.map((signal) => (
                <option key={signal.signal_key} value={signal.signal_key}>
                  {signal.signal_key}
                </option>
              ))}
            </select>
          </Field>
          <Field className="battery-form-grid__wide" label="message_key">
            <input
              value={selectedItem.name_key}
              onChange={(event) => updateBatteryItem(itemIndex, 'name_key', event.target.value)}
            />
          </Field>
          <Field label={t('batteryMonitor.items.locale')}>
            <select
              value={selectedLocale}
              onChange={(event) => setSelectedLocale(event.target.value)}
            >
              {localeOrder.map((locale) => (
                <option key={locale} value={locale}>
                  {localeLabels[locale] ?? locale}
                </option>
              ))}
            </select>
          </Field>
          <Field
            className="battery-form-grid__wide"
            label={t('batteryMonitor.items.currentTranslation')}
            hint={t(
              selectedItemHasTranslation
                ? 'batteryMonitor.items.translationPresent'
                : 'batteryMonitor.items.translationMissing',
            )}
          >
            <input
              value={selectedItemTranslation}
              onChange={(event) =>
                updateBatteryItemLanguage(itemIndex, event.target.value, selectedLocale)
              }
            />
          </Field>
          <Field label={t('batteryMonitor.items.fallback')}>
            <input
              value={selectedItem.fallback_name}
              onChange={(event) =>
                updateBatteryItem(itemIndex, 'fallback_name', event.target.value)
              }
            />
          </Field>
          <Field label={t('batteryMonitor.items.unit')}>
            <input
              value={selectedItem.unit}
              onChange={(event) => updateBatteryItem(itemIndex, 'unit', event.target.value)}
            />
          </Field>
        </div>
        <details className="battery-advanced-details" open>
          <summary>
            <Settings2 aria-hidden="true" size={15} />
            {t('batteryMonitor.items.formatting')}
          </summary>
          <div className="battery-form-grid">
            <Field label={t('batteryMonitor.items.format')}>
              <select
                value={selectedItem.formatter.kind}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'kind', event.target.value)
                }
              >
                {formatterOptions.map(([value, key]) => (
                  <option key={value} value={value}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('batteryMonitor.items.offset')}>
              <input
                step="any"
                type="number"
                value={selectedItem.formatter.offset}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'offset', Number(event.target.value))
                }
              />
            </Field>
            <Field label={t('batteryMonitor.items.scale')}>
              <div className="battery-inline-fields">
                <input
                  type="number"
                  value={selectedItem.formatter.scale_num}
                  onChange={(event) =>
                    updateBatteryItemFormatter(itemIndex, 'scale_num', Number(event.target.value))
                  }
                />
                <span>/</span>
                <input
                  type="number"
                  value={selectedItem.formatter.scale_den}
                  onChange={(event) =>
                    updateBatteryItemFormatter(itemIndex, 'scale_den', Number(event.target.value))
                  }
                />
              </div>
            </Field>
            <Field label={t('batteryMonitor.items.decimals')}>
              <input
                min={0}
                type="number"
                value={selectedItem.formatter.decimals}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'decimals', Number(event.target.value))
                }
              />
            </Field>
            <Field label={t('batteryMonitor.items.displayBase')}>
              <select
                value={selectedItem.formatter.display_base ?? 10}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'display_base', Number(event.target.value))
                }
              >
                <option value={10}>10</option>
                <option value={16}>16</option>
              </select>
            </Field>
            <Field label={t('batteryMonitor.items.trueText')}>
              <input
                value={selectedItem.formatter.true_text ?? ''}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'true_text', event.target.value)
                }
              />
            </Field>
            <Field label={t('batteryMonitor.items.falseText')}>
              <input
                value={selectedItem.formatter.false_text ?? ''}
                onChange={(event) =>
                  updateBatteryItemFormatter(itemIndex, 'false_text', event.target.value)
                }
              />
            </Field>
          </div>
        </details>
        <details className="battery-advanced-details">
          <summary>
            <Settings2 aria-hidden="true" size={15} />
            {t('batteryMonitor.items.validity')}
          </summary>
          <div className="battery-form-grid">
            <Field label={t('batteryMonitor.items.validityFrame')}>
              <select
                value={selectedItem.validity.frame_key ?? ''}
                onChange={(event) =>
                  updateBatteryItemValidity(itemIndex, 'frame_key', event.target.value)
                }
              >
                {frames.map((frame) => (
                  <option key={frame.frame_key} value={frame.frame_key}>
                    {frame.frame_key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('batteryMonitor.items.frameTimeout')}>
              <input
                min={0}
                type="number"
                value={selectedItem.validity.timeout_ticks ?? ''}
                onChange={(event) =>
                  updateBatteryItemValidity(itemIndex, 'timeout_ticks', Number(event.target.value))
                }
              />
            </Field>
            <Field className="battery-form-grid__wide" label={t('batteryMonitor.items.emptyText')}>
              <input
                value={selectedItem.validity.empty_text ?? ''}
                onChange={(event) =>
                  updateBatteryItemValidity(itemIndex, 'empty_text', event.target.value)
                }
              />
            </Field>
          </div>
        </details>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className="battery-editor-split">
        <aside className="battery-collection-panel battery-item-collection">
          <div className="battery-collection-header">
            <div>
              <strong>{t('batteryMonitor.items.title', { count: items.length })}</strong>
              <small>{t('batteryMonitor.items.collectionHint')}</small>
            </div>
            <button
              aria-label={t('batteryMonitor.actions.addItem')}
              onClick={addBatteryItem}
              title={t('batteryMonitor.actions.addItem')}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
          <label className="battery-search-field">
            <Search aria-hidden="true" size={15} />
            <input
              value={itemQuery}
              onChange={(event) => setItemQuery(event.target.value)}
              placeholder={t('batteryMonitor.items.search')}
            />
            {itemQuery ? (
              <button
                aria-label={t('common.actions.clear')}
                onClick={() => setItemQuery('')}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            ) : null}
          </label>
          <div className="battery-collection-list">
            {filteredItems.map(({ item, index }) => (
              <button
                className={`battery-collection-row battery-item-row${itemIndex === index ? ' is-selected' : ''}`}
                draggable
                onClick={() => setItemIndex(index)}
                onDragStart={() => setDraggedItemIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedItemIndex !== null) {
                    const nextIndex = moveBatteryItem(draggedItemIndex, index);
                    if (nextIndex !== null) setItemIndex(nextIndex);
                  }
                  setDraggedItemIndex(null);
                }}
                onDragEnd={() => setDraggedItemIndex(null)}
                key={`${item.item_key}-${index}`}
                type="button"
              >
                <GripVertical aria-hidden="true" className="battery-drag-handle" size={16} />
                <span className={`battery-collection-status${item.enabled ? ' is-enabled' : ''}`} />
                <span className="battery-collection-copy">
                  <strong>
                    {item.order + 1}.{' '}
                    {localizedText(
                      loadedProject,
                      item.name_key,
                      selectedLocale,
                      item.fallback_name || item.item_key,
                    )}
                  </strong>
                  <small>
                    {item.item_key} · {item.signal_key} ·{' '}
                    {item.unit || t('batteryMonitor.items.noUnit')}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={15} />
              </button>
            ))}
            {filteredItems.length === 0 ? (
              <p className="battery-collection-empty">{t('batteryMonitor.items.noMatch')}</p>
            ) : null}
          </div>
          <p className="battery-drag-hint">
            <GripVertical aria-hidden="true" size={14} />
            {t('batteryMonitor.items.dragHint')}
          </p>
        </aside>
        {renderItemEditor()}
      </div>
    );
  }

  function renderValidation() {
    return (
      <div className="battery-validation-page">
        <div className="battery-validation-page-header">
          <div>
            <span className="battery-kicker">{t('batteryMonitor.validation.kicker')}</span>
            <h3>{t('batteryMonitor.validation.title')}</h3>
            <p>{t('batteryMonitor.validation.description')}</p>
          </div>
          <div
            className={`battery-validation-count${batteryValidation.valid ? ' is-valid' : ' is-invalid'}`}
          >
            <strong>{batteryValidation.errors.length}</strong>
            <span>{t('batteryMonitor.validation.errors')}</span>
            <strong>{batteryValidation.warnings.length}</strong>
            <span>{t('batteryMonitor.validation.warnings')}</span>
          </div>
        </div>
        {batteryValidation.errors.length === 0 && batteryValidation.warnings.length === 0 ? (
          <div className="battery-validation-all-clear">
            <CheckCircle2 aria-hidden="true" size={25} />
            <strong>{t('batteryMonitor.validation.noIssues')}</strong>
          </div>
        ) : null}
        <div className="battery-validation-columns">
          <section>
            <h4>
              <CircleAlert aria-hidden="true" size={16} />
              {t('batteryMonitor.validation.errors')}
            </h4>
            {batteryValidation.errors.map((issue) => (
              <IssueRow
                issue={issue}
                key={`${issue.code}-${issue.path.join('.')}-${JSON.stringify(issue.values ?? {})}`}
                message={issueMessage(issue)}
                onClick={() => goToIssue(issue)}
              />
            ))}
            {batteryValidation.errors.length === 0 ? (
              <p className="battery-validation-empty">{t('batteryMonitor.validation.noErrors')}</p>
            ) : null}
          </section>
          <section>
            <h4>
              <AlertTriangle aria-hidden="true" size={16} />
              {t('batteryMonitor.validation.warnings')}
            </h4>
            {batteryValidation.warnings.map((issue) => (
              <IssueRow
                issue={issue}
                key={`${issue.code}-${issue.path.join('.')}-${JSON.stringify(issue.values ?? {})}`}
                message={issueMessage(issue)}
                onClick={() => goToIssue(issue)}
              />
            ))}
            {batteryValidation.warnings.length === 0 ? (
              <p className="battery-validation-empty">
                {t('batteryMonitor.validation.noWarnings')}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  const workspaceContent = {
    overview: renderOverview,
    frames: renderFrames,
    signals: renderSignals,
    items: renderItems,
    validation: renderValidation,
  }[workspace]();

  return (
    <section className="table-spec-card battery-monitor-page">
      <header className="battery-page-header">
        <div className="private-protocol-header-text">
          <div className="battery-title-line">
            <h2>{t('batteryMonitor.title')}</h2>
            <span className="battery-version-badge battery-version-badge--v2">
              JCPro V2 / Battery V2
            </span>
          </div>
          <p>{t('batteryMonitor.description')}</p>
        </div>
        <div className="battery-page-actions">
          <ActionButton
            icon={<FileJson aria-hidden="true" size={15} />}
            onClick={() => void handleExportBatteryMonitor()}
            disabled={isExportingBatteryMonitor}
          >
            {isExportingBatteryMonitor
              ? t('batteryMonitor.actions.exporting')
              : t('batteryMonitor.actions.exportJson')}
          </ActionButton>
          <ActionButton
            icon={<Import aria-hidden="true" size={15} />}
            onClick={() => void handleImportBatteryMonitor()}
            disabled={isImportingBatteryMonitor}
          >
            {isImportingBatteryMonitor
              ? t('batteryMonitor.actions.importing')
              : t('batteryMonitor.actions.importJson')}
          </ActionButton>
          <ActionButton
            icon={<CheckCircle2 aria-hidden="true" size={15} />}
            onClick={() => setWorkspace('validation')}
          >
            {t('batteryMonitor.actions.validate')}
          </ActionButton>
          <details className="battery-action-menu">
            <summary>
              <Database aria-hidden="true" size={15} />
              {t('batteryMonitor.actions.dataExchange')}
            </summary>
            <div className="battery-action-menu-content">
              <ActionButton
                icon={<Download aria-hidden="true" size={15} />}
                onClick={() => void handleExportBatteryFramesCsv()}
                disabled={isExportingBatteryCsv}
              >
                {t('batteryMonitor.actions.exportFramesCsv')}
              </ActionButton>
              <ActionButton
                icon={<Upload aria-hidden="true" size={15} />}
                onClick={() => void handleImportBatteryFramesCsv()}
                disabled={isImportingBatteryCsv}
              >
                {t('batteryMonitor.actions.importFramesCsv')}
              </ActionButton>
              <ActionButton
                icon={<Download aria-hidden="true" size={15} />}
                onClick={() => void handleExportBatterySignalsCsv()}
                disabled={isExportingBatteryCsv}
              >
                {t('batteryMonitor.actions.exportSignalsCsv')}
              </ActionButton>
              <ActionButton
                icon={<Upload aria-hidden="true" size={15} />}
                onClick={() => void handleImportBatterySignalsCsv()}
                disabled={isImportingBatteryCsv}
              >
                {t('batteryMonitor.actions.importSignalsCsv')}
              </ActionButton>
              <ActionButton
                icon={<Download aria-hidden="true" size={15} />}
                onClick={() => void handleExportBatteryItemsCsv()}
                disabled={isExportingBatteryCsv}
              >
                {t('batteryMonitor.actions.exportItemsCsv')}
              </ActionButton>
              <ActionButton
                icon={<Upload aria-hidden="true" size={15} />}
                onClick={() => void handleImportBatteryItemsCsv()}
                disabled={isImportingBatteryCsv}
              >
                {t('batteryMonitor.actions.importItemsCsv')}
              </ActionButton>
            </div>
          </details>
          <ActionButton
            icon={<Download aria-hidden="true" size={15} />}
            onClick={() => void handleExportBatteryDbc()}
            disabled={isExportingBatteryDbc}
          >
            {isExportingBatteryDbc
              ? t('batteryMonitor.actions.exporting')
              : t('batteryMonitor.actions.exportDbc')}
          </ActionButton>
          <ActionButton
            icon={<Upload aria-hidden="true" size={15} />}
            onClick={() => void handleImportBatteryDbc()}
            disabled={isImportingBatteryDbc}
          >
            {isImportingBatteryDbc
              ? t('batteryMonitor.actions.importing')
              : t('batteryMonitor.actions.importDbc')}
          </ActionButton>
        </div>
      </header>
      <ProtocolProfileBar
        document={loadedProject.document}
        onUpdateSections={onUpdateSections}
        scope="battery"
      />
      {batteryMonitorExportStatus ||
      batteryMonitorImportStatus ||
      batteryCsvStatus ||
      batteryDbcStatus ? (
        <div aria-live="polite" className="config-helper-text battery-status-stack" role="status">
          {batteryMonitorExportStatus ||
            batteryMonitorImportStatus ||
            batteryCsvStatus ||
            batteryDbcStatus}
        </div>
      ) : null}
      <div className="battery-summary-strip">
        <article>
          <span>{t('batteryMonitor.summary.status')}</span>
          <strong className={currentBatteryMonitorDocument.enabled ? 'text-success' : undefined}>
            {currentBatteryMonitorDocument.enabled
              ? t('batteryMonitor.enabled')
              : t('batteryMonitor.disabled')}
          </strong>
        </article>
        <article>
          <span>{t('batteryMonitor.summary.framesSignals')}</span>
          <strong>
            {frames.length} / {signals.length}
          </strong>
        </article>
        <article>
          <span>{t('batteryMonitor.summary.enabledItems')}</span>
          <strong>
            {items.filter((item) => item.enabled).length} / {items.length}
          </strong>
        </article>
        <article>
          <span>{t('batteryMonitor.summary.translations')}</span>
          <strong>{`${localeOrder.length} ${t('batteryMonitor.summary.locales')}`}</strong>
        </article>
        <article className={batteryValidation.valid ? 'is-valid' : 'is-invalid'}>
          <span>{t('batteryMonitor.summary.validation')}</span>
          <strong>
            {batteryValidation.errors.length
              ? t('batteryMonitor.validation.errorCount', {
                  count: batteryValidation.errors.length,
                })
              : t('batteryMonitor.validation.valid')}
          </strong>
        </article>
      </div>
      <div
        aria-label={t('batteryMonitor.workspaces.label')}
        className="battery-workspace-tabs"
        role="tablist"
      >
        {(['overview', 'frames', 'signals', 'items', 'validation'] as const).map((key) => (
          <button
            aria-selected={workspace === key}
            className={workspace === key ? 'is-active' : undefined}
            onClick={() => setWorkspace(key)}
            role="tab"
            key={key}
            type="button"
          >
            {key === 'overview' ? (
              <Database aria-hidden="true" size={15} />
            ) : key === 'validation' ? (
              <CheckCircle2 aria-hidden="true" size={15} />
            ) : (
              <span className="battery-tab-count">
                {key === 'frames'
                  ? frames.length
                  : key === 'signals'
                    ? signals.length
                    : items.length}
              </span>
            )}
            {t(`batteryMonitor.workspaces.${key}`)}
          </button>
        ))}
      </div>
      <div
        aria-busy={isImportingBatteryMonitor || isImportingBatteryCsv || isImportingBatteryDbc}
        className="battery-workspace-content"
        role="tabpanel"
      >
        {workspaceContent}
      </div>
    </section>
  );
}

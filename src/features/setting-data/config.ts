import type {
  SettingColumnPresetOption,
  SettingEditorOption,
  SettingEditorSection,
  SettingParameterColumn,
} from './types';
import { settingDataTypeDefinitions } from './settingDataTypes';
import {
  settingPreprocessDecimalDefinitions,
  settingPreprocessDefinitions,
} from './settingPreprocessing';

export const settingColumnWidthStorageKey = 'jc-custom-platform.settingData.columnWidths';
export const settingColumnPresetStorageKey = 'jc-custom-platform.settingData.columnPreset';
export const communicationIndexRadixStorageKey =
  'jc-custom-platform.settingData.communicationIndexRadix';
export const maxSettingColumnWidth = 480;

export const settingParameterColumns: SettingParameterColumn[] = [
  { key: 'select', labelKey: '', defaultWidth: 44, minWidth: 44, align: 'center' },
  { key: 'index', labelKey: '', defaultWidth: 54, minWidth: 44, align: 'center' },
  { key: 'name', labelKey: 'settingData.columns.name', defaultWidth: 180, minWidth: 120, align: 'left' },
  { key: 'auth', labelKey: 'settingData.columns.auth', defaultWidth: 96, minWidth: 76 },
  { key: 'protocol', labelKey: 'settingData.columns.protocol', defaultWidth: 110, minWidth: 86 },
  { key: 'frameId', labelKey: 'settingData.columns.frameId', defaultWidth: 90, minWidth: 72 },
  { key: 'mainIndex', labelKey: 'settingData.columns.mainIndex', defaultWidth: 90, minWidth: 72 },
  { key: 'subIndex', labelKey: 'settingData.columns.subIndex', defaultWidth: 80, minWidth: 64 },
  { key: 'access', labelKey: 'settingData.columns.access', defaultWidth: 96, minWidth: 76 },
  { key: 'maxValue', labelKey: 'settingData.columns.maxValue', defaultWidth: 110, minWidth: 80 },
  { key: 'minValue', labelKey: 'settingData.columns.minValue', defaultWidth: 110, minWidth: 80 },
  { key: 'defaultValue', labelKey: 'settingData.columns.defaultValue', defaultWidth: 110, minWidth: 80 },
  { key: 'dataType', labelKey: 'settingData.columns.dataType', defaultWidth: 130, minWidth: 90 },
  { key: 'bitStart', labelKey: 'settingData.columns.bitStart', defaultWidth: 110, minWidth: 86 },
  { key: 'bitLength', labelKey: 'settingData.columns.bitLength', defaultWidth: 100, minWidth: 76 },
  { key: 'preprocess', labelKey: 'settingData.columns.preprocess', defaultWidth: 130, minWidth: 94 },
  { key: 'scale', labelKey: 'settingData.columns.scale', defaultWidth: 100, minWidth: 76 },
  { key: 'offset', labelKey: 'settingData.columns.offset', defaultWidth: 100, minWidth: 76 },
  { key: 'decimals', labelKey: 'settingData.columns.decimals', defaultWidth: 100, minWidth: 76 },
  { key: 'actions', labelKey: 'settingData.columns.actions', defaultWidth: 120, minWidth: 100 },
];

export const settingColumnPresetOptions: SettingColumnPresetOption[] = [
  {
    value: 'common',
    labelKey: 'settingData.columnPresets.common',
    columns: [
      'select',
      'index',
      'name',
      'access',
      'frameId',
      'mainIndex',
      'subIndex',
      'dataType',
      'actions',
    ],
  },
  {
    value: 'communication',
    labelKey: 'settingData.columnPresets.communication',
    columns: [
      'select',
      'index',
      'name',
      'auth',
      'protocol',
      'frameId',
      'mainIndex',
      'subIndex',
      'access',
      'actions',
    ],
  },
  {
    value: 'values',
    labelKey: 'settingData.columnPresets.values',
    columns: [
      'select',
      'index',
      'name',
      'access',
      'maxValue',
      'minValue',
      'defaultValue',
      'dataType',
      'actions',
    ],
  },
  {
    value: 'processing',
    labelKey: 'settingData.columnPresets.processing',
    columns: [
      'select',
      'index',
      'name',
      'dataType',
      'bitStart',
      'bitLength',
      'preprocess',
      'scale',
      'offset',
      'decimals',
      'actions',
    ],
  },
  {
    value: 'all',
    labelKey: 'settingData.columnPresets.all',
    columns: settingParameterColumns.map((column) => column.key),
  },
];

export const sdoTypeOptions: SettingEditorOption[] = [
  { value: 0, labelKey: 'settingData.options.menu' },
  { value: 1, labelKey: 'settingData.options.parameter' },
];

export const sdoAuthOptions: SettingEditorOption[] = [
  { value: 0, labelKey: 'settingData.options.normalUser' },
  { value: 1, labelKey: 'settingData.options.normalUser' },
  { value: 2, labelKey: 'settingData.options.administrator' },
  { value: 3, labelKey: 'settingData.options.superAdministrator' },
];

export const sdoAccessOptions: SettingEditorOption[] = [
  { value: 0, labelKey: 'settingData.options.readOnly' },
  { value: 1, labelKey: 'settingData.options.readWrite' },
  { value: 2, labelKey: 'settingData.options.writeOnly' },
];

export const sdoProtocolOptions: SettingEditorOption[] = [{ value: 0, label: 'CAN_OPEN' }];

export const sdoBooleanOptions: SettingEditorOption[] = [
  { value: 0, labelKey: 'settingData.options.no' },
  { value: 1, labelKey: 'settingData.options.yes' },
];

export const sdoDataTypeOptions: SettingEditorOption[] = settingDataTypeDefinitions.map(
  (definition) => ({
    value: `${definition.name}:${definition.handle}`,
    label: `${definition.name} (handle=${definition.handle})`,
  }),
);

export const sdoPreprocessOptions: SettingEditorOption[] = settingPreprocessDefinitions.map(
  (definition) => ({
    value: `${definition.name}:${definition.handle}`,
    label: `${definition.name} (pre_handle=${definition.handle})`,
  }),
);

export const sdoPreprocessDecimalOptions: SettingEditorOption[] =
  settingPreprocessDecimalDefinitions.map((definition) => ({
    value: definition.value,
    label: definition.name,
  }));

export const settingEditorSections: SettingEditorSection[] = [
  {
    titleKey: 'settingData.sections.basic',
    fields: [
      { field: 'name', labelKey: 'settingData.fields.name', kind: 'text', defaultValue: '', visibleFor: 'all' },
      {
        field: 'type',
        labelKey: 'settingData.fields.type',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'all',
        options: sdoTypeOptions,
      },
      {
        field: 'user_auth',
        labelKey: 'settingData.fields.permission',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'all',
        options: sdoAuthOptions,
      },
      {
        field: 'name_index',
        labelKey: 'settingData.fields.languageIndex',
        kind: 'number',
        defaultValue: 0,
        visibleFor: 'all',
      },
    ],
  },
  {
    titleKey: 'settingData.sections.communicationIndex',
    fields: [
      {
        field: 'control_protocol',
        labelKey: 'settingData.fields.protocol',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoProtocolOptions,
      },
      {
        field: 'control_rw',
        labelKey: 'settingData.fields.access',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoAccessOptions,
      },
      { field: 'fid', labelKey: 'settingData.fields.fid', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'mid', labelKey: 'settingData.fields.mid', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'sid', labelKey: 'settingData.fields.sid', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
    ],
  },
  {
    titleKey: 'settingData.sections.defaultsAndRange',
    fields: [
      {
        field: 'control_use_default',
        labelKey: 'settingData.fields.useDefault',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoBooleanOptions,
      },
      {
        field: 'control_use_min_max',
        labelKey: 'settingData.fields.useRange',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoBooleanOptions,
      },
      {
        field: 'data_max',
        labelKey: 'settingData.fields.maxValue',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'data_min',
        labelKey: 'settingData.fields.minValue',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'data_default',
        labelKey: 'settingData.fields.defaultValue',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
    ],
  },
  {
    titleKey: 'settingData.sections.settingEntry',
    fields: [
      {
        field: 'data_type_label',
        labelKey: 'settingData.fields.dataType',
        kind: 'select',
        defaultValue: 'u8:0',
        visibleFor: 'parameter',
        options: sdoDataTypeOptions,
      },
      {
        field: 'bit_start',
        labelKey: 'settingData.fields.bitStart',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'bit_length',
        labelKey: 'settingData.fields.bitLength',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'preprocess_label',
        labelKey: 'settingData.fields.preprocessing',
        kind: 'select',
        defaultValue: '原始数据:0',
        visibleFor: 'parameter',
        options: sdoPreprocessOptions,
      },
      {
        field: 'scale_value',
        labelKey: 'settingData.fields.scale',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'offset_value',
        labelKey: 'settingData.fields.offset',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'decimals_value',
        labelKey: 'settingData.fields.decimals',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoPreprocessDecimalOptions,
      },
    ],
  },
];

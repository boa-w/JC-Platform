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
  { key: 'select', label: '', defaultWidth: 44, minWidth: 44, align: 'center' },
  { key: 'index', label: '', defaultWidth: 54, minWidth: 44, align: 'center' },
  { key: 'name', label: '参数名称', defaultWidth: 180, minWidth: 120, align: 'left' },
  { key: 'auth', label: '使用权限', defaultWidth: 96, minWidth: 76 },
  { key: 'protocol', label: '协议类型', defaultWidth: 110, minWidth: 86 },
  { key: 'frameId', label: '帧ID', defaultWidth: 90, minWidth: 72 },
  { key: 'mainIndex', label: '主索引', defaultWidth: 90, minWidth: 72 },
  { key: 'subIndex', label: '子索引', defaultWidth: 80, minWidth: 64 },
  { key: 'access', label: '读写权限', defaultWidth: 96, minWidth: 76 },
  { key: 'maxValue', label: '最大值', defaultWidth: 110, minWidth: 80 },
  { key: 'minValue', label: '最小值', defaultWidth: 110, minWidth: 80 },
  { key: 'defaultValue', label: '默认值', defaultWidth: 110, minWidth: 80 },
  { key: 'dataType', label: '数据类型', defaultWidth: 130, minWidth: 90 },
  { key: 'bitStart', label: 'bit开始位置', defaultWidth: 110, minWidth: 86 },
  { key: 'bitLength', label: 'bit长度', defaultWidth: 100, minWidth: 76 },
  { key: 'preprocess', label: '数据预处理', defaultWidth: 130, minWidth: 94 },
  { key: 'scale', label: '缩放值', defaultWidth: 100, minWidth: 76 },
  { key: 'offset', label: '偏移值', defaultWidth: 100, minWidth: 76 },
  { key: 'decimals', label: '保留小数', defaultWidth: 100, minWidth: 76 },
  { key: 'actions', label: '操作', defaultWidth: 120, minWidth: 100 },
];

export const settingColumnPresetOptions: SettingColumnPresetOption[] = [
  {
    value: 'common',
    label: '常用',
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
    label: '通信',
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
    label: '数值',
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
    label: '位段处理',
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
    label: '全部',
    columns: settingParameterColumns.map((column) => column.key),
  },
];

export const sdoTypeOptions: SettingEditorOption[] = [
  { value: 0, label: '菜单' },
  { value: 1, label: '参数' },
];

export const sdoAuthOptions: SettingEditorOption[] = [
  { value: 0, label: '普通用户' },
  { value: 1, label: '普通用户' },
  { value: 2, label: '管理员' },
  { value: 3, label: '超级管理员' },
];

export const sdoAccessOptions: SettingEditorOption[] = [
  { value: 0, label: '只读' },
  { value: 1, label: '读写' },
  { value: 2, label: '只写' },
];

export const sdoProtocolOptions: SettingEditorOption[] = [{ value: 0, label: 'CAN_OPEN' }];

export const sdoBooleanOptions: SettingEditorOption[] = [
  { value: 0, label: '否' },
  { value: 1, label: '是' },
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
    title: '基础信息',
    fields: [
      { field: 'name', label: '名称', kind: 'text', defaultValue: '', visibleFor: 'all' },
      {
        field: 'type',
        label: '类型',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'all',
        options: sdoTypeOptions,
      },
      {
        field: 'user_auth',
        label: '权限',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'all',
        options: sdoAuthOptions,
      },
      {
        field: 'name_index',
        label: '语言索引',
        kind: 'number',
        defaultValue: 0,
        visibleFor: 'all',
      },
    ],
  },
  {
    title: '通信索引',
    fields: [
      {
        field: 'control_protocol',
        label: '协议',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoProtocolOptions,
      },
      {
        field: 'control_rw',
        label: '读写',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoAccessOptions,
      },
      { field: 'fid', label: 'FID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'mid', label: 'MID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'sid', label: 'SID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
    ],
  },
  {
    title: '默认值与范围',
    fields: [
      {
        field: 'control_use_default',
        label: '使用默认值',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoBooleanOptions,
      },
      {
        field: 'control_use_min_max',
        label: '使用范围',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoBooleanOptions,
      },
      {
        field: 'data_max',
        label: '最大值',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'data_min',
        label: '最小值',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'data_default',
        label: '默认值',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
    ],
  },
  {
    title: '设置条目',
    fields: [
      {
        field: 'data_type_label',
        label: '数据类型',
        kind: 'select',
        defaultValue: 'u8:0',
        visibleFor: 'parameter',
        options: sdoDataTypeOptions,
      },
      {
        field: 'bit_start',
        label: 'bit开始位置',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'bit_length',
        label: 'bit长度',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'preprocess_label',
        label: '数据预处理',
        kind: 'select',
        defaultValue: '原始数据:0',
        visibleFor: 'parameter',
        options: sdoPreprocessOptions,
      },
      {
        field: 'scale_value',
        label: '缩放值',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'offset_value',
        label: '偏移值',
        kind: 'text',
        defaultValue: '',
        visibleFor: 'parameter',
      },
      {
        field: 'decimals_value',
        label: '保留小数',
        kind: 'select',
        defaultValue: 0,
        visibleFor: 'parameter',
        options: sdoPreprocessDecimalOptions,
      },
    ],
  },
];

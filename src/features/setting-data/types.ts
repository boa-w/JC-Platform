import type { Dispatch, SetStateAction } from 'react';
import type { LoadedProject, SdoNodeDocument } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';

export type SdoNodeField = keyof Pick<
  SdoNodeDocument,
  | 'name'
  | 'type'
  | 'user_auth'
  | 'name_index'
  | 'control_protocol'
  | 'control_rw'
  | 'control_use_default'
  | 'control_use_min_max'
  | 'handle'
  | 'handle_name'
  | 'handle_param'
  | 'fid'
  | 'mid'
  | 'sid'
  | 'data_default'
  | 'data_min'
  | 'data_max'
  | 'pre_handle'
  | 'pre_handle_name'
  | 'pre_handle_scale'
  | 'pre_handle_offset'
  | 'pre_handle_decimal'
  | 'pre_handle_decimal_name'
>;

export type SettingParameterColumnKey =
  | 'select'
  | 'index'
  | 'name'
  | 'auth'
  | 'protocol'
  | 'frameId'
  | 'mainIndex'
  | 'subIndex'
  | 'access'
  | 'maxValue'
  | 'minValue'
  | 'defaultValue'
  | 'dataType'
  | 'bitStart'
  | 'bitLength'
  | 'preprocess'
  | 'scale'
  | 'offset'
  | 'decimals'
  | 'actions';

export type SettingColumnPreset = 'common' | 'communication' | 'values' | 'processing' | 'all';

export type CommunicationIndexRadix = 'decimal' | 'hexadecimal';

export interface SettingColumnPresetOption {
  value: SettingColumnPreset;
  labelKey: string;
  columns: SettingParameterColumnKey[];
}

export interface SettingParameterColumn {
  key: SettingParameterColumnKey;
  labelKey: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'center' | 'right';
}

export type SettingEditorInputKind = 'text' | 'number' | 'select';

export type SettingEditorOption = {
  value: number | string;
  label?: string;
  labelKey?: string;
};

export type SettingEditorVirtualField =
  | 'data_type_label'
  | 'bit_start'
  | 'bit_length'
  | 'preprocess_label'
  | 'scale_value'
  | 'offset_value'
  | 'decimals_value';

export type SettingEditorField = {
  field: SdoNodeField | SettingEditorVirtualField;
  labelKey: string;
  kind: SettingEditorInputKind;
  defaultValue: string | number;
  visibleFor?: 'all' | 'menu' | 'parameter';
  options?: SettingEditorOption[];
};

export type SettingEditorSection = {
  titleKey: string;
  fields: SettingEditorField[];
};

export interface SettingMenuRow {
  key: string;
  path: number[];
  name: string;
  pathNames: string[];
  level: number;
  auth: string;
  parameterCount: number;
  directParameterCount: number;
  hasMenuChildren: boolean;
  isSearchMatch?: boolean;
  hasSearchMatchInChildren?: boolean;
}

export interface SettingParameterRow {
  index: number;
  path: number[];
  name: string;
  menuPath: string;
  pathNames: string[];
  auth: string;
  protocol: string;
  frameId: string;
  mainIndex: string;
  subIndex: string;
  frameIdValue?: number;
  mainIndexValue?: number;
  subIndexValue?: number;
  access: string;
  maxValue: string;
  minValue: string;
  defaultValue: string;
  dataType: string;
  bitStart: string;
  bitLength: string;
  preprocess: string;
  scale: string;
  offset: string;
  decimals: string;
  isReadonly: boolean;
  isBooleanMonitor: boolean;
  usageHint: string;
}

export interface SettingDataPageProps {
  loadedProject: LoadedProject | null;
  isActive: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  updateProjectDocument: (section: string, value: unknown) => void;
  isModifiedPath: (path: JsonPath) => boolean;
  restoreModifiedPath: (path: JsonPath) => void;
}

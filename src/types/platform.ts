export type NavigationKey = 'project' | 'ui' | 'pdo-simple' | 'pdo-advanced' | 'sdo' | 'language' | 'export' | 'settings';

export interface ProjectSummary {
  name: string;
  version: string;
  path?: string;
  deviceResolution: string;
  updatedAt?: string;
}

export interface FeatureModule {
  key: NavigationKey;
  title: string;
  description: string;
}

export interface BackendHealth {
  app_name: string;
  version: string;
  commit_hash: string;
  core_status: string;
}

export type LegacyTableKind = 'sdo' | 'pdoSimple' | 'language';

export interface ProjectValidationReport {
  valid: boolean;
  missing_sections: string[];
  warnings: string[];
}

export interface LoadedProject {
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  document: unknown;
}

export interface MigratedProject {
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  document: unknown;
  added_sections: string[];
  migrated_version: string;
}

export interface ProjectParseReport {
  valid: boolean;
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  document: ProjectDocument | null;
  added_sections: string[];
  errors: string[];
}

export interface ProjectDocument {
  config_version?: string;
  project: ProjectMetadata;
  device: DeviceConfig;
  ui_info: UiInfoDocument;
  pdo_simple_send_recv: PdoSimpleDocument;
  pdo_global_param: unknown[];
  pdo_condition: unknown[];
  pdo_recv: unknown[];
  pdo_send: unknown[];
  sdo_info: SdoNodeDocument;
  language_info: LanguageDocument;
}

export interface ProjectMetadata {
  name: string;
  from?: string;
  base_path?: string;
  create_time?: string;
  update_time?: string;
}

export interface DeviceConfig {
  resolution_w: number;
  resolution_h: number;
}

export interface UiInfoDocument {
  logo?: UiResourceDocument;
  main?: UiPageDocument;
  [key: string]: unknown;
}

export interface UiPageDocument {
  name?: string;
  item: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UiResourceDocument {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  options: unknown[];
  [key: string]: unknown;
}

export interface PdoSimpleDocument {
  pdo_send: PdoSimpleFrameDocument[];
  pdo_recv: PdoSimpleFrameDocument[];
}

export interface PdoSimpleFrameDocument {
  id: number;
  type: number;
  desc: string;
  data: PdoSimpleSignalDocument[];
  [key: string]: unknown;
}

export interface PdoSimpleSignalDocument {
  pos: number;
  len: number;
  show_type: number;
  pdo_param_index: number;
  pdo_param_name?: string;
  [key: string]: unknown;
}

export interface SdoNodeDocument {
  type: number;
  user_auth: number;
  name_index: number;
  name: string;
  children: SdoNodeDocument[];
  control_protocol?: number;
  control_rw?: number;
  control_use_default?: number;
  control_use_min_max?: number;
  handle?: number;
  handle_name?: string;
  handle_param?: string;
  fid?: number;
  mid?: number;
  sid?: number;
  data_default?: string;
  data_min?: string;
  data_max?: string;
  pre_handle?: number;
  pre_handle_name?: string;
  pre_handle_scale?: string;
  pre_handle_offset?: string;
  pre_handle_decimal?: number;
  pre_handle_decimal_name?: string;
  [key: string]: unknown;
}

export interface LanguageDocument {
  list_code_language: string[];
  list_inner: string[];
  list_translate: Record<string, unknown>;
  language_labels?: Record<string, string>;
}

export interface NewProjectRequest {
  path: string;
  name: string;
  resolutionW: number;
  resolutionH: number;
}

export interface SaveProjectRequest {
  path: string;
  document: unknown;
}

export interface SaveProjectAsRequest {
  source_path: string;
  target_path: string;
  document: unknown;
}

export interface ProjectResourceCopyItem {
  source: string;
  destination: string;
}

export interface SaveProjectAsReport {
  project: LoadedProject;
  copied_resources: ProjectResourceCopyItem[];
  warnings: string[];
}

export interface LegacyTableSpec {
  kind: LegacyTableKind;
  headers: string[];
}

export interface TableValidationReport {
  valid: boolean;
  expected_headers: string[];
  actual_headers: string[];
  errors: string[];
}

export interface TableDocument {
  headers: string[];
  rows: string[][];
}

export interface TableFileRequest {
  path: string;
}

export interface ExportTableRequest {
  path: string;
  document: TableDocument;
}

export interface ExportPlanRequest {
  project_path?: string;
  output_dir: string;
  document: unknown;
}

export interface BinaryBuildReport {
  valid: boolean;
  file_size: number;
  crc: number;
  data_description: DataDescriptionPlan;
  bytes: number[];
  warnings: string[];
  errors: string[];
}

export interface BinaryCompareRequest {
  document: unknown;
  legacy_binary_path: string;
}

export interface BinaryCompareReport {
  valid: boolean;
  same: boolean;
  generated_size: number;
  legacy_size: number;
  first_diff_offset?: number;
  generated_byte?: number;
  legacy_byte?: number;
  build: BinaryBuildReport;
  errors: string[];
}

export interface ProjectExportReport {
  valid: boolean;
  export_root: string;
  manifest_path: string;
  binary_path: string;
  copied_images: UiImageCopyItem[];
  binary: BinaryBuildReport;
  errors: string[];
  warnings: string[];
}

export interface UiImageCopyReport {
  valid: boolean;
  export_root: string;
  copied_files: UiImageCopyItem[];
  errors: string[];
  warnings: string[];
}

export interface UiImageCopyItem {
  source: string;
  destination: string;
}

export interface ExportPlanReport {
  valid: boolean;
  export_root: string;
  directories: string[];
  manifest_path: string;
  binary_path: string;
  screen_src: ScreenSourcePlan;
  data_description: DataDescriptionPlan;
  errors: string[];
  warnings: string[];
}

export interface ScreenSourcePlan {
  update: boolean;
  num: number;
  pages: ScreenPagePlan[];
}

export interface ScreenPagePlan {
  key: string;
  name: string;
  num: number;
  items: ScreenItemPlan[];
}

export interface ScreenItemPlan {
  x: number;
  y: number;
  w: number;
  h: number;
  dest: string;
  src: string;
  format: string;
  p_num?: number;
}

export interface DataDescriptionPlan {
  update: boolean;
  format: string;
  src: string;
  dest: string;
  file_size: number;
  crc: number;
  global_param_base_addr: number;
  global_param_total: number;
  global_param_index_base_addr: number;
  global_param_index_total: number;
  global_condition_base_addr: number;
  global_condition_total: number;
  pdo_recv_base_addr: number;
  pdo_recv_total: number;
  pdo_send_base_addr: number;
  pdo_send_total: number;
  sdo_base_addr: number;
  language_addr: number[];
  language_code: string[];
}

export interface SdoImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  document: unknown | null;
}

export interface PdoSimpleImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  document: unknown | null;
}

export interface PdoAdvancedParseReport {
  valid: boolean;
  document: PdoAdvancedDocument | null;
  errors: string[];
}

export interface PdoAdvancedDocument {
  pdo_global_param: PdoGlobalParam[];
  pdo_condition: PdoCondition[];
  pdo_recv: PdoAdvancedFrame[];
  pdo_send: PdoAdvancedFrame[];
}

export interface PdoGlobalParam {
  param_id: string;
  name: string;
  def: string;
  reserved: number;
  type: number;
  inner: number;
}

export interface PdoCondition {
  param_id: string;
  process: number;
  data: PdoConditionInput[];
}

export interface PdoConditionInput {
  param_id: string;
}

export interface PdoAdvancedFrame {
  id: number;
  type: number;
  desc: string;
  data: PdoAdvancedSignal[];
}

export interface PdoAdvancedSignal {
  pos: number;
  len: number;
  show_type: number;
  handle: number;
  handle_param: string;
  param_id: string;
}

export interface LanguageImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  document: unknown | null;
}

export interface UiResourceParseReport {
  valid: boolean;
  logo: ParsedUiResource | null;
  main_items: ParsedUiResource[];
  errors: string[];
}

export interface UiResourceParseRequest {
  project_path?: string;
  document: unknown;
}

export interface UiResourceUpdateRequest {
  document: unknown;
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  default_option: number;
}

export interface UiResourceUpdateReport {
  valid: boolean;
  document: unknown;
  errors: string[];
}

export interface UiResourceOptionAddRequest {
  document: unknown;
  key: string;
  sources: string[];
}

export interface UiResourceOptionRemoveRequest {
  document: unknown;
  key: string;
  option_index: number;
}

export interface ParsedUiResource {
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  handle: 'Show' | 'List' | 'Anim' | 'Unknown';
  default_option: number;
  dest: string[];
  options: ParsedResourceOption[];
  pdo_param_index?: number;
}

export interface ParsedResourceOption {
  sources: string[];
  frame_count: number;
  format?: string;
}

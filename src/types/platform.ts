export type NavigationKey =
  | 'project'
  | 'setting-data'
  | 'realtime-data'
  | 'signal-dictionary'
  | 'private-protocol'
  | 'protocol-mapping'
  | 'canopen-export'
  | 'ui'
  | 'battery-protocol'
  | 'battery-monitor'
  | 'fault-code'
  | 'language'
  | 'export'
  | 'settings'
  | 'can-test-data';

export interface ProjectSummary {
  name: string;
  version: string;
  path?: string;
  deviceResolution: string;
  updatedAt?: string;
}

export type ModuleLifecycle = 'stable' | 'experimental' | 'deprecated' | 'experimental-deprecated';

export interface FeatureModule {
  key: NavigationKey;
  title: string;
  description: string;
  lifecycle?: ModuleLifecycle;
  lifecycleReason?: string;
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

export interface GitProjectRequest {
  project_path: string;
  sidecar_path?: string;
}

export interface GitProjectStatus {
  available: boolean;
  repo_root?: string;
  branch?: string;
  head_hash?: string;
  head_short_hash?: string;
  head_subject?: string;
  managed_paths: string[];
  changed_paths: string[];
  additions: number;
  deletions: number;
  has_staged_changes: boolean;
  warning?: string;
}

export interface GitRevision {
  hash: string;
  short_hash: string;
  author: string;
  authored_at: string;
  subject: string;
}

export interface GitProjectContext {
  status: GitProjectStatus;
  revisions: GitRevision[];
}

export interface GitRevisionSnapshot {
  revision: GitRevision;
  project_document: unknown;
  sidecar_document?: unknown;
  sidecar_path?: string;
}

export interface GitCommitRequest extends GitProjectRequest {
  message: string;
}

export interface GitCommitReport {
  hash: string;
  short_hash: string;
  subject: string;
  committed_paths: string[];
}

export interface GitReviewReport {
  repo_root: string;
  branch: string;
  base_ref?: string;
  additions: number;
  deletions: number;
  files: GitReviewFile[];
}

export interface GitReviewFile {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  header: string;
  old_start: number;
  new_start: number;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  kind: 'context' | 'addition' | 'deletion';
  old_line?: number;
  new_line?: number;
  content: string;
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
  signal_dictionary: SignalDictionary;
  private_protocol: PrivateProtocolDocument;
  protocol_mapping: ProtocolMapping[];
  language_info: LanguageDocument;
  battery_protocol: BatteryProtocol;
  battery_monitor_info: BatteryMonitorInfo;
  fault_code_info: FaultCodeInfo;
}

export interface UnifiedProtocolModel {
  signal_dictionary: SignalDictionary;
  canopen: CanOpenTransport;
  private_protocol: PrivateProtocolDocument;
  mappings: ProtocolMapping[];
  validation: ProtocolValidationReport;
}

export interface SignalDictionary {
  signals: SignalDefinition[];
}

export interface SignalDefinition {
  signal_id: string;
  name: string;
  data_type: SignalDataType;
  default_value?: string;
  min_value?: string;
  max_value?: string;
  inner?: number;
  scale: SignalScale;
  display: SignalDisplay;
}

export type SignalDataType =
  | 'bool'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'i8'
  | 'i16'
  | 'i32'
  | 'f32'
  | 'string'
  | 'bytes'
  | { custom: string };

export interface SignalScale {
  scale_num: number;
  scale_den: number;
  offset: number;
  decimals: number;
}

export interface SignalDisplay {
  unit: string;
  format: string;
  description: string;
}

export interface CanOpenTransport {
  sdo_objects: CanOpenSdoObject[];
  pdo_recv: CanOpenPdoFrame[];
  pdo_send: CanOpenPdoFrame[];
}

export interface CanOpenSdoObject {
  signal_id?: string;
  name: string;
  frame_id: number;
  index: number;
  subindex: number;
  access: number;
  data_type: string;
}

export interface CanOpenPdoFrame {
  frame_id: number;
  frame_type: number;
  direction: 'receive' | 'send';
  description: string;
  mappings: CanOpenPdoMapping[];
}

export interface CanOpenPdoMapping {
  signal_id: string;
  bit_offset: number;
  bit_length: number;
  show_type: number;
}

export interface PrivateProtocolDocument {
  enabled: boolean;
  frames: PrivateFrame[];
}

export interface PrivateFrame {
  frame_id: number;
  frame_key: string;
  name: string;
  frame_type: string;
  cycle_ms: number;
  checksum: string;
  byte_order: string;
  payload: PrivatePayloadSignal[];
  source: string;
}

export interface PrivatePayloadSignal {
  signal_id: string;
  bit_offset: number;
  bit_length: number;
  byte_order: string;
}

export interface ProtocolMapping {
  signal_id: string;
  target: ProtocolMappingTarget;
}

export type ProtocolMappingTarget =
  | { kind: 'can_open_sdo'; index: number; subindex: number }
  | {
      kind: 'can_open_pdo';
      direction: 'receive' | 'send';
      frame_id: number;
      bit_offset: number;
      bit_length: number;
    }
  | {
      kind: 'private_frame';
      frame_key: string;
      frame_id: number;
      bit_offset: number;
      bit_length: number;
    };

export interface ProtocolValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProtocolCompatibilityReport {
  valid: boolean;
  document: unknown;
  updated_sections: string[];
  errors: string[];
  warnings: string[];
}

export interface BatteryProtocol {
  default_timeout_ticks: number;
  frames: BatteryMonitorFrame[];
  signals: BatteryMonitorSignal[];
  dbc_content?: string;
  [key: string]: unknown;
}

export interface BatteryMonitorInfo {
  enabled: boolean;
  page_size: number;
  items: BatteryMonitorItem[];
  [key: string]: unknown;
}

export interface FaultCodeInfo {
  schema_version?: number;
  enabled: boolean;
  version?: number;
  sources?: FaultCodeSource[];
  codes?: FaultCodeItem[];
  [key: string]: unknown;
}

export interface FaultCodeSource {
  source_key?: string;
  source_id: number;
  type_char: string;
  name?: string;
  can_id: number;
  frame_type?: number;
  type?: number;
  code_byte?: number;
  code_offset?: number;
  clear_code?: number;
  invalid_codes?: number[];
  enabled?: boolean;
  [key: string]: unknown;
}

export interface FaultCodeItem {
  source_key?: string;
  type_char?: string;
  source_id?: number;
  code: number;
  message_key?: string;
  name_key?: string;
  name?: string;
  severity?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface BatteryMonitorFrame {
  frame_key: string;
  can_id: number;
  type: number;
  desc: string;
  timeout_ticks: number;
  [key: string]: unknown;
}

export interface BatteryMonitorSignal {
  signal_key: string;
  param_id: string;
  name: string;
  inner: number;
  type: number;
  def: string;
  frame_key: string;
  pos: number;
  len: number;
  show_type: number;
  handle?: number;
  handle_param?: string;
  factor?: number;
  offset?: number;
  min?: number;
  max?: number;
  unit?: string;
  receiver?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface DbcImportReport {
  frames: BatteryMonitorFrame[];
  signals: BatteryMonitorSignal[];
  errors: string[];
}

export interface BatteryMonitorFormatter {
  kind: string;
  offset: number;
  scale_num: number;
  scale_den: number;
  decimals: number;
  display_base?: number;
  true_text?: string;
  false_text?: string;
  [key: string]: unknown;
}

export interface BatteryMonitorValidity {
  mode: string;
  frame_key?: string;
  empty_text?: string;
  timeout_ticks?: number;
  [key: string]: unknown;
}

export interface BatteryMonitorItem {
  item_key: string;
  enabled: boolean;
  order: number;
  signal_key: string;
  name_key: string;
  unit: string;
  formatter: BatteryMonitorFormatter;
  validity: BatteryMonitorValidity;
  [key: string]: unknown;
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

export interface BaiduTranslateRequest {
  from: string;
  to: string;
  texts: string[];
}

export interface TranslationCredentialStatus {
  appId: string;
  hasAppKey: boolean;
}

export interface SaveTranslationCredentialsRequest {
  appId: string;
  appKey: string | null;
}

export interface BaiduTranslateResponse {
  translations: string[];
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

export interface ExportTargetOptions {
  config: boolean;
  bin: boolean;
}

export interface ExportBatteryOptions {
  battery_protocol: ExportTargetOptions;
  battery_monitor_info: ExportTargetOptions;
  fault_code_info: ExportTargetOptions;
}

export interface ExportPlanRequest {
  project_path?: string;
  output_dir: string;
  document: unknown;
  manifest_filename?: string;
  binary_filename?: string;
  export_options?: ExportBatteryOptions;
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
  export_options?: ExportBatteryOptions;
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
  battery_monitor_base_addr: number;
  battery_monitor_item_total: number;
  battery_monitor_frame_total: number;
  battery_monitor_version: number;
  fault_code_base_addr: number;
  fault_code_version: number;
  fault_source_total: number;
  fault_code_total: number;
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

export interface CanTestSignalValue {
  name: string;
  unit: string;
  pos: number;
  len: number;
  scaleNum: number;
  scaleDen: number;
  offset: number;
  minValue?: number | null;
  maxValue?: number | null;
  rawValue: number;
  displayValue: number;
  source?: string;
  testRole?: string;
}

export interface CanTestFrame {
  id: number;
  frameType: number;
  name: string;
  dlc: number;
  cycleMs: number;
  data: string;
  source?: string;
  scenario?: string;
  signals: CanTestSignalValue[];
}

export interface CanTestSettingEntry {
  name: string;
  menuPath: string;
  frameId: number;
  index: number;
  subindex: number;
  access: string;
  dataType: string;
  pos: number;
  len: number;
  role: string;
  value: string;
  defaultValue?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  scale?: string | null;
  offset?: string | null;
  source: string;
}

export type CanTestProfile = 'smoke' | 'boundary' | 'fault' | 'regression';

export interface CanTestCase {
  caseId: string;
  title: string;
  scenario: string;
  description: string;
  tags: string[];
  frames: CanTestFrame[];
  settingEntries: CanTestSettingEntry[];
}

export interface CanTestCoverage {
  frameCount: number;
  signalCount: number;
  settingEntryCount: number;
  caseCount: number;
  generatedFrameCount: number;
  generatedSettingEntryCount: number;
  coveredScenarios: string[];
}

export interface CanTestGenerateResponse {
  frames: CanTestFrame[];
  settingEntries: CanTestSettingEntry[];
  frameCount: number;
  cases: CanTestCase[];
  coverage: CanTestCoverage;
  warnings: string[];
}

export interface CanopenNodeSummary {
  nodeId: number;
  name: string;
  sdoRxCobId: number;
  sdoTxCobId: number;
  objectCount: number;
  pdoCount: number;
  bitfieldCount: number;
}

export interface CanopenConversionReport {
  valid: boolean;
  nodes: CanopenNodeSummary[];
  files: string[];
  warnings: string[];
  model: unknown;
}

/**
 * 前后端共享的领域类型定义(前端 TypeScript 侧)。
 *
 * 本文件是 `.jcpro` 配置文档、Git 版本管理、发布导出/二进制 ABI、UI 资源、
 * 多语言与翻译、CAN 测试数据等功能的类型契约,字段命名与结构直接对应
 * Rust 后端(`src-tauri/domain`、`src-tauri/commands`)的序列化结果。
 *
 * 命名约定:
 * - `snake_case` 字段来自后端 JSON 序列化,属于跨层机器契约,改动需同步两边;
 * - `camelCase` 字段多由前端本地构造,或来自浏览器预览模式下的本地 fallback。
 */

/** 左侧导航/模块标识,后端与前端共用的功能键集合。 */
export type NavigationKey =
  | 'project'
  | 'setting-data'
  | 'realtime-data'
  | 'signal-dictionary'
  | 'private-protocol'
  | 'protocol-mapping'
  | 'canopen-export'
  | 'ui'
  | 'battery-monitor'
  | 'fault-code'
  | 'language'
  | 'export'
  | 'settings'
  | 'can-test-data';

/** 当前打开项目的最简摘要信息(列表与标题栏展示用)。 */
export interface ProjectSummary {
  name: string;
  version: string;
  /** 项目文件绝对路径;浏览器预览模式可能缺失。 */
  path?: string;
  /** 设备分辨率文本(如 `240x320`),未加载时为 `未加载`。 */
  deviceResolution: string;
  updatedAt?: string;
}

/** 模块生命周期状态,用于导航栏角标与功能可见性控制。 */
export type ModuleLifecycle = 'stable' | 'experimental' | 'deprecated' | 'experimental-deprecated';

/** 导航功能模块的静态注册元数据,由 `src/data/modules.ts` 提供。 */
export interface FeatureModule {
  key: NavigationKey;
  /** 标题的 i18n key。 */
  titleKey: string;
  /** 描述的 i18n key。 */
  descriptionKey: string;
  /** 生命周期状态;缺失视为 stable。 */
  lifecycle?: ModuleLifecycle;
  /** 生命周期说明的 i18n key,用于向用户解释为何标注。 */
  lifecycleReasonKey?: string;
}

/** 后端健康检查结果。 */
export interface BackendHealth {
  /** 应用名(来自 Cargo.toml/tauri.conf.json)。 */
  app_name: string;
  /** 版本号,与 package.json 保持同步。 */
  version: string;
  /** 编译时 git commit hash,由 Rust build.rs 注入;未知时为 `unknown`。 */
  commit_hash: string;
  /** 状态:`ok`、`browser-preview`(前端 fallback)或错误描述文本。 */
  core_status: string;
}

/** 旧版表格导入类型的种类,决定表头规范与导入逻辑。 */
export type LegacyTableKind = 'sdo' | 'pdoSimple' | 'language';

/** 项目结构校验结果。 */
export interface ProjectValidationReport {
  /** 是否整体合法(无错误);警告不影响合法状态。 */
  valid: boolean;
  /** 缺失的必需 section 名列表。 */
  missing_sections: string[];
  warnings: string[];
}

/**
 * 加载后的项目:`document` 为原始 JSON 编辑文档,`unknown` 类型,
 * 实际形态视 config_version 分为 jc001(jc001 结构)或 jc002(jc002 结构)。
 */
export interface LoadedProject {
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  /** 运行时 JSON 文档;结构见 ProjectDocument,业务代码按 config_version 解析。 */
  document: unknown;
}

/** Git 版本管理命令的基础请求参数。 */
export interface GitProjectRequest {
  /** 项目文件绝对路径,用于定位所属 git 仓库。 */
  project_path: string;
  /** v1 已废弃 sidecar 文件绝对路径(旧项目兼容);不存在则省略。 */
  sidecar_path?: string;
}

/** 项目所属 git 仓库的状态快照。 */
export interface GitProjectStatus {
  /** 项目路径下是否可用的 git 仓库。 */
  available: boolean;
  repo_root?: string;
  branch?: string;
  head_hash?: string;
  head_short_hash?: string;
  head_subject?: string;
  /** 需要纳入版本管理的相对路径(.jcpro 及 v1 sidecar)。 */
  managed_paths: string[];
  /** 相对工作区有改动的路径。 */
  changed_paths: string[];
  additions: number;
  deletions: number;
  /** 是否存在已暂存(staged)的改动。 */
  has_staged_changes: boolean;
  warning?: string;
}

/** git 提交信息(历史条目)。 */
export interface GitRevision {
  hash: string;
  short_hash: string;
  author: string;
  /** 提交时间(ISO 8601 文本)。 */
  authored_at: string;
  subject: string;
}

/** 项目 git 上下文:状态 + 最近提交历史。 */
export interface GitProjectContext {
  status: GitProjectStatus;
  revisions: GitRevision[];
}

/** 某个历史提交中项目文档的完整快照,用于审阅/回滚。 */
export interface GitRevisionSnapshot {
  revision: GitRevision;
  /** 该提交时的 .jcpro 文档。 */
  project_document: unknown;
  sidecar_document?: unknown;
  sidecar_path?: string;
}

/** 提交一次项目版本的请求。 */
export interface GitCommitRequest extends GitProjectRequest {
  /** 提交消息。 */
  message: string;
}

/** 提交结果报告。 */
export interface GitCommitReport {
  hash: string;
  short_hash: string;
  subject: string;
  /** 本次实际提交的文件路径(相对仓库根)。 */
  committed_paths: string[];
}

/** 变更审阅报告:工作区改动或历史提交的差异总览。 */
export interface GitReviewReport {
  repo_root: string;
  branch: string;
  /** 对比基准 ref;审阅工作区改动时可能为暂存区。 */
  base_ref?: string;
  additions: number;
  deletions: number;
  files: GitReviewFile[];
}

/** 单个变更文件的信息。 */
export interface GitReviewFile {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

/** 工作区某文件的编辑态内容(原始 + 当前)。 */
export interface GitWorktreeFileContent {
  path: string;
  /** 打开编辑前的原文。 */
  original_content: string;
  /** 编辑后的当前内容。 */
  current_content: string;
}

/** 差异块(hunk),对应统一 diff 的一段。 */
export interface GitDiffHunk {
  /** 统一 diff 块头文本(如 `@@ -1,3 +1,4 @@`)。 */
  header: string;
  old_start: number;
  new_start: number;
  lines: GitDiffLine[];
}

/** 差异行。 */
export interface GitDiffLine {
  kind: 'context' | 'addition' | 'deletion';
  /** 原文行号;context/addition 行可能缺省。 */
  old_line?: number;
  /** 新文行号;context/deletion 行可能缺省。 */
  new_line?: number;
  /** 行内容(不含 +/- 前缀)。 */
  content: string;
}

/** 迁移后的项目结果(old: v1 → v2 或文档间迁移)。 */
export interface MigratedProject {
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  document: unknown;
  /** 迁移过程中新增的 section 名列表。 */
  added_sections: string[];
  /** 迁移后的 config_version。 */
  migrated_version: string;
}

/** 项目文档解析报告。 */
export interface ProjectParseReport {
  valid: boolean;
  summary: ProjectSummary;
  validation: ProjectValidationReport;
  /** 解析成功时的完整文档;失败为 null。 */
  document: ProjectDocument | null;
  added_sections: string[];
  errors: string[];
}

/**
 * `.jcpro` 顶层结构(jc001 与 jc002 的并集)。
 * 不同 config_version 允许/强制字段不同,校验规则见后端 `validate_project_document`。
 */
export interface ProjectDocument {
  config_version?: string;
  project: ProjectMetadata;
  export_info: ProjectExportSettings;
  device: DeviceConfig;
  ui_info: UiInfoDocument;
  /** 仅供 v1 编辑/导入兼容使用;jc002 持久化为 advanced PDO 各段。 */
  pdo_simple_send_recv?: PdoSimpleDocument;
  /** jc002/advanced PDO 全局参数段(结构见 PdoAdvancedDocument)。 */
  pdo_global_param: unknown[];
  pdo_condition: unknown[];
  pdo_recv: unknown[];
  pdo_send: unknown[];
  /** SDO 菜单树文档。 */
  sdo_info: SdoNodeDocument;
  canopen?: CanOpenProjectDocument;
  /** jc002 profile 集合(控制器/电池/故障码)。 */
  protocol_profiles?: ProtocolProfilesDocument;
  signal_dictionary: SignalDictionary;
  private_protocol: PrivateProtocolDocument;
  protocol_mapping: ProtocolMapping[];
  /** v1 语言数据(jc001);与 v2 `localization` 互斥。 */
  language_info?: LanguageDocument;
  /** v2 语言数据(jc002);与 v1 `language_info` 互斥。 */
  localization?: LocalizationDocument;
  /** jc002 逻辑显示数据：一个业务值可绑定多个 CANopen 响应变体。 */
  display_data?: DisplayDataDocument;
  battery_monitor?: BatteryMonitorProtocol;
  fault_code_info?: FaultCodeInfo;
}

/** jc002 逻辑显示数据段；独立于固定40字节 SDO v2记录。 */
export interface DisplayDataDocument {
  schema_version: 1;
  signals: DisplayDataSignalDocument[];
}

export interface DisplayDataSignalDocument {
  data_id: string;
  sources: DisplayDataSourceDocument[];
  format_profiles: Record<string, DisplayDataFormatProfileDocument>;
  format_selector: DisplayDataFormatSelectorDocument;
}

export interface DisplayDataSourceDocument {
  source_id: string;
  kind: 'canopen_sdo' | string;
  channel_ref: string;
  request: DisplayDataRequestDocument;
  response_variants: DisplayDataResponseVariantDocument[];
}

export interface DisplayDataRequestDocument {
  command: number;
  index: number;
  subindex: number;
  data: number[];
}

export interface DisplayDataResponseVariantDocument {
  command: number;
  raw_type: 'u16' | 'u32' | string;
  raw_offset: number;
  scale_num: number;
  scale_den: number;
  default_format: string;
}

export interface DisplayDataFormatProfileDocument {
  decimals: number;
  rounding: 'truncate' | 'nearest' | string;
}

export interface DisplayDataFormatSelectorDocument {
  /** 稳定的 sdo_info.parameter_id，不使用菜单数组下标。 */
  parameter_ref: string;
  value_map: Record<string, string>;
  fallback: string;
}

/** 发布导出相关的路径与文件名配置。 */
export interface ProjectExportSettings {
  folder_name: string;
  manifest_filename: string;
  binary_filename: string;
  battery_monitor: ProjectExportTargetSettings;
  fault_code_info: ProjectExportTargetSettings;
}

/** 某类数据在导出包中是否包含 config/bin。 */
export interface ProjectExportTargetSettings {
  config: boolean;
  bin: boolean;
}

/** 统一协议模型:将信号字典/CANopen/锂电监控/私有帧统一到一个编辑视图。 */
export interface UnifiedProtocolModel {
  signal_dictionary: SignalDictionary;
  canopen: CanOpenTransport;
  battery_monitor: BatteryMonitorProtocolModel;
  private_protocol: PrivateProtocolDocument;
  mappings: ProtocolMapping[];
  validation: ProtocolValidationReport;
}

/** 业务信号字典(含兼容旧项目的统一信号定义)。 */
export interface SignalDictionary {
  signals: SignalDefinition[];
}

/** 一个业务信号的完整定义。 */
export interface SignalDefinition {
  signal_id: string;
  name: string;
  data_type: SignalDataType;
  default_value?: string;
  min_value?: string;
  max_value?: string;
  /** 字节宽度/嵌套长度(按 data_type 解释,如 string/bytes 的长度)。 */
  inner?: number;
  scale: SignalScale;
  display: SignalDisplay;
}

/** 信号数据类型;`{ custom: string }` 允许自定义类型名。 */
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

/** 物理值 = (原始值/scale_den)*scale_num + offset,按 decimals 保留小数。 */
export interface SignalScale {
  scale_num: number;
  scale_den: number;
  offset: number;
  decimals: number;
}

/** 信号的显示属性。 */
export interface SignalDisplay {
  unit: string;
  /** 显示格式化串(固件定义)。 */
  format: string;
  description: string;
}

/** CANopen 传输层统一视图(SDO 对象 + 收发 PDO 帧)。 */
export interface CanOpenTransport {
  sdo_objects: CanOpenSdoObject[];
  pdo_recv: CanOpenPdoFrame[];
  pdo_send: CanOpenPdoFrame[];
}

/** .jcpro 中的 CANopen 子树文档。 */
export interface CanOpenProjectDocument {
  schema_version: number;
  nodes: CanOpenNodeDocument[];
  pdos: CanOpenPdoDocument[];
}

/** 控制器协议段:实现侧所属 pdo/sdo/canopen 段。 */
export interface ControllerProtocolSections {
  pdo_global_param: unknown[];
  pdo_condition: unknown[];
  pdo_recv: unknown[];
  pdo_send: unknown[];
  sdo_info: SdoNodeDocument;
  canopen?: CanOpenProjectDocument;
}

/** 锂电监控协议段:实现侧所属 battery_monitor 段。 */
export interface BatteryProtocolSections {
  battery_monitor?: BatteryMonitorProtocol;
}

/** 控制器协议 profile:独立命名空间下的控制器协议文档集合。 */
export interface ControllerProtocolProfile {
  profile_id: string;
  controller_family: string;
  controller_revision: string;
  description?: string;
  /** 叠加在项目级语言目录之上的局部目录(profile 内)。 */
  localization_overlay?: LocalizationOverlayDocument;
  protocol: ControllerProtocolSections;
}

/** 电池协议 profile:独立命名空间下的锂电监控协议文档。 */
export interface BatteryProtocolProfile {
  profile_id: string;
  battery_family: string;
  battery_revision: string;
  description?: string;
  /** 叠加在项目级语言目录之上的局部目录(profile 内)。 */
  localization_overlay?: LocalizationOverlayDocument;
  protocol: {
    battery_monitor: BatteryMonitorProtocol;
  };
}

/**
 * jc002 profile 集合文档(schema_version 恒为 2)。
 * active_* 仅决定当前编辑视图,以 editor-only 持久化策略序列化。
 */
export interface ProtocolProfilesDocument {
  schema_version: 2;
  /**
   * 仅编辑器使用:当前激活的控制器 profile 选择状态。
   * 项目序列化器与 jc002 导出 manifest 会移除这些字段;固件在运行时自行选择。
   */
  active_controller_profile_id: string;
  active_battery_profile_id?: string;
  active_fault_code_profile_id?: string;
  controller_profiles: ControllerProtocolProfile[];
  battery_profiles: BatteryProtocolProfile[];
  fault_code_profiles: FaultCodeProfile[];
}

/** 独立的故障码解析与目录 profile。 */
export interface FaultCodeProfile {
  profile_id: string;
  fault_family: string;
  fault_revision: string;
  description?: string;
  /** 叠加在项目级语言目录之上的局部目录(profile 内)。 */
  localization_overlay?: LocalizationOverlayDocument;
  protocol: {
    fault_code_info: FaultCodeInfo;
  };
}

/** CANopen 节点定义。 */
export interface CanOpenNodeDocument {
  node_id: number;
  name: string;
  /** 节点角色:`local`(本机)、`remote` 或设备自定义字符串。 */
  role: 'local' | 'remote' | string;
  sdo?: CanOpenSdoChannelDocument;
}

/** 节点 SDO 通道的 COB-ID 配置。 */
export interface CanOpenSdoChannelDocument {
  cob_id_mode: 'default' | 'explicit' | string;
  client_to_server_cob_id: number;
  server_to_client_cob_id: number;
}

/** CANopen PDO 文档定义(编辑视图)。 */
export interface CanOpenPdoDocument {
  key: string;
  direction: 'receive' | 'send' | string;
  pdo_type: 'tpdo' | 'rpdo' | string;
  /** 通信对象标识符(COB-ID),含方向位。 */
  cob_id: number;
  cob_id_mode: 'default' | 'explicit' | string;
  frame_type: number;
  producer_node_id?: number;
  consumer_node_ids: number[];
  pdo_number?: number;
  consumer_pdo_number?: number;
  transmission_type?: number;
  /** 帧数据来源段:pdo_recv 或 pdo_send。 */
  source_section?: 'pdo_recv' | 'pdo_send' | string;
  source_index?: number;
}

/** 统一协议模型中的 SDO 对象条目。 */
export interface CanOpenSdoObject {
  signal_id?: string;
  name: string;
  /** 帧 COB-ID。 */
  frame_id: number;
  index: number;
  subindex: number;
  /** 访问权限位掩码(如 read/write)。 */
  access: number;
  /** 数据类型文本。 */
  data_type: string;
}

/** 统一协议模型中的 PDO 帧。 */
export interface CanOpenPdoFrame {
  frame_id: number;
  frame_type: number;
  direction: 'receive' | 'send';
  description: string;
  /** 信号 → 帧比特位映射列表。 */
  mappings: CanOpenPdoMapping[];
  metadata?: CanOpenPdoMetadata;
}

/** PDO 帧的可选元数据(编辑辅助信息)。 */
export interface CanOpenPdoMetadata {
  key: string;
  cob_id_mode: 'default' | 'explicit' | string;
  pdo_type: 'tpdo' | 'rpdo' | string;
  pdo_number?: number;
  producer_node_id?: number;
  consumer_node_ids: number[];
  consumer_pdo_number?: number;
  transmission_type?: number;
}

/** 信号到 PDO 帧内比特位的映射。 */
export interface CanOpenPdoMapping {
  signal_id: string;
  /** 帧内起始比特位(0 起)。 */
  bit_offset: number;
  bit_length: number;
  /** 显示类型编号(配合信号定义解析)。 */
  show_type: number;
}

/** 私有协议文档(兼容保留;CANopen+信号字典的统一重构期间使用)。 */
export interface PrivateProtocolDocument {
  enabled: boolean;
  frames: PrivateFrame[];
}

/** 私有协议帧定义。 */
export interface PrivateFrame {
  frame_id: number;
  frame_key: string;
  name: string;
  frame_type: string;
  /** 周期(毫秒)。 */
  cycle_ms: number;
  /** 校验方式文本。 */
  checksum: string;
  /** 字节序文本(如 little_endian)。 */
  byte_order: string;
  payload: PrivatePayloadSignal[];
  source: string;
}

/** 私有帧载荷中的信号布局。 */
export interface PrivatePayloadSignal {
  signal_id: string;
  bit_offset: number;
  bit_length: number;
  byte_order: string;
}

/** 业务信号与其传输目标的映射。 */
export interface ProtocolMapping {
  signal_id: string;
  target: ProtocolMappingTarget;
}

/** 业务信号的传输目标:type 化歧义联合(通过 kind 区分)。 */
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

/** 统一协议模型的交叉校验结果。 */
export interface ProtocolValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** 协议兼容/扁平化处理报告(历史模型 → jc002 结构)。 */
export interface ProtocolCompatibilityReport {
  valid: boolean;
  document: unknown;
  updated_sections: string[];
  errors: string[];
  warnings: string[];
}

/** 锂电监控协议文档(schema_version/version 双字段,版本固定为 2)。 */
export interface BatteryMonitorProtocol {
  schema_version: 2;
  enabled: boolean;
  version: 2;
  /** 缺数据超时判定用的默认 tick 数。 */
  default_timeout_ticks: number;
  /** 分页大小,用于固件按页读取。 */
  page_size: number;
  frames: BatteryMonitorFrame[];
  signals: BatteryMonitorSignal[];
  /** 固件 UI 展示条目(复用信号+格式化+有效性)。 */
  items: BatteryMonitorItem[];
  [key: string]: unknown;
}

/** 与 BatteryMonitorProtocol 相同的别名(统一协议模型引用)。 */
export type BatteryMonitorProtocolModel = BatteryMonitorProtocol;

/** 故障码文档(来源/定义/绑定三组数据)。 */
export interface FaultCodeInfo {
  schema_version?: number;
  enabled: boolean;
  version?: number;
  sources?: FaultCodeSource[];
  definitions?: FaultCodeDefinition[];
  /** 来源码值 → 故障定义的绑定关系。 */
  bindings?: FaultCodeBinding[];
  [key: string]: unknown;
}

/** 故障码定义(故障键 → 多语言消息键)。 */
export interface FaultCodeDefinition {
  fault_key: string;
  /** 指向多语言目录的消息键。 */
  message_key: string;
  name?: string;
  /** 严重等级文本。 */
  severity?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** 故障来源码值到故障定义的绑定。 */
export interface FaultCodeBinding {
  source_key: string;
  /** 原始设备上报的码值。 */
  code: number;
  fault_key: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** 故障来源帧的解析配置(从哪一帧、哪一字节取码)。 */
export interface FaultCodeSource {
  source_key?: string;
  source_id: number;
  /** 来源类型字符(固件定义)。 */
  type_char: string;
  name?: string;
  can_id: number;
  frame_type?: number;
  type?: number;
  /** 取码字节索引。 */
  code_byte?: number;
  /** 由 code_byte 扩展的偏移。 */
  code_offset?: number;
  /** 正常/清除时上报的码值。 */
  clear_code?: number;
  /** 视为无效(忽略)的码值列表。 */
  invalid_codes?: number[];
  enabled?: boolean;
  [key: string]: unknown;
}

/** 锂电监控 CAN 帧定义。 */
export interface BatteryMonitorFrame {
  frame_key: string;
  can_id: number;
  frame_type: number;
  /** 数据长度计数。 */
  dlc: number;
  desc: string;
  /** 该帧的超时 tick 数(0 表示不超时)。 */
  timeout_ticks: number;
  [key: string]: unknown;
}

/** 锂电监控信号(原始取数 + 位域解析 + 显示格式化)。 */
export interface BatteryMonitorSignal {
  signal_key: string;
  name: string;
  /** 信号位宽(bit)。 */
  inner: number;
  /** 所属帧。 */
  frame_key: string;
  /** 帧内起始位。 */
  pos: number;
  len: number;
  byte_order: 'little_endian' | 'big_endian';
  /** 原始码值减去的偏移。 */
  raw_offset: number;
  /** 原始取数类型(位域如何读出)。 */
  raw_type: 'u8' | 'u16_le' | 'u32_le' | 'datetime_ymdhms';
  /** 解析后的数值类型。 */
  value_type: 'u8' | 'u16' | 'u32' | 'f32' | 'datetime';
  /** 解析分辨率(物理值 = (原始值-raw_offset)*parse_resolution + parse_offset)。 */
  parse_resolution: number;
  parse_offset: number;
  /** 位域掩码(仅取 raw 数据中该信号所需位)。 */
  parse_mask: number;
  /** 位域移位量。 */
  parse_shift: number;
  receiver?: string;
  comment?: string;
  [key: string]: unknown;
}

/** DBC 文件导入结果。 */
export interface DbcImportReport {
  frames: BatteryMonitorFrame[];
  signals: BatteryMonitorSignal[];
  errors: string[];
}

/** 显示格式化配置(配合 BatteryMonitorSignal 解析)。 */
export interface BatteryMonitorFormatter {
  /** 格式化方式(如 number/text)。 */
  kind: string;
  offset: number;
  scale_num: number;
  scale_den: number;
  decimals: number;
  /** 进制显示基数(如 10/16/2)。 */
  display_base?: number;
  /** kind 为布尔/状态文本时的真值文本。 */
  true_text?: string;
  false_text?: string;
  [key: string]: unknown;
}

/** 数据有效性判断(何时显示为空/超时)。 */
export interface BatteryMonitorValidity {
  mode: string;
  frame_key?: string;
  /** 无效时显示的空文本。 */
  empty_text?: string;
  timeout_ticks?: number;
  [key: string]: unknown;
}

/** 固件 UI 展示条目:信号 + 格式化 + 有效性 + 多语言名称。 */
export interface BatteryMonitorItem {
  item_key: string;
  enabled: boolean;
  /** 固件展示顺序。 */
  order: number;
  signal_key: string;
  /** 名称的多语言键。 */
  name_key: string;
  /** 语言缺失时的回退名称。 */
  fallback_name: string;
  unit: string;
  formatter: BatteryMonitorFormatter;
  validity: BatteryMonitorValidity;
  [key: string]: unknown;
}

/** 项目元信息段。 */
export interface ProjectMetadata {
  name: string;
  /** 模板来源标识。 */
  from?: string;
  /** 项目基路径。 */
  base_path?: string;
  create_time?: string;
  update_time?: string;
}

/** 设备分辨率配置。 */
export interface DeviceConfig {
  resolution_w: number;
  resolution_h: number;
}

/** UI 资源顶层文档(logo 与主页资源)。 */
export interface UiInfoDocument {
  logo?: UiResourceDocument;
  main?: UiPageDocument;
  [key: string]: unknown;
}

/** UI 页面资源容器。 */
export interface UiPageDocument {
  name?: string;
  /** 资源键 → UiResourceDocument 的映射。 */
  item: Record<string, unknown>;
  [key: string]: unknown;
}

/** 单个 UI 资源(位置/尺寸代码由后端在执行资源命令时按 key 解析)。 */
export interface UiResourceDocument {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** 可选图片资源集。 */
  options: unknown[];
  [key: string]: unknown;
}

/** v1 简化 PDO 文档(仅供兼容查看/迁移,见 ProjectDocument.pdo_simple_send_recv)。 */
export interface PdoSimpleDocument {
  pdo_send: PdoSimpleFrameDocument[];
  pdo_recv: PdoSimpleFrameDocument[];
}

/** v1 简化 PDO 帧。 */
export interface PdoSimpleFrameDocument {
  id: number;
  /** 帧类型标识。 */
  type: number;
  desc: string;
  data: PdoSimpleSignalDocument[];
  [key: string]: unknown;
}

/** v1 简化 PDO 帧内信号。 */
export interface PdoSimpleSignalDocument {
  /** 帧内起始位。 */
  pos: number;
  len: number;
  /** 显示类型编号。 */
  show_type: number;
  /** 关联的参数索引。 */
  pdo_param_index: number;
  pdo_param_name?: string;
  [key: string]: unknown;
}

/** SDO 菜单树节点(自引用树结构)。 */
export interface SdoNodeDocument {
  /** 节点类型编号。 */
  type: number;
  /** 用户权限位。 */
  user_auth: number;
  /** 名称的语言索引。 */
  name_index: number;
  name: string;
  children: SdoNodeDocument[];
  /** 是否带操作控制(位标志)。 */
  control_protocol?: number;
  control_rw?: number;
  control_use_default?: number;
  control_use_min_max?: number;
  /** 处理句柄编号。 */
  handle?: number;
  handle_name?: string;
  handle_param?: string;
  /** 稳定设置参数引用键，供 display_data.format_selector.parameter_ref 使用。 */
  parameter_id?: string;
  fid?: number;
  mid?: number;
  sid?: number;
  /** 默认值(以字符串形式跨语言保留原样)。 */
  data_default?: string;
  data_min?: string;
  data_max?: string;
  /** 预处理句柄及其参数。 */
  pre_handle?: number;
  pre_handle_name?: string;
  pre_handle_scale?: string;
  pre_handle_offset?: string;
  pre_handle_decimal?: number;
  pre_handle_decimal_name?: string;
  [key: string]: unknown;
}

/** 语言编辑器投影：v1 使用 language_labels，jc002 使用 language.name.* 消息。 */
export interface LanguageDocument {
  /** 语言编码列表(索引语言块用)。 */
  list_code_language: string[];
  /** v2 默认 locale，用于编辑器显示语言名称。 */
  default_locale?: string;
  /** 语言内部名列表,与 list_code_language 一一对应。 */
  list_inner: string[];
  /** 多语言翻译数据。 */
  list_translate: Record<string, unknown>;
  /** 语言编码 → 显示名映射。 */
  language_labels?: Record<string, string>;
  /** jc002 语言名称 key:locale code → language.name.<locale>。 */
  language_name_keys?: Record<string, string>;
  /** 编辑器锁定键数量(合并/导出提示用)。 */
  editor_locked_key_count?: number;
  /** UI 受保护键仅用于编辑 UI(Profile 叠加视图保留编辑器但不允许改动)。 */
  editor_protected_keys?: string[];
}

/** 单条多语言消息:简单字符串或复数形式表。 */
export type LocalizationMessage = string | Record<string, string>;

/** 单个 locale 的语言数据。 */
export interface LocalizationLocale {
  enabled?: boolean;
  /** 阅读方向。 */
  direction?: 'ltr' | 'rtl';
  translations: Record<string, LocalizationMessage>;
  [key: string]: unknown;
}

/** v2 语言文档(localization 段):稳定消息键 + LVGL lv_i18n 风格动态语言包。 */
export interface LocalizationDocument {
  default_locale: string;
  /** 语言切换的顺序。 */
  locale_order: string[];
  locales: Record<string, LocalizationLocale>;
  [key: string]: unknown;
}

/** Profile 内局部消息;所属 locale 与顺序仍由项目级配置决定。 */
export interface LocalizationOverlayDocument {
  locales: Record<string, LocalizationOverlayLocale>;
  [key: string]: unknown;
}

/** Profile 叠加目录中的单个 locale 翻译集合。 */
export interface LocalizationOverlayLocale {
  translations: Record<string, LocalizationMessage>;
  [key: string]: unknown;
}

/** 百度翻译请求。 */
export interface BaiduTranslateRequest {
  /** 源语言编码。 */
  from: string;
  /** 目标语言编码。 */
  to: string;
  /** 待翻译文本列表。 */
  texts: string[];
}

/** 翻译凭据状态(凭据存储于系统 keyring,Rust 侧管理)。 */
export interface TranslationCredentialStatus {
  appId: string;
  /** 是否已配置 appKey。 */
  hasAppKey: boolean;
}

/** 保存/更新百度翻译凭据的请求;appKey 为 null 表示仅清除判断。 */
export interface SaveTranslationCredentialsRequest {
  appId: string;
  appKey: string | null;
}

/** 异常退出恢复草稿(双持久化:Tauri 后端 + 浏览器 localStorage)。 */
export interface ProjectRecoveryDraft {
  schemaVersion: number;
  /** 项目文件绝对路径,用于关联窗口与恢复提示。 */
  projectPath: string;
  projectName: string;
  /** 草稿保存时间(ISO 文本)。 */
  savedAt: string;
  /** 草稿中的文档快照。 */
  document: unknown;
}

/** 百度翻译响应。 */
export interface BaiduTranslateResponse {
  /** 与请求 texts 顺序对应的译文列表。 */
  translations: string[];
}

/** 新建项目请求。 */
export interface NewProjectRequest {
  /** 项目文件保存路径(绝对路径)。 */
  path: string;
  name: string;
  /** 设备分辨率(宽)。 */
  resolutionW: number;
  /** 设备分辨率(高)。 */
  resolutionH: number;
}

/** 保存项目请求。 */
export interface SaveProjectRequest {
  path: string;
  document: unknown;
}

/** 另存为请求(从 source_path 迁到 target_path,并复制资源)。 */
export interface SaveProjectAsRequest {
  source_path: string;
  target_path: string;
  document: unknown;
}

/** 另存为时需要复制的资源文件(UI 图片等)。 */
export interface ProjectResourceCopyItem {
  source: string;
  destination: string;
}

/** 另存为结果报告。 */
export interface SaveProjectAsReport {
  project: LoadedProject;
  copied_resources: ProjectResourceCopyItem[];
  warnings: string[];
}

/** 项目窗口操作结果类型:复用当前窗口/新开窗口/聚焦既有窗口。 */
export type ProjectWindowAction = 'current' | 'created' | 'focused';

/** 项目窗口打开结果(每个项目路径独立窗口)。 */
export interface ProjectWindowOpenResult {
  action: ProjectWindowAction;
  /** Webview 窗口标签。 */
  windowLabel: string;
  path: string;
}

/** 旧版表格的导出规范(表头列定义)。 */
export interface LegacyTableSpec {
  kind: LegacyTableKind;
  /** 期望表头列名(顺序敏感)。 */
  headers: string[];
}

/** 表格导入的合法性检查结果。 */
export interface TableValidationReport {
  valid: boolean;
  expected_headers: string[];
  actual_headers: string[];
  errors: string[];
}

/** 通用二维表格文档(CSV/表格交换用)。 */
export interface TableDocument {
  headers: string[];
  /** 数据行;任一行行宽应等于 headers 长度。 */
  rows: string[][];
}

/** 表格文件请求(CSV/Excel 文件路径)。 */
export interface TableFileRequest {
  path: string;
}

/** 导出二维表格到文件。 */
export interface ExportTableRequest {
  path: string;
  document: TableDocument;
}

/** 生成发布包/导出计划的基础请求(canexport 配置可覆盖默认名)。 */
export interface ExportPlanRequest {
  project_path?: string;
  output_dir: string;
  document: unknown;
  folder_name?: string;
  manifest_filename?: string;
  binary_filename?: string;
}

/** 二进制构建报告(bundle .bin 的布局与校验信息)。 */
export interface BinaryBuildReport {
  valid: boolean;
  file_size: number;
  /** CRC16 校验值。 */
  crc: number;
  data_description: DataDescriptionPlan;
  /** 生成的二进制字节。 */
  bytes: number[];
  warnings: string[];
  errors: string[];
}

/** 与旧版 .bin 做逐字节比较的请求。 */
export interface BinaryCompareRequest {
  document: unknown;
  legacy_binary_path: string;
}

/** 与旧版 .bin 的比较结果报告。 */
export interface BinaryCompareReport {
  valid: boolean;
  /** 两文件是否一致。 */
  same: boolean;
  generated_size: number;
  legacy_size: number;
  /** 首个差异偏移;两者一致时缺省。 */
  first_diff_offset?: number;
  generated_byte?: number;
  legacy_byte?: number;
  build: BinaryBuildReport;
  errors: string[];
}

/** 发布包导出结果报告。 */
export interface ProjectExportReport {
  valid: boolean;
  /** 导出根目录(输出目录下的 jc_export 或其配置名)。 */
  export_root: string;
  manifest_path: string;
  binary_path: string;
  copied_images: UiImageCopyItem[];
  binary: BinaryBuildReport;
  errors: string[];
  warnings: string[];
}

/** 仅复制 UI 图片资源的报告(v2 细分导出)。 */
export interface UiImageCopyReport {
  valid: boolean;
  export_root: string;
  copied_files: UiImageCopyItem[];
  errors: string[];
  warnings: string[];
}

/** 被复制的图片源/目标对。 */
export interface UiImageCopyItem {
  source: string;
  destination: string;
}

/** 导出计划(先规划后写盘):目录、清单、二进制数据描述与屏幕资源。 */
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

/** 屏幕资源(图片)的导出计划。 */
export interface ScreenSourcePlan {
  update: boolean;
  /** 图片资源总数。 */
  num: number;
  pages: ScreenPagePlan[];
}

/** 单个屏幕页面资源计划。 */
export interface ScreenPagePlan {
  key: string;
  name: string;
  num: number;
  items: ScreenItemPlan[];
}

/** 屏幕内单个图片项的导出计划。 */
export interface ScreenItemPlan {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 设备端目标路径。 */
  dest: string;
  /** 源文件路径。 */
  src: string;
  /** 目标格式。 */
  format: string;
  p_num?: number;
}

/**
 * 二进制数据描述:各段的基址/数量/CRC 及版本。
 * `*_addr = -1` + `*_total = 0` 表示该段可选且未包含;地址为 0 表示跟随前段连续布局。
 */
export interface DataDescriptionPlan {
  update: boolean;
  /** 输出格式标识。 */
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
  /** 锂电监控段基址。 */
  battery_monitor_base_addr: number;
  battery_monitor_item_total: number;
  battery_monitor_frame_total: number;
  battery_monitor_version: number;
  fault_code_base_addr: number;
  fault_code_version: number;
  fault_source_total: number;
  fault_code_total: number;
  /** SDO 段基址。 */
  sdo_base_addr: number;
  sdo_version: number;
  /** v1 语言块地址(与索引语言对应)。 */
  language_addr?: number[];
  /** v1 语言编码列表。 */
  language_code?: string[];
  /** v2 动态语言包段基址。 */
  i18n_base_addr?: number;
  i18n_size?: number;
  i18n_version?: number;
  i18n_locale_total?: number;
  i18n_message_total?: number;
  /** jc002 profile 载荷版本。 */
  protocol_profile_version?: number;
  controller_profile_total?: number;
  active_controller_profile_id?: string;
  battery_profile_total?: number;
  active_battery_profile_id?: string;
  fault_code_profile_total?: number;
  active_fault_code_profile_id?: string;
  protocol_bundle_version?: number;
  /** 各 profile 的独立载荷段。 */
  protocol_profile_payloads?: ProtocolProfilePayloadPlan[];
}

/** jc002 profile 载荷段计划。 */
export interface ProtocolProfilePayloadPlan {
  /** 独立的载荷族;控制器/电池/故障三者的载荷彼此独立,不做组合。 */
  scope: 'controller' | 'battery' | 'fault';
  profile_id: string;
  base_addr: number;
  file_size: number;
  crc: number;
  description: DataDescriptionPlan;
}

/** SDO 表格导入报告。 */
export interface SdoImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  /** 转换后的 SDO 文档;失败为 null。 */
  document: unknown | null;
}

/** v1 简化 PDO 表格导入报告。 */
export interface PdoSimpleImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  document: unknown | null;
}

/** v1 简化 PDO → jc002 advanced PDO 转换报告。 */
export interface PdoSimpleConversionReport {
  valid: boolean;
  document: PdoAdvancedDocument | null;
  errors: string[];
  warnings: string[];
  source_frame_total: number;
  source_signal_total: number;
  /** 转换生成的全局参数总数。 */
  generated_param_total: number;
}

/** jc002 advanced PDO 解析报告。 */
export interface PdoAdvancedParseReport {
  valid: boolean;
  document: PdoAdvancedDocument | null;
  errors: string[];
}

/** jc002 advanced PDO 文档(实际持久化的 PDO 格式)。 */
export interface PdoAdvancedDocument {
  pdo_global_param: PdoGlobalParam[];
  pdo_condition: PdoCondition[];
  pdo_recv: PdoAdvancedFrame[];
  pdo_send: PdoAdvancedFrame[];
}

/** advanced PDO 全局参数。 */
export interface PdoGlobalParam {
  param_id: string;
  name: string;
  /** 默认值(字符串形式)。 */
  def: string;
  reserved: number;
  type: number;
  /** 位宽/嵌套长度。 */
  inner: number;
}

/** advanced PDO 条件规则(满足 process 与输入参数时触发)。 */
export interface PdoCondition {
  param_id: string;
  /** 处理方式编号。 */
  process: number;
  data: PdoConditionInput[];
}

/** 条件规则的输入参数引用。 */
export interface PdoConditionInput {
  param_id: string;
}

/** advanced PDO 帧。 */
export interface PdoAdvancedFrame {
  id: number;
  type: number;
  desc: string;
  data: PdoAdvancedSignal[];
}

/** advanced PDO 帧内信号。 */
export interface PdoAdvancedSignal {
  pos: number;
  len: number;
  show_type: number;
  handle: number;
  handle_param: string;
  param_id: string;
}

/** v1 语言表格导入报告。 */
export interface LanguageImportReport {
  valid: boolean;
  table: TableValidationReport;
  errors: string[];
  document: unknown | null;
}

/** 单语言 CSV 导入请求(填充分支提交到指定语言)。 */
export interface SingleLanguageCsvImportRequest {
  path: string;
  language_code: string;
  document: LanguageDocument;
}

/** 单语言 CSV 导入统计报告。 */
export interface SingleLanguageImportReport {
  valid: boolean;
  language_code: string;
  filled: number;
  skipped_existing: number;
  skipped_unknown: number;
  skipped_empty: number;
  skipped_duplicate: number;
  errors: string[];
  document: LanguageDocument | null;
}

/** UI 资源解析报告(logo 与主页面资源列表)。 */
export interface UiResourceParseReport {
  valid: boolean;
  logo: ParsedUiResource | null;
  main_items: ParsedUiResource[];
  errors: string[];
}

/** UI 资源解析请求(可选项目路径用于定位相对资源)。 */
export interface UiResourceParseRequest {
  project_path?: string;
  document: unknown;
}

/** 更新单个 UI 资源的位置与默认选项。 */
export interface UiResourceUpdateRequest {
  document: unknown;
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  default_option: number;
}

/** UI 资源更新结果报告。 */
export interface UiResourceUpdateReport {
  valid: boolean;
  document: unknown;
  errors: string[];
}

/** 为 UI 资源新增默认可选图片集。 */
export interface UiResourceOptionAddRequest {
  document: unknown;
  key: string;
  /** 新增选项的源图片路径列表。 */
  sources: string[];
}

/** 移除 UI 资源的某个可选图片集。 */
export interface UiResourceOptionRemoveRequest {
  document: unknown;
  key: string;
  option_index: number;
}

/** 解析后的 UI 资源(供画布/表格编辑)。 */
export interface ParsedUiResource {
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 资源类型(Show/List/Anim,见 UiCanvasPreview 渲染)。 */
  handle: 'Show' | 'List' | 'Anim' | 'Unknown';
  default_option: number;
  /** 设备端目标路径列表。 */
  dest: string[];
  options: ParsedResourceOption[];
  pdo_param_index?: number;
}

/** UI 资源的单个可选图片集。 */
export interface ParsedResourceOption {
  /** 源图片路径列表(动画时为帧序列)。 */
  sources: string[];
  /** 动画帧数;静态图为 1。 */
  frame_count: number;
  format?: string;
}

/** CAN 测试数据中的单个信号值。 */
export interface CanTestSignalValue {
  name: string;
  unit: string;
  /** 帧内起始位。 */
  pos: number;
  len: number;
  scaleNum: number;
  scaleDen: number;
  offset: number;
  minValue?: number | null;
  maxValue?: number | null;
  /** 组包的原始值。 */
  rawValue: number;
  /** 显示用物理值。 */
  displayValue: number;
  /** 来源说明。 */
  source?: string;
  /** 测试角色(如 boundary/fault)。 */
  testRole?: string;
}

/** CAN 测试数据中的一帧。 */
export interface CanTestFrame {
  id: number;
  frameType: number;
  name: string;
  dlc: number;
  /** 周期(毫秒)。 */
  cycleMs: number;
  /** 十六进制数据串(组包后)。 */
  data: string;
  source?: string;
  /** 场景标签(如 smoke/boundary)。 */
  scenario?: string;
  signals: CanTestSignalValue[];
}

/** CAN 测试数据中的一条 SDO 配置项。 */
export interface CanTestSettingEntry {
  name: string;
  /** 菜单路径。 */
  menuPath: string;
  frameId: number;
  index: number;
  subindex: number;
  access: string;
  dataType: string;
  pos: number;
  len: number;
  role: string;
  /** 测试写入值。 */
  value: string;
  defaultValue?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  scale?: string | null;
  offset?: string | null;
  source: string;
}

/** CAN 测试场景类型。 */
export type CanTestProfile = 'smoke' | 'boundary' | 'fault' | 'regression';

/** 单个 CAN 测试用例(多帧 + 多条配置)。 */
export interface CanTestCase {
  caseId: string;
  title: string;
  scenario: string;
  description: string;
  tags: string[];
  frames: CanTestFrame[];
  settingEntries: CanTestSettingEntry[];
}

/** CAN 测试数据覆盖统计。 */
export interface CanTestCoverage {
  frameCount: number;
  signalCount: number;
  settingEntryCount: number;
  caseCount: number;
  generatedFrameCount: number;
  generatedSettingEntryCount: number;
  coveredScenarios: string[];
}

/** CAN 测试数据生成响应。 */
export interface CanTestGenerateResponse {
  frames: CanTestFrame[];
  settingEntries: CanTestSettingEntry[];
  frameCount: number;
  cases: CanTestCase[];
  coverage: CanTestCoverage;
  warnings: string[];
}

/** CANopen 转换分析中的节点摘要。 */
export interface CanopenNodeSummary {
  nodeId: number;
  name: string;
  sdoRxCobId: number;
  sdoTxCobId: number;
  objectCount: number;
  pdoCount: number;
  bitfieldCount: number;
}

/** CANopen 转换/导出报告(EDS 与测试帧等产物)。 */
export interface CanopenConversionReport {
  valid: boolean;
  nodes: CanopenNodeSummary[];
  /** 产出的文件路径列表。 */
  files: string[];
  warnings: string[];
  /** 转换后的协议模型。 */
  model: unknown;
}

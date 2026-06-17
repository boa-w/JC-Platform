import type { FeatureModule } from '../types/platform';

export const featureModules: FeatureModule[] = [
  {
    key: 'project',
    title: '项目管理',
    description: '负责项目创建、打开、结构检查、保存和基础目录管理。',
  },
  {
    key: 'setting-data',
    title: '设置数据',
    description: '按旧版上位机布局展示 SDO 菜单和设置参数。',
  },
  {
    key: 'realtime-data',
    title: '实时数据',
    description: '按旧版上位机布局展示 PDO 接收表、发送表和帧明细。',
  },
  {
    key: 'signal-dictionary',
    title: '业务信号字典',
    description: '负责统一维护 Signal、数据类型、单位、缩放比例和业务含义。',
  },
  {
    key: 'private-protocol',
    title: '私有协议',
    description: '负责自定义帧、周期、校验方式、字节序和载荷布局。',
    lifecycle: 'experimental-deprecated',
    lifecycleReason: '实验性历史扩展，仅保留兼容与迁移用途；后续协议主线聚焦 CANOpen。',
  },
  {
    key: 'protocol-mapping',
    title: '协议映射',
    description: '统一展示 CANopen、私有协议和业务 Signal 之间的映射与校验结果。',
    lifecycle: 'experimental',
    lifecycleReason: '多协议映射层仍在验证中，后续会随 CANOpen 主线重构继续收敛。',
  },
  {
    key: 'ui',
    title: 'UI 资源编辑',
    description: '负责设备分辨率画布、图标/动画资源、属性编辑、选项增删和资源导出路径维护。',
  },
  {
    key: 'battery-protocol',
    title: '锂电协议',
    description: '负责锂电监控 CAN 帧定义、信号布局、数据类型和超时策略。',
    lifecycle: 'experimental-deprecated',
    lifecycleReason: '锂电行业定制实验功能，后续建议迁移到通用 CANOpen/DBC 扩展机制。',
  },
  {
    key: 'battery-monitor',
    title: '锂电监控显示',
    description: '负责锂电显示项配置：信号选取、单位、格式、精度和有效性策略。',
    lifecycle: 'experimental-deprecated',
    lifecycleReason: '依赖锂电协议扩展，仅保留兼容用途，后续将与核心 CANOpen 配置解耦。',
  },
  {
    key: 'language',
    title: '多国语言',
    description: '负责自动收集翻译项、编辑多语言表、CSV/XLS 导入导出和导出语言资源。',
  },
  {
    key: 'can-test-data',
    title: 'CAN 测试数据构建',
    description: '自动提取项目 PDO/锂电 CAN 帧，生成测试数据并导出为 TXT 文件。',
  },
  {
    key: 'export',
    title: '项目导出',
    description: '负责生成 jc_export、复制图片资源、生成 JSON 描述和设备二进制 bin。',
  },
  {
    key: 'settings',
    title: '软件设置',
    description: '管理导出写入控制、外观主题等软件级偏好设置。',
  },
];

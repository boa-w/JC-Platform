import type { FeatureModule } from '../types/platform';

export const featureModules: FeatureModule[] = [
  {
    key: 'project',
    title: '项目管理',
    description: '负责项目创建、打开、结构检查、保存和基础目录管理。',
  },
  {
    key: 'ui',
    title: 'UI 资源编辑',
    description: '负责设备分辨率画布、图标/动画资源、属性编辑、选项增删和资源导出路径维护。',
  },
  {
    key: 'pdo-simple',
    title: 'PDO 简化配置',
    description: '负责接收表/发送表、CAN 帧、系统变量绑定和 byte/bit 取数配置。',
  },
  {
    key: 'pdo-advanced',
    title: 'PDO 高级配置',
    description: '负责全局变量、CAN 数据项、条件表和底层 PDO 结构配置。',
  },
  {
    key: 'sdo',
    title: 'SDO 参数配置',
    description: '负责 SDO 菜单树、CAN Open 参数、权限、读写属性、缩放偏移和小数位。',
  },
  {
    key: 'language',
    title: '多国语言',
    description: '负责自动收集翻译项、编辑多语言表、CSV/XLS 导入导出和导出语言资源。',
  },
  {
    key: 'export',
    title: '项目导出',
    description: '负责生成 jc_export、复制图片资源、生成 JSON 描述和设备二进制 bin。',
  },
  {
    key: 'settings',
    title: '软件设置',
    description: '查看软件版本、核心状态和运行环境信息。',
  },
];

import type { PdoSimpleDocument } from '../../types/platform';

export const pdoSimpleTestData: PdoSimpleDocument = {
  pdo_recv: [
    {
      id: 0x181, type: 0, desc: '电机运行状态', data: [
        { pos: 0, len: 16, show_type: 0, pdo_param_index: 0, pdo_param_name: 'motor_speed' },
        { pos: 16, len: 8, show_type: 0, pdo_param_index: 1, pdo_param_name: 'motor_temp' },
        { pos: 24, len: 8, show_type: 0, pdo_param_index: 2, pdo_param_name: 'motor_status' },
      ]
    },
    {
      id: 0x182, type: 0, desc: '电池信息', data: [
        { pos: 0, len: 16, show_type: 0, pdo_param_index: 3, pdo_param_name: 'battery_voltage' },
        { pos: 16, len: 8, show_type: 0, pdo_param_index: 4, pdo_param_name: 'battery_current' },
        { pos: 24, len: 8, show_type: 0, pdo_param_index: 5, pdo_param_name: 'battery_soc' },
        { pos: 32, len: 8, show_type: 0, pdo_param_index: 6, pdo_param_name: 'battery_temp' },
      ]
    },
  ],
  pdo_send: [
    {
      id: 0x101, type: 0, desc: '控制指令', data: [
        { pos: 0, len: 8, show_type: 0, pdo_param_index: 7, pdo_param_name: 'control_cmd' },
        { pos: 8, len: 16, show_type: 0, pdo_param_index: 8, pdo_param_name: 'target_value' },
      ]
    },
    {
      id: 0x102, type: 0, desc: '参数配置', data: [
        { pos: 0, len: 16, show_type: 0, pdo_param_index: 9, pdo_param_name: 'param_value' },
        { pos: 16, len: 8, show_type: 0, pdo_param_index: 10, pdo_param_name: 'param_index' },
      ]
    },
  ],
};

import type { PdoAdvancedDocument } from '../../types/platform';

export const pdoAdvancedTestData: PdoAdvancedDocument = {
  pdo_global_param: [
    { param_id: '001', name: '电机转速', def: '0', reserved: 0, type: 0, inner: -1 },
    { param_id: '002', name: '电机温度', def: '25', reserved: 0, type: 0, inner: -1 },
    { param_id: '003', name: '电池电压', def: '480', reserved: 0, type: 0, inner: -1 },
    { param_id: '004', name: '电池SOC', def: '50', reserved: 0, type: 0, inner: -1 },
    { param_id: '005', name: '车速', def: '0', reserved: 0, type: 0, inner: -1 },
    { param_id: '006', name: '故障码', def: '0', reserved: 0, type: 0, inner: -1 },
  ],
  pdo_condition: [
    { param_id: '006', process: 0, data: [{ param_id: '003' }, { param_id: '004' }] },
  ],
  pdo_recv: [
    {
      id: 0x281,
      type: 0,
      desc: '电机状态帧',
      data: [
        { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '001' },
        { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '002' },
      ],
    },
    {
      id: 0x282,
      type: 0,
      desc: '电池状态帧',
      data: [
        { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '003' },
        { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '004' },
      ],
    },
  ],
  pdo_send: [
    {
      id: 0x201,
      type: 0,
      desc: '控制帧',
      data: [
        { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '005' },
        { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '006' },
      ],
    },
  ],
};

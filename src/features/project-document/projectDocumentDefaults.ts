import type {
  BatteryMonitorFrame,
  BatteryMonitorItem,
  BatteryMonitorProtocol,
  BatteryMonitorSignal,
} from '../../types/platform';

function batteryFrame(
  frame_key: string,
  can_id: number,
  desc: string,
): BatteryMonitorFrame {
  return { frame_key, can_id, frame_type: 0, dlc: 8, desc, timeout_ticks: 200 };
}

function batterySignal(
  signal_key: string,
  param_id: string,
  name: string,
  frame_key: string,
  pos: number,
  len: number,
  raw_offset: number,
  raw_type: BatteryMonitorSignal['raw_type'],
  value_type: BatteryMonitorSignal['value_type'],
  parse_resolution: number,
  parse_offset: number,
  parse_mask = 0xffffffff,
  parse_shift = 0,
): BatteryMonitorSignal {
  return {
    signal_key,
    param_id,
    name,
    inner: -1,
    frame_key,
    pos,
    len,
    byte_order: 'little_endian',
    raw_offset,
    raw_type,
    value_type,
    parse_resolution,
    parse_offset,
    parse_mask,
    parse_shift,
    receiver: 'vcu',
    comment: '基于 meter_d70t_zc_202620042 实际锂电监控解析规则',
  };
}

function batteryItem(
  order: number,
  item_key: string,
  fallback_name: string,
  unit: string,
  kind: string,
  scale_den: number,
  decimals: number,
  frame_key: string,
): BatteryMonitorItem {
  return {
    item_key,
    enabled: true,
    order,
    signal_key: item_key,
    name_key: `battery_monitor.${item_key}`,
    fallback_name,
    unit,
    formatter: {
      kind,
      offset: 0,
      scale_num: 1,
      scale_den,
      decimals,
      display_base: 10,
      true_text: '',
      false_text: '',
    },
    validity: { mode: 'frame_timeout', frame_key, empty_text: ' ' },
  };
}

export const defaultBatteryMonitor: BatteryMonitorProtocol = {
  schema_version: 1,
  enabled: true,
  version: 1,
  default_timeout_ticks: 200,
  page_size: 4,
  frames: [
    batteryFrame('battery_2f0', 0x2f0, 'B2V01 锂电基础信息'),
    batteryFrame('battery_2f1', 0x2f1, 'B2V02 锂电电流与继电器状态'),
    batteryFrame('battery_2f2', 0x2f2, 'B2V03 锂电电量与循环信息'),
    batteryFrame('battery_2f3', 0x2f3, 'B2V04 单体电压与温度'),
    batteryFrame('battery_244', 0x244, 'B2V05 锂电故障状态'),
    batteryFrame('battery_444', 0x444, 'B2V06 锂电 SOC'),
    batteryFrame('battery_445', 0x445, 'B2V07 充电开始时间'),
    batteryFrame('battery_446', 0x446, 'B2V08 充电结束时间'),
    batteryFrame('battery_447', 0x447, 'B2V09 累计电量'),
    batteryFrame('battery_448', 0x448, 'B2V10 累计时间'),
    batteryFrame('battery_381', 0x381, 'B2V11 绝缘阻值'),
  ],
  signals: [
    batterySignal('hvb_vol', 'BATTERY_MONITOR_HVB_VOL', 'HVBVol', 'battery_2f0', 0, 16, 0, 'u16_le', 'f32', 0.1, 0),
    batterySignal('hvb_cur', 'BATTERY_MONITOR_HVB_CUR', 'HVBCur', 'battery_2f0', 16, 16, 2, 'u16_le', 'f32', 0.1, -600),
    batterySignal('hvb_soh', 'BATTERY_MONITOR_HVB_SOH', 'HVBSOH', 'battery_2f0', 32, 8, 4, 'u8', 'u8', 1, 0),
    batterySignal('max_con_dch_cur', 'BATTERY_MONITOR_MAX_CON_DCH_CUR', 'MaxConDchCur', 'battery_2f1', 0, 16, 0, 'u16_le', 'f32', 0.1, 0),
    batterySignal('max_pluse_dch_cur', 'BATTERY_MONITOR_MAX_PLUSE_DCH_CUR', 'MaxPluseDchCur', 'battery_2f1', 16, 16, 2, 'u16_le', 'f32', 0.1, 0),
    batterySignal('max_chg_cur', 'BATTERY_MONITOR_MAX_CHG_CUR', 'MaxChgCur', 'battery_2f1', 32, 16, 4, 'u16_le', 'f32', 0.1, 0),
    batterySignal('st_dis_chg_relay', 'BATTERY_MONITOR_ST_DIS_CHG_RELAY', 'St_DisChgRelay', 'battery_2f1', 48, 1, 6, 'u8', 'u8', 1, 0, 0x01),
    batterySignal('st_lock_relay', 'BATTERY_MONITOR_ST_LOCK_RELAY', 'St_LockRealy', 'battery_2f1', 49, 1, 6, 'u8', 'u8', 1, 0, 0x02, 1),
    batterySignal('st_charge_relay', 'BATTERY_MONITOR_ST_CHARGE_RELAY', 'St_ChargeRelay', 'battery_2f1', 50, 1, 6, 'u8', 'u8', 1, 0, 0x04, 2),
    batterySignal('st_pre_chg_relay', 'BATTERY_MONITOR_ST_PRE_CHG_RELAY', 'St_PreChgRelay', 'battery_2f1', 51, 1, 6, 'u8', 'u8', 1, 0, 0x08, 3),
    batterySignal('dch_ah', 'BATTERY_MONITOR_DCH_AH', 'DchAH', 'battery_2f2', 0, 16, 0, 'u16_le', 'u16', 1, 0),
    batterySignal('ttl_chg_ah', 'BATTERY_MONITOR_TTL_CHG_AH', 'TtlChgAH', 'battery_2f2', 16, 32, 2, 'u32_le', 'u32', 1, 0),
    batterySignal('hvb_loop', 'BATTERY_MONITOR_HVB_LOOP', 'HVBLoop', 'battery_2f2', 48, 16, 6, 'u16_le', 'u16', 1, 0),
    batterySignal('max_cell_vol', 'BATTERY_MONITOR_MAX_CELL_VOL', 'MaxCellVol', 'battery_2f3', 0, 16, 0, 'u16_le', 'u16', 1, 0),
    batterySignal('min_cell_vol', 'BATTERY_MONITOR_MIN_CELL_VOL', 'MinCellVol', 'battery_2f3', 16, 16, 2, 'u16_le', 'u16', 1, 0),
    batterySignal('max_cell_tem', 'BATTERY_MONITOR_MAX_CELL_TEM', 'MaxCellTem', 'battery_2f3', 32, 8, 4, 'u8', 'u8', 1, -40),
    batterySignal('min_cell_tem', 'BATTERY_MONITOR_MIN_CELL_TEM', 'MinCellTem', 'battery_2f3', 40, 8, 5, 'u8', 'u8', 1, -40),
    batterySignal('discharge_allow', 'BATTERY_MONITOR_DISCHARGE_ALLOW', 'DischargeAllow', 'battery_244', 0, 1, 0, 'u16_le', 'u8', 1, 0, 0x0001),
    batterySignal('over_discharge', 'BATTERY_MONITOR_OVER_DISCHARGE', 'OverDischarge', 'battery_244', 1, 1, 0, 'u16_le', 'u8', 1, 0, 0x0002, 1),
    batterySignal('batt_cur_exceeds', 'BATTERY_MONITOR_BATT_CUR_EXCEEDS', 'BattCurExceeds', 'battery_244', 2, 1, 0, 'u16_le', 'u8', 1, 0, 0x0004, 2),
    batterySignal('leakage', 'BATTERY_MONITOR_LEAKAGE', 'Leakage', 'battery_244', 3, 2, 0, 'u16_le', 'u8', 1, 0, 0x0018, 3),
    batterySignal('batt_high_vol', 'BATTERY_MONITOR_BATT_HIGH_VOL', 'BattHighVol', 'battery_244', 5, 1, 0, 'u16_le', 'u8', 1, 0, 0x0020, 5),
    batterySignal('cell_vol_low', 'BATTERY_MONITOR_CELL_VOL_LOW', 'CellVolLow', 'battery_244', 6, 1, 0, 'u16_le', 'u8', 1, 0, 0x0040, 6),
    batterySignal('batt_low_tem', 'BATTERY_MONITOR_BATT_LOW_TEM', 'BattLowTem', 'battery_244', 8, 1, 0, 'u16_le', 'u8', 1, 0, 0x0100, 8),
    batterySignal('batt_high_tem', 'BATTERY_MONITOR_BATT_HIGH_TEM', 'BattHighTem', 'battery_244', 9, 2, 0, 'u16_le', 'u8', 1, 0, 0x0600, 9),
    batterySignal('battery_soc', 'BATTERY_MONITOR_BATTERY_SOC', 'BatterySOC', 'battery_444', 48, 8, 6, 'u8', 'u8', 1, 0),
    batterySignal('charge_start_time', 'BATTERY_MONITOR_CHARGE_START_TIME', 'charge start time', 'battery_445', 0, 56, 0, 'datetime_ymdhms', 'datetime', 1, 0),
    batterySignal('charge_end_time', 'BATTERY_MONITOR_CHARGE_END_TIME', 'charge end time', 'battery_446', 0, 56, 0, 'datetime_ymdhms', 'datetime', 1, 0),
    batterySignal('cumulative_discharge_quantity', 'BATTERY_MONITOR_CUMULATIVE_DISCHARGE_QUANTITY', 'Cumulative discharge quantity', 'battery_447', 0, 32, 0, 'u32_le', 'u32', 1, 0),
    batterySignal('accumulated_charging_capacity', 'BATTERY_MONITOR_ACCUMULATED_CHARGING_CAPACITY', 'Accumulated charging capacity', 'battery_447', 32, 32, 4, 'u32_le', 'u32', 1, 0),
    batterySignal('cumulative_discharge_time', 'BATTERY_MONITOR_CUMULATIVE_DISCHARGE_TIME', 'Cumulative discharge time', 'battery_448', 0, 32, 0, 'u32_le', 'u32', 1, 0),
    batterySignal('cumulative_charging_time', 'BATTERY_MONITOR_CUMULATIVE_CHARGING_TIME', 'Cumulative charging time', 'battery_448', 32, 32, 4, 'u32_le', 'u32', 1, 0),
    batterySignal('min_insulation_resistance', 'BATTERY_MONITOR_MIN_INSULATION_RESISTANCE', 'MinInsulationResistance', 'battery_381', 0, 16, 0, 'u16_le', 'u16', 1, 0),
  ],
  items: [
    batteryItem(0, 'hvb_vol', 'HVBVol 总电压', 'V', 'linear', 1, 1, 'battery_2f0'),
    batteryItem(1, 'hvb_cur', 'HVBCur 总电流', 'A', 'linear', 1, 1, 'battery_2f0'),
    batteryItem(2, 'hvb_soh', 'HVBSOH 电池SOH', '%', 'linear', 1, 0, 'battery_2f0'),
    batteryItem(3, 'max_con_dch_cur', 'MaxConDchCur 最大可持续放电电流', 'A', 'linear', 1, 1, 'battery_2f1'),
    batteryItem(4, 'max_pluse_dch_cur', 'MaxPluseDchCur 最大脉冲放电电流', 'A', 'linear', 1, 1, 'battery_2f1'),
    batteryItem(5, 'max_chg_cur', 'MaxChgCur 最大回馈电流', 'A', 'linear', 1, 1, 'battery_2f1'),
    batteryItem(6, 'st_dis_chg_relay', 'St_DisChgRelay 总正继电器状态', '', 'linear', 1, 0, 'battery_2f1'),
    batteryItem(7, 'st_lock_relay', 'St_LockRealy 自锁继电器状态', '', 'linear', 1, 0, 'battery_2f1'),
    batteryItem(8, 'st_charge_relay', 'St_ChargeRelay 充电继电器状态', '', 'linear', 1, 0, 'battery_2f1'),
    batteryItem(9, 'st_pre_chg_relay', 'St_PreChgRelay 预充继电器状态', '', 'linear', 1, 0, 'battery_2f1'),
    batteryItem(10, 'dch_ah', 'DchAH 放电电量', 'kwh', 'linear', 100, 2, 'battery_2f2'),
    batteryItem(11, 'ttl_chg_ah', 'TtlChgAH 累计充电安时', 'AH', 'linear', 1, 0, 'battery_2f2'),
    batteryItem(12, 'hvb_loop', 'HVBLoop 电池循环次数', '', 'linear', 1, 0, 'battery_2f2'),
    batteryItem(13, 'max_cell_vol', 'MaxCellVol 最大电池单体电压值', 'V', 'linear', 1000, 3, 'battery_2f3'),
    batteryItem(14, 'min_cell_vol', 'MinCellVol 最小电池单体电压值', 'V', 'linear', 1000, 3, 'battery_2f3'),
    batteryItem(15, 'max_cell_tem', 'MaxCellTem 最大电池单体温度', '℃', 'linear', 1, 0, 'battery_2f3'),
    batteryItem(16, 'min_cell_tem', 'MinCellTem 最小电池单体温度', '℃', 'linear', 1, 0, 'battery_2f3'),
    batteryItem(17, 'discharge_allow', 'DischargeAllow 允许放电', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(18, 'over_discharge', 'OverDischarge 放电过压故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(19, 'batt_cur_exceeds', 'BattCurExceeds 放电过流故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(20, 'leakage', 'Leakage 漏电故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(21, 'batt_high_vol', 'BattHighVol 单体电压过高故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(22, 'cell_vol_low', 'CellVolLow 单体电压过低故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(23, 'batt_low_tem', 'BattLowTem 电池温度过低故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(24, 'batt_high_tem', 'BattHighTem 电池温度过高故障', '', 'linear', 1, 0, 'battery_244'),
    batteryItem(25, 'battery_soc', 'BatterySOC 电池电量', '%', 'linear', 1, 0, 'battery_444'),
    batteryItem(26, 'charge_start_time', '锂电池充电开始时间', '', 'datetime', 1, 0, 'battery_445'),
    batteryItem(27, 'charge_end_time', '锂电池充电结束时间', '', 'datetime', 1, 0, 'battery_446'),
    batteryItem(28, 'cumulative_discharge_quantity', 'Cumulative discharge quantity 累计放电电量', 'kwh', 'linear', 1, 0, 'battery_447'),
    batteryItem(29, 'accumulated_charging_capacity', 'Accumulated charging capacity 累计充电电量', 'kwh', 'linear', 1, 0, 'battery_447'),
    batteryItem(30, 'cumulative_discharge_time', 'Cumulative discharge time 累计放电时间', 'H', 'linear', 1, 0, 'battery_448'),
    batteryItem(31, 'cumulative_charging_time', 'Cumulative charging time 累计充电时间', 'H', 'linear', 1, 0, 'battery_448'),
    batteryItem(32, 'min_insulation_resistance', 'MinInsulationResistance 最小绝缘阻值', 'kΩ', 'linear', 1, 0, 'battery_381'),
  ],
};

const defaultFaultCodeInfo = {
  schema_version: 1,
  enabled: true,
  version: 1,
  sources: [
    {
      source_key: 'traction',
      source_id: 1,
      type_char: 'T',
      name: '牵引',
      can_id: 648,
      frame_type: 0,
      code_byte: 2,
      clear_code: 0,
      invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      enabled: true,
    },
    {
      source_key: 'pump',
      source_id: 2,
      type_char: 'P',
      name: '油泵',
      can_id: 660,
      frame_type: 0,
      code_byte: 2,
      clear_code: 0,
      invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      enabled: true,
    },
  ],
  codes: [],
};

const defaultExportInfo = {
  folder_name: 'jc_export',
  manifest_filename: 'ConfigUpdate.json',
  binary_filename: 'pdo_sdo_data.bin',
};

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function withRequiredEditorSections(document: unknown) {
  const source = (document as Record<string, unknown>) ?? {};
  const defaults: Record<string, unknown> = {};
  if (!source.export_info) defaults.export_info = cloneDefault(defaultExportInfo);
  if (!source.battery_monitor) defaults.battery_monitor = cloneDefault(defaultBatteryMonitor);
  if (!source.fault_code_info) defaults.fault_code_info = cloneDefault(defaultFaultCodeInfo);
  return Object.keys(defaults).length > 0 ? { ...source, ...defaults } : null;
}

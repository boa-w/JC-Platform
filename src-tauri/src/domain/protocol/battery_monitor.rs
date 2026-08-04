//! 锂电监控协议领域模型。
//!
//! 锂电监控是独立协议，不再拆成“协议段 + 显示段”两个来源。帧、信号解析规则、
//! 页面显示项和超时策略必须从同一个 `battery_monitor` 根段生成和导出。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const BATTERY_MONITOR_SCHEMA_VERSION: u16 = 1;
pub const BATTERY_MONITOR_BINARY_VERSION: u16 = 1;
pub const BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS: u16 = 200;
pub const BATTERY_MONITOR_PAGE_SIZE: u16 = 4;
pub const BATTERY_PARSE_NO_MASK: u32 = u32::MAX;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorProtocol {
    #[serde(default = "default_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_binary_version")]
    pub version: u16,
    #[serde(default = "default_timeout_ticks")]
    pub default_timeout_ticks: u16,
    #[serde(default = "default_page_size")]
    pub page_size: u16,
    #[serde(default)]
    pub frames: Vec<BatteryMonitorFrame>,
    #[serde(default)]
    pub signals: Vec<BatteryMonitorSignal>,
    #[serde(default)]
    pub items: Vec<BatteryMonitorItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorFrame {
    pub frame_key: String,
    pub can_id: u32,
    #[serde(default)]
    pub frame_type: u8,
    #[serde(default = "default_dlc")]
    pub dlc: u8,
    #[serde(default)]
    pub desc: String,
    #[serde(default = "default_timeout_ticks")]
    pub timeout_ticks: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorSignal {
    pub signal_key: String,
    pub param_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub inner: i64,
    pub frame_key: String,
    pub pos: u16,
    pub len: u16,
    #[serde(default)]
    pub byte_order: BatteryByteOrder,
    #[serde(default)]
    pub raw_offset: u8,
    #[serde(default)]
    pub raw_type: BatteryRawType,
    #[serde(default)]
    pub value_type: BatteryValueType,
    #[serde(default = "default_parse_resolution")]
    pub parse_resolution: f64,
    #[serde(default)]
    pub parse_offset: f64,
    #[serde(default = "default_parse_mask")]
    pub parse_mask: u32,
    #[serde(default)]
    pub parse_shift: u8,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub receiver: String,
    #[serde(default)]
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryByteOrder {
    #[default]
    LittleEndian,
    BigEndian,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryRawType {
    #[default]
    U8,
    U16Le,
    U32Le,
    #[serde(rename = "datetime_ymdhms")]
    DateTimeYmdhms,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryValueType {
    #[default]
    U8,
    U16,
    U32,
    F32,
    #[serde(rename = "datetime")]
    DateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorItem {
    pub item_key: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub order: u16,
    pub signal_key: String,
    pub name_key: String,
    #[serde(default)]
    pub fallback_name: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub formatter: BatteryMonitorFormatter,
    #[serde(default)]
    pub validity: BatteryMonitorValidity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BatteryMonitorFormatter {
    #[serde(default = "default_formatter_kind")]
    pub kind: String,
    #[serde(default)]
    pub offset: f64,
    #[serde(default = "default_scale_num")]
    pub scale_num: i32,
    #[serde(default = "default_scale_den")]
    pub scale_den: i32,
    #[serde(default)]
    pub decimals: u8,
    #[serde(default = "default_display_base")]
    pub display_base: u8,
    #[serde(default)]
    pub true_text: String,
    #[serde(default)]
    pub false_text: String,
}

impl Default for BatteryMonitorFormatter {
    fn default() -> Self {
        Self {
            kind: default_formatter_kind(),
            offset: 0.0,
            scale_num: default_scale_num(),
            scale_den: default_scale_den(),
            decimals: 0,
            display_base: default_display_base(),
            true_text: String::new(),
            false_text: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct BatteryMonitorValidity {
    #[serde(default = "default_validity_mode")]
    pub mode: String,
    #[serde(default)]
    pub frame_key: String,
    #[serde(default = "default_empty_text")]
    pub empty_text: String,
    #[serde(default)]
    pub timeout_ticks: Option<u16>,
}

pub fn parse_battery_monitor_protocol(document: &Value) -> BatteryMonitorProtocol {
    document
        .get("battery_monitor")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

pub fn default_battery_monitor_protocol() -> Value {
    json!({
        "schema_version": BATTERY_MONITOR_SCHEMA_VERSION,
        "enabled": true,
        "version": BATTERY_MONITOR_BINARY_VERSION,
        "default_timeout_ticks": BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS,
        "page_size": BATTERY_MONITOR_PAGE_SIZE,
        "frames": default_frames(),
        "signals": default_signals(),
        "items": default_items()
    })
}

pub const BATTERY_MONITOR_LANGUAGE_ENTRIES: &[(&str, &str)] = &[
    ("battery_monitor.hvb_vol", "HVBVol 总电压"),
    ("battery_monitor.hvb_cur", "HVBCur 总电流"),
    ("battery_monitor.hvb_soh", "HVBSOH 电池SOH"),
    (
        "battery_monitor.max_con_dch_cur",
        "MaxConDchCur 最大可持续放电电流",
    ),
    (
        "battery_monitor.max_pluse_dch_cur",
        "MaxPluseDchCur 最大脉冲放电电流",
    ),
    ("battery_monitor.max_chg_cur", "MaxChgCur 最大回馈电流"),
    (
        "battery_monitor.st_dis_chg_relay",
        "St_DisChgRelay 总正继电器状态",
    ),
    (
        "battery_monitor.st_lock_relay",
        "St_LockRealy 自锁继电器状态",
    ),
    (
        "battery_monitor.st_charge_relay",
        "St_ChargeRelay 充电继电器状态",
    ),
    (
        "battery_monitor.st_pre_chg_relay",
        "St_PreChgRelay 预充继电器状态",
    ),
    ("battery_monitor.dch_ah", "DchAH 放电电量"),
    ("battery_monitor.ttl_chg_ah", "TtlChgAH 累计充电安时"),
    ("battery_monitor.hvb_loop", "HVBLoop 电池循环次数"),
    (
        "battery_monitor.max_cell_vol",
        "MaxCellVol 最大电池单体电压值",
    ),
    (
        "battery_monitor.min_cell_vol",
        "MinCellVol 最小电池单体电压值",
    ),
    (
        "battery_monitor.max_cell_tem",
        "MaxCellTem 最大电池单体温度",
    ),
    (
        "battery_monitor.min_cell_tem",
        "MinCellTem 最小电池单体温度",
    ),
    ("battery_monitor.discharge_allow", "DischargeAllow 允许放电"),
    (
        "battery_monitor.over_discharge",
        "OverDischarge 放电过压故障",
    ),
    (
        "battery_monitor.batt_cur_exceeds",
        "BattCurExceeds 放电过流故障",
    ),
    ("battery_monitor.leakage", "Leakage 漏电故障"),
    (
        "battery_monitor.batt_high_vol",
        "BattHighVol 单体电压过高故障",
    ),
    (
        "battery_monitor.cell_vol_low",
        "CellVolLow 单体电压过低故障",
    ),
    (
        "battery_monitor.batt_low_tem",
        "BattLowTem 电池温度过低故障",
    ),
    (
        "battery_monitor.batt_high_tem",
        "BattHighTem 电池温度过高故障",
    ),
    ("battery_monitor.battery_soc", "BatterySOC 电池电量"),
    ("battery_monitor.charge_start_time", "锂电池充电开始时间"),
    ("battery_monitor.charge_end_time", "锂电池充电结束时间"),
    (
        "battery_monitor.cumulative_discharge_quantity",
        "Cumulative discharge quantity 累计放电电量",
    ),
    (
        "battery_monitor.accumulated_charging_capacity",
        "Accumulated charging capacity 累计充电电量",
    ),
    (
        "battery_monitor.cumulative_discharge_time",
        "Cumulative discharge time 累计放电时间",
    ),
    (
        "battery_monitor.cumulative_charging_time",
        "Cumulative charging time 累计充电时间",
    ),
    (
        "battery_monitor.min_insulation_resistance",
        "MinInsulationResistance 最小绝缘阻值",
    ),
];

fn default_frames() -> Value {
    json!([
        frame("battery_2f0", 0x2f0, "B2V01 锂电基础信息", 200),
        frame("battery_2f1", 0x2f1, "B2V02 锂电电流与继电器状态", 200),
        frame("battery_2f2", 0x2f2, "B2V03 锂电电量与循环信息", 200),
        frame("battery_2f3", 0x2f3, "B2V04 单体电压与温度", 200),
        frame("battery_244", 0x244, "B2V05 锂电故障状态", 200),
        frame("battery_444", 0x444, "B2V06 锂电 SOC", 200),
        frame("battery_445", 0x445, "B2V07 充电开始时间", 200),
        frame("battery_446", 0x446, "B2V08 充电结束时间", 200),
        frame("battery_447", 0x447, "B2V09 累计电量", 200),
        frame("battery_448", 0x448, "B2V10 累计时间", 200),
        frame("battery_381", 0x381, "B2V11 绝缘阻值", 200)
    ])
}

fn frame(frame_key: &str, can_id: u32, desc: &str, timeout_ticks: u16) -> Value {
    json!({
        "frame_key": frame_key,
        "can_id": can_id,
        "frame_type": 0,
        "dlc": 8,
        "desc": desc,
        "timeout_ticks": timeout_ticks
    })
}

fn default_signals() -> Value {
    json!([
        signal(
            "hvb_vol",
            "BATTERY_MONITOR_HVB_VOL",
            "HVBVol",
            "battery_2f0",
            0,
            16,
            0,
            "u16_le",
            "f32",
            0.1,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "hvb_cur",
            "BATTERY_MONITOR_HVB_CUR",
            "HVBCur",
            "battery_2f0",
            16,
            16,
            2,
            "u16_le",
            "f32",
            0.1,
            -600.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "hvb_soh",
            "BATTERY_MONITOR_HVB_SOH",
            "HVBSOH",
            "battery_2f0",
            32,
            8,
            4,
            "u8",
            "u8",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "max_con_dch_cur",
            "BATTERY_MONITOR_MAX_CON_DCH_CUR",
            "MaxConDchCur",
            "battery_2f1",
            0,
            16,
            0,
            "u16_le",
            "f32",
            0.1,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "max_pluse_dch_cur",
            "BATTERY_MONITOR_MAX_PLUSE_DCH_CUR",
            "MaxPluseDchCur",
            "battery_2f1",
            16,
            16,
            2,
            "u16_le",
            "f32",
            0.1,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "max_chg_cur",
            "BATTERY_MONITOR_MAX_CHG_CUR",
            "MaxChgCur",
            "battery_2f1",
            32,
            16,
            4,
            "u16_le",
            "f32",
            0.1,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "st_dis_chg_relay",
            "BATTERY_MONITOR_ST_DIS_CHG_RELAY",
            "St_DisChgRelay",
            "battery_2f1",
            48,
            1,
            6,
            "u8",
            "u8",
            1.0,
            0.0,
            0x01,
            0
        ),
        signal(
            "st_lock_relay",
            "BATTERY_MONITOR_ST_LOCK_RELAY",
            "St_LockRealy",
            "battery_2f1",
            49,
            1,
            6,
            "u8",
            "u8",
            1.0,
            0.0,
            0x02,
            1
        ),
        signal(
            "st_charge_relay",
            "BATTERY_MONITOR_ST_CHARGE_RELAY",
            "St_ChargeRelay",
            "battery_2f1",
            50,
            1,
            6,
            "u8",
            "u8",
            1.0,
            0.0,
            0x04,
            2
        ),
        signal(
            "st_pre_chg_relay",
            "BATTERY_MONITOR_ST_PRE_CHG_RELAY",
            "St_PreChgRelay",
            "battery_2f1",
            51,
            1,
            6,
            "u8",
            "u8",
            1.0,
            0.0,
            0x08,
            3
        ),
        signal(
            "dch_ah",
            "BATTERY_MONITOR_DCH_AH",
            "DchAH",
            "battery_2f2",
            0,
            16,
            0,
            "u16_le",
            "u16",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "ttl_chg_ah",
            "BATTERY_MONITOR_TTL_CHG_AH",
            "TtlChgAH",
            "battery_2f2",
            16,
            32,
            2,
            "u32_le",
            "u32",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "hvb_loop",
            "BATTERY_MONITOR_HVB_LOOP",
            "HVBLoop",
            "battery_2f2",
            48,
            16,
            6,
            "u16_le",
            "u16",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "max_cell_vol",
            "BATTERY_MONITOR_MAX_CELL_VOL",
            "MaxCellVol",
            "battery_2f3",
            0,
            16,
            0,
            "u16_le",
            "u16",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "min_cell_vol",
            "BATTERY_MONITOR_MIN_CELL_VOL",
            "MinCellVol",
            "battery_2f3",
            16,
            16,
            2,
            "u16_le",
            "u16",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "max_cell_tem",
            "BATTERY_MONITOR_MAX_CELL_TEM",
            "MaxCellTem",
            "battery_2f3",
            32,
            8,
            4,
            "u8",
            "u8",
            1.0,
            -40.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "min_cell_tem",
            "BATTERY_MONITOR_MIN_CELL_TEM",
            "MinCellTem",
            "battery_2f3",
            40,
            8,
            5,
            "u8",
            "u8",
            1.0,
            -40.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "discharge_allow",
            "BATTERY_MONITOR_DISCHARGE_ALLOW",
            "DischargeAllow",
            "battery_244",
            0,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0001,
            0
        ),
        signal(
            "over_discharge",
            "BATTERY_MONITOR_OVER_DISCHARGE",
            "OverDischarge",
            "battery_244",
            1,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0002,
            1
        ),
        signal(
            "batt_cur_exceeds",
            "BATTERY_MONITOR_BATT_CUR_EXCEEDS",
            "BattCurExceeds",
            "battery_244",
            2,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0004,
            2
        ),
        signal(
            "leakage",
            "BATTERY_MONITOR_LEAKAGE",
            "Leakage",
            "battery_244",
            3,
            2,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0018,
            3
        ),
        signal(
            "batt_high_vol",
            "BATTERY_MONITOR_BATT_HIGH_VOL",
            "BattHighVol",
            "battery_244",
            5,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0020,
            5
        ),
        signal(
            "cell_vol_low",
            "BATTERY_MONITOR_CELL_VOL_LOW",
            "CellVolLow",
            "battery_244",
            6,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0040,
            6
        ),
        signal(
            "batt_low_tem",
            "BATTERY_MONITOR_BATT_LOW_TEM",
            "BattLowTem",
            "battery_244",
            8,
            1,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0100,
            8
        ),
        signal(
            "batt_high_tem",
            "BATTERY_MONITOR_BATT_HIGH_TEM",
            "BattHighTem",
            "battery_244",
            9,
            2,
            0,
            "u16_le",
            "u8",
            1.0,
            0.0,
            0x0600,
            9
        ),
        signal(
            "battery_soc",
            "BATTERY_MONITOR_BATTERY_SOC",
            "BatterySOC",
            "battery_444",
            48,
            8,
            6,
            "u8",
            "u8",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "charge_start_time",
            "BATTERY_MONITOR_CHARGE_START_TIME",
            "charge start time",
            "battery_445",
            0,
            56,
            0,
            "datetime_ymdhms",
            "datetime",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "charge_end_time",
            "BATTERY_MONITOR_CHARGE_END_TIME",
            "charge end time",
            "battery_446",
            0,
            56,
            0,
            "datetime_ymdhms",
            "datetime",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "cumulative_discharge_quantity",
            "BATTERY_MONITOR_CUMULATIVE_DISCHARGE_QUANTITY",
            "Cumulative discharge quantity",
            "battery_447",
            0,
            32,
            0,
            "u32_le",
            "u32",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "accumulated_charging_capacity",
            "BATTERY_MONITOR_ACCUMULATED_CHARGING_CAPACITY",
            "Accumulated charging capacity",
            "battery_447",
            32,
            32,
            4,
            "u32_le",
            "u32",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "cumulative_discharge_time",
            "BATTERY_MONITOR_CUMULATIVE_DISCHARGE_TIME",
            "Cumulative discharge time",
            "battery_448",
            0,
            32,
            0,
            "u32_le",
            "u32",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "cumulative_charging_time",
            "BATTERY_MONITOR_CUMULATIVE_CHARGING_TIME",
            "Cumulative charging time",
            "battery_448",
            32,
            32,
            4,
            "u32_le",
            "u32",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        ),
        signal(
            "min_insulation_resistance",
            "BATTERY_MONITOR_MIN_INSULATION_RESISTANCE",
            "MinInsulationResistance",
            "battery_381",
            0,
            16,
            0,
            "u16_le",
            "u16",
            1.0,
            0.0,
            BATTERY_PARSE_NO_MASK,
            0
        )
    ])
}

fn signal(
    signal_key: &str,
    param_id: &str,
    name: &str,
    frame_key: &str,
    pos: u16,
    len: u16,
    raw_offset: u8,
    raw_type: &str,
    value_type: &str,
    parse_resolution: f64,
    parse_offset: f64,
    parse_mask: u32,
    parse_shift: u8,
) -> Value {
    json!({
        "signal_key": signal_key,
        "param_id": param_id,
        "name": name,
        "inner": -1,
        "frame_key": frame_key,
        "pos": pos,
        "len": len,
        "byte_order": "little_endian",
        "raw_offset": raw_offset,
        "raw_type": raw_type,
        "value_type": value_type,
        "parse_resolution": parse_resolution,
        "parse_offset": parse_offset,
        "parse_mask": parse_mask,
        "parse_shift": parse_shift,
        "receiver": "vcu",
        "comment": "基于 meter_d70t_zc_202620042 实际锂电监控解析规则"
    })
}

fn default_items() -> Value {
    json!([
        item(
            0,
            "hvb_vol",
            "HVBVol 总电压",
            "V",
            "linear",
            0.0,
            1,
            1,
            1,
            "battery_2f0"
        ),
        item(
            1,
            "hvb_cur",
            "HVBCur 总电流",
            "A",
            "linear",
            0.0,
            1,
            1,
            1,
            "battery_2f0"
        ),
        item(
            2,
            "hvb_soh",
            "HVBSOH 电池SOH",
            "%",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f0"
        ),
        item(
            3,
            "max_con_dch_cur",
            "MaxConDchCur 最大可持续放电电流",
            "A",
            "linear",
            0.0,
            1,
            1,
            1,
            "battery_2f1"
        ),
        item(
            4,
            "max_pluse_dch_cur",
            "MaxPluseDchCur 最大脉冲放电电流",
            "A",
            "linear",
            0.0,
            1,
            1,
            1,
            "battery_2f1"
        ),
        item(
            5,
            "max_chg_cur",
            "MaxChgCur 最大回馈电流",
            "A",
            "linear",
            0.0,
            1,
            1,
            1,
            "battery_2f1"
        ),
        item(
            6,
            "st_dis_chg_relay",
            "St_DisChgRelay 总正继电器状态",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f1"
        ),
        item(
            7,
            "st_lock_relay",
            "St_LockRealy 自锁继电器状态",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f1"
        ),
        item(
            8,
            "st_charge_relay",
            "St_ChargeRelay 充电继电器状态",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f1"
        ),
        item(
            9,
            "st_pre_chg_relay",
            "St_PreChgRelay 预充继电器状态",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f1"
        ),
        item(
            10,
            "dch_ah",
            "DchAH 放电电量",
            "kwh",
            "linear",
            0.0,
            1,
            100,
            2,
            "battery_2f2"
        ),
        item(
            11,
            "ttl_chg_ah",
            "TtlChgAH 累计充电安时",
            "AH",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f2"
        ),
        item(
            12,
            "hvb_loop",
            "HVBLoop 电池循环次数",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f2"
        ),
        item(
            13,
            "max_cell_vol",
            "MaxCellVol 最大电池单体电压值",
            "V",
            "linear",
            0.0,
            1,
            1000,
            3,
            "battery_2f3"
        ),
        item(
            14,
            "min_cell_vol",
            "MinCellVol 最小电池单体电压值",
            "V",
            "linear",
            0.0,
            1,
            1000,
            3,
            "battery_2f3"
        ),
        item(
            15,
            "max_cell_tem",
            "MaxCellTem 最大电池单体温度",
            "℃",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f3"
        ),
        item(
            16,
            "min_cell_tem",
            "MinCellTem 最小电池单体温度",
            "℃",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_2f3"
        ),
        item(
            17,
            "discharge_allow",
            "DischargeAllow 允许放电",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            18,
            "over_discharge",
            "OverDischarge 放电过压故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            19,
            "batt_cur_exceeds",
            "BattCurExceeds 放电过流故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            20,
            "leakage",
            "Leakage 漏电故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            21,
            "batt_high_vol",
            "BattHighVol 单体电压过高故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            22,
            "cell_vol_low",
            "CellVolLow 单体电压过低故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            23,
            "batt_low_tem",
            "BattLowTem 电池温度过低故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            24,
            "batt_high_tem",
            "BattHighTem 电池温度过高故障",
            "",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_244"
        ),
        item(
            25,
            "battery_soc",
            "BatterySOC 电池电量",
            "%",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_444"
        ),
        item(
            26,
            "charge_start_time",
            "锂电池充电开始时间",
            "",
            "datetime",
            0.0,
            1,
            1,
            0,
            "battery_445"
        ),
        item(
            27,
            "charge_end_time",
            "锂电池充电结束时间",
            "",
            "datetime",
            0.0,
            1,
            1,
            0,
            "battery_446"
        ),
        item(
            28,
            "cumulative_discharge_quantity",
            "Cumulative discharge quantity 累计放电电量",
            "kwh",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_447"
        ),
        item(
            29,
            "accumulated_charging_capacity",
            "Accumulated charging capacity 累计充电电量",
            "kwh",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_447"
        ),
        item(
            30,
            "cumulative_discharge_time",
            "Cumulative discharge time 累计放电时间",
            "H",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_448"
        ),
        item(
            31,
            "cumulative_charging_time",
            "Cumulative charging time 累计充电时间",
            "H",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_448"
        ),
        item(
            32,
            "min_insulation_resistance",
            "MinInsulationResistance 最小绝缘阻值",
            "kΩ",
            "linear",
            0.0,
            1,
            1,
            0,
            "battery_381"
        )
    ])
}

fn item(
    order: u16,
    item_key: &str,
    fallback_name: &str,
    unit: &str,
    kind: &str,
    offset: f64,
    scale_num: i32,
    scale_den: i32,
    decimals: u8,
    frame_key: &str,
) -> Value {
    json!({
        "item_key": item_key,
        "enabled": true,
        "order": order,
        "signal_key": item_key,
        "name_key": format!("battery_monitor.{}", item_key),
        "fallback_name": fallback_name,
        "unit": unit,
        "formatter": {
            "kind": kind,
            "offset": offset,
            "scale_num": scale_num,
            "scale_den": scale_den,
            "decimals": decimals,
            "display_base": 10,
            "true_text": "",
            "false_text": ""
        },
        "validity": {
            "mode": "frame_timeout",
            "frame_key": frame_key,
            "empty_text": " "
        }
    })
}

fn default_schema_version() -> u16 {
    BATTERY_MONITOR_SCHEMA_VERSION
}

fn default_binary_version() -> u16 {
    BATTERY_MONITOR_BINARY_VERSION
}

fn default_timeout_ticks() -> u16 {
    BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS
}

fn default_page_size() -> u16 {
    BATTERY_MONITOR_PAGE_SIZE
}

fn default_dlc() -> u8 {
    8
}

fn default_enabled() -> bool {
    true
}

fn default_parse_resolution() -> f64 {
    1.0
}

fn default_parse_mask() -> u32 {
    BATTERY_PARSE_NO_MASK
}

fn default_formatter_kind() -> String {
    "linear".to_string()
}

fn default_scale_num() -> i32 {
    1
}

fn default_scale_den() -> i32 {
    1
}

fn default_display_base() -> u8 {
    10
}

fn default_validity_mode() -> String {
    "frame_timeout".to_string()
}

fn default_empty_text() -> String {
    " ".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_protocol_matches_actual_project_shape() {
        let document = default_battery_monitor_protocol();
        let protocol: BatteryMonitorProtocol = serde_json::from_value(document).unwrap();

        assert_eq!(protocol.frames.len(), 11);
        assert_eq!(protocol.signals.len(), 33);
        assert_eq!(protocol.items.len(), 33);
        assert_eq!(protocol.frames[0].can_id, 0x2f0);
        assert_eq!(protocol.frames[10].can_id, 0x381);
        assert_eq!(protocol.signals[18].parse_mask, 0x0002);
        assert_eq!(protocol.signals[20].parse_mask, 0x0018);
        assert_eq!(
            protocol.signals[26].raw_type,
            BatteryRawType::DateTimeYmdhms
        );
        assert_eq!(protocol.items[26].formatter.kind, "datetime");
        assert_eq!(protocol.items[32].order, 32);
    }
}

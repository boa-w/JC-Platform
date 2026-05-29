//! SDO（Service Data Object）领域模型。
//!
//! SDO 采用树形菜单结构：菜单节点（type=0）包含子菜单或参数，
//! 参数节点（type=1）描述具体的 CANopen 对象字典条目。
//!
//! 支持表格导入/导出和 JSON 直接编辑两种方式。

use crate::infrastructure::csv_excel::{
    validate_headers, TableDocument, TableValidationReport, SDO_HEADERS,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// SDO 菜单节点 —— 包含名称、权限和子节点列表。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdoMenu {
    pub name: String,
    pub user_auth: u8,
    pub children: Vec<SdoNode>,
}

/// SDO 树节点枚举 —— 菜单或参数，通过 JSON `type` 字段区分。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SdoNode {
    Menu(SdoMenu),
    Parameter(SdoParameter),
}

/// SDO 参数节点 —— 对应 CANopen 对象字典中的一个条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdoParameter {
    pub name: String,
    pub user_auth: u8,
    pub protocol: SdoProtocol,
    pub frame_id: u32,
    pub main_index: u16,
    pub sub_index: u8,
    pub access: SdoAccess,
    pub data_type: String,
    pub default_value: Option<String>,
    pub min_value: Option<String>,
    pub max_value: Option<String>,
    pub bit_start: Option<u16>,
    pub bit_length: Option<u16>,
    pub preprocess: Option<SdoPreprocess>,
}

/// SDO 通信协议类型。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SdoProtocol {
    CanOpen,
}

/// SDO 参数读写权限。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SdoAccess {
    ReadOnly,
    ReadWrite,
    WriteOnly,
}

/// SDO 数据预处理配置（缩放、偏移、小数位数）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdoPreprocess {
    pub method: String,
    pub scale: Option<String>,
    pub offset: Option<String>,
    pub decimals: Option<u8>,
}

/// SDO 表格导入结果报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdoImportReport {
    pub valid: bool,
    pub table: TableValidationReport,
    pub errors: Vec<String>,
    pub document: Option<Value>,
}

/// 用户权限等级标签（索引对应 JSON 中的 `user_auth` 值）。
const SDO_AUTH: &[&str] = &["通用权限", "普通用户", "管理员", "超级管理员"];
const SDO_PROTOCOL: &[&str] = &["CAN_OPEN"];
const SDO_RW: &[&str] = &["只读", "读写", "只写"];

/// 将 SDO JSON 树形文档递归展平为表格行（用于导出 CSV/Excel）。
pub fn sdo_document_to_table(document: &Value) -> TableDocument {
    let mut rows = Vec::new();
    if let Some(children) = document.get("children").and_then(Value::as_array) {
        for main in children {
            append_sdo_rows(main, "", &mut rows);
        }
    }

    TableDocument {
        headers: SDO_HEADERS.iter().map(|item| (*item).to_string()).collect(),
        rows,
    }
}

/// 将表格文档解析为 SDO JSON 树形结构。
///
/// 流程：校验表头 → 逐行解析 → 全局校验（重名、菜单一致性）→ 构建树。
pub fn parse_sdo_table(document: TableDocument) -> SdoImportReport {
    let table = validate_headers(&document.headers, SDO_HEADERS);
    let mut errors = table.errors.clone();
    let mut rows = Vec::new();

    if table.valid {
        for (index, row) in document.rows.iter().enumerate() {
            match SdoTableRow::from_cells(index + 1, row) {
                Ok(row) => rows.push(row),
                Err(row_errors) => errors.extend(row_errors),
            }
        }
        validate_sdo_rows(&rows, &mut errors);
    }

    let valid = errors.is_empty();
    let document = if valid {
        Some(build_sdo_document(&rows))
    } else {
        None
    };

    SdoImportReport {
        valid,
        table,
        errors,
        document,
    }
}

fn append_sdo_rows(node: &Value, parent_name: &str, rows: &mut Vec<Vec<String>>) {
    let node_type = node.get("type").and_then(Value::as_u64).unwrap_or(0);
    let name = node.get("name").and_then(Value::as_str).unwrap_or_default();

    if node_type == 0 {
        let children = node
            .get("children")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if children.is_empty() {
            rows.push(vec![
                name.to_string(),
                auth_label(node),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
            ]);
            return;
        }
        for child in children {
            if parent_name.is_empty() {
                append_sdo_rows(&child, name, rows);
            } else {
                append_sdo_parameter_row(parent_name, name, &child, rows);
            }
        }
    } else {
        append_sdo_parameter_row(parent_name, "", node, rows);
    }
}

fn append_sdo_parameter_row(
    main_menu: &str,
    sub_menu: &str,
    node: &Value,
    rows: &mut Vec<Vec<String>>,
) {
    if node.get("type").and_then(Value::as_u64).unwrap_or(0) == 0 {
        rows.push(vec![
            main_menu.to_string(),
            String::new(),
            node.get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            auth_label(node),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        ]);
        return;
    }

    let (bit_start, bit_length) = parse_handle_param(
        node.get("handle_param")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    rows.push(vec![
        main_menu.to_string(),
        String::new(),
        sub_menu.to_string(),
        String::new(),
        node.get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        auth_label(node),
        SDO_PROTOCOL
            .get(
                node.get("control_protocol")
                    .and_then(Value::as_u64)
                    .unwrap_or(0) as usize,
            )
            .unwrap_or(&SDO_PROTOCOL[0])
            .to_string(),
        node.get("fid")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .to_string(),
        node.get("mid")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .to_string(),
        node.get("sid")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .to_string(),
        SDO_RW
            .get(node.get("control_rw").and_then(Value::as_u64).unwrap_or(0) as usize)
            .unwrap_or(&SDO_RW[0])
            .to_string(),
        node.get("data_max")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("data_min")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("data_default")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("handle_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        bit_start,
        bit_length,
        node.get("pre_handle_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("pre_handle_scale")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("pre_handle_offset")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        node.get("pre_handle_decimal_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    ]);
}

fn auth_label(node: &Value) -> String {
    SDO_AUTH
        .get(node.get("user_auth").and_then(Value::as_u64).unwrap_or(0) as usize)
        .unwrap_or(&SDO_AUTH[0])
        .to_string()
}

fn parse_handle_param(value: &str) -> (String, String) {
    let parts = value.split("->").collect::<Vec<_>>();
    if parts.len() < 2 {
        return (String::new(), String::new());
    }
    let start = parts[0].parse::<u32>().unwrap_or(0);
    let end = parts[1].parse::<u32>().unwrap_or(0);
    (
        format!("bit{}", start),
        format!("{}个bits", end.saturating_sub(start) + 1),
    )
}

fn validate_sdo_rows(rows: &[SdoTableRow], errors: &mut Vec<String>) {
    let mut top_menus = HashSet::new();
    let mut menu_paths = HashSet::new();
    let mut names = HashSet::new();

    for row in rows {
        if row.sub_menu.is_empty() {
            top_menus.insert(row.main_menu.clone());
        } else {
            menu_paths.insert(format!("{}->{}", row.main_menu, row.sub_menu));
        }

        let name_key = format!("{} {} {}", row.main_menu, row.sub_menu, row.parameter);
        if !names.insert(name_key.clone()) {
            errors.push(format!("名称重复：{}", name_key));
        }
    }

    for menu_path in menu_paths {
        let top_prefix = menu_path.split("->").next().unwrap_or_default();
        if top_menus.contains(top_prefix) {
            errors.push(format!("数据格式错误 子菜单不统一：{}", menu_path));
        }
    }
}

/// 将表格行数据构建为 SDO 树形 JSON。
///
/// 按 `main_menu → sub_menu → parameters` 层级分组，生成嵌套的 `children` 结构。
fn build_sdo_document(rows: &[SdoTableRow]) -> Value {
    let mut grouped: HashMap<String, Vec<&SdoTableRow>> = HashMap::new();
    let mut order = Vec::new();

    for row in rows {
        let key = if row.sub_menu.is_empty() {
            row.main_menu.clone()
        } else {
            format!("{}->{}", row.main_menu, row.sub_menu)
        };
        if !grouped.contains_key(&key) {
            order.push(key.clone());
        }
        grouped.entry(key).or_default().push(row);
    }

    let mut main_children = Vec::new();
    let mut main_indexes: HashMap<String, usize> = HashMap::new();

    for key in order {
        let rows = grouped.get(&key).cloned().unwrap_or_default();
        let Some(first) = rows.first() else { continue };

        if first.sub_menu.is_empty() && first.parameter.is_empty() {
            main_indexes.insert(first.main_menu.clone(), main_children.len());
            main_children.push(menu_node(
                &first.main_menu,
                auth_index(&first.main_auth),
                Vec::new(),
            ));
            continue;
        }

        if !first.sub_menu.is_empty() && first.parameter.is_empty() {
            let sub_node = menu_node(&first.sub_menu, auth_index(&first.sub_auth), Vec::new());
            main_indexes.insert(first.main_menu.clone(), main_children.len());
            main_children.push(menu_node(
                &first.main_menu,
                auth_index(&first.main_auth),
                vec![sub_node],
            ));
            continue;
        }

        let main_index = match main_indexes.get(&first.main_menu) {
            Some(index) => *index,
            None => {
                main_indexes.insert(first.main_menu.clone(), main_children.len());
                main_children.push(menu_node(
                    &first.main_menu,
                    auth_index(&first.main_auth),
                    Vec::new(),
                ));
                main_children.len() - 1
            }
        };

        let children = main_children[main_index]
            .get_mut("children")
            .and_then(Value::as_array_mut);
        let Some(children) = children else { continue };

        if first.sub_menu.is_empty() {
            children.extend(rows.iter().map(|row| parameter_node(row)));
        } else {
            let sub_children = rows
                .iter()
                .map(|row| parameter_node(row))
                .collect::<Vec<_>>();
            children.push(menu_node(
                &first.sub_menu,
                auth_index(&first.sub_auth),
                sub_children,
            ));
        }
    }

    json!({
        "type": 0,
        "user_auth": 0,
        "name_index": 0,
        "name": "菜单",
        "children": main_children
    })
}

fn menu_node(name: &str, auth: usize, children: Vec<Value>) -> Value {
    json!({
        "type": 0,
        "user_auth": auth,
        "name_index": 0,
        "name": name,
        "children": children
    })
}

fn parameter_node(row: &SdoTableRow) -> Value {
    let control_use_default = if row.default_value.is_empty() { 0 } else { 1 };
    let control_use_min_max = if row.min_value.is_empty() { 0 } else { 1 };

    json!({
        "type": 1,
        "user_auth": auth_index(&row.auth),
        "name_index": 0,
        "name": row.parameter,
        "control_protocol": index_of(SDO_PROTOCOL, &row.protocol).unwrap_or(0),
        "control_rw": index_of(SDO_RW, &row.read_write).unwrap_or(0),
        "control_use_default": control_use_default,
        "control_use_min_max": control_use_min_max,
        "handle": 0,
        "handle_name": row.data_type,
        "handle_param": handle_param(&row.bit_start, &row.bit_length),
        "fid": parse_number(&row.frame_id).unwrap_or(0),
        "mid": parse_number(&row.main_index).unwrap_or(0),
        "sid": parse_number(&row.sub_index).unwrap_or(0),
        "data_default": row.default_value,
        "data_min": row.min_value,
        "data_max": row.max_value,
        "pre_handle": 0,
        "pre_handle_name": row.preprocess,
        "pre_handle_scale": row.scale,
        "pre_handle_offset": row.offset,
        "pre_handle_decimal_name": row.decimals,
        "pre_handle_decimal": 0
    })
}

fn handle_param(bit_start: &str, bit_length: &str) -> String {
    if bit_start.is_empty() || bit_length.is_empty() {
        return "0->0->0".to_string();
    }
    let start = bit_start
        .to_lowercase()
        .replace("bit", "")
        .parse::<u32>()
        .unwrap_or(0);
    let length = bit_length
        .to_lowercase()
        .replace("个bits", "")
        .parse::<u32>()
        .unwrap_or(0);
    format!("{}->{}->1", start, length.saturating_sub(1))
}

fn auth_index(value: &str) -> usize {
    index_of(SDO_AUTH, value).unwrap_or(0)
}

fn index_of(values: &[&str], value: &str) -> Option<usize> {
    values.iter().position(|item| *item == value)
}

fn parse_number(value: &str) -> Option<u32> {
    let value = value.trim();
    if value.is_empty() {
        return Some(0);
    }
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .map_or_else(
            || value.parse::<u32>().ok(),
            |hex| u32::from_str_radix(hex, 16).ok(),
        )
}

/// SDO 表格的单行内部表示（21 列）。
#[derive(Debug, Clone)]
struct SdoTableRow {
    main_menu: String,
    main_auth: String,
    sub_menu: String,
    sub_auth: String,
    parameter: String,
    auth: String,
    protocol: String,
    frame_id: String,
    main_index: String,
    sub_index: String,
    read_write: String,
    max_value: String,
    min_value: String,
    default_value: String,
    data_type: String,
    bit_start: String,
    bit_length: String,
    preprocess: String,
    scale: String,
    offset: String,
    decimals: String,
}

impl SdoTableRow {
    fn from_cells(line: usize, cells: &[String]) -> Result<Self, Vec<String>> {
        let mut errors = Vec::new();
        if cells.len() < SDO_HEADERS.len() {
            errors.push(format!("数据长度错误 line:{}", line));
            return Err(errors);
        }

        let row = Self {
            main_menu: cell(cells, 0),
            main_auth: cell(cells, 1),
            sub_menu: cell(cells, 2),
            sub_auth: cell(cells, 3),
            parameter: cell(cells, 4),
            auth: cell(cells, 5),
            protocol: cell(cells, 6),
            frame_id: cell(cells, 7),
            main_index: cell(cells, 8),
            sub_index: cell(cells, 9),
            read_write: cell(cells, 10),
            max_value: cell(cells, 11),
            min_value: cell(cells, 12),
            default_value: cell(cells, 13),
            data_type: cell(cells, 14),
            bit_start: cell(cells, 15),
            bit_length: cell(cells, 16),
            preprocess: cell(cells, 17),
            scale: cell(cells, 18),
            offset: cell(cells, 19),
            decimals: cell(cells, 20),
        };

        row.validate(line, &mut errors);

        if errors.is_empty() {
            Ok(row)
        } else {
            Err(errors)
        }
    }

    fn validate(&self, line: usize, errors: &mut Vec<String>) {
        if self.main_menu.is_empty() && (!self.sub_menu.is_empty() || !self.parameter.is_empty()) {
            errors.push(format!("主菜单名称错误 line:{}", line));
        }
        if (self.main_menu.is_empty() && !self.main_auth.is_empty())
            || (self.sub_menu.is_empty() && !self.sub_auth.is_empty())
            || (self.parameter.is_empty() && !self.auth.is_empty())
        {
            errors.push(format!("权限错误1 line:{}", line));
        }
        for auth in [&self.main_auth, &self.sub_auth, &self.auth] {
            if !auth.is_empty() && index_of(SDO_AUTH, auth).is_none() {
                errors.push(format!("权限错误2 line:{}", line));
            }
        }
        if !self.parameter.is_empty() {
            if index_of(SDO_PROTOCOL, &self.protocol).is_none() {
                errors.push(format!("协议类型:{}:{}", self.path_key(), self.parameter));
            }
            if parse_number(&self.frame_id).is_none()
                || parse_number(&self.main_index).is_none()
                || parse_number(&self.sub_index).is_none()
            {
                errors.push(format!(
                    "索引格式错误:{}:{}",
                    self.path_key(),
                    self.parameter
                ));
            }
            if index_of(SDO_RW, &self.read_write).is_none() {
                errors.push(format!("读写权限:{}:{}", self.path_key(), self.parameter));
            }
            if self.data_type.is_empty() {
                errors.push(format!("数据类型:{}:{}", self.path_key(), self.parameter));
            }
        }
    }

    fn path_key(&self) -> String {
        if self.sub_menu.is_empty() {
            self.main_menu.clone()
        } else {
            format!("{}->{}", self.main_menu, self.sub_menu)
        }
    }
}

fn cell(cells: &[String], index: usize) -> String {
    cells
        .get(index)
        .map(|item| item.trim().to_string())
        .unwrap_or_default()
}

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanopenConversionReport {
    pub valid: bool,
    pub nodes: Vec<CanopenNodeSummary>,
    pub files: Vec<String>,
    pub warnings: Vec<String>,
    pub model: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanopenNodeSummary {
    pub node_id: u32,
    pub name: String,
    pub sdo_rx_cob_id: u32,
    pub sdo_tx_cob_id: u32,
    pub object_count: u32,
    pub pdo_count: u32,
    pub bitfield_count: u32,
}

#[derive(Debug, Clone)]
struct ObjectSpec {
    node_id: u32,
    index: u32,
    subindex: u32,
    name: String,
    menu_path: String,
    access: String,
    data_type: String,
    default_value: Option<String>,
    min_value: Option<String>,
    max_value: Option<String>,
    handle: u32,
    handle_param: String,
}

#[derive(Debug, Clone)]
struct PdoSpec {
    node_id: Option<u32>,
    direction: String,
    pdo_number: Option<u32>,
    cob_id: u32,
    name: String,
    mappings: Vec<PdoMappingSpec>,
}

#[derive(Debug, Clone)]
struct PdoMappingSpec {
    param_id: String,
    name: String,
    bit_offset: u32,
    bit_length: u32,
    show_type: u32,
    index: Option<u32>,
    subindex: Option<u32>,
}

#[derive(Debug, Clone)]
struct BitFieldSpec {
    node_id: u32,
    index: u32,
    subindex: u32,
    name: String,
    menu_path: String,
    handle: u32,
    bit_index: u32,
    off_value: String,
    on_value: String,
}

fn object_u32(value: &Value, key: &str) -> Option<u32> {
    value.get(key).and_then(value_u32)
}

fn value_u32(value: &Value) -> Option<u32> {
    value.as_u64().map(|v| v as u32).or_else(|| {
        let text = value.as_str()?.trim();
        if let Some(hex) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
            u32::from_str_radix(hex, 16).ok()
        } else {
            text.parse::<u32>().ok()
        }
    })
}

fn object_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn access_type(value: u32) -> String {
    match value {
        1 => "rw",
        2 => "wo",
        _ => "ro",
    }
    .to_string()
}

fn eds_data_type(
    handle: u32,
    min_value: Option<&String>,
    max_value: Option<&String>,
) -> &'static str {
    match handle {
        4 | 7 => "0x0007", // UNSIGNED32
        3 => "0x0006",     // UNSIGNED16
        6 => "0x0009",     // VISIBLE_STRING
        _ => {
            let max = max_value.and_then(|v| value_u32(&Value::String(v.clone())));
            let min = min_value.and_then(|v| value_u32(&Value::String(v.clone())));
            if min == Some(0) && max.is_some_and(|value| value <= 255) {
                "0x0005" // UNSIGNED8
            } else if max.is_some_and(|value| value <= 65535) {
                "0x0006"
            } else {
                "0x0007"
            }
        }
    }
}

fn collect_sdo_objects(document: &Value, warnings: &mut Vec<String>) -> Vec<ObjectSpec> {
    let mut objects = Vec::new();
    let Some(root) = document.get("sdo_info") else {
        warnings.push("缺少 sdo_info，无法生成对象字典".to_string());
        return objects;
    };

    fn visit(
        node: &Value,
        path: &mut Vec<String>,
        objects: &mut Vec<ObjectSpec>,
        warnings: &mut Vec<String>,
    ) {
        let node_type = object_u32(node, "type").unwrap_or(0);
        let name = object_string(node, "name").unwrap_or_else(|| {
            if node_type == 1 {
                "Unnamed Parameter".to_string()
            } else {
                "Unnamed Menu".to_string()
            }
        });

        if node_type == 1 {
            let node_id = object_u32(node, "fid").unwrap_or(0);
            let index = object_u32(node, "mid").unwrap_or(0);
            let subindex = object_u32(node, "sid").unwrap_or(0);
            if node_id == 0 || index == 0 {
                warnings.push(format!("设置项 {} 缺少有效 fid/mid", name));
            }
            let handle = object_u32(node, "handle").unwrap_or(0);
            let min_value = object_string(node, "data_min");
            let max_value = object_string(node, "data_max");
            objects.push(ObjectSpec {
                node_id,
                index,
                subindex,
                name,
                menu_path: path.join(" / "),
                access: access_type(object_u32(node, "control_rw").unwrap_or(0)),
                data_type: eds_data_type(handle, min_value.as_ref(), max_value.as_ref())
                    .to_string(),
                default_value: object_string(node, "data_default"),
                min_value,
                max_value,
                handle,
                handle_param: object_string(node, "handle_param").unwrap_or_default(),
            });
            return;
        }

        path.push(name);
        if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
            for child in children {
                visit(child, path, objects, warnings);
            }
        }
        path.pop();
    }

    let mut path = Vec::new();
    visit(root, &mut path, &mut objects, warnings);
    objects
}

fn collect_param_names(document: &Value) -> HashMap<String, String> {
    let mut names = HashMap::new();
    if let Some(params) = document.get("pdo_global_param").and_then(|v| v.as_array()) {
        for param in params {
            if let Some(id) = object_string(param, "param_id") {
                let name = object_string(param, "name").unwrap_or_else(|| id.clone());
                names.insert(id, name);
            }
        }
    }
    names
}

fn pdo_kind(cob_id: u32, node_ids: &BTreeSet<u32>) -> (Option<u32>, String, Option<u32>) {
    let bases = [
        ("tpdo", 1, 0x180),
        ("tpdo", 2, 0x280),
        ("tpdo", 3, 0x380),
        ("tpdo", 4, 0x480),
        ("rpdo", 1, 0x200),
        ("rpdo", 2, 0x300),
        ("rpdo", 3, 0x400),
        ("rpdo", 4, 0x500),
    ];
    for (direction, number, base) in bases {
        if cob_id >= base {
            let node_id = cob_id - base;
            if node_ids.contains(&node_id) {
                return (Some(node_id), direction.to_string(), Some(number));
            }
        }
    }
    (None, "custom".to_string(), None)
}

fn collect_pdos(
    document: &Value,
    objects: &[ObjectSpec],
    warnings: &mut Vec<String>,
) -> Vec<PdoSpec> {
    let node_ids = objects
        .iter()
        .map(|obj| obj.node_id)
        .collect::<BTreeSet<_>>();
    let param_names = collect_param_names(document);
    let mut by_name = HashMap::new();
    for obj in objects {
        by_name
            .entry(obj.name.clone())
            .or_insert((obj.index, obj.subindex));
    }

    let mut pdos = Vec::new();
    for section in ["pdo_recv", "pdo_send"] {
        if let Some(frames) = document.get(section).and_then(|v| v.as_array()) {
            for frame in frames {
                let cob_id = object_u32(frame, "id")
                    .or_else(|| object_u32(frame, "can_id"))
                    .unwrap_or(0);
                let (node_id, direction, pdo_number) = pdo_kind(cob_id, &node_ids);
                if node_id.is_none() || pdo_number.is_none() {
                    warnings.push(format!(
                        "已排除实时帧 0x{:X}：无法按 CANopen 默认 PDO 连接集匹配到设置数据中的 Node-ID",
                        cob_id
                    ));
                    continue;
                }
                let mut mappings = Vec::new();
                for signal in frame
                    .get("data")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
                {
                    let param_id = object_string(&signal, "param_id")
                        .or_else(|| object_string(&signal, "pdo_param_name"))
                        .unwrap_or_else(|| "unknown".to_string());
                    let name = param_names
                        .get(&param_id)
                        .cloned()
                        .unwrap_or_else(|| param_id.clone());
                    let resolved = by_name.get(&name).copied();
                    if resolved.is_none() {
                        warnings.push(format!(
                            "PDO 0x{:X} 信号 {} 无法映射到对象字典 index/subindex，EDS PDO Mapping 将标记为未解析",
                            cob_id, name
                        ));
                    }
                    mappings.push(PdoMappingSpec {
                        param_id,
                        name,
                        bit_offset: object_u32(&signal, "pos").unwrap_or(0),
                        bit_length: object_u32(&signal, "len").unwrap_or(0),
                        show_type: object_u32(&signal, "show_type").unwrap_or(0),
                        index: resolved.map(|item| item.0),
                        subindex: resolved.map(|item| item.1),
                    });
                }
                pdos.push(PdoSpec {
                    node_id,
                    direction,
                    pdo_number,
                    cob_id,
                    name: object_string(frame, "desc")
                        .unwrap_or_else(|| format!("PDO_0x{cob_id:X}")),
                    mappings,
                });
            }
        }
    }
    pdos
}

fn model_json(objects: &[ObjectSpec], pdos: &[PdoSpec], warnings: &[String]) -> Value {
    let mut nodes = BTreeMap::<u32, Vec<&ObjectSpec>>::new();
    let bitfields = collect_bitfields(objects);
    for obj in objects {
        nodes.entry(obj.node_id).or_default().push(obj);
    }
    let node_values = nodes
        .iter()
        .map(|(node_id, objects)| {
            let node_pdos = pdos
                .iter()
                .filter(|pdo| pdo.node_id == Some(*node_id))
                .map(|pdo| {
                    json!({
                        "cobId": format!("0x{:X}", pdo.cob_id),
                        "direction": pdo.direction,
                        "pdoNumber": pdo.pdo_number,
                        "name": pdo.name,
                        "mappings": pdo.mappings.iter().map(|m| json!({
                            "paramId": m.param_id,
                            "name": m.name,
                            "bitOffset": m.bit_offset,
                            "bitLength": m.bit_length,
                            "showType": m.show_type,
                            "index": m.index.map(|v| format!("0x{:04X}", v)),
                            "subindex": m.subindex,
                            "inferred": m.index.is_some(),
                        })).collect::<Vec<_>>(),
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "nodeId": node_id,
                "source": "sdo_info + canopen-compatible pdo_recv/pdo_send",
                "sdo": {
                    "rxCobId": format!("0x{:X}", 0x600 + node_id),
                    "txCobId": format!("0x{:X}", 0x580 + node_id),
                },
                "objects": objects.iter().map(|obj| json!({
                    "index": format!("0x{:04X}", obj.index),
                    "subindex": obj.subindex,
                    "name": obj.name,
                    "menuPath": obj.menu_path,
                    "access": obj.access,
                    "dataType": obj.data_type,
                    "defaultValue": obj.default_value,
                    "minValue": obj.min_value,
                    "maxValue": obj.max_value,
                    "legacy": {
                        "fid": obj.node_id,
                        "mid": obj.index,
                        "sid": obj.subindex,
                        "handle": obj.handle,
                        "handleParam": obj.handle_param,
                    }
                })).collect::<Vec<_>>(),
                "bitfields": bitfields.iter().filter(|field| field.node_id == *node_id).map(|field| json!({
                    "index": format!("0x{:04X}", field.index),
                    "subindex": field.subindex,
                    "bitIndex": field.bit_index,
                    "name": field.name,
                    "offValue": field.off_value,
                    "onValue": field.on_value,
                    "handle": field.handle,
                    "menuPath": field.menu_path,
                })).collect::<Vec<_>>(),
                "pdos": node_pdos,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "version": 1,
        "scope": "setting-data-and-canopen-pdo",
        "description": "CANopen-compatible SDO objects are generated from 数据/设置数据(sdo_info). PDOs are included only when their COB-ID matches the CANopen default PDO connection set for a known Node-ID.",
        "nodes": node_values,
        "warnings": warnings,
    })
}

fn eds_value(value: &Option<String>, fallback: &str) -> String {
    value.clone().unwrap_or_else(|| fallback.to_string())
}

fn eds_text(value: &str) -> String {
    value
        .replace(['\r', '\n', '='], " ")
        .trim()
        .chars()
        .take(120)
        .collect::<String>()
}

fn csv_cell(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn dbc_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace(['\r', '\n'], " ")
        .trim()
        .to_string()
}

fn dbc_identifier(value: &str, fallback: &str) -> String {
    let mut output = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            output.push(ch);
        } else if !output.ends_with('_') {
            output.push('_');
        }
    }
    let output = output.trim_matches('_');
    let mut output = if output.is_empty() {
        fallback.to_string()
    } else {
        output.to_string()
    };
    if match output.chars().next() {
        Some(ch) => ch.is_ascii_digit(),
        None => true,
    } {
        output = format!("_{output}");
    }
    output.chars().take(96).collect()
}

fn parse_bitfield_param(value: &str) -> Option<(u32, String, String)> {
    let parts = value.split("->").map(str::trim).collect::<Vec<_>>();
    if parts.len() < 3 {
        return None;
    }
    let bit_index = parts[0].parse::<u32>().ok()?;
    Some((bit_index, parts[1].to_string(), parts[2].to_string()))
}

fn collect_bitfields(objects: &[ObjectSpec]) -> Vec<BitFieldSpec> {
    let mut bitfields = objects
        .iter()
        .filter_map(|obj| {
            if !matches!(obj.handle, 11 | 12) {
                return None;
            }
            let (bit_index, off_value, on_value) = parse_bitfield_param(&obj.handle_param)?;
            Some(BitFieldSpec {
                node_id: obj.node_id,
                index: obj.index,
                subindex: obj.subindex,
                name: obj.name.clone(),
                menu_path: obj.menu_path.clone(),
                handle: obj.handle,
                bit_index,
                off_value,
                on_value,
            })
        })
        .collect::<Vec<_>>();
    bitfields.sort_by_key(|field| (field.node_id, field.index, field.subindex, field.bit_index));
    bitfields
}

fn generate_bitfield_csv(bitfields: &[BitFieldSpec]) -> String {
    let mut lines = vec![
        "NODE_ID,INDEX,SUBINDEX,BIT_INDEX,NAME,OFF_VALUE,ON_VALUE,HANDLE,MENU_PATH".to_string(),
    ];
    for field in bitfields {
        lines.push(format!(
            "{},0x{:04X},{},{},{},{},{},{},{}",
            field.node_id,
            field.index,
            field.subindex,
            field.bit_index,
            csv_cell(&field.name),
            csv_cell(&field.off_value),
            csv_cell(&field.on_value),
            field.handle,
            csv_cell(&field.menu_path),
        ));
    }
    lines.join("\n")
}

fn bitfield_json(bitfields: &[BitFieldSpec]) -> Value {
    json!({
        "version": 1,
        "scope": "sdo-bitfield-semantics",
        "description": "Business bit semantics parsed from 数据/设置数据 handle_param. These bits are not injected into DBC unless a real PDO signal carries the corresponding bit position.",
        "bitfields": bitfields.iter().map(|field| json!({
            "nodeId": field.node_id,
            "index": format!("0x{:04X}", field.index),
            "subindex": field.subindex,
            "bitIndex": field.bit_index,
            "name": field.name,
            "offValue": field.off_value,
            "onValue": field.on_value,
            "handle": field.handle,
            "menuPath": field.menu_path,
        })).collect::<Vec<_>>(),
    })
}

fn generate_sdo_object_csv(objects: &[ObjectSpec]) -> String {
    let mut lines = vec![
        "NODE_ID,SDO_RX_COB_ID,SDO_TX_COB_ID,INDEX,SUBINDEX,NAME,ACCESS,DATA_TYPE,DEFAULT_VALUE,MIN_VALUE,MAX_VALUE,HANDLE,HANDLE_PARAM,MENU_PATH".to_string(),
    ];
    for obj in objects {
        lines.push(format!(
            "{},0x{:X},0x{:X},0x{:04X},{},{},{},{},{},{},{},{},{},{}",
            obj.node_id,
            0x600 + obj.node_id,
            0x580 + obj.node_id,
            obj.index,
            obj.subindex,
            csv_cell(&obj.name),
            obj.access,
            obj.data_type,
            csv_cell(obj.default_value.as_deref().unwrap_or("")),
            csv_cell(obj.min_value.as_deref().unwrap_or("")),
            csv_cell(obj.max_value.as_deref().unwrap_or("")),
            obj.handle,
            csv_cell(&obj.handle_param),
            csv_cell(&obj.menu_path),
        ));
    }
    lines.join("\n")
}

fn sdo_object_json(objects: &[ObjectSpec]) -> Value {
    json!({
        "version": 1,
        "scope": "sdo-object-dictionary-map",
        "description": "Object dictionary entries addressable through SDO frames. DBC describes the generic SDO transport frames; this map provides object-level names, indexes and value constraints.",
        "objects": objects.iter().map(|obj| json!({
            "nodeId": obj.node_id,
            "sdoRxCobId": format!("0x{:X}", 0x600 + obj.node_id),
            "sdoTxCobId": format!("0x{:X}", 0x580 + obj.node_id),
            "index": format!("0x{:04X}", obj.index),
            "subindex": obj.subindex,
            "name": obj.name,
            "menuPath": obj.menu_path,
            "access": obj.access,
            "dataType": obj.data_type,
            "defaultValue": obj.default_value,
            "minValue": obj.min_value,
            "maxValue": obj.max_value,
            "handle": obj.handle,
            "handleParam": obj.handle_param,
        })).collect::<Vec<_>>(),
    })
}

fn sdo_object_summary(objects: &[&ObjectSpec]) -> String {
    let mut parts = Vec::new();
    for obj in objects.iter().take(12) {
        parts.push(format!("{}=0x{:04X}:{}", obj.name, obj.index, obj.subindex));
    }
    if objects.len() > 12 {
        parts.push(format!("... {} more", objects.len() - 12));
    }
    parts.join("; ")
}

fn push_sdo_dbc_message(
    lines: &mut Vec<String>,
    comments: &mut Vec<String>,
    values: &mut Vec<String>,
    cob_id: u32,
    frame_name: &str,
    node_id: u32,
    role: &str,
    objects: &[&ObjectSpec],
) {
    lines.push(format!("BO_ {cob_id} {frame_name}: 8 Vector__XXX\n"));
    lines.push(" SG_ SDO_Command : 0|8@1+ (1,0) [0|255] \"\" Vector__XXX\n".to_string());
    lines.push(" SG_ SDO_Index : 8|16@1+ (1,0) [0|65535] \"\" Vector__XXX\n".to_string());
    lines.push(" SG_ SDO_SubIndex : 24|8@1+ (1,0) [0|255] \"\" Vector__XXX\n".to_string());
    lines.push(" SG_ SDO_DataU32 : 32|32@1+ (1,0) [0|4294967295] \"\" Vector__XXX\n\n".to_string());

    comments.push(format!(
        "CM_ BO_ {cob_id} \"CANopen SDO {role}; node_id={node_id}; objects={}; {}; see sdo_object_map.csv/json\";\n",
        objects.len(),
        dbc_text(&sdo_object_summary(objects))
    ));
    comments.push(format!(
        "CM_ SG_ {cob_id} SDO_Index \"Object index in little-endian bytes 1..2; combine with SDO_SubIndex and sdo_object_map.csv/json.\";\n"
    ));
    comments.push(format!(
        "CM_ SG_ {cob_id} SDO_SubIndex \"Object subindex; combine with SDO_Index and sdo_object_map.csv/json.\";\n"
    ));
    comments.push(format!(
        "CM_ SG_ {cob_id} SDO_DataU32 \"Expedited SDO payload bytes 4..7, little-endian.\";\n"
    ));
    values.push(format!(
        "VAL_ {cob_id} SDO_Command 35 \"Download4Req\" 43 \"Download2Req\" 47 \"Download1Req\" 64 \"UploadReq\" 67 \"Upload4Resp\" 75 \"Upload2Resp\" 79 \"Upload1Resp\" 96 \"DownloadResp\" 128 \"Abort\";\n"
    ));
}

fn generate_canopen_protocol_dbc(objects: &[ObjectSpec], pdos: &[PdoSpec]) -> String {
    let mut lines = Vec::new();
    let mut comments = Vec::new();
    let mut values = Vec::new();

    lines.push("VERSION \"Generated CANopen Protocol DBC\"\n\n".to_string());
    lines.push("NS_ :\n\tNS_DESC_\n\tCM_\n\tBA_DEF_\n\tBA_\n\tVAL_\n\tBA_DEF_DEF_\n\n".to_string());
    lines.push("BS_:\n\n".to_string());
    lines.push("BU_: Vector__XXX\n\n".to_string());

    let mut objects_by_node = BTreeMap::<u32, Vec<&ObjectSpec>>::new();
    for obj in objects {
        objects_by_node.entry(obj.node_id).or_default().push(obj);
    }
    for (node_id, node_objects) in &objects_by_node {
        push_sdo_dbc_message(
            &mut lines,
            &mut comments,
            &mut values,
            0x600 + node_id,
            &format!("SDO_RX_Node{node_id}"),
            *node_id,
            "client_to_server",
            node_objects,
        );
        push_sdo_dbc_message(
            &mut lines,
            &mut comments,
            &mut values,
            0x580 + node_id,
            &format!("SDO_TX_Node{node_id}"),
            *node_id,
            "server_to_client",
            node_objects,
        );
    }

    for pdo in pdos {
        let node_id = pdo.node_id.unwrap_or(0);
        let pdo_prefix = match pdo.direction.as_str() {
            "tpdo" => "TPDO",
            "rpdo" => "RPDO",
            _ => "PDO",
        };
        let number = pdo.pdo_number.unwrap_or(0);
        let frame_name = dbc_identifier(
            &format!("{pdo_prefix}{number}_Node{node_id}_{}", pdo.name),
            &format!("PDO_0x{:X}", pdo.cob_id),
        );
        lines.push(format!(
            "BO_ {} {}: 8 Vector__XXX\n",
            pdo.cob_id, frame_name
        ));

        let mut used_names = BTreeSet::new();
        for (index, mapping) in pdo.mappings.iter().enumerate() {
            if mapping.bit_length == 0 {
                continue;
            }
            let fallback = format!("SIG_{}", mapping.param_id);
            let mut signal_name = dbc_identifier(&mapping.name, &fallback);
            if signal_name == "_" || signal_name.is_empty() {
                signal_name = dbc_identifier(&fallback, &format!("SIG_{:X}_{index}", pdo.cob_id));
            }
            let base_name = signal_name.clone();
            let mut suffix = 2;
            while used_names.contains(&signal_name) {
                signal_name = format!("{base_name}_{suffix}");
                suffix += 1;
            }
            used_names.insert(signal_name.clone());

            let byte_order = if mapping.show_type == 1 { "0" } else { "1" };
            let max_value = if mapping.bit_length >= 64 {
                u64::MAX
            } else {
                (1_u64 << mapping.bit_length) - 1
            };
            lines.push(format!(
                " SG_ {} : {}|{}@{}+ (1,0) [0|{}] \"\" Vector__XXX\n",
                signal_name, mapping.bit_offset, mapping.bit_length, byte_order, max_value
            ));

            let object_ref = match (mapping.index, mapping.subindex) {
                (Some(index), Some(subindex)) => format!(" object=0x{index:04X}:{subindex}"),
                _ => " object=unresolved".to_string(),
            };
            comments.push(format!(
                "CM_ SG_ {} {} \"{}; param_id={};{}\";\n",
                pdo.cob_id,
                signal_name,
                dbc_text(&mapping.name),
                dbc_text(&mapping.param_id),
                object_ref
            ));
            if mapping.bit_length == 1 {
                values.push(format!(
                    "VAL_ {} {} 0 \"Off\" 1 \"On\";\n",
                    pdo.cob_id, signal_name
                ));
            }
        }
        lines.push("\n".to_string());
        comments.push(format!(
            "CM_ BO_ {} \"{}; direction={}; pdo_number={}; node_id={}\";\n",
            pdo.cob_id,
            dbc_text(&pdo.name),
            pdo.direction,
            number,
            node_id
        ));
    }

    lines.push("\n".to_string());
    lines.extend(comments);
    lines.push("\n".to_string());
    lines.extend(values);
    lines.concat()
}

fn unique_objects<'a>(objects: &'a [&'a ObjectSpec]) -> Vec<&'a ObjectSpec> {
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for obj in objects {
        if seen.insert((obj.node_id, obj.index, obj.subindex)) {
            unique.push(*obj);
        }
    }
    unique
}

fn unique_owned_objects(objects: &[ObjectSpec]) -> Vec<&ObjectSpec> {
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for obj in objects {
        if seen.insert((obj.node_id, obj.index, obj.subindex)) {
            unique.push(obj);
        }
    }
    unique
}

fn eds_object_list_section(name: &str, indices: &BTreeSet<u32>) -> String {
    let mut lines = vec![format!("[{name}]\nSupportedObjects={}\n", indices.len())];
    for (index, object_index) in indices.iter().enumerate() {
        lines.push(format!("{}=0x{:04X}\n", index + 1, object_index));
    }
    lines.push("\n".to_string());
    lines.concat()
}

fn generate_eds(node_id: u32, objects: &[&ObjectSpec], pdos: &[&PdoSpec]) -> String {
    let mut lines = Vec::new();
    let eds_objects = unique_objects(objects);
    let mandatory_indices = BTreeSet::from([0x1000, 0x1001, 0x1018]);
    let mut optional_indices = BTreeSet::from([0x1200]);
    let mut manufacturer_indices = BTreeSet::new();

    for pdo in pdos {
        let Some(number) = pdo.pdo_number else {
            continue;
        };
        let comm_base = if pdo.direction == "tpdo" {
            0x1800
        } else {
            0x1400
        };
        let map_base = if pdo.direction == "tpdo" {
            0x1A00
        } else {
            0x1600
        };
        optional_indices.insert(comm_base + number - 1);
        optional_indices.insert(map_base + number - 1);
    }

    for obj in &eds_objects {
        if mandatory_indices.contains(&obj.index) {
            continue;
        }
        if (0x2000..=0x5FFF).contains(&obj.index) {
            manufacturer_indices.insert(obj.index);
        } else {
            optional_indices.insert(obj.index);
        }
    }

    lines.push("[FileInfo]\n".to_string());
    lines.push(format!("FileName=node_{node_id:02}.eds\n"));
    lines.push("FileVersion=1\nFileRevision=0\nEDSVersion=4.0\n".to_string());
    lines.push(format!(
        "Description=Generated CANopen EDS for node {node_id}\n\n"
    ));

    lines.push("[DeviceInfo]\n".to_string());
    lines.push("VendorName=JC\nProductName=Legacy CANopen Compatible Node\n".to_string());
    lines.push("BaudRate_125=1\nBaudRate_250=1\nBaudRate_500=1\nSimpleBootUpSlave=1\n".to_string());
    lines.push(format!(
        "NrOfRXPDO={}\nNrOfTXPDO={}\nLSS_Supported=0\n\n",
        pdos.iter().filter(|pdo| pdo.direction == "rpdo").count(),
        pdos.iter().filter(|pdo| pdo.direction == "tpdo").count()
    ));

    lines.push(
        "[MandatoryObjects]\nSupportedObjects=3\n1=0x1000\n2=0x1001\n3=0x1018\n\n".to_string(),
    );
    lines.push(eds_object_list_section(
        "OptionalObjects",
        &optional_indices,
    ));
    lines.push(eds_object_list_section(
        "ManufacturerObjects",
        &manufacturer_indices,
    ));

    lines.push("[1000]\nParameterName=Device Type\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0x00000000\nPDOMapping=0\n\n".to_string());
    lines.push("[1001]\nParameterName=Error Register\nObjectType=0x7\nDataType=0x0005\nAccessType=ro\nDefaultValue=0\nPDOMapping=0\n\n".to_string());
    lines
        .push("[1018]\nParameterName=Identity Object\nObjectType=0x9\nSubNumber=4\n\n".to_string());
    lines.push("[1018sub1]\nParameterName=Vendor ID\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0\nPDOMapping=0\n\n".to_string());
    lines.push("[1018sub2]\nParameterName=Product Code\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0\nPDOMapping=0\n\n".to_string());
    lines.push("[1018sub3]\nParameterName=Revision Number\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=1\nPDOMapping=0\n\n".to_string());
    lines.push("[1018sub4]\nParameterName=Serial Number\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0\nPDOMapping=0\n\n".to_string());
    lines.push(
        "[1200]\nParameterName=SDO Server Parameter\nObjectType=0x9\nSubNumber=2\n\n".to_string(),
    );
    lines.push(format!("[1200sub1]\nParameterName=COB-ID client to server\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0x{:X}\nPDOMapping=0\n\n", 0x600 + node_id));
    lines.push(format!("[1200sub2]\nParameterName=COB-ID server to client\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0x{:X}\nPDOMapping=0\n\n", 0x580 + node_id));

    for pdo in pdos {
        let Some(number) = pdo.pdo_number else {
            continue;
        };
        let comm_base = if pdo.direction == "tpdo" {
            0x1800
        } else {
            0x1400
        };
        let map_base = if pdo.direction == "tpdo" {
            0x1A00
        } else {
            0x1600
        };
        let idx = comm_base + number - 1;
        let map_idx = map_base + number - 1;
        lines.push(format!(
            "[{idx:04X}]\nParameterName={} Communication Parameter\nObjectType=0x9\nSubNumber=5\n\n",
            eds_text(&pdo.name)
        ));
        lines.push(format!("[{idx:04X}sub1]\nParameterName=COB-ID\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0x{:X}\nPDOMapping=0\n\n", pdo.cob_id));
        lines.push(format!("[{idx:04X}sub2]\nParameterName=Transmission Type\nObjectType=0x7\nDataType=0x0005\nAccessType=rw\nDefaultValue=255\nPDOMapping=0\n\n"));
        let resolved = pdo
            .mappings
            .iter()
            .filter(|m| m.index.is_some())
            .collect::<Vec<_>>();
        lines.push(format!(
            "[{map_idx:04X}]\nParameterName={} Mapping Parameter\nObjectType=0x9\nSubNumber={}\n\n",
            eds_text(&pdo.name),
            resolved.len() + 1
        ));
        lines.push(format!("[{map_idx:04X}sub0]\nParameterName=Number of mapped objects\nObjectType=0x7\nDataType=0x0005\nAccessType=ro\nDefaultValue={}\nPDOMapping=0\n\n", resolved.len()));
        for (index, mapping) in resolved.iter().enumerate() {
            let encoded = (mapping.index.unwrap() << 16)
                | (mapping.subindex.unwrap_or(0) << 8)
                | mapping.bit_length;
            lines.push(format!("[{map_idx:04X}sub{}]\nParameterName={}\nObjectType=0x7\nDataType=0x0007\nAccessType=ro\nDefaultValue=0x{:08X}\nPDOMapping=0\n\n", index + 1, eds_text(&mapping.name), encoded));
        }
    }

    let mut grouped = BTreeMap::<u32, Vec<&ObjectSpec>>::new();
    for obj in eds_objects {
        grouped.entry(obj.index).or_default().push(obj);
    }
    for (index, subs) in grouped {
        let max_subindex = subs.iter().map(|obj| obj.subindex).max().unwrap_or(0);
        lines.push(format!(
            "[{index:04X}]\nParameterName=Manufacturer Object 0x{index:04X}\nObjectType=0x9\nSubNumber={}\n\n",
            max_subindex + 1
        ));
        lines.push(format!(
            "[{index:04X}sub0]\nParameterName=Number of entries\nObjectType=0x7\nDataType=0x0005\nAccessType=ro\nDefaultValue={}\nPDOMapping=0\n\n",
            max_subindex
        ));
        for obj in subs {
            lines.push(format!(
                "[{:04X}sub{}]\nParameterName={}\nObjectType=0x7\nDataType={}\nAccessType={}\nDefaultValue={}\nLowLimit={}\nHighLimit={}\nPDOMapping=1\n\n",
                obj.index,
                obj.subindex,
                eds_text(&obj.name),
                obj.data_type,
                obj.access,
                eds_value(&obj.default_value, "0"),
                eds_value(&obj.min_value, "0"),
                eds_value(&obj.max_value, "0"),
            ));
        }
    }

    lines.concat()
}

fn sdo_command_for(obj: &ObjectSpec) -> &'static str {
    match obj.data_type.as_str() {
        "0x0005" => "2F",
        "0x0006" => "2B",
        _ => "23",
    }
}

fn parse_number(text: &str) -> u32 {
    let value = text.trim();
    if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u32::from_str_radix(hex, 16).unwrap_or(0)
    } else {
        value.parse::<f64>().unwrap_or(0.0).round().max(0.0) as u32
    }
}

fn sdo_write_data(obj: &ObjectSpec, value: &str) -> String {
    let cmd = sdo_command_for(obj);
    let index_low = obj.index & 0xff;
    let index_high = (obj.index >> 8) & 0xff;
    let value = parse_number(value);
    let bytes = value.to_le_bytes();
    format!(
        "{} {:02X} {:02X} {:02X} {:02X} {:02X} {:02X} {:02X}",
        cmd, index_low, index_high, obj.subindex, bytes[0], bytes[1], bytes[2], bytes[3]
    )
}

fn generate_sdo_csv(objects: &[ObjectSpec]) -> String {
    let mut lines = vec!["CASE_ID,CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX".to_string()];
    for obj in unique_owned_objects(objects) {
        let can_id = 0x600 + obj.node_id;
        let index_low = obj.index & 0xff;
        let index_high = (obj.index >> 8) & 0xff;
        lines.push(format!(
            "SDO_READ_{:02X}_{:04X}_{:02X},0x{:X},0,{},8,0,40 {:02X} {:02X} {:02X} 00 00 00 00",
            obj.node_id,
            obj.index,
            obj.subindex,
            can_id,
            csv_cell(&format!("SDO_READ_{:04X}_{:02X}", obj.index, obj.subindex)),
            index_low,
            index_high,
            obj.subindex
        ));
        if obj.access != "ro" {
            if let Some(default_value) = &obj.default_value {
                lines.push(format!(
                    "SDO_WRITE_DEFAULT_{:02X}_{:04X}_{:02X},0x{:X},0,{},8,0,{}",
                    obj.node_id,
                    obj.index,
                    obj.subindex,
                    can_id,
                    csv_cell(&format!(
                        "SDO_WRITE_{}_{:04X}_{:02X}",
                        obj.name, obj.index, obj.subindex
                    )),
                    sdo_write_data(obj, default_value)
                ));
            }
        }
    }
    lines.join("\n")
}

fn generate_pdo_csv(pdos: &[PdoSpec]) -> String {
    let mut lines = vec!["CASE_ID,CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX".to_string()];
    for pdo in pdos {
        lines.push(format!(
            "PDO_ZERO_0x{:X},0x{:X},0,{},8,100,00 00 00 00 00 00 00 00",
            pdo.cob_id,
            pdo.cob_id,
            csv_cell(&pdo.name)
        ));
        lines.push(format!(
            "PDO_FF_0x{:X},0x{:X},0,{},8,100,FF FF FF FF FF FF FF FF",
            pdo.cob_id,
            pdo.cob_id,
            csv_cell(&pdo.name)
        ));
    }
    lines.join("\n")
}

fn vendor_json(objects: &[ObjectSpec], pdos: &[PdoSpec], warnings: &[String]) -> Value {
    let bitfields = collect_bitfields(objects);
    json!({
        "version": 1,
        "scope": "setting-data-and-canopen-pdo",
        "description": "Vendor extension for legacy setting-data fields and CANopen-compatible PDO details not fully expressible in EDS.",
        "bitfields": bitfields.iter().map(|field| json!({
            "nodeId": field.node_id,
            "index": format!("0x{:04X}", field.index),
            "subindex": field.subindex,
            "bitIndex": field.bit_index,
            "name": field.name,
            "menuPath": field.menu_path,
            "handle": field.handle,
            "offValue": field.off_value,
            "onValue": field.on_value,
        })).collect::<Vec<_>>(),
        "unresolvedPdoMappings": pdos.iter().flat_map(|pdo| pdo.mappings.iter().filter(|m| m.index.is_none()).map(move |mapping| json!({
            "cobId": format!("0x{:X}", pdo.cob_id),
            "pdoName": pdo.name,
            "paramId": mapping.param_id,
            "name": mapping.name,
            "bitOffset": mapping.bit_offset,
            "bitLength": mapping.bit_length,
        }))).collect::<Vec<_>>(),
        "warnings": warnings,
    })
}

pub fn convert_canopen_document(document: &Value) -> CanopenConversionReport {
    let mut warnings = Vec::new();
    let objects = collect_sdo_objects(document, &mut warnings);
    let pdos = collect_pdos(document, &objects, &mut warnings);
    let bitfields = collect_bitfields(&objects);
    let model = model_json(&objects, &pdos, &warnings);
    let node_ids = objects
        .iter()
        .map(|obj| obj.node_id)
        .collect::<BTreeSet<_>>();
    let unique = unique_owned_objects(&objects);
    let nodes = node_ids
        .into_iter()
        .map(|node_id| CanopenNodeSummary {
            node_id,
            name: format!("Node {node_id}"),
            sdo_rx_cob_id: 0x600 + node_id,
            sdo_tx_cob_id: 0x580 + node_id,
            object_count: unique.iter().filter(|obj| obj.node_id == node_id).count() as u32,
            pdo_count: pdos
                .iter()
                .filter(|pdo| pdo.node_id == Some(node_id))
                .count() as u32,
            bitfield_count: bitfields
                .iter()
                .filter(|field| field.node_id == node_id)
                .count() as u32,
        })
        .collect::<Vec<_>>();
    CanopenConversionReport {
        valid: !objects.is_empty(),
        nodes,
        files: Vec::new(),
        warnings,
        model,
    }
}

pub fn export_canopen_package(
    output_dir: &str,
    document: &Value,
) -> Result<CanopenConversionReport, String> {
    let mut report = convert_canopen_document(document);
    let mut warnings = Vec::new();
    let objects = collect_sdo_objects(document, &mut warnings);
    let pdos = collect_pdos(document, &objects, &mut warnings);
    let bitfields = collect_bitfields(&objects);
    report.warnings = warnings;
    report.model = model_json(&objects, &pdos, &report.warnings);
    let root = Path::new(output_dir).join("canopen_export");
    fs::create_dir_all(&root).map_err(|e| format!("创建 CANopen 导出目录失败：{}", e))?;

    let mut files = Vec::new();
    let node_ids = objects
        .iter()
        .map(|obj| obj.node_id)
        .collect::<BTreeSet<_>>();
    for node_id in node_ids {
        let node_objects = objects
            .iter()
            .filter(|obj| obj.node_id == node_id)
            .collect::<Vec<_>>();
        let node_pdos = pdos
            .iter()
            .filter(|pdo| pdo.node_id == Some(node_id))
            .collect::<Vec<_>>();
        let path = root.join(format!("node_{node_id:02}.eds"));
        fs::write(&path, generate_eds(node_id, &node_objects, &node_pdos))
            .map_err(|e| format!("写入 EDS 失败：{}", e))?;
        files.push(path.to_string_lossy().to_string());
    }

    let model_path = root.join("canopen.model.json");
    fs::write(
        &model_path,
        serde_json::to_string_pretty(&model_json(&objects, &pdos, &report.warnings))
            .map_err(|e| format!("序列化 CANopen model 失败：{}", e))?,
    )
    .map_err(|e| format!("写入 CANopen model 失败：{}", e))?;
    files.push(model_path.to_string_lossy().to_string());

    let vendor_path = root.join("canopen.vendor.json");
    fs::write(
        &vendor_path,
        serde_json::to_string_pretty(&vendor_json(&objects, &pdos, &report.warnings))
            .map_err(|e| format!("序列化 vendor 扩展失败：{}", e))?,
    )
    .map_err(|e| format!("写入 vendor 扩展失败：{}", e))?;
    files.push(vendor_path.to_string_lossy().to_string());

    let protocol_dbc = generate_canopen_protocol_dbc(&objects, &pdos);
    let dbc_path = root.join("canopen_protocol.dbc");
    fs::write(&dbc_path, &protocol_dbc)
        .map_err(|e| format!("写入 CANopen 协议 DBC 失败：{}", e))?;
    files.push(dbc_path.to_string_lossy().to_string());

    let legacy_dbc_path = root.join("canopen_pdo.dbc");
    fs::write(&legacy_dbc_path, &protocol_dbc)
        .map_err(|e| format!("写入 CANopen DBC 兼容文件失败：{}", e))?;
    files.push(legacy_dbc_path.to_string_lossy().to_string());

    let sdo_object_json_path = root.join("sdo_object_map.json");
    fs::write(
        &sdo_object_json_path,
        serde_json::to_string_pretty(&sdo_object_json(&objects))
            .map_err(|e| format!("序列化 SDO 对象映射失败：{}", e))?,
    )
    .map_err(|e| format!("写入 SDO 对象映射 JSON 失败：{}", e))?;
    files.push(sdo_object_json_path.to_string_lossy().to_string());

    let sdo_object_csv_path = root.join("sdo_object_map.csv");
    fs::write(&sdo_object_csv_path, generate_sdo_object_csv(&objects))
        .map_err(|e| format!("写入 SDO 对象映射 CSV 失败：{}", e))?;
    files.push(sdo_object_csv_path.to_string_lossy().to_string());

    let bitfield_json_path = root.join("bitfield_map.json");
    fs::write(
        &bitfield_json_path,
        serde_json::to_string_pretty(&bitfield_json(&bitfields))
            .map_err(|e| format!("序列化位域映射失败：{}", e))?,
    )
    .map_err(|e| format!("写入位域映射 JSON 失败：{}", e))?;
    files.push(bitfield_json_path.to_string_lossy().to_string());

    let bitfield_csv_path = root.join("bitfield_map.csv");
    fs::write(&bitfield_csv_path, generate_bitfield_csv(&bitfields))
        .map_err(|e| format!("写入位域映射 CSV 失败：{}", e))?;
    files.push(bitfield_csv_path.to_string_lossy().to_string());

    let pdo_path = root.join("pdo_test_frames.csv");
    fs::write(&pdo_path, generate_pdo_csv(&pdos))
        .map_err(|e| format!("写入 PDO 测试帧失败：{}", e))?;
    files.push(pdo_path.to_string_lossy().to_string());

    let sdo_path = root.join("sdo_test_frames.csv");
    fs::write(&sdo_path, generate_sdo_csv(&objects))
        .map_err(|e| format!("写入 SDO 测试帧失败：{}", e))?;
    files.push(sdo_path.to_string_lossy().to_string());

    let report_path = root.join("conversion_report.json");
    files.push(report_path.to_string_lossy().to_string());
    report.files = files.clone();
    fs::write(
        &report_path,
        serde_json::to_string_pretty(&report).map_err(|e| format!("序列化转换报告失败：{}", e))?,
    )
    .map_err(|e| format!("写入转换报告失败：{}", e))?;

    Ok(report)
}

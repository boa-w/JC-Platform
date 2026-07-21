//! Legacy 项目文件兼容策略。
//!
//! 该模块集中定义写回 `.jcpro` 时需要剥离的重构专属段，避免命令层和项目层各自维护
//! 一份规则。注意：前端当前还把 `battery_protocol` 视为 sidecar/refactor-only；为保持
//! 既有保存和导出行为不变，后端暂不在 `.jcpro` 写回时剥离该段。

use chrono::Local;
use serde_json::{Map, Value};

const REFACTOR_ONLY_SECTIONS: &[&str] = &[
    "signal_dictionary",
    "private_protocol",
    "protocol_mapping",
    "battery_monitor_info",
];

const LEGACY_CONFIG_VERSION: &str = "jc001";

const LEGACY_JCPRO_TOP_LEVEL_ORDER: &[&str] = &[
    "config_version",
    "device",
    "project",
    "export_info",
    "ui_info",
    "language_info",
    "fault_code_info",
    "pdo_simple_send_recv",
    "pdo_global_param",
    "pdo_condition",
    "pdo_recv",
    "pdo_send",
    "sdo_info",
    "history_ui",
];

const PROJECT_FIELD_ORDER: &[&str] = &["name", "create_time", "update_time", "from", "base_path"];
const EXPORT_INFO_FIELD_ORDER: &[&str] = &["folder_name", "manifest_filename", "binary_filename"];
const DEVICE_FIELD_ORDER: &[&str] = &[
    "type",
    "version",
    "meter_code",
    "screen size",
    "resolution_w",
    "resolution_h",
];
const UI_INFO_FIELD_ORDER: &[&str] = &["logo", "main"];
const UI_MAIN_FIELD_ORDER: &[&str] = &["name", "item"];
const UI_RESOURCE_FIELD_ORDER: &[&str] = &[
    "name",
    "x",
    "y",
    "w",
    "h",
    "handle",
    "default_option",
    "dest",
    "isjpg",
    "option",
];
const LANGUAGE_INFO_FIELD_ORDER: &[&str] = &[
    "list_code_language",
    "language_labels",
    "list_inner",
    "list_translate",
];
const PDO_SIMPLE_FIELD_ORDER: &[&str] = &["pdo_send", "pdo_recv"];
const SDO_FIELD_ORDER: &[&str] = &["type", "user_auth", "name_index", "name", "children"];
const FAULT_CODE_INFO_FIELD_ORDER: &[&str] =
    &["schema_version", "enabled", "version", "sources", "codes"];
const FAULT_CODE_SOURCE_FIELD_ORDER: &[&str] = &[
    "source_key",
    "source_id",
    "name",
    "type_char",
    "can_id",
    "frame_type",
    "code_byte",
    "clear_code",
    "invalid_codes",
    "enabled",
];
const FAULT_CODE_ITEM_FIELD_ORDER: &[&str] = &[
    "source_key",
    "source_id",
    "type_char",
    "code",
    "severity",
    "message_key",
    "name",
    "enabled",
];

pub fn is_legacy_jcpro_path(path: &str) -> bool {
    path.to_lowercase().ends_with(".jcpro")
}

pub fn refactor_only_sections() -> &'static [&'static str] {
    REFACTOR_ONLY_SECTIONS
}

pub fn sanitize_document_for_target(path: &str, mut document: Value) -> Value {
    if !is_legacy_jcpro_path(path) {
        return document;
    }
    if let Some(object) = document.as_object_mut() {
        for section in refactor_only_sections() {
            object.remove(*section);
        }
    }
    set_legacy_config_version(&mut document);
    update_project_update_time(&mut document, &current_legacy_timestamp());
    order_legacy_jcpro_document(document)
}

fn set_legacy_config_version(document: &mut Value) {
    let Some(root) = document.as_object_mut() else {
        return;
    };
    root.insert(
        "config_version".to_string(),
        Value::String(LEGACY_CONFIG_VERSION.to_string()),
    );
}

fn current_legacy_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn update_project_update_time(document: &mut Value, timestamp: &str) {
    let Some(root) = document.as_object_mut() else {
        return;
    };
    let project = root
        .entry("project".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !project.is_object() {
        *project = Value::Object(Map::new());
    }
    if let Some(project) = project.as_object_mut() {
        project.insert(
            "update_time".to_string(),
            Value::String(timestamp.to_string()),
        );
    }
}

fn order_legacy_jcpro_document(mut document: Value) -> Value {
    order_child_object(&mut document, "project", PROJECT_FIELD_ORDER);
    order_child_object(&mut document, "export_info", EXPORT_INFO_FIELD_ORDER);
    order_child_object(&mut document, "device", DEVICE_FIELD_ORDER);
    order_ui_info(&mut document);
    order_language_info(&mut document);
    order_child_object(
        &mut document,
        "pdo_simple_send_recv",
        PDO_SIMPLE_FIELD_ORDER,
    );
    order_child_object(&mut document, "sdo_info", SDO_FIELD_ORDER);
    order_fault_code_info(&mut document);
    order_object_value(document, LEGACY_JCPRO_TOP_LEVEL_ORDER)
}

fn order_ui_info(root: &mut Value) {
    let Some(ui_info) = root.get_mut("ui_info") else {
        return;
    };

    order_child_object(ui_info, "logo", UI_RESOURCE_FIELD_ORDER);

    if let Some(items) = ui_info
        .get_mut("main")
        .and_then(|main| main.get_mut("item"))
        .and_then(Value::as_object_mut)
    {
        for item in items.values_mut() {
            let value = std::mem::take(item);
            *item = order_object_value(value, UI_RESOURCE_FIELD_ORDER);
        }
    }

    order_child_object(ui_info, "main", UI_MAIN_FIELD_ORDER);
    let value = std::mem::take(ui_info);
    *ui_info = order_object_value(value, UI_INFO_FIELD_ORDER);
}

fn order_language_info(root: &mut Value) {
    let Some(language_info) = root.get_mut("language_info") else {
        return;
    };

    let language_codes = language_info
        .get("list_code_language")
        .and_then(Value::as_array)
        .map(|items| string_array_values(items))
        .unwrap_or_default();
    let inner_keys = language_info
        .get("list_inner")
        .and_then(Value::as_array)
        .map(|items| string_array_values(items))
        .unwrap_or_default();

    if let Some(labels) = language_info.get_mut("language_labels") {
        let value = std::mem::take(labels);
        *labels = order_object_by_primary_keys(value, &language_codes);
    }

    if let Some(translations) = language_info.get_mut("list_translate") {
        let value = std::mem::take(translations);
        *translations = order_list_translate_value(value, &inner_keys, &language_codes);
    }

    let value = std::mem::take(language_info);
    *language_info = order_object_value(value, LANGUAGE_INFO_FIELD_ORDER);
}

fn string_array_values(items: &[Value]) -> Vec<String> {
    items
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}

fn order_list_translate_value(
    value: Value,
    inner_keys: &[String],
    language_codes: &[String],
) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };

    let mut ordered = Map::new();
    for key in inner_keys {
        if let Some(value) = object.remove(key) {
            ordered.insert(
                key.clone(),
                order_object_by_primary_keys(value, language_codes),
            );
        }
    }

    let mut remaining = object.into_iter().collect::<Vec<_>>();
    remaining.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (key, value) in remaining {
        ordered.insert(key, order_object_by_primary_keys(value, language_codes));
    }

    Value::Object(ordered)
}

fn order_object_by_primary_keys(value: Value, primary_keys: &[String]) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };

    let mut ordered = Map::new();
    for key in primary_keys {
        if let Some(value) = object.remove(key) {
            ordered.insert(key.clone(), value);
        }
    }

    let mut remaining = object.into_iter().collect::<Vec<_>>();
    remaining.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (key, value) in remaining {
        ordered.insert(key, value);
    }

    Value::Object(ordered)
}

fn order_child_object(root: &mut Value, key: &str, field_order: &[&str]) {
    let Some(child) = root.get_mut(key) else {
        return;
    };
    let value = std::mem::take(child);
    *child = order_object_value(value, field_order);
}

fn order_fault_code_info(root: &mut Value) {
    let Some(fault_code_info) = root.get_mut("fault_code_info") else {
        return;
    };

    if let Some(object) = fault_code_info.as_object_mut() {
        object.remove("groups");
        object.remove("bindings");
    }

    if let Some(sources) = fault_code_info
        .get_mut("sources")
        .and_then(Value::as_array_mut)
    {
        for source in sources {
            let value = std::mem::take(source);
            *source = order_object_value(value, FAULT_CODE_SOURCE_FIELD_ORDER);
        }
    }

    if let Some(codes) = fault_code_info
        .get_mut("codes")
        .and_then(Value::as_array_mut)
    {
        for code in codes {
            if let Some(object) = code.as_object_mut() {
                object.remove("generated_from_group");
                object.remove("group_key");
            }
            let value = std::mem::take(code);
            *code = order_object_value(value, FAULT_CODE_ITEM_FIELD_ORDER);
        }
    }

    let value = std::mem::take(fault_code_info);
    *fault_code_info = order_object_value(value, FAULT_CODE_INFO_FIELD_ORDER);
}

fn order_object_value(value: Value, field_order: &[&str]) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };

    let mut ordered = Map::new();
    for key in field_order {
        if let Some(value) = object.remove(*key) {
            ordered.insert((*key).to_string(), value);
        }
    }
    for (key, value) in object {
        ordered.insert(key, value);
    }
    Value::Object(ordered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sanitize_jcpro_removes_refactor_only_sections_but_keeps_battery_protocol() {
        let document = json!({
            "signal_dictionary": {},
            "private_protocol": {},
            "protocol_mapping": [],
            "battery_monitor_info": {},
            "battery_protocol": { "frames": [] },
            "export_info": {
                "binary_filename": "data.bin",
                "folder_name": "release",
                "manifest_filename": "update.json"
            },
            "fault_code_info": { "sources": [], "codes": [] },
            "pdo_recv": []
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);

        assert!(sanitized.get("signal_dictionary").is_none());
        assert!(sanitized.get("private_protocol").is_none());
        assert!(sanitized.get("protocol_mapping").is_none());
        assert!(sanitized.get("battery_monitor_info").is_none());
        assert!(sanitized.get("battery_protocol").is_some());
        assert_eq!(
            sanitized
                .get("export_info")
                .and_then(Value::as_object)
                .map(|value| value.keys().map(String::as_str).collect::<Vec<_>>()),
            Some(vec!["folder_name", "manifest_filename", "binary_filename"])
        );
        assert!(sanitized.get("fault_code_info").is_some());
        assert!(sanitized.get("pdo_recv").is_some());
    }

    #[test]
    fn sanitize_non_jcpro_keeps_refactor_sections() {
        let document = json!({ "signal_dictionary": {}, "private_protocol": {} });
        let sanitized = sanitize_document_for_target("demo.refactor.json", document);

        assert!(sanitized.get("signal_dictionary").is_some());
        assert!(sanitized.get("private_protocol").is_some());
    }

    #[test]
    fn update_project_update_time_replaces_legacy_timestamp() {
        let mut document = json!({
            "project": {
                "name": "demo",
                "update_time": "2026-06-11 10:50:40"
            }
        });

        update_project_update_time(&mut document, "2026-07-03 12:34:56");

        assert_eq!(
            document
                .get("project")
                .and_then(|project| project.get("update_time"))
                .and_then(Value::as_str),
            Some("2026-07-03 12:34:56")
        );
    }

    #[test]
    fn sanitize_jcpro_orders_sections_like_legacy_generator() {
        let document = json!({
            "sdo_info": { "children": [], "name": "", "name_index": 0, "type": 0, "user_auth": 0 },
            "project": { "base_path": "", "from": "", "update_time": "", "create_time": "", "name": "demo" },
            "export_info": { "binary_filename": "data.bin", "manifest_filename": "update.json", "folder_name": "release" },
            "pdo_recv": [],
            "language_info": { "list_translate": {}, "list_inner": [], "list_code_language": [] },
            "fault_code_info": {
                "codes": [
                    {
                        "group_key": "traction_common",
                        "generated_from_group": true,
                        "enabled": true,
                        "name": "故障",
                        "message_key": "fault.traction.001",
                        "severity": "fault",
                        "code": 1,
                        "type_char": "T",
                        "source_id": 1,
                        "source_key": "traction"
                    }
                ],
                "bindings": [
                    {
                        "overrides": [
                            {
                                "enabled": true,
                                "name": "覆盖故障",
                                "message_key": "fault.pump.001",
                                "severity": "warning",
                                "code": 1
                            }
                        ],
                        "excludes": [2],
                        "enabled": true,
                        "group_key": "traction_common",
                        "source_key": "pump"
                    }
                ],
                "groups": [
                    {
                        "codes": [
                            {
                                "enabled": true,
                                "name": "模板故障",
                                "message_key": "fault.common.001",
                                "severity": "fault",
                                "code": 1
                            }
                        ],
                        "enabled": true,
                        "name": "通用故障",
                        "group_key": "traction_common"
                    }
                ],
                "sources": [
                    {
                        "enabled": true,
                        "invalid_codes": [],
                        "clear_code": 0,
                        "code_byte": 2,
                        "frame_type": 0,
                        "can_id": 648,
                        "type_char": "T",
                        "name": "牵引",
                        "source_id": 1,
                        "source_key": "traction"
                    }
                ],
                "version": 1,
                "enabled": true,
                "schema_version": 1
            },
            "device": { "resolution_h": 480, "resolution_w": 800, "meter_code": "D70T", "version": "1", "type": "meter" },
            "config_version": "1",
            "ui_info": {
                "main": {
                    "item": {
                        "bg": {
                            "option": ["image/bg.png"],
                            "dest": "main/Bg",
                            "default_option": 0,
                            "handle": "show",
                            "h": 480,
                            "w": 800,
                            "y": 0,
                            "x": 0,
                            "name": "背景"
                        }
                    },
                    "name": "主界面"
                },
                "logo": {
                    "option": ["image/logo/nuoli.jpg"],
                    "isjpg": 1,
                    "dest": "logo/CustomerLogo",
                    "default_option": 1,
                    "handle": "show",
                    "h": 480,
                    "w": 800,
                    "y": 0,
                    "x": 0,
                    "name": "开机logo"
                }
            },
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_send": [],
            "history_ui": []
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);
        let object = sanitized.as_object().unwrap();
        assert_eq!(
            sanitized.get("config_version").and_then(Value::as_str),
            Some("jc001")
        );
        assert_eq!(
            object
                .keys()
                .take(14)
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec![
                "config_version",
                "device",
                "project",
                "export_info",
                "ui_info",
                "language_info",
                "fault_code_info",
                "pdo_simple_send_recv",
                "pdo_global_param",
                "pdo_condition",
                "pdo_recv",
                "pdo_send",
                "sdo_info",
                "history_ui",
            ]
        );

        let fault = sanitized
            .get("fault_code_info")
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            fault.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["schema_version", "enabled", "version", "sources", "codes"]
        );
        assert!(fault.get("groups").is_none());
        assert!(fault.get("bindings").is_none());

        let source = fault
            .get("sources")
            .unwrap()
            .as_array()
            .unwrap()
            .first()
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            source.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "source_key",
                "source_id",
                "name",
                "type_char",
                "can_id",
                "frame_type",
                "code_byte",
                "clear_code",
                "invalid_codes",
                "enabled",
            ]
        );

        let fault_code = fault
            .get("codes")
            .unwrap()
            .as_array()
            .unwrap()
            .first()
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            fault_code.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "source_key",
                "source_id",
                "type_char",
                "code",
                "severity",
                "message_key",
                "name",
                "enabled"
            ]
        );

        let ui_info = sanitized.get("ui_info").unwrap().as_object().unwrap();
        assert_eq!(
            ui_info.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["logo", "main"]
        );

        let logo = ui_info.get("logo").unwrap().as_object().unwrap();
        assert_eq!(
            logo.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "name",
                "x",
                "y",
                "w",
                "h",
                "handle",
                "default_option",
                "dest",
                "isjpg",
                "option",
            ]
        );

        let main = ui_info.get("main").unwrap().as_object().unwrap();
        assert_eq!(
            main.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["name", "item"]
        );

        let bg = main
            .get("item")
            .unwrap()
            .get("bg")
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            bg.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "name",
                "x",
                "y",
                "w",
                "h",
                "handle",
                "default_option",
                "dest",
                "option",
            ]
        );
    }

    #[test]
    fn sanitize_jcpro_orders_language_translate_for_stable_diff() {
        let document = json!({
            "project": { "name": "demo" },
            "language_info": {
                "list_translate": {
                    "z_external": { "ja": "外部 Z", "en": "External Z", "zh": "外部Z" },
                    "key_b": { "ja": "B日", "extra": "B+", "zh": "B中", "en": "B英" },
                    "a_external": { "zh": "外部A", "en": "External A" },
                    "key_a": { "en": "A英", "zh": "A中", "ja": "A日" }
                },
                "list_inner": ["中文", "English", "key_a", "key_b"],
                "language_labels": { "ja": "日语", "zh": "中文", "en": "English" },
                "list_code_language": ["zh", "en", "ja"]
            }
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);
        let language_info = sanitized.get("language_info").unwrap().as_object().unwrap();
        assert_eq!(
            language_info.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "list_code_language",
                "language_labels",
                "list_inner",
                "list_translate"
            ]
        );

        let labels = language_info
            .get("language_labels")
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            labels.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["zh", "en", "ja"]
        );

        let translations = language_info
            .get("list_translate")
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(
            translations.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["key_a", "key_b", "a_external", "z_external"]
        );

        let key_b = translations.get("key_b").unwrap().as_object().unwrap();
        assert_eq!(
            key_b.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["zh", "en", "ja", "extra"]
        );
    }
}

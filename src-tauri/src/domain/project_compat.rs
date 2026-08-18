//! Legacy 项目文件兼容策略。
//!
//! 该模块集中定义写回 `.jcpro` 时需要剥离的重构专属段，避免命令层和项目层各自维护
//! 一份规则。锂电监控和故障码 Profile 只属于 jc002，不进入 jc001 保存结果。

use chrono::Local;
use serde_json::{Map, Value};

const REFACTOR_ONLY_SECTIONS: &[&str] =
    &["signal_dictionary", "private_protocol", "protocol_mapping"];

const LEGACY_CONFIG_VERSION: &str = "jc001";
const V2_CONFIG_VERSION: &str = "jc002";

const LEGACY_JCPRO_TOP_LEVEL_ORDER: &[&str] = &[
    "config_version",
    "device",
    "project",
    "export_info",
    "ui_info",
    "language_info",
    "pdo_simple_send_recv",
    "pdo_global_param",
    "pdo_condition",
    "pdo_recv",
    "pdo_send",
    "sdo_info",
    "history_ui",
];

const V2_JCPRO_TOP_LEVEL_ORDER: &[&str] = &[
    "config_version",
    "device",
    "project",
    "export_info",
    "ui_info",
    "canopen",
    "protocol_profiles",
    "fault_code_info",
    "pdo_global_param",
    "pdo_condition",
    "pdo_recv",
    "pdo_send",
    "sdo_info",
    "history_ui",
    "battery_monitor",
    "localization",
];
const LOCALIZATION_FIELD_ORDER: &[&str] = &["default_locale", "locale_order", "locales"];
const LOCALE_FIELD_ORDER: &[&str] = &["enabled", "direction", "translations"];
const LOCALIZATION_OVERLAY_FIELD_ORDER: &[&str] = &["locales"];
const LOCALIZATION_OVERLAY_LOCALE_FIELD_ORDER: &[&str] = &["translations"];
const CANOPEN_FIELD_ORDER: &[&str] = &["schema_version", "nodes", "pdos"];
const CANOPEN_NODE_FIELD_ORDER: &[&str] = &["node_id", "name", "role", "sdo"];
const CANOPEN_SDO_FIELD_ORDER: &[&str] = &[
    "cob_id_mode",
    "client_to_server_cob_id",
    "server_to_client_cob_id",
];
const CANOPEN_PDO_FIELD_ORDER: &[&str] = &[
    "key",
    "direction",
    "pdo_type",
    "cob_id",
    "cob_id_mode",
    "frame_type",
    "producer_node_id",
    "consumer_node_ids",
    "pdo_number",
    "consumer_pdo_number",
    "transmission_type",
    "source_section",
    "source_index",
];
const PROTOCOL_PROFILES_FIELD_ORDER: &[&str] = &[
    "schema_version",
    "active_controller_profile_id",
    "active_battery_profile_id",
    "active_fault_code_profile_id",
    "controller_profiles",
    "battery_profiles",
    "fault_code_profiles",
];
const CONTROLLER_PROFILE_FIELD_ORDER: &[&str] = &[
    "profile_id",
    "controller_family",
    "controller_revision",
    "description",
    "localization_overlay",
    "protocol",
];
const CONTROLLER_PROTOCOL_FIELD_ORDER: &[&str] = &[
    "pdo_global_param",
    "pdo_condition",
    "pdo_recv",
    "pdo_send",
    "sdo_info",
    "canopen",
];
const BATTERY_PROFILE_FIELD_ORDER: &[&str] = &[
    "profile_id",
    "battery_family",
    "battery_revision",
    "description",
    "localization_overlay",
    "protocol",
];
const BATTERY_PROTOCOL_FIELD_ORDER: &[&str] = &["battery_monitor"];
const FAULT_CODE_PROFILE_FIELD_ORDER: &[&str] = &[
    "profile_id",
    "fault_family",
    "fault_revision",
    "description",
    "localization_overlay",
    "protocol",
];
const FAULT_CODE_PROTOCOL_FIELD_ORDER: &[&str] = &["fault_code_info"];

const PROJECT_FIELD_ORDER: &[&str] = &["name", "create_time", "update_time", "from", "base_path"];
const EXPORT_INFO_FIELD_ORDER: &[&str] = &[
    "folder_name",
    "manifest_filename",
    "binary_filename",
    "battery_monitor",
    "fault_code_info",
];
const EXPORT_TARGET_FIELD_ORDER: &[&str] = &["config", "bin"];
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
const SDO_FIELD_ORDER: &[&str] = &["type", "user_auth", "name_index", "name", "children"];
const FAULT_CODE_V2_INFO_FIELD_ORDER: &[&str] = &[
    "schema_version",
    "enabled",
    "version",
    "sources",
    "definitions",
    "bindings",
];
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
const FAULT_CODE_DEFINITION_FIELD_ORDER: &[&str] =
    &["fault_key", "message_key", "name", "severity", "enabled"];
const FAULT_CODE_BINDING_FIELD_ORDER: &[&str] = &["source_key", "code", "fault_key", "enabled"];

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
    match document.get("config_version").and_then(Value::as_str) {
        Some(V2_CONFIG_VERSION) => {
            if let Some(object) = document.as_object_mut() {
                // jc002 stores only advanced PDO sections. The project layer
                // performs any legacy table conversion before this boundary.
                object.remove("pdo_simple_send_recv");
            }
            update_project_update_time(&mut document, &current_legacy_timestamp());
            order_v2_jcpro_document(document)
        }
        _ => {
            if let Some(object) = document.as_object_mut() {
                for section in refactor_only_sections() {
                    object.remove(*section);
                }
                object.remove("battery_monitor");
                object.remove("fault_code_info");
                if let Some(export_info) =
                    object.get_mut("export_info").and_then(Value::as_object_mut)
                {
                    export_info.remove("fault_code_info");
                }
            }
            set_legacy_config_version(&mut document);
            update_project_update_time(&mut document, &current_legacy_timestamp());
            order_legacy_jcpro_document(document)
        }
    }
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
    order_export_info(&mut document);
    order_child_object(&mut document, "device", DEVICE_FIELD_ORDER);
    order_ui_info(&mut document);
    order_language_info(&mut document);
    order_child_object(&mut document, "sdo_info", SDO_FIELD_ORDER);
    order_object_value(document, LEGACY_JCPRO_TOP_LEVEL_ORDER)
}

fn order_v2_jcpro_document(mut document: Value) -> Value {
    order_child_object(&mut document, "project", PROJECT_FIELD_ORDER);
    order_export_info(&mut document);
    order_child_object(&mut document, "device", DEVICE_FIELD_ORDER);
    order_ui_info(&mut document);
    order_child_object(&mut document, "sdo_info", SDO_FIELD_ORDER);
    order_fault_code_info(&mut document);
    order_canopen(&mut document);
    order_protocol_profiles(&mut document);
    order_localization(&mut document);
    order_object_value(document, V2_JCPRO_TOP_LEVEL_ORDER)
}

fn order_canopen(root: &mut Value) {
    let Some(canopen) = root.get_mut("canopen") else {
        return;
    };
    if let Some(nodes) = canopen.get_mut("nodes").and_then(Value::as_array_mut) {
        for node in nodes.iter_mut() {
            order_child_object(node, "sdo", CANOPEN_SDO_FIELD_ORDER);
            let value = std::mem::take(node);
            *node = order_object_value(value, CANOPEN_NODE_FIELD_ORDER);
        }
        nodes.sort_by(|left, right| {
            left.get("node_id")
                .and_then(Value::as_i64)
                .unwrap_or_default()
                .cmp(
                    &right
                        .get("node_id")
                        .and_then(Value::as_i64)
                        .unwrap_or_default(),
                )
        });
    }
    if let Some(pdos) = canopen.get_mut("pdos").and_then(Value::as_array_mut) {
        for pdo in pdos.iter_mut() {
            let value = std::mem::take(pdo);
            *pdo = order_object_value(value, CANOPEN_PDO_FIELD_ORDER);
        }
        pdos.sort_by(|left, right| {
            left.get("key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(right.get("key").and_then(Value::as_str).unwrap_or(""))
        });
    }
    let value = std::mem::take(canopen);
    *canopen = order_object_value(value, CANOPEN_FIELD_ORDER);
}

fn order_protocol_profiles(root: &mut Value) {
    let locale_order = root
        .get("localization")
        .and_then(|value| value.get("locale_order"))
        .and_then(Value::as_array)
        .map(|items| string_array_values(items))
        .unwrap_or_default();
    let Some(protocol_profiles) = root.get_mut("protocol_profiles") else {
        return;
    };
    if let Some(profiles) = protocol_profiles
        .get_mut("controller_profiles")
        .and_then(Value::as_array_mut)
    {
        for profile in profiles.iter_mut() {
            if let Some(overlay) = profile.get_mut("localization_overlay") {
                order_localization_overlay(overlay, &locale_order);
            }
            if let Some(protocol) = profile.get_mut("protocol") {
                order_child_object(protocol, "sdo_info", SDO_FIELD_ORDER);
                order_canopen(protocol);
                let value = std::mem::take(protocol);
                *protocol = order_object_value(value, CONTROLLER_PROTOCOL_FIELD_ORDER);
            }
            let value = std::mem::take(profile);
            *profile = order_object_value(value, CONTROLLER_PROFILE_FIELD_ORDER);
        }
        profiles.sort_by(|left, right| {
            left.get("profile_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(
                    right
                        .get("profile_id")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
        });
    }
    if let Some(profiles) = protocol_profiles
        .get_mut("fault_code_profiles")
        .and_then(Value::as_array_mut)
    {
        for profile in profiles.iter_mut() {
            if let Some(overlay) = profile.get_mut("localization_overlay") {
                order_localization_overlay(overlay, &locale_order);
            }
            if let Some(protocol) = profile.get_mut("protocol") {
                order_child_object(protocol, "fault_code_info", FAULT_CODE_V2_INFO_FIELD_ORDER);
                if let Some(fault_code_info) = protocol.get_mut("fault_code_info") {
                    order_fault_code_info_value(fault_code_info);
                }
                let value = std::mem::take(protocol);
                *protocol = order_object_value(value, FAULT_CODE_PROTOCOL_FIELD_ORDER);
            }
            let value = std::mem::take(profile);
            *profile = order_object_value(value, FAULT_CODE_PROFILE_FIELD_ORDER);
        }
        profiles.sort_by(|left, right| {
            left.get("profile_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(
                    right
                        .get("profile_id")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
        });
    }
    if let Some(profiles) = protocol_profiles
        .get_mut("battery_profiles")
        .and_then(Value::as_array_mut)
    {
        for profile in profiles.iter_mut() {
            if let Some(overlay) = profile.get_mut("localization_overlay") {
                order_localization_overlay(overlay, &locale_order);
            }
            if let Some(protocol) = profile.get_mut("protocol") {
                let value = std::mem::take(protocol);
                *protocol = order_object_value(value, BATTERY_PROTOCOL_FIELD_ORDER);
            }
            let value = std::mem::take(profile);
            *profile = order_object_value(value, BATTERY_PROFILE_FIELD_ORDER);
        }
        profiles.sort_by(|left, right| {
            left.get("profile_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(
                    right
                        .get("profile_id")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
        });
    }
    let value = std::mem::take(protocol_profiles);
    *protocol_profiles = order_object_value(value, PROTOCOL_PROFILES_FIELD_ORDER);
}

fn order_localization(root: &mut Value) {
    let Some(localization) = root.get_mut("localization") else {
        return;
    };
    let locale_order = localization
        .get("locale_order")
        .and_then(Value::as_array)
        .map(|items| string_array_values(items))
        .unwrap_or_default();
    if let Some(locales) = localization.get_mut("locales") {
        let Value::Object(mut locale_map) = std::mem::take(locales) else {
            return;
        };
        let mut ordered_locales = Map::new();
        for locale in &locale_order {
            if let Some(mut value) = locale_map.remove(locale) {
                order_locale(&mut value);
                ordered_locales.insert(locale.clone(), value);
            }
        }
        let mut remaining = locale_map.into_iter().collect::<Vec<_>>();
        remaining.sort_by(|(left, _), (right, _)| left.cmp(right));
        for (locale, mut value) in remaining {
            order_locale(&mut value);
            ordered_locales.insert(locale, value);
        }
        *locales = Value::Object(ordered_locales);
    }
    let value = std::mem::take(localization);
    *localization = order_object_value(value, LOCALIZATION_FIELD_ORDER);
}

fn order_locale(locale: &mut Value) {
    if let Some(translations) = locale.get_mut("translations") {
        let value = std::mem::take(translations);
        *translations = order_object_by_primary_keys(value, &[]);
    }
    let value = std::mem::take(locale);
    *locale = order_object_value(value, LOCALE_FIELD_ORDER);
}

fn order_localization_overlay(overlay: &mut Value, locale_order: &[String]) {
    if let Some(locales) = overlay.get_mut("locales") {
        let Value::Object(mut locale_map) = std::mem::take(locales) else {
            return;
        };
        let mut ordered_locales = Map::new();
        for locale in locale_order {
            if let Some(mut value) = locale_map.remove(locale) {
                value = order_object_value(value, LOCALIZATION_OVERLAY_LOCALE_FIELD_ORDER);
                ordered_locales.insert(locale.clone(), value);
            }
        }
        let mut remaining = locale_map.into_iter().collect::<Vec<_>>();
        remaining.sort_by(|(left, _), (right, _)| left.cmp(right));
        for (locale, mut value) in remaining {
            value = order_object_value(value, LOCALIZATION_OVERLAY_LOCALE_FIELD_ORDER);
            ordered_locales.insert(locale, value);
        }
        *locales = Value::Object(ordered_locales);
    }
    let value = std::mem::take(overlay);
    *overlay = order_object_value(value, LOCALIZATION_OVERLAY_FIELD_ORDER);
}

fn order_export_info(root: &mut Value) {
    let Some(export_info) = root.get_mut("export_info") else {
        return;
    };
    order_child_object(export_info, "battery_monitor", EXPORT_TARGET_FIELD_ORDER);
    order_child_object(export_info, "fault_code_info", EXPORT_TARGET_FIELD_ORDER);
    let value = std::mem::take(export_info);
    *export_info = order_object_value(value, EXPORT_INFO_FIELD_ORDER);
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
    order_fault_code_info_value(fault_code_info);
}

fn order_fault_code_info_value(fault_code_info: &mut Value) {
    if fault_code_info
        .get("schema_version")
        .and_then(Value::as_i64)
        != Some(2)
    {
        return;
    }
    if let Some(sources) = fault_code_info
        .get_mut("sources")
        .and_then(Value::as_array_mut)
    {
        for source in sources.iter_mut() {
            let value = std::mem::take(source);
            *source = order_object_value(value, FAULT_CODE_SOURCE_FIELD_ORDER);
        }
        sources.sort_by(|left, right| {
            let left_id = left.get("source_id").and_then(Value::as_i64).unwrap_or(0);
            let right_id = right.get("source_id").and_then(Value::as_i64).unwrap_or(0);
            left_id.cmp(&right_id).then_with(|| {
                left.get("source_key")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .cmp(
                        right
                            .get("source_key")
                            .and_then(Value::as_str)
                            .unwrap_or(""),
                    )
            })
        });
    }

    if let Some(definitions) = fault_code_info
        .get_mut("definitions")
        .and_then(Value::as_array_mut)
    {
        for definition in definitions.iter_mut() {
            let value = std::mem::take(definition);
            *definition = order_object_value(value, FAULT_CODE_DEFINITION_FIELD_ORDER);
        }
        definitions.sort_by(|left, right| {
            left.get("fault_key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(right.get("fault_key").and_then(Value::as_str).unwrap_or(""))
        });
    }

    if let Some(bindings) = fault_code_info
        .get_mut("bindings")
        .and_then(Value::as_array_mut)
    {
        for binding in bindings.iter_mut() {
            let value = std::mem::take(binding);
            *binding = order_object_value(value, FAULT_CODE_BINDING_FIELD_ORDER);
        }
        bindings.sort_by(|left, right| {
            left.get("source_key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(
                    right
                        .get("source_key")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
                .then_with(|| {
                    left.get("code")
                        .and_then(Value::as_i64)
                        .unwrap_or(0)
                        .cmp(&right.get("code").and_then(Value::as_i64).unwrap_or(0))
                })
        });
    }

    let value = std::mem::take(fault_code_info);
    *fault_code_info = order_object_value(value, FAULT_CODE_V2_INFO_FIELD_ORDER);
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
    fn sanitize_jc001_removes_unified_sections_and_fault_code_mvp() {
        let document = json!({
            "signal_dictionary": {},
            "private_protocol": {},
            "protocol_mapping": [],
            "battery_monitor": { "frames": [] },
            "export_info": {
                "binary_filename": "data.bin",
                "folder_name": "release",
                "manifest_filename": "update.json",
                "fault_code_info": { "config": true, "bin": true }
            },
            "fault_code_info": { "sources": [], "codes": [] },
            "pdo_recv": []
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);

        assert!(sanitized.get("signal_dictionary").is_none());
        assert!(sanitized.get("private_protocol").is_none());
        assert!(sanitized.get("protocol_mapping").is_none());
        assert!(sanitized.get("battery_monitor").is_none());
        assert_eq!(
            sanitized
                .get("export_info")
                .and_then(Value::as_object)
                .map(|value| value.keys().map(String::as_str).collect::<Vec<_>>()),
            Some(vec!["folder_name", "manifest_filename", "binary_filename"])
        );
        assert!(sanitized["export_info"].get("fault_code_info").is_none());
        assert!(sanitized.get("fault_code_info").is_none());
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

    #[test]
    fn sanitize_jc002_preserves_version_and_localization_schema() {
        let document = json!({
            "localization": {
                "locales": {
                    "en": { "translations": { "z.key": "Z", "a.key": "A" }, "enabled": true },
                    "zh": { "translations": { "z.key": "中Z", "a.key": "中A" }, "enabled": true }
                },
                "locale_order": ["zh", "en"],
                "default_locale": "zh"
            },
            "fault_code_info": {
                "schema_version": 2,
                "enabled": true,
                "version": 2,
                "sources": [
                    { "source_key": "pump", "source_id": 2, "type_char": "P", "can_id": 660 },
                    { "source_key": "traction", "source_id": 1, "type_char": "T", "can_id": 648 }
                ],
                "definitions": [
                    { "fault_key": "fault.pump.052", "message_key": "fault.message.low", "severity": "fault" },
                    { "fault_key": "fault.traction.052", "message_key": "fault.message.low", "severity": "fault" }
                ],
                "bindings": [
                    { "source_key": "traction", "code": 52, "fault_key": "fault.traction.052" },
                    { "source_key": "pump", "code": 52, "fault_key": "fault.pump.052" }
                ]
            },
            "project": { "name": "v2" },
            "protocol_profiles": {
                "battery_profiles": [
                    {
                        "protocol": {
                            "battery_monitor": {}
                        },
                        "battery_revision": "1",
                        "battery_family": "BMS",
                        "profile_id": "battery_a"
                    }
                ],
                "controller_profiles": [
                    {
                        "protocol": {
                            "sdo_info": { "children": [], "type": 0 },
                            "pdo_send": [],
                            "pdo_recv": [],
                            "pdo_condition": [],
                            "pdo_global_param": []
                        },
                        "controller_revision": "2",
                        "controller_family": "Inmotion",
                        "profile_id": "inmotion"
                    },
                    {
                        "protocol": {
                            "pdo_global_param": [],
                            "pdo_condition": [],
                            "pdo_recv": [],
                            "pdo_send": [],
                            "sdo_info": { "type": 0, "children": [] }
                        },
                        "controller_revision": "1",
                        "controller_family": "ACM",
                        "profile_id": "acm"
                    }
                ],
                "active_battery_profile_id": "battery_a",
                "active_controller_profile_id": "inmotion",
                "schema_version": 2
            },
            "config_version": "jc002"
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);

        assert_eq!(sanitized["config_version"], "jc002");
        assert!(sanitized.get("localization").is_some());
        assert_eq!(
            sanitized["protocol_profiles"]["active_controller_profile_id"],
            "inmotion"
        );
        assert_eq!(
            sanitized["protocol_profiles"]["controller_profiles"][0]["profile_id"],
            "acm"
        );
        assert_eq!(
            sanitized["protocol_profiles"]["controller_profiles"][0]["protocol"]
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec![
                "pdo_global_param",
                "pdo_condition",
                "pdo_recv",
                "pdo_send",
                "sdo_info"
            ]
        );
        assert_eq!(
            sanitized["protocol_profiles"]["battery_profiles"][0]["profile_id"],
            "battery_a"
        );
        assert!(sanitized.get("language_info").is_none());
        assert!(sanitized["fault_code_info"].get("codes").is_none());
        assert_eq!(
            sanitized["fault_code_info"]
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec![
                "schema_version",
                "enabled",
                "version",
                "sources",
                "definitions",
                "bindings"
            ]
        );
        assert_eq!(
            sanitized["fault_code_info"]["sources"][0]["source_key"],
            "traction"
        );
        assert_eq!(
            sanitized["fault_code_info"]["bindings"][0]["source_key"],
            "pump"
        );
        assert_eq!(
            sanitized["localization"]["locales"]
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["zh", "en"]
        );
        assert_eq!(
            sanitized["localization"]["locales"]["zh"]["translations"]
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["a.key", "z.key"]
        );
    }
}

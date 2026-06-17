//! Legacy 项目文件兼容策略。
//!
//! 该模块集中定义写回 `.jcpro` 时需要剥离的重构专属段，避免命令层和项目层各自维护
//! 一份规则。注意：前端当前还把 `battery_protocol` 视为 sidecar/refactor-only；为保持
//! 既有保存和导出行为不变，后端暂不在 `.jcpro` 写回时剥离该段。

use serde_json::Value;

const REFACTOR_ONLY_SECTIONS: &[&str] = &[
    "signal_dictionary",
    "private_protocol",
    "protocol_mapping",
    "battery_monitor_info",
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
    document
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
            "pdo_recv": []
        });

        let sanitized = sanitize_document_for_target("demo.jcpro", document);

        assert!(sanitized.get("signal_dictionary").is_none());
        assert!(sanitized.get("private_protocol").is_none());
        assert!(sanitized.get("protocol_mapping").is_none());
        assert!(sanitized.get("battery_monitor_info").is_none());
        assert!(sanitized.get("battery_protocol").is_some());
        assert!(sanitized.get("pdo_recv").is_some());
    }

    #[test]
    fn sanitize_non_jcpro_keeps_refactor_sections() {
        let document = json!({ "signal_dictionary": {}, "private_protocol": {} });
        let sanitized = sanitize_document_for_target("demo.refactor.json", document);

        assert!(sanitized.get("signal_dictionary").is_some());
        assert!(sanitized.get("private_protocol").is_some());
    }
}

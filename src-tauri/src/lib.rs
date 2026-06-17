//! 自定义开发平台 —— Tauri 后端核心库。
//!
//! # 模块结构
//!
//! | 模块 | 职责 |
//! |------|------|
//! | [`commands`] | Tauri IPC 命令层，前端 `invoke()` 的直接入口 |
//! | [`domain`] | 业务领域层：PDO / SDO / 语言 / UI 资源 / 项目管理 / 导出 |
//! | [`infrastructure`] | 基础设施层：文件系统、CSV/Excel 读写、JSON 持久化、二进制写入 |

#![allow(dead_code)]

pub mod cli;
mod commands;
mod domain;
mod infrastructure;

use commands::{
    add_ui_resource_option_document, backend_health, build_project_binary_report,
    build_project_export_plan, compare_project_binary_report, copy_ui_resource_images,
    create_project, export_dbc, export_project_package_command, export_table_csv,
    export_table_workbook, flatten_unified_protocol_document, generate_can_test_data,
    generate_dbc_content, import_dbc, import_language_csv, import_language_table,
    import_language_workbook, import_pdo_simple_csv, import_pdo_simple_table,
    import_pdo_simple_workbook, import_sdo_csv, import_sdo_table, import_sdo_workbook,
    language_document_table, legacy_table_spec, load_json_file, load_project, load_text_file,
    migrate_project_document, migrate_project_file, migrate_unified_protocol_document,
    parse_pdo_advanced_file, parse_pdo_advanced_project, parse_project_document,
    parse_project_file, parse_ui_resource_file, parse_ui_resources,
    parse_ui_resources_with_project_path, parse_unified_protocol_project,
    pdo_simple_document_table, project_summary, remove_ui_resource_option_document, save_json_file,
    save_project, save_project_as, save_text_file, sdo_document_table, update_ui_resource_document,
    validate_project_document, validate_table_headers,
};

/// 构建并启动 Tauri 应用。
///
/// - 注册 `tauri-plugin-dialog` 插件（文件选择对话框）
/// - 通过 `generate_handler!` 注册所有 IPC 命令
///
/// 桌面端由 `main()` 调用，移动端由 `mobile_entry_point` 宏调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            backend_health,
            project_summary,
            load_project,
            create_project,
            save_project,
            save_project_as,
            validate_project_document,
            migrate_project_document,
            migrate_project_file,
            parse_project_document,
            parse_project_file,
            parse_unified_protocol_project,
            migrate_unified_protocol_document,
            flatten_unified_protocol_document,
            parse_ui_resources,
            parse_ui_resources_with_project_path,
            parse_ui_resource_file,
            update_ui_resource_document,
            add_ui_resource_option_document,
            remove_ui_resource_option_document,
            legacy_table_spec,
            validate_table_headers,
            import_sdo_table,
            import_sdo_csv,
            import_sdo_workbook,
            import_pdo_simple_table,
            parse_pdo_advanced_project,
            parse_pdo_advanced_file,
            import_pdo_simple_csv,
            import_pdo_simple_workbook,
            import_language_table,
            import_language_csv,
            import_language_workbook,
            export_table_csv,
            export_table_workbook,
            language_document_table,
            pdo_simple_document_table,
            sdo_document_table,
            build_project_export_plan,
            export_project_package_command,
            copy_ui_resource_images,
            compare_project_binary_report,
            build_project_binary_report,
            generate_can_test_data,
            save_text_file,
            save_json_file,
            load_json_file,
            load_text_file,
            import_dbc,
            export_dbc,
            generate_dbc_content
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jc custom platform tauri app");
}

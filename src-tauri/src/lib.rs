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
    add_ui_resource_option_document, analyze_canopen_conversion, backend_health,
    build_project_binary_report, build_project_export_plan, clear_project_recovery_draft,
    clear_translation_credentials, commit_project_git_version, compare_project_binary_report,
    copy_ui_resource_images, create_project, export_canopen_package, export_dbc,
    export_project_package_command, export_table_csv, export_table_workbook,
    flatten_unified_protocol_document, generate_can_test_data, generate_dbc_content, import_dbc,
    import_language_csv, import_language_table, import_language_workbook, import_pdo_simple_csv,
    import_pdo_simple_table, import_pdo_simple_workbook, import_sdo_csv, import_sdo_table,
    import_sdo_workbook, import_single_language_csv, inspect_project_git, language_document_table,
    legacy_table_spec, list_project_git_revisions, load_json_file, load_project,
    load_project_git_context, load_project_git_revision, load_project_git_worktree_file,
    load_project_recovery_draft, load_text_file, migrate_project_document, migrate_project_file,
    migrate_unified_protocol_document, parse_pdo_advanced_file, parse_pdo_advanced_project,
    parse_project_document, parse_project_file, parse_ui_resource_file, parse_ui_resources,
    parse_ui_resources_with_project_path, parse_unified_protocol_project,
    pdo_simple_document_table, project_summary, remove_ui_resource_option_document,
    review_project_git_changes, review_project_git_revision, save_json_file, save_project,
    save_project_as, save_project_git_worktree_file, save_project_recovery_draft, save_text_file,
    save_translation_credentials, sdo_document_table, take_pending_project_path,
    translate_baidu_text, translation_credentials_status, update_ui_resource_document,
    validate_project_document, validate_table_headers, PendingProjectPath,
};
use tauri::{Emitter, Manager};

fn dispatch_project_open(app: &tauri::AppHandle, path: String) {
    app.state::<PendingProjectPath>().replace(path.clone());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    if let Err(error) = app.emit("open-project", path) {
        eprintln!("发送项目打开事件失败：{error}");
    }
}

/// 构建并启动 Tauri 应用。
///
/// - 注册 `tauri-plugin-dialog` 插件（文件选择对话框）
/// - 通过 `generate_handler!` 注册所有 IPC 命令
///
/// 桌面端由 `main()` 调用，移动端由 `mobile_entry_point` 宏调用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_project_path =
        PendingProjectPath::new(commands::project_path_from_args(std::env::args()));
    tauri::Builder::default()
        .manage(pending_project_path)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = commands::project_path_from_args(args) {
                dispatch_project_open(app, path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Err(error) = app
                .handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
            {
                eprintln!("初始化更新插件失败，已跳过：{error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend_health,
            project_summary,
            take_pending_project_path,
            inspect_project_git,
            load_project_git_context,
            list_project_git_revisions,
            load_project_git_revision,
            commit_project_git_version,
            review_project_git_changes,
            review_project_git_revision,
            load_project_git_worktree_file,
            save_project_git_worktree_file,
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
            import_single_language_csv,
            export_table_csv,
            export_table_workbook,
            language_document_table,
            translation_credentials_status,
            save_translation_credentials,
            clear_translation_credentials,
            translate_baidu_text,
            load_project_recovery_draft,
            save_project_recovery_draft,
            clear_project_recovery_draft,
            pdo_simple_document_table,
            sdo_document_table,
            build_project_export_plan,
            export_project_package_command,
            copy_ui_resource_images,
            compare_project_binary_report,
            build_project_binary_report,
            generate_can_test_data,
            analyze_canopen_conversion,
            export_canopen_package,
            save_text_file,
            save_json_file,
            load_json_file,
            load_text_file,
            import_dbc,
            export_dbc,
            generate_dbc_content
        ])
        .build(tauri::generate_context!())
        .expect("failed to build jc custom platform tauri app")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path = path.to_string_lossy().into_owned();
                        if let Some(project_path) = commands::project_path_from_args([path]) {
                            dispatch_project_open(app, project_path);
                        }
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

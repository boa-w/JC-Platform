//! Tauri IPC 命令层。
//!
//! 每个 `#[tauri::command]` 函数对应前端的一次 `invoke()` 调用。
//! 命令职责：参数反序列化 → 调用 domain 层 → 结果序列化返回。
//! 命令函数本身不做业务校验，仅负责桥接前后端。

use crate::domain::export::{
    build_export_plan, build_project_binary, compare_project_binary, copy_ui_images,
    export_project_package, BinaryBuildReport, BinaryCompareReport, BinaryCompareRequest,
    ExportPlanReport, ExportPlanRequest, ProjectExportReport, UiImageCopyReport,
};
use crate::domain::language::{
    language_document_to_table, merge_single_language_rows, parse_language_table,
    LanguageImportReport, SingleLanguageImportReport,
};
use crate::domain::pdo::{
    parse_pdo_advanced_document, parse_pdo_simple_table, pdo_simple_document_to_table,
    PdoAdvancedParseReport, PdoSimpleImportReport,
};
use crate::domain::project::{
    create_legacy_project_document, migrate_legacy_project_document, parse_legacy_project_document,
    save_project_as as save_project_as_document, validate_project_version_contract, LoadedProject,
    MigratedProject, NewProjectRequest, ProjectParseReport, ProjectSummary,
    ProjectValidationReport, SaveProjectAsReport, SaveProjectAsRequest, SaveProjectRequest,
};
use crate::domain::project_compat::sanitize_document_for_target;
use crate::domain::protocol_manager::{
    build_unified_protocol_model, flatten_unified_protocol_to_legacy,
    migrate_project_to_unified_protocol, ProtocolCompatibilityReport, UnifiedProtocolModel,
};
use crate::domain::sdo::{parse_sdo_table, sdo_document_to_table, SdoImportReport};
use crate::domain::translation::{
    translate_with_baidu, BaiduTranslateCredentials, BaiduTranslateRequest, BaiduTranslateResponse,
};
use crate::domain::ui_resource::{
    add_ui_resource_option, parse_ui_info, remove_ui_resource_option, update_ui_resource,
    UiResourceOptionAddRequest, UiResourceOptionRemoveRequest, UiResourceParseReport,
    UiResourceUpdateReport, UiResourceUpdateRequest,
};
use crate::infrastructure::credentials::{
    self, SaveTranslationCredentialsRequest, TranslationCredentialStatus,
};
use crate::infrastructure::csv_excel::{
    read_csv, read_csv_rows, read_workbook, validate_headers, validate_language_headers, write_csv,
    write_workbook_xml, ExportTableRequest, TableDocument, TableFileRequest, TableValidationReport,
    LANGUAGE_REQUIRED_PREFIX_HEADERS, PDO_SIMPLE_HEADERS, SDO_HEADERS,
};
use crate::infrastructure::git::{
    self, GitCommitReport, GitCommitRequest, GitProjectContext, GitProjectRequest,
    GitProjectStatus, GitReviewReport, GitRevision, GitRevisionSnapshot,
};
use crate::infrastructure::json_store;
use crate::infrastructure::recovery::{self, ProjectRecoveryDraft};
use can_dbc::{ByteOrder, Dbc, MessageId, NumericValue, ValueType};
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct PendingProjectPath(Mutex<HashMap<String, String>>);

#[derive(Default)]
pub struct ProjectWindowRegistry(Mutex<ProjectWindowRegistryState>);

#[derive(Default)]
struct ProjectWindowRegistryState {
    path_to_window: HashMap<String, String>,
    window_to_path: HashMap<String, String>,
    next_window_id: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ProjectWindowClaim {
    Current(String),
    Existing(String),
    New(String),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectWindowAction {
    Current,
    Created,
    Focused,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWindowOpenResult {
    pub action: ProjectWindowAction,
    pub window_label: String,
    pub path: String,
}

const PROJECT_WINDOW_LOCKED_ERROR: &str = "project_window_locked";
const PROJECT_PATH_NOT_JCPRO_ERROR: &str = "project_path_not_jcpro";

#[derive(Debug, Clone, Deserialize)]
pub struct SingleLanguageCsvImportRequest {
    pub path: String,
    pub language_code: String,
    pub document: Value,
}

impl PendingProjectPath {
    pub fn new(path: Option<String>) -> Self {
        let mut pending = HashMap::new();
        if let Some(path) = path {
            pending.insert("main".to_string(), path);
        }
        Self(Mutex::new(pending))
    }

    pub fn replace(&self, path: String) {
        self.replace_for_label("main", path);
    }

    pub fn replace_for_label(&self, label: &str, path: String) {
        if let Ok(mut pending) = self.0.lock() {
            pending.insert(label.to_string(), path);
        }
    }

    fn take_for_label(&self, label: &str) -> Option<String> {
        self.0.lock().ok()?.remove(label)
    }
}

impl ProjectWindowRegistry {
    fn claim_path(&self, preferred_label: Option<&str>, path: &str) -> ProjectWindowClaim {
        let mut state = self.0.lock().expect("project window registry poisoned");
        if let Some(owner) = state.path_to_window.get(path) {
            if preferred_label.is_some_and(|label| label == owner) {
                return ProjectWindowClaim::Current(owner.clone());
            }
            return ProjectWindowClaim::Existing(owner.clone());
        }

        if let Some(label) = preferred_label {
            if !state.window_to_path.contains_key(label) {
                state
                    .path_to_window
                    .insert(path.to_string(), label.to_string());
                state
                    .window_to_path
                    .insert(label.to_string(), path.to_string());
                return ProjectWindowClaim::Current(label.to_string());
            }
        }

        let label = loop {
            state.next_window_id = state.next_window_id.wrapping_add(1);
            let candidate = format!("project-{}", state.next_window_id);
            if !state.window_to_path.contains_key(&candidate) {
                break candidate;
            }
        };
        state.path_to_window.insert(path.to_string(), label.clone());
        state.window_to_path.insert(label.clone(), path.to_string());
        ProjectWindowClaim::New(label)
    }

    pub(crate) fn release_label(&self, label: &str) {
        let Ok(mut state) = self.0.lock() else {
            return;
        };
        if let Some(path) = state.window_to_path.remove(label) {
            if state
                .path_to_window
                .get(&path)
                .is_some_and(|owner| owner == label)
            {
                state.path_to_window.remove(&path);
            }
        }
    }

    fn path_owned_by_label(&self, label: &str, path: &str) -> bool {
        self.0
            .lock()
            .ok()
            .and_then(|state| state.window_to_path.get(label).cloned())
            .is_some_and(|owned_path| owned_path == path)
    }

    fn release_path_for_label(&self, label: &str, path: &str) {
        let Ok(mut state) = self.0.lock() else {
            return;
        };
        let owns_path = state
            .window_to_path
            .get(label)
            .is_some_and(|owned_path| owned_path == path);
        if state
            .path_to_window
            .get(path)
            .is_some_and(|owner| owner == label)
        {
            state.path_to_window.remove(path);
        }
        if owns_path {
            state.window_to_path.remove(label);
        }
    }

    fn with_save_as_lock<T, F>(
        &self,
        label: &str,
        target_path: Option<&str>,
        operation: F,
    ) -> Result<T, String>
    where
        F: FnOnce() -> Result<T, String>,
    {
        let mut state = self.0.lock().expect("project window registry poisoned");
        let old_path = state.window_to_path.get(label).cloned();

        if let Some(target_path) = target_path {
            if let Some(owner) = state.path_to_window.get(target_path) {
                if owner != label {
                    return Err(PROJECT_WINDOW_LOCKED_ERROR.to_string());
                }
            }
            if old_path.as_deref() != Some(target_path) {
                if let Some(old_path) = &old_path {
                    if state
                        .path_to_window
                        .get(old_path)
                        .is_some_and(|owner| owner == label)
                    {
                        state.path_to_window.remove(old_path);
                    }
                }
                state
                    .path_to_window
                    .insert(target_path.to_string(), label.to_string());
                state
                    .window_to_path
                    .insert(label.to_string(), target_path.to_string());
            }
        }

        match operation() {
            Ok(value) => {
                if target_path.is_none() {
                    if let Some(old_path) = old_path {
                        if state
                            .path_to_window
                            .get(&old_path)
                            .is_some_and(|owner| owner == label)
                        {
                            state.path_to_window.remove(&old_path);
                        }
                    }
                    state.window_to_path.remove(label);
                }
                Ok(value)
            }
            Err(error) => {
                if let Some(target_path) = target_path {
                    if state
                        .path_to_window
                        .get(target_path)
                        .is_some_and(|owner| owner == label)
                    {
                        state.path_to_window.remove(target_path);
                    }
                    if let Some(old_path) = old_path {
                        state
                            .path_to_window
                            .insert(old_path.clone(), label.to_string());
                        state.window_to_path.insert(label.to_string(), old_path);
                    } else {
                        state.window_to_path.remove(label);
                    }
                }
                Err(error)
            }
        }
    }
}

pub fn project_path_from_args(args: impl IntoIterator<Item = String>) -> Option<String> {
    args.into_iter().find(|argument| {
        Path::new(argument)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("jcpro"))
    })
}

/// 后端健康检查响应。
#[derive(Debug, Serialize)]
pub struct BackendHealth {
    pub app_name: String,
    pub version: String,
    pub commit_hash: String,
    pub core_status: String,
}

/// 健康检查 —— 前端用于确认后端已就绪。
#[tauri::command]
pub fn backend_health() -> BackendHealth {
    BackendHealth {
        app_name: "自定义开发平台".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        commit_hash: option_env!("JC_GIT_COMMIT_HASH")
            .unwrap_or("unknown")
            .to_string(),
        core_status: "ready".to_string(),
    }
}

/// 返回空的项目摘要（无项目打开时的默认状态）。
#[tauri::command]
pub fn project_summary() -> ProjectSummary {
    ProjectSummary::empty()
}

#[tauri::command]
pub fn take_pending_project_path(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PendingProjectPath>,
) -> Option<String> {
    state.take_for_label(window.label())
}

fn normalize_project_window_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if !project_path_from_args([trimmed.to_string()]).is_some() {
        return Err(PROJECT_PATH_NOT_JCPRO_ERROR.to_string());
    }
    let resolved = resolve_project_path(trimmed).map_err(|error| error.to_string())?;
    Ok(normalize_project_path_key(resolved))
}

fn normalize_new_project_window_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if !project_path_from_args([trimmed.to_string()]).is_some() {
        return Err(PROJECT_PATH_NOT_JCPRO_ERROR.to_string());
    }
    let resolved = resolve_project_path(trimmed).unwrap_or_else(|_| {
        let candidate = PathBuf::from(trimmed);
        if candidate.is_absolute() {
            candidate
        } else {
            std::env::current_dir()
                .map(|current_dir| current_dir.join(candidate))
                .unwrap_or_else(|_| PathBuf::from(trimmed))
        }
    });
    Ok(normalize_project_path_key(resolved))
}

fn normalize_project_path_key(path: PathBuf) -> String {
    let normalized = if path.exists() {
        path.canonicalize().unwrap_or(path)
    } else if let (Some(parent), Some(file_name)) = (path.parent(), path.file_name()) {
        parent
            .canonicalize()
            .map(|canonical_parent| canonical_parent.join(file_name))
            .unwrap_or(path)
    } else {
        path
    };
    let mut key = normalized.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        key.make_ascii_lowercase();
    }
    key
}

fn focus_project_window(app: &tauri::AppHandle, label: &str) -> bool {
    let Some(window) = app.get_webview_window(label) else {
        return false;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    true
}

fn build_project_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("自定义开发平台")
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 700.0)
        .resizable(true)
        .visible(true)
        .build()
        .map(|_| ())
        .map_err(|error| format!("project_window_create_failed:{error}"))
}

async fn route_project_window(
    app: &tauri::AppHandle,
    pending: &PendingProjectPath,
    registry: &ProjectWindowRegistry,
    current_label: Option<&str>,
    path: String,
) -> Result<ProjectWindowOpenResult, String> {
    let trimmed_path = path.trim().to_string();
    let normalized_path = normalize_project_window_path(&trimmed_path)?;

    loop {
        match registry.claim_path(current_label, &normalized_path) {
            ProjectWindowClaim::Current(label) => {
                return Ok(ProjectWindowOpenResult {
                    action: ProjectWindowAction::Current,
                    window_label: label,
                    path: trimmed_path,
                });
            }
            ProjectWindowClaim::Existing(label) => {
                if focus_project_window(app, &label) {
                    return Ok(ProjectWindowOpenResult {
                        action: ProjectWindowAction::Focused,
                        window_label: label,
                        path: trimmed_path,
                    });
                }
                registry.release_label(&label);
            }
            ProjectWindowClaim::New(label) => {
                pending.replace_for_label(&label, trimmed_path.clone());
                if let Err(error) = build_project_window(app, &label) {
                    pending.take_for_label(&label);
                    registry.release_label(&label);
                    return Err(error);
                }
                return Ok(ProjectWindowOpenResult {
                    action: ProjectWindowAction::Created,
                    window_label: label,
                    path: trimmed_path,
                });
            }
        }
    }
}

#[tauri::command]
pub async fn open_project_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    pending: tauri::State<'_, PendingProjectPath>,
    registry: tauri::State<'_, ProjectWindowRegistry>,
    path: String,
) -> Result<ProjectWindowOpenResult, String> {
    let current_label = window.label().to_string();
    route_project_window(&app, &pending, &registry, Some(&current_label), path).await
}

#[tauri::command]
pub async fn create_project_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    pending: tauri::State<'_, PendingProjectPath>,
    registry: tauri::State<'_, ProjectWindowRegistry>,
    request: NewProjectRequest,
) -> Result<ProjectWindowOpenResult, String> {
    let current_label = window.label().to_string();
    let target_path = request.path.trim().to_string();
    let request = NewProjectRequest {
        path: target_path.clone(),
        ..request
    };
    let normalized_path = normalize_new_project_window_path(&target_path)?;

    loop {
        let already_owned = registry.path_owned_by_label(&current_label, &normalized_path);
        match registry.claim_path(Some(&current_label), &normalized_path) {
            ProjectWindowClaim::Current(label) => {
                if already_owned {
                    return Err(PROJECT_WINDOW_LOCKED_ERROR.to_string());
                }
                if let Err(error) = create_project(request.clone()) {
                    registry.release_label(&label);
                    return Err(error);
                }
                return Ok(ProjectWindowOpenResult {
                    action: ProjectWindowAction::Current,
                    window_label: label,
                    path: target_path,
                });
            }
            ProjectWindowClaim::Existing(label) => {
                if focus_project_window(&app, &label) {
                    return Ok(ProjectWindowOpenResult {
                        action: ProjectWindowAction::Focused,
                        window_label: label,
                        path: target_path,
                    });
                }
                registry.release_label(&label);
            }
            ProjectWindowClaim::New(label) => {
                if let Err(error) = create_project(request.clone()) {
                    registry.release_label(&label);
                    return Err(error);
                }
                pending.replace_for_label(&label, target_path.clone());
                if let Err(error) = build_project_window(&app, &label) {
                    pending.take_for_label(&label);
                    registry.release_label(&label);
                    return Err(error);
                }
                return Ok(ProjectWindowOpenResult {
                    action: ProjectWindowAction::Created,
                    window_label: label,
                    path: target_path,
                });
            }
        }
    }
}

#[tauri::command]
pub fn release_project_window(
    window: tauri::WebviewWindow,
    registry: tauri::State<'_, ProjectWindowRegistry>,
    path: String,
) -> Result<(), String> {
    let normalized_path = normalize_project_window_path(&path)?;
    registry.release_path_for_label(window.label(), &normalized_path);
    Ok(())
}

pub async fn dispatch_external_project_open(app: tauri::AppHandle, path: String) {
    let pending = app.state::<PendingProjectPath>();
    let registry = app.state::<ProjectWindowRegistry>();
    let preferred_label = app.get_webview_window("main").map(|_| "main".to_string());
    let result = route_project_window(
        &app,
        &pending,
        &registry,
        preferred_label.as_deref(),
        path.clone(),
    )
    .await;

    let Ok(result) = result else {
        if let Err(error) = result {
            eprintln!("处理外部项目打开请求失败：{error}");
        }
        return;
    };
    if result.action == ProjectWindowAction::Current {
        pending.replace_for_label(&result.window_label, result.path.clone());
        let _ = focus_project_window(&app, &result.window_label);
        if let Err(error) = app.emit_to(&result.window_label, "open-project", result.path) {
            eprintln!("发送项目打开事件失败：{error}");
        }
    }
}

/// 检查项目文件所属的 Git 仓库及受管配置状态。
async fn run_blocking_git<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("Git 后台任务异常结束：{error}"))?
}

#[tauri::command]
pub async fn inspect_project_git(request: GitProjectRequest) -> Result<GitProjectStatus, String> {
    run_blocking_git(move || Ok(git::inspect_project(&request))).await
}

/// 一次性返回项目 Git 状态和历史，避免桌面端重复发现仓库。
#[tauri::command]
pub async fn load_project_git_context(
    request: GitProjectRequest,
    limit: usize,
) -> Result<GitProjectContext, String> {
    run_blocking_git(move || Ok(git::load_project_context(&request, limit))).await
}

/// 返回影响当前项目配置的最近 Git 版本。
#[tauri::command]
pub async fn list_project_git_revisions(
    request: GitProjectRequest,
    limit: usize,
) -> Result<Vec<GitRevision>, String> {
    run_blocking_git(move || git::list_revisions(&request, limit)).await
}

/// 读取指定版本中的项目配置和可选 sidecar。
#[tauri::command]
pub async fn load_project_git_revision(
    request: GitProjectRequest,
    revision: String,
) -> Result<GitRevisionSnapshot, String> {
    run_blocking_git(move || git::load_revision(&request, &revision)).await
}

/// 仅提交当前项目明确受管的配置文件。
#[tauri::command]
pub async fn commit_project_git_version(
    request: GitCommitRequest,
) -> Result<GitCommitReport, String> {
    run_blocking_git(move || git::commit_project(&request)).await
}

/// 返回当前受管项目配置的结构化逐行差异。
#[tauri::command]
pub async fn review_project_git_changes(
    request: GitProjectRequest,
) -> Result<GitReviewReport, String> {
    run_blocking_git(move || git::review_project(&request)).await
}

/// 返回指定项目版本相对其父版本的结构化逐行差异。
#[tauri::command]
pub async fn review_project_git_revision(
    request: GitProjectRequest,
    revision: String,
) -> Result<GitReviewReport, String> {
    run_blocking_git(move || git::review_revision(&request, &revision)).await
}

/// 读取当前项目受管且未提交的工作树文件。
#[tauri::command]
pub async fn load_project_git_worktree_file(
    request: GitProjectRequest,
    path: String,
) -> Result<git::GitWorktreeFileContent, String> {
    run_blocking_git(move || git::load_worktree_file(&request, &path)).await
}

/// 保存当前项目受管且未提交的工作树 JSON 文件。
#[tauri::command]
pub async fn save_project_git_worktree_file(
    request: GitProjectRequest,
    path: String,
    content: String,
) -> Result<(), String> {
    run_blocking_git(move || git::save_worktree_file(&request, &path, &content)).await
}

/// 从磁盘加载 `.jcpro` 项目文件，返回摘要、校验结果与原始 JSON。
#[tauri::command]
pub fn load_project(path: String) -> Result<LoadedProject, String> {
    let resolved_path = resolve_project_path(&path).map_err(|error| error.to_string())?;
    let document =
        json_store::read_json::<Value>(&resolved_path).map_err(|error| error.to_string())?;
    load_project_from_document(resolved_path.to_string_lossy().to_string(), document)
}

/// 创建新项目文件并写入磁盘，返回加载后的项目状态。
#[tauri::command]
pub fn create_project(request: NewProjectRequest) -> Result<LoadedProject, String> {
    let document =
        create_legacy_project_document(&request.name, request.resolution_w, request.resolution_h);
    let document = sanitize_document_for_target(&request.path, document);
    json_store::write_json(&request.path, &document).map_err(|error| error.to_string())?;
    load_project_from_document(request.path, document)
}

/// 将项目 JSON 写回磁盘并返回更新后的加载结果。
#[tauri::command]
pub fn save_project(request: SaveProjectRequest) -> Result<LoadedProject, String> {
    validate_project_version_contract(&request.document)?;
    let document = sanitize_document_for_target(&request.path, request.document);
    json_store::write_json(&request.path, &document).map_err(|error| error.to_string())?;
    load_project_from_document(request.path, document)
}

/// 将当前项目另存为新文件，并复制引用的 UI 资源。
#[tauri::command]
pub fn save_project_as(request: SaveProjectAsRequest) -> Result<SaveProjectAsReport, String> {
    save_project_as_document(request)
}

/// 桌面编辑器专用的另存为入口：成功后原子迁移当前窗口的 `.jcpro` 锁。
#[tauri::command]
pub fn save_project_as_locked(
    window: tauri::WebviewWindow,
    registry: tauri::State<'_, ProjectWindowRegistry>,
    request: SaveProjectAsRequest,
) -> Result<SaveProjectAsReport, String> {
    let target_path = request.target_path.clone();
    let target_key = if project_path_from_args([target_path.clone()]).is_some() {
        Some(normalize_new_project_window_path(&target_path)?)
    } else {
        None
    };
    registry.with_save_as_lock(window.label(), target_key.as_deref(), || {
        save_project_as_document(request)
    })
}

/// 校验项目 JSON 是否包含所有必要段落。
#[tauri::command]
pub fn validate_project_document(document: Value) -> ProjectValidationReport {
    ProjectValidationReport::from_legacy_value(&document)
}

/// 将旧版项目 JSON 迁移到当前版本（补齐缺失段落）。
#[tauri::command]
pub fn migrate_project_document(document: Value) -> MigratedProject {
    migrate_legacy_project_document(None, document)
}

/// 从磁盘读取项目文件，执行迁移后写回磁盘。
#[tauri::command]
pub fn migrate_project_file(path: String) -> Result<MigratedProject, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    let mut migrated = migrate_legacy_project_document(Some(path.clone()), document);
    migrated.document = sanitize_document_for_target(&path, migrated.document);
    json_store::write_json(&path, &migrated.document).map_err(|error| error.to_string())?;
    Ok(migrated)
}

#[tauri::command]
pub fn parse_project_document(document: Value) -> ProjectParseReport {
    parse_legacy_project_document(None, document)
}

#[tauri::command]
pub fn parse_project_file(path: String) -> Result<ProjectParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_legacy_project_document(Some(path), document))
}

#[tauri::command]
pub fn parse_unified_protocol_project(document: Value) -> UnifiedProtocolModel {
    build_unified_protocol_model(&document)
}

#[tauri::command]
pub fn migrate_unified_protocol_document(document: Value) -> Value {
    migrate_project_to_unified_protocol(document)
}

#[tauri::command]
pub fn flatten_unified_protocol_document(document: Value) -> ProtocolCompatibilityReport {
    flatten_unified_protocol_to_legacy(document)
}

/// UI 资源解析请求（可选附带项目路径用于解析相对图片路径）。
#[derive(Debug, Deserialize)]
pub struct UiResourceParseRequest {
    pub project_path: Option<String>,
    pub document: Value,
}

#[tauri::command]
pub fn parse_ui_resources(document: Value) -> UiResourceParseReport {
    parse_ui_info(None, &document)
}

#[tauri::command]
pub fn parse_ui_resources_with_project_path(
    app: tauri::AppHandle,
    request: UiResourceParseRequest,
) -> Result<UiResourceParseReport, String> {
    let report = parse_ui_resources_for_project(request);
    let scope = app.asset_protocol_scope();
    for source in ui_resource_sources(&report) {
        scope
            .allow_file(source)
            .map_err(|error| format!("无法授权 UI 资源预览 {}：{}", source, error))?;
    }
    Ok(report)
}

fn ui_resource_sources(report: &UiResourceParseReport) -> Vec<&str> {
    report
        .logo
        .iter()
        .chain(report.main_items.iter())
        .flat_map(|resource| resource.options.iter())
        .flat_map(|option| option.sources.iter().map(String::as_str))
        .collect()
}

pub fn parse_ui_resources_for_project(request: UiResourceParseRequest) -> UiResourceParseReport {
    parse_ui_info(request.project_path.as_deref(), &request.document)
}

#[tauri::command]
pub fn parse_ui_resource_file(path: String) -> Result<UiResourceParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_ui_info(Some(&path), &document))
}

#[tauri::command]
pub fn update_ui_resource_document(request: UiResourceUpdateRequest) -> UiResourceUpdateReport {
    update_ui_resource(request)
}

#[tauri::command]
pub fn add_ui_resource_option_document(
    request: UiResourceOptionAddRequest,
) -> UiResourceUpdateReport {
    add_ui_resource_option(request)
}

#[tauri::command]
pub fn remove_ui_resource_option_document(
    request: UiResourceOptionRemoveRequest,
) -> UiResourceUpdateReport {
    remove_ui_resource_option(request)
}

/// 从已解析的 JSON 文档构建 `LoadedProject`（摘要 + 校验 + 原始文档）。
fn load_project_from_document(path: String, document: Value) -> Result<LoadedProject, String> {
    let summary = ProjectSummary::from_legacy_value(Some(path), &document);
    let validation = ProjectValidationReport::from_legacy_value(&document);

    Ok(LoadedProject {
        summary,
        validation,
        document,
    })
}

/// 解析项目文件路径：支持绝对路径、相对路径，以及在当前目录祖先中按文件名搜索。
fn resolve_project_path(path: &str) -> Result<PathBuf, std::io::Error> {
    let project_path = PathBuf::from(path);
    if project_path.exists() || project_path.is_absolute() {
        return Ok(project_path);
    }

    let current_dir = std::env::current_dir()?;
    let ancestors = current_dir.ancestors().take(4);

    ancestors
        .clone()
        .map(|ancestor| ancestor.join(&project_path))
        .find(|candidate| candidate.exists())
        .or_else(|| {
            ancestors
                .filter_map(|ancestor| locate_by_file_name(ancestor, &project_path))
                .next()
        })
        .unwrap_or(project_path)
        .canonicalize()
}

/// 在 `root` 的直接子目录中查找包含 `project_path` 文件名的文件。
fn locate_by_file_name(root: &Path, project_path: &Path) -> Option<PathBuf> {
    let file_name = project_path.file_name()?;
    let direct_children = std::fs::read_dir(root).ok()?;

    for child in direct_children.flatten() {
        let child_path = child.path();
        if child_path.is_dir() {
            let candidate = child_path.join(file_name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

/// 旧版表格类型枚举，用于指定导入/导出的数据类型。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LegacyTableKind {
    Sdo,
    PdoSimple,
    Language,
}

/// 表格规范描述（类型标识 + 标准表头列表）。
#[derive(Debug, Serialize)]
pub struct LegacyTableSpec {
    pub kind: String,
    pub headers: Vec<String>,
}

/// 根据表格类型返回对应的表头规范，前端用于生成导入模板。
#[tauri::command]
pub fn legacy_table_spec(kind: LegacyTableKind) -> LegacyTableSpec {
    match kind {
        LegacyTableKind::Sdo => LegacyTableSpec {
            kind: "sdo".to_string(),
            headers: SDO_HEADERS.iter().map(|item| (*item).to_string()).collect(),
        },
        LegacyTableKind::PdoSimple => LegacyTableSpec {
            kind: "pdoSimple".to_string(),
            headers: PDO_SIMPLE_HEADERS
                .iter()
                .map(|item| (*item).to_string())
                .collect(),
        },
        LegacyTableKind::Language => LegacyTableSpec {
            kind: "language".to_string(),
            headers: LANGUAGE_REQUIRED_PREFIX_HEADERS
                .iter()
                .chain(["中文_zh"].iter())
                .map(|item| (*item).to_string())
                .collect(),
        },
    }
}

#[tauri::command]
pub fn validate_table_headers(
    kind: LegacyTableKind,
    headers: Vec<String>,
) -> TableValidationReport {
    match kind {
        LegacyTableKind::Sdo => validate_headers(&headers, SDO_HEADERS),
        LegacyTableKind::PdoSimple => validate_headers(&headers, PDO_SIMPLE_HEADERS),
        LegacyTableKind::Language => validate_language_headers(&headers),
    }
}

#[tauri::command]
pub fn import_sdo_table(document: TableDocument) -> SdoImportReport {
    parse_sdo_table(document)
}

#[tauri::command]
pub fn import_sdo_csv(request: TableFileRequest) -> Result<SdoImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_sdo_table(document))
}

#[tauri::command]
pub fn import_sdo_workbook(request: TableFileRequest) -> Result<SdoImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_sdo_table(document))
}

#[tauri::command]
pub fn import_pdo_simple_table(document: TableDocument) -> PdoSimpleImportReport {
    parse_pdo_simple_table(document)
}

#[tauri::command]
pub fn parse_pdo_advanced_project(document: Value) -> PdoAdvancedParseReport {
    parse_pdo_advanced_document(&document)
}

#[tauri::command]
pub fn parse_pdo_advanced_file(path: String) -> Result<PdoAdvancedParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_advanced_document(&document))
}

#[tauri::command]
pub fn import_pdo_simple_csv(request: TableFileRequest) -> Result<PdoSimpleImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_simple_table(document))
}

#[tauri::command]
pub fn import_pdo_simple_workbook(
    request: TableFileRequest,
) -> Result<PdoSimpleImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_simple_table(document))
}

#[tauri::command]
pub fn import_language_table(document: TableDocument) -> LanguageImportReport {
    parse_language_table(document)
}

#[tauri::command]
pub fn import_language_csv(request: TableFileRequest) -> Result<LanguageImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_language_table(document))
}

#[tauri::command]
pub fn import_language_workbook(request: TableFileRequest) -> Result<LanguageImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_language_table(document))
}

#[tauri::command]
pub fn import_single_language_csv(
    request: SingleLanguageCsvImportRequest,
) -> Result<SingleLanguageImportReport, String> {
    let rows = read_csv_rows(&request.path).map_err(|error| error.to_string())?;
    Ok(merge_single_language_rows(
        &request.document,
        &request.language_code,
        rows,
    ))
}

#[tauri::command]
pub fn export_table_csv(request: ExportTableRequest) -> Result<(), String> {
    write_csv(&request.path, &request.document).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_table_workbook(request: ExportTableRequest) -> Result<(), String> {
    write_workbook_xml(&request.path, &request.document).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn language_document_table(document: Value) -> TableDocument {
    language_document_to_table(&document)
}

#[tauri::command]
pub async fn translate_baidu_text(
    request: BaiduTranslateRequest,
) -> Result<BaiduTranslateResponse, String> {
    let stored = tauri::async_runtime::spawn_blocking(credentials::load_translation_credentials)
        .await
        .map_err(|error| format!("读取翻译凭据任务失败：{error}"))??
        .ok_or_else(|| "请先在软件设置中保存百度翻译凭据。".to_string())?;
    translate_with_baidu(
        request,
        BaiduTranslateCredentials {
            app_id: stored.app_id,
            app_key: stored.app_key,
        },
    )
    .await
}

#[tauri::command]
pub async fn translation_credentials_status() -> Result<TranslationCredentialStatus, String> {
    tauri::async_runtime::spawn_blocking(credentials::translation_credential_status)
        .await
        .map_err(|error| format!("读取翻译凭据任务失败：{error}"))?
}

#[tauri::command]
pub async fn save_translation_credentials(
    request: SaveTranslationCredentialsRequest,
) -> Result<TranslationCredentialStatus, String> {
    tauri::async_runtime::spawn_blocking(move || credentials::save_translation_credentials(request))
        .await
        .map_err(|error| format!("保存翻译凭据任务失败：{error}"))?
}

#[tauri::command]
pub async fn clear_translation_credentials() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(credentials::clear_translation_credentials)
        .await
        .map_err(|error| format!("清空翻译凭据任务失败：{error}"))?
}

#[tauri::command]
pub async fn load_project_recovery_draft(
    app: tauri::AppHandle,
) -> Result<Option<ProjectRecoveryDraft>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve application data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        recovery::load_project_recovery_draft(&app_data_dir)
    })
    .await
    .map_err(|error| format!("Recovery draft read task failed: {error}"))?
}

#[tauri::command]
pub async fn save_project_recovery_draft(
    app: tauri::AppHandle,
    draft: ProjectRecoveryDraft,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve application data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        recovery::save_project_recovery_draft(&app_data_dir, draft)
    })
    .await
    .map_err(|error| format!("Recovery draft write task failed: {error}"))?
}

#[tauri::command]
pub async fn clear_project_recovery_draft(
    app: tauri::AppHandle,
    project_path: Option<String>,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve application data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        recovery::clear_project_recovery_draft(&app_data_dir, project_path.as_deref())
    })
    .await
    .map_err(|error| format!("Recovery draft cleanup task failed: {error}"))?
}

#[tauri::command]
pub fn pdo_simple_document_table(document: Value) -> TableDocument {
    pdo_simple_document_to_table(&document)
}

#[tauri::command]
pub fn sdo_document_table(document: Value) -> TableDocument {
    sdo_document_to_table(&document)
}

#[tauri::command]
pub fn build_project_export_plan(request: ExportPlanRequest) -> ExportPlanReport {
    build_export_plan(request)
}

#[tauri::command]
pub fn export_project_package_command(request: ExportPlanRequest) -> ProjectExportReport {
    export_project_package(request)
}

#[tauri::command]
pub fn copy_ui_resource_images(request: ExportPlanRequest) -> UiImageCopyReport {
    copy_ui_images(request)
}

#[tauri::command]
pub fn compare_project_binary_report(request: BinaryCompareRequest) -> BinaryCompareReport {
    compare_project_binary(request)
}

#[tauri::command]
pub fn build_project_binary_report(document: Value) -> BinaryBuildReport {
    build_project_binary(&document)
}

// ── CAN 测试数据构建 ──────────────────────────────────────────────

use crate::domain::{can_test, canopen_convert};

/// 从项目文档中提取所有 CAN 帧并生成测试数据。
#[tauri::command]
pub fn generate_can_test_data(
    document: Value,
    profile: Option<String>,
) -> can_test::CanTestGenerateResponse {
    can_test::generate_can_test_data(&document, profile.as_deref())
}

/// 分析旧项目并生成 CANopen 兼容转换报告。
#[tauri::command]
pub fn analyze_canopen_conversion(document: Value) -> canopen_convert::CanopenConversionReport {
    canopen_convert::convert_canopen_document(&document)
}

/// 导出 CANopen 转换包：EDS、vendor 扩展、测试帧和转换报告。
#[tauri::command]
pub fn export_canopen_package(
    output_dir: String,
    document: Value,
) -> Result<canopen_convert::CanopenConversionReport, String> {
    canopen_convert::export_canopen_package(&output_dir, &document)
}

/// 将文本内容写入到指定文件路径。
#[tauri::command]
pub fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败：{}", e))
}

/// 将 JSON Value 写入到指定文件路径。
#[tauri::command]
pub fn save_json_file(path: String, content: Value) -> Result<(), String> {
    let json_str =
        serde_json::to_string_pretty(&content).map_err(|e| format!("序列化 JSON 失败：{}", e))?;
    std::fs::write(&path, json_str).map_err(|e| format!("写入文件失败：{}", e))
}

/// 从指定文件路径读取 JSON 内容。
#[tauri::command]
pub fn load_json_file(path: String) -> Result<Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))?;
    serde_json::from_str(content.strip_prefix('\u{FEFF}').unwrap_or(&content))
        .map_err(|e| format!("解析 JSON 失败：{}", e))
}

/// 从指定文件路径读取文本内容。
#[tauri::command]
pub fn load_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))
}

fn numeric_value_to_f64(val: &NumericValue) -> f64 {
    match val {
        NumericValue::Uint(v) => *v as f64,
        NumericValue::Int(v) => *v as f64,
        NumericValue::Double(v) => *v,
    }
}

/// 从 DBC 文件导入帧和信号。
#[tauri::command]
pub fn import_dbc(path: String) -> Result<Value, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("读取 DBC 文件失败：{}", e))?;
    let dbc = Dbc::try_from(content.as_str()).map_err(|e| format!("解析 DBC 失败：{}", e))?;

    let mut frames: Vec<Value> = Vec::new();
    let mut signals: Vec<Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut key_counts: BTreeMap<String, usize> = BTreeMap::new();

    for msg in &dbc.messages {
        let (can_id, frame_type) = match &msg.id {
            MessageId::Standard(id) => (u32::from(*id), 0i64),
            MessageId::Extended(id) => (*id, 1i64),
        };

        let base_key = if msg.name.is_empty() {
            format!("dbc_msg_{:03X}", can_id)
        } else {
            msg.name
                .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
        };
        let entry = key_counts.entry(base_key.clone()).or_insert(0);
        *entry += 1;
        let frame_key = if *entry > 1 {
            format!("{}_{}", base_key, *entry - 1)
        } else {
            base_key
        };

        let desc = dbc
            .message_comment(msg.id.clone())
            .unwrap_or("")
            .to_string();

        frames.push(json!({
            "frame_key": frame_key,
            "can_id": can_id,
            "frame_type": frame_type,
            "dlc": 8,
            "desc": desc,
            "timeout_ticks": 200,
        }));

        for sig in &msg.signals {
            let show_type = match &sig.byte_order {
                ByteOrder::BigEndian => 1i64,
                ByteOrder::LittleEndian => 0i64,
            };

            let (raw_type, value_type) = match (&sig.value_type, sig.size) {
                (ValueType::Signed, size) if size <= 8 => ("u8", "u8"),
                (ValueType::Signed, size) if size <= 16 => ("u16_le", "f32"),
                (ValueType::Signed, _) => ("u32_le", "f32"),
                (ValueType::Unsigned, size) if size <= 8 => ("u8", "u8"),
                (ValueType::Unsigned, size) if size <= 16 => ("u16_le", "u16"),
                (ValueType::Unsigned, _) => ("u32_le", "u32"),
            };

            let sig_name = if sig.name.is_empty() {
                format!("sig_{}", signals.len() + 1)
            } else {
                sig.name
                    .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
            };

            let comment = dbc
                .signal_comment(msg.id.clone(), &sig.name)
                .unwrap_or("")
                .to_string();
            let message_key = format!("battery_monitor.signal.{frame_key}.{sig_name}");

            signals.push(json!({
                "signal_key": sig_name,
                "name": message_key,
                "inner": -1i64,
                "frame_key": frame_key.clone(),
                "pos": sig.start_bit as i64,
                "len": sig.size as i64,
                "byte_order": if show_type == 1 { "big_endian" } else { "little_endian" },
                "raw_offset": (sig.start_bit / 8) as i64,
                "raw_type": raw_type,
                "value_type": value_type,
                "parse_resolution": sig.factor,
                "parse_offset": sig.offset,
                "parse_mask": u32::MAX,
                "parse_shift": 0,
                "receiver": sig.receivers.join(","),
                "comment": comment,
            }));
        }
    }

    if frames.is_empty() {
        errors.push("DBC 文件中未找到任何消息".to_string());
    }

    Ok(json!({
        "frames": frames,
        "signals": signals,
        "errors": errors,
    }))
}

/// 导出帧和信号到 DBC 文件。
#[tauri::command]
pub fn export_dbc(path: String, frames: Vec<Value>, signals: Vec<Value>) -> Result<(), String> {
    let mut lines: Vec<String> = Vec::new();
    let mut all_receivers: Vec<String> = vec!["dbc_export".to_string()];

    lines.push("VERSION \"\"\n\n".to_string());
    lines.push(
        "NS_ :\n\tNS_DESC_\n\tCM_\n\tBA_DEF_\n\tBA_\n\tVAL_\n\tCAT_DEF_\n\tCAT_\n\tFILTER\n\tBA_DEF_DEF_\n\tEV_DATA_\n\tENVVAR_DATA_\n\tSGTYPE_\n\tSGTYPE_VAL_\n\tBA_DEF_SGTYPE_\n\tBA_SGTYPE_\n\tSIG_VALTYPE_\n\tCOMTYPE_\n\tCM_DEF_\n\tCM_DEF_DEF_\n\n".to_string(),
    );
    lines.push("BS_:\n\n".to_string());

    for sig in &signals {
        let receiver = sig["receiver"].as_str().unwrap_or("");
        if !receiver.is_empty() && !all_receivers.contains(&receiver.to_string()) {
            all_receivers.push(receiver.to_string());
        }
    }
    lines.push(format!("BU_: {}\n\n", all_receivers.join(" ")));

    let mut comments: Vec<String> = Vec::new();

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;

        let mut signal_lines: Vec<String> = Vec::new();
        let frame_signals: Vec<&Value> = signals
            .iter()
            .filter(|s| s["frame_key"].as_str() == Some(frame_key))
            .collect();

        for sig in &frame_signals {
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let pos = sig["pos"].as_u64().unwrap_or(0);
            let len = sig["len"].as_u64().unwrap_or(8);
            let byte_order = if sig["byte_order"] == "big_endian" {
                "0"
            } else {
                "1"
            };
            let factor = sig["parse_resolution"].as_f64().unwrap_or(1.0);
            let offset = sig["parse_offset"].as_f64().unwrap_or(0.0);
            let min_val = sig["min"].as_f64().unwrap_or(0.0);
            let max_val = sig["max"].as_f64().unwrap_or(0.0);
            let unit = sig["unit"].as_str().unwrap_or("");
            let receiver = sig["receiver"].as_str().unwrap_or("dbc_export");

            signal_lines.push(format!(
                " SG_ {} : {}|{}@{}+ ({},{}) [{}|{}] \"{}\"  {}",
                sig_name, pos, len, byte_order, factor, offset, min_val, max_val, unit, receiver,
            ));
        }

        lines.push(format!(
            "BO_ {} {}: {} dbc_export\n{}\n",
            can_id,
            frame_key,
            frame_val["dlc"].as_u64().unwrap_or(8),
            signal_lines.join("\n"),
        ));
    }

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;
        let desc = frame_val["desc"].as_str().unwrap_or("");

        if !desc.is_empty() {
            comments.push(format!("CM_ BO_ {} \"{}\";\n", can_id, desc));
        }

        for sig in &signals {
            if sig["frame_key"].as_str() != Some(frame_key) {
                continue;
            }
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let comment = sig["comment"].as_str().unwrap_or("");
            let name = sig["name"].as_str().unwrap_or("");
            let sig_comment = if !comment.is_empty() {
                comment.to_string()
            } else if !name.is_empty() && name != sig_name {
                name.to_string()
            } else {
                String::new()
            };
            if !sig_comment.is_empty() {
                comments.push(format!(
                    "CM_ SG_ {} {} \"{}\";\n",
                    can_id, sig_name, sig_comment
                ));
            }
        }
    }

    lines.extend(comments);
    let dbc_content = lines.concat();
    std::fs::write(&path, &dbc_content).map_err(|e| format!("写入 DBC 文件失败：{}", e))
}

/// 根据帧和信号生成 DBC 文本内容（不写文件）。
#[tauri::command]
pub fn generate_dbc_content(frames: Vec<Value>, signals: Vec<Value>) -> Result<String, String> {
    let mut lines: Vec<String> = Vec::new();
    let mut all_receivers: Vec<String> = vec!["dbc_export".to_string()];

    lines.push("VERSION \"\"\n\n".to_string());
    lines.push(
        "NS_ :\n\tNS_DESC_\n\tCM_\n\tBA_DEF_\n\tBA_\n\tVAL_\n\tCAT_DEF_\n\tCAT_\n\tFILTER\n\tBA_DEF_DEF_\n\tEV_DATA_\n\tENVVAR_DATA_\n\tSGTYPE_\n\tSGTYPE_VAL_\n\tBA_DEF_SGTYPE_\n\tBA_SGTYPE_\n\tSIG_VALTYPE_\n\tCOMTYPE_\n\tCM_DEF_\n\tCM_DEF_DEF_\n\n".to_string(),
    );
    lines.push("BS_:\n\n".to_string());

    for sig in &signals {
        let receiver = sig["receiver"].as_str().unwrap_or("");
        if !receiver.is_empty() && !all_receivers.contains(&receiver.to_string()) {
            all_receivers.push(receiver.to_string());
        }
    }
    lines.push(format!("BU_: {}\n\n", all_receivers.join(" ")));

    let mut comments: Vec<String> = Vec::new();

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;

        let mut signal_lines: Vec<String> = Vec::new();
        let frame_signals: Vec<&Value> = signals
            .iter()
            .filter(|s| s["frame_key"].as_str() == Some(frame_key))
            .collect();

        for sig in &frame_signals {
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let pos = sig["pos"].as_u64().unwrap_or(0);
            let len = sig["len"].as_u64().unwrap_or(8);
            let byte_order = if sig["byte_order"] == "big_endian" {
                "0"
            } else {
                "1"
            };
            let factor = sig["parse_resolution"].as_f64().unwrap_or(1.0);
            let offset = sig["parse_offset"].as_f64().unwrap_or(0.0);
            let min_val = sig["min"].as_f64().unwrap_or(0.0);
            let max_val = sig["max"].as_f64().unwrap_or(0.0);
            let unit = sig["unit"].as_str().unwrap_or("");
            let receiver = sig["receiver"].as_str().unwrap_or("dbc_export");

            signal_lines.push(format!(
                " SG_ {} : {}|{}@{}+ ({},{}) [{}|{}] \"{}\"  {}",
                sig_name, pos, len, byte_order, factor, offset, min_val, max_val, unit, receiver,
            ));
        }

        lines.push(format!(
            "BO_ {} {}: {} dbc_export\n{}\n",
            can_id,
            frame_key,
            frame_val["dlc"].as_u64().unwrap_or(8),
            signal_lines.join("\n"),
        ));
    }

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;
        let desc = frame_val["desc"].as_str().unwrap_or("");

        if !desc.is_empty() {
            comments.push(format!("CM_ BO_ {} \"{}\";\n", can_id, desc));
        }

        for sig in &signals {
            if sig["frame_key"].as_str() != Some(frame_key) {
                continue;
            }
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let comment = sig["comment"].as_str().unwrap_or("");
            let name = sig["name"].as_str().unwrap_or("");
            let sig_comment = if !comment.is_empty() {
                comment.to_string()
            } else if !name.is_empty() && name != sig_name {
                name.to_string()
            } else {
                String::new()
            };
            if !sig_comment.is_empty() {
                comments.push(format!(
                    "CM_ SG_ {} {} \"{}\";\n",
                    can_id, sig_name, sig_comment
                ));
            }
        }
    }

    lines.extend(comments);
    Ok(lines.concat())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_every_resolved_ui_resource_source_for_asset_scope() {
        let project_path = std::env::current_dir()
            .unwrap()
            .join("workspace")
            .join("config")
            .join("meter.jcpro");
        let document = json!({
            "ui_info": {
                "logo": {
                    "name": "logo",
                    "handle": "show",
                    "option": ["images/logo.png"]
                },
                "main": {
                    "item": {
                        "speed": {
                            "name": "speed",
                            "handle": "list",
                            "option": [{ "list": ["images/speed-0.png", "images/speed-1.png"] }]
                        }
                    }
                }
            }
        });
        let report = parse_ui_resources_for_project(UiResourceParseRequest {
            project_path: Some(project_path.to_string_lossy().into_owned()),
            document,
        });
        let sources = ui_resource_sources(&report)
            .into_iter()
            .map(PathBuf::from)
            .collect::<Vec<_>>();
        let project_dir = project_path.parent().unwrap();

        assert_eq!(
            sources,
            vec![
                project_dir.join("images/logo.png"),
                project_dir.join("images/speed-0.png"),
                project_dir.join("images/speed-1.png"),
            ]
        );
    }

    #[test]
    fn selects_jcpro_project_path_from_desktop_arguments() {
        assert_eq!(
            project_path_from_args([
                "jc-custom-platform.exe".to_string(),
                "--flag".to_string(),
                r#"D:\projects\meter.JCPRO"#.to_string(),
            ]),
            Some(r#"D:\projects\meter.JCPRO"#.to_string())
        );
        assert_eq!(
            project_path_from_args([
                "jc-custom-platform.exe".to_string(),
                "notes.json".to_string()
            ]),
            None
        );
    }

    #[test]
    fn project_window_registry_allows_one_owner_per_path() {
        let registry = ProjectWindowRegistry::default();

        assert_eq!(
            registry.claim_path(Some("main"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::Current("main".to_string())
        );
        assert_eq!(
            registry.claim_path(Some("main"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::Current("main".to_string())
        );
        assert_eq!(
            registry.claim_path(Some("project-2"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::Existing("main".to_string())
        );

        let second = registry.claim_path(Some("main"), "d:/projects/two.jcpro");
        assert_eq!(second, ProjectWindowClaim::New("project-1".to_string()));
        registry.release_label("main");
        assert_eq!(
            registry.claim_path(Some("project-2"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::Current("project-2".to_string())
        );
    }

    #[test]
    fn pending_project_paths_are_scoped_to_window_labels() {
        let pending = PendingProjectPath::new(Some("d:/projects/main.jcpro".to_string()));
        pending.replace_for_label("project-1", "d:/projects/second.jcpro".to_string());

        assert_eq!(
            pending.take_for_label("main"),
            Some("d:/projects/main.jcpro".to_string())
        );
        assert_eq!(
            pending.take_for_label("project-1"),
            Some("d:/projects/second.jcpro".to_string())
        );
        assert_eq!(pending.take_for_label("project-2"), None);
    }

    #[test]
    fn project_window_registry_keeps_save_as_lock_atomic() {
        let registry = ProjectWindowRegistry::default();
        registry.claim_path(Some("main"), "d:/projects/one.jcpro");

        assert_eq!(
            registry.with_save_as_lock("main", Some("d:/projects/two.jcpro"), || {
                Err::<(), _>("write failed".to_string())
            }),
            Err("write failed".to_string())
        );
        assert_eq!(
            registry.claim_path(Some("project-2"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::Existing("main".to_string())
        );

        assert_eq!(
            registry.with_save_as_lock("main", Some("d:/projects/two.jcpro"), || Ok(())),
            Ok(())
        );
        assert_eq!(
            registry.claim_path(Some("main"), "d:/projects/one.jcpro"),
            ProjectWindowClaim::New("project-1".to_string())
        );

        assert_eq!(registry.with_save_as_lock("main", None, || Ok(())), Ok(()));
        assert_eq!(
            registry.claim_path(Some("project-2"), "d:/projects/two.jcpro"),
            ProjectWindowClaim::Current("project-2".to_string())
        );
    }
}

//! Git-backed version management for project configuration files.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitProjectRequest {
    pub project_path: String,
    pub sidecar_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitProjectStatus {
    pub available: bool,
    pub repo_root: Option<String>,
    pub branch: Option<String>,
    pub head_hash: Option<String>,
    pub head_short_hash: Option<String>,
    pub head_subject: Option<String>,
    pub managed_paths: Vec<String>,
    pub changed_paths: Vec<String>,
    pub has_staged_changes: bool,
    pub warning: Option<String>,
}

impl GitProjectStatus {
    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            available: false,
            repo_root: None,
            branch: None,
            head_hash: None,
            head_short_hash: None,
            head_subject: None,
            managed_paths: Vec::new(),
            changed_paths: Vec::new(),
            has_staged_changes: false,
            warning: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GitRevision {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub authored_at: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitRevisionSnapshot {
    pub revision: GitRevision,
    pub project_document: Value,
    pub sidecar_document: Option<Value>,
    pub sidecar_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitRequest {
    pub project_path: String,
    pub sidecar_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommitReport {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub committed_paths: Vec<String>,
}

struct RepositoryContext {
    root: PathBuf,
    managed_paths: Vec<String>,
    warning: Option<String>,
}

pub fn inspect_project(request: &GitProjectRequest) -> GitProjectStatus {
    let context = match discover_repository(request) {
        Ok(context) => context,
        Err(error) => return GitProjectStatus::unavailable(error),
    };

    let branch = git_text(&context.root, &["branch", "--show-current"])
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| Some("HEAD (detached)".to_string()));
    let head_line =
        git_text(&context.root, &["log", "-1", "--format=%H%x1f%h%x1f%s"]).unwrap_or_default();
    let mut head_parts = head_line.splitn(3, '\x1f');
    let head_hash = non_empty(head_parts.next());
    let head_short_hash = non_empty(head_parts.next());
    let head_subject = non_empty(head_parts.next());
    let changed_paths = context
        .managed_paths
        .iter()
        .filter(|path| path_has_changes(&context.root, path))
        .cloned()
        .collect();

    GitProjectStatus {
        available: true,
        repo_root: Some(context.root.to_string_lossy().to_string()),
        branch,
        head_hash,
        head_short_hash,
        head_subject,
        managed_paths: context.managed_paths,
        changed_paths,
        has_staged_changes: has_staged_changes(&context.root).unwrap_or(false),
        warning: context.warning,
    }
}

pub fn list_revisions(
    request: &GitProjectRequest,
    limit: usize,
) -> Result<Vec<GitRevision>, String> {
    let context = discover_repository(request)?;
    if git_text(&context.root, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100).to_string();
    let mut args = vec![
        "log".to_string(),
        format!("--max-count={limit}"),
        "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e".to_string(),
        "--".to_string(),
    ];
    args.extend(context.managed_paths.iter().cloned());
    let output = git_text_owned(&context.root, &args)?;

    Ok(output
        .split('\x1e')
        .filter_map(|record| {
            let fields: Vec<_> = record.trim().splitn(5, '\x1f').collect();
            (fields.len() == 5).then(|| GitRevision {
                hash: fields[0].to_string(),
                short_hash: fields[1].to_string(),
                author: fields[2].to_string(),
                authored_at: fields[3].to_string(),
                subject: fields[4].to_string(),
            })
        })
        .collect())
}

pub fn load_revision(
    request: &GitProjectRequest,
    revision: &str,
) -> Result<GitRevisionSnapshot, String> {
    validate_revision(revision)?;
    let context = discover_repository(request)?;
    let revisions = revision_details(&context.root, revision)?;
    let project_path = context
        .managed_paths
        .first()
        .ok_or_else(|| "项目文件不在 Git 仓库中".to_string())?;
    let project_document = show_json(&context.root, revision, project_path)?;
    let sidecar_path = context.managed_paths.get(1).cloned();
    let sidecar_document = sidecar_path
        .as_deref()
        .and_then(|path| show_json(&context.root, revision, path).ok());

    Ok(GitRevisionSnapshot {
        revision: revisions,
        project_document,
        sidecar_document,
        sidecar_path,
    })
}

pub fn commit_project(request: &GitCommitRequest) -> Result<GitCommitReport, String> {
    let message = request.message.trim();
    if message.is_empty() {
        return Err("版本说明不能为空".to_string());
    }

    let context = discover_repository(&GitProjectRequest {
        project_path: request.project_path.clone(),
        sidecar_path: request.sidecar_path.clone(),
    })?;
    if has_staged_changes(&context.root)? {
        return Err("Git 暂存区已有内容，请先提交或取消暂存后再保存项目版本".to_string());
    }
    if has_conflicts(&context.root)? {
        return Err("Git 仓库存在未解决冲突，无法保存项目版本".to_string());
    }
    if !context
        .managed_paths
        .iter()
        .any(|path| path_has_changes(&context.root, path))
    {
        return Err("受管配置文件没有可提交的修改".to_string());
    }

    let mut add_args = vec!["add".to_string(), "--".to_string()];
    add_args.extend(context.managed_paths.iter().cloned());
    git_success_owned(&context.root, &add_args)?;

    let staged_paths = git_lines(&context.root, &["diff", "--cached", "--name-only"])?;
    if staged_paths
        .iter()
        .any(|path| !context.managed_paths.contains(path))
    {
        return Err("暂存区在提交前出现了非项目文件，已停止提交".to_string());
    }

    git_success(&context.root, &["commit", "-m", message])?;
    let revision = revision_details(&context.root, "HEAD")?;
    Ok(GitCommitReport {
        hash: revision.hash,
        short_hash: revision.short_hash,
        subject: revision.subject,
        committed_paths: context.managed_paths,
    })
}

fn discover_repository(request: &GitProjectRequest) -> Result<RepositoryContext, String> {
    let project_path = canonical_existing_file(&request.project_path)?;
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "无法确定项目文件所在目录".to_string())?;
    let root_text = git_text(project_dir, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "项目路径不在 Git 仓库中".to_string())?;
    let root = PathBuf::from(root_text)
        .canonicalize()
        .map_err(|error| format!("无法解析 Git 仓库根目录：{error}"))?;
    let mut managed_paths = vec![repo_relative_path(&root, &project_path)?];
    let mut warning = None;

    let sidecar_path = request
        .sidecar_path
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| project_path.with_extension("refactor-config.json"));
    let sidecar = canonical_potential_file(&sidecar_path)?;
    match repo_relative_path(&root, &sidecar) {
        Ok(relative)
            if sidecar.exists()
                || git_success(&root, &["ls-files", "--error-unmatch", "--", &relative])
                    .is_ok() =>
        {
            managed_paths.push(relative)
        }
        Ok(relative) if path_has_history(&root, &relative) => managed_paths.push(relative),
        Ok(_) => {}
        Err(_) if request.sidecar_path.is_some() => {
            warning = Some("重构配置位于当前 Git 仓库之外，不会纳入版本".to_string())
        }
        Err(_) => {}
    }

    Ok(RepositoryContext {
        root,
        managed_paths,
        warning,
    })
}

fn canonical_existing_file(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(format!("项目配置文件不存在：{}", path.display()));
    }
    path.canonicalize()
        .map_err(|error| format!("无法解析文件路径 {}：{error}", path.display()))
}

fn canonical_potential_file(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|error| format!("无法解析文件路径 {}：{error}", path.display()));
    }
    let parent = path
        .parent()
        .ok_or_else(|| format!("无法解析文件路径：{}", path.display()))?
        .canonicalize()
        .map_err(|error| format!("无法解析文件目录 {}：{error}", path.display()))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("无法解析文件名：{}", path.display()))?;
    Ok(parent.join(file_name))
}

fn repo_relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| format!("文件不在 Git 仓库中：{}", path.display()))?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn validate_revision(revision: &str) -> Result<(), String> {
    if (7..=40).contains(&revision.len()) && revision.chars().all(|ch| ch.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Git 版本号格式无效".to_string())
    }
}

fn revision_details(root: &Path, revision: &str) -> Result<GitRevision, String> {
    let format_arg = "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s";
    let output = git_text(root, &["show", "-s", format_arg, revision])?;
    let fields: Vec<_> = output.splitn(5, '\x1f').collect();
    if fields.len() != 5 {
        return Err("无法解析 Git 版本信息".to_string());
    }
    Ok(GitRevision {
        hash: fields[0].to_string(),
        short_hash: fields[1].to_string(),
        author: fields[2].to_string(),
        authored_at: fields[3].to_string(),
        subject: fields[4].to_string(),
    })
}

fn show_json(root: &Path, revision: &str, path: &str) -> Result<Value, String> {
    let object = format!("{revision}:{path}");
    let content = git_text(root, &["show", &object])?;
    serde_json::from_str(&content)
        .map_err(|error| format!("版本 {revision} 中的 {path} 不是有效 JSON：{error}"))
}

fn path_has_changes(root: &Path, path: &str) -> bool {
    git_text(
        root,
        &["status", "--porcelain", "--untracked-files=all", "--", path],
    )
    .map(|output| !output.is_empty())
    .unwrap_or(false)
}

fn path_has_history(root: &Path, path: &str) -> bool {
    git_text(root, &["log", "-1", "--format=%H", "--", path])
        .map(|output| !output.is_empty())
        .unwrap_or(false)
}

fn has_staged_changes(root: &Path) -> Result<bool, String> {
    let output = git_output(root, &["diff", "--cached", "--quiet"])?;
    match output.status.code() {
        Some(0) => Ok(false),
        Some(1) => Ok(true),
        _ => Err(git_error(&output)),
    }
}

fn has_conflicts(root: &Path) -> Result<bool, String> {
    Ok(!git_lines(root, &["diff", "--name-only", "--diff-filter=U"])?.is_empty())
}

fn git_lines(root: &Path, args: &[&str]) -> Result<Vec<String>, String> {
    Ok(git_text(root, args)?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn git_text(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_output(root, args)?;
    if !output.status.success() {
        return Err(git_error(&output));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_text_owned(root: &Path, args: &[String]) -> Result<String, String> {
    let refs: Vec<_> = args.iter().map(String::as_str).collect();
    git_text(root, &refs)
}

fn git_success(root: &Path, args: &[&str]) -> Result<(), String> {
    git_text(root, args).map(|_| ())
}

fn git_success_owned(root: &Path, args: &[String]) -> Result<(), String> {
    git_text_owned(root, args).map(|_| ())
}

fn git_output(root: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| format!("无法运行 Git：{error}"))
}

fn git_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        "Git 命令执行失败".to_string()
    } else {
        stderr
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value.filter(|value| !value.is_empty()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn commits_only_managed_project_files_and_reads_history() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("jc-git-test-{unique}"));
        fs::create_dir_all(&root).unwrap();
        git_success(&root, &["init"]).unwrap();
        git_success(&root, &["config", "user.name", "JC Test"]).unwrap();
        git_success(&root, &["config", "user.email", "jc@example.invalid"]).unwrap();

        let project = root.join("meter.jcpro");
        let sidecar = root.join("meter.refactor-config.json");
        let unrelated = root.join("notes.txt");
        fs::write(&project, r#"{"config_version":"v1"}"#).unwrap();
        fs::write(&unrelated, "unchanged").unwrap();
        git_success(&root, &["add", "--", "meter.jcpro", "notes.txt"]).unwrap();
        git_success(&root, &["commit", "-m", "initial"]).unwrap();

        fs::write(&project, r#"{"config_version":"v2"}"#).unwrap();
        fs::write(&sidecar, r#"{"signal_dictionary":{"signals":[]}}"#).unwrap();
        fs::write(&unrelated, "local change").unwrap();
        let request = GitCommitRequest {
            project_path: project.to_string_lossy().to_string(),
            sidecar_path: Some(sidecar.to_string_lossy().to_string()),
            message: "project version".to_string(),
        };
        let report = commit_project(&request).unwrap();
        assert_eq!(
            report.committed_paths,
            vec!["meter.jcpro", "meter.refactor-config.json"]
        );
        assert!(path_has_changes(&root, "notes.txt"));

        let project_request = GitProjectRequest {
            project_path: project.to_string_lossy().to_string(),
            sidecar_path: Some(sidecar.to_string_lossy().to_string()),
        };
        let revisions = list_revisions(&project_request, 10).unwrap();
        assert_eq!(revisions[0].subject, "project version");
        let snapshot = load_revision(&project_request, &report.hash).unwrap();
        assert_eq!(snapshot.project_document["config_version"], "v2");
        assert!(snapshot.sidecar_document.is_some());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_mix_existing_staged_changes_into_project_version() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("jc-git-staged-test-{unique}"));
        fs::create_dir_all(&root).unwrap();
        git_success(&root, &["init"]).unwrap();
        git_success(&root, &["config", "user.name", "JC Test"]).unwrap();
        git_success(&root, &["config", "user.email", "jc@example.invalid"]).unwrap();

        let project = root.join("meter.jcpro");
        let unrelated = root.join("notes.txt");
        fs::write(&project, r#"{"config_version":"v1"}"#).unwrap();
        fs::write(&unrelated, "initial").unwrap();
        git_success(&root, &["add", "--", "meter.jcpro", "notes.txt"]).unwrap();
        git_success(&root, &["commit", "-m", "initial"]).unwrap();
        fs::write(&project, r#"{"config_version":"v2"}"#).unwrap();
        fs::write(&unrelated, "staged change").unwrap();
        git_success(&root, &["add", "--", "notes.txt"]).unwrap();

        let error = commit_project(&GitCommitRequest {
            project_path: project.to_string_lossy().to_string(),
            sidecar_path: None,
            message: "must fail".to_string(),
        })
        .unwrap_err();
        assert!(error.contains("暂存区已有内容"));
        assert!(path_has_changes(&root, "meter.jcpro"));

        fs::remove_dir_all(root).unwrap();
    }
}

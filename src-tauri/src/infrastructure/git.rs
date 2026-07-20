//! Git-backed version management for project configuration files.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const MAX_WORKTREE_EDITOR_BYTES: usize = 16 * 1024 * 1024;

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
    pub additions: usize,
    pub deletions: usize,
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
            additions: 0,
            deletions: 0,
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
pub struct GitProjectContext {
    pub status: GitProjectStatus,
    pub revisions: Vec<GitRevision>,
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

#[derive(Debug, Clone, Serialize)]
pub struct GitReviewReport {
    pub repo_root: String,
    pub branch: String,
    pub base_ref: Option<String>,
    pub additions: usize,
    pub deletions: usize,
    pub files: Vec<GitReviewFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitReviewFile {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<GitDiffHunk>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitWorktreeFileContent {
    pub path: String,
    pub original_content: String,
    pub current_content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffHunk {
    pub header: String,
    pub old_start: usize,
    pub new_start: usize,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffLine {
    pub kind: String,
    pub old_line: Option<usize>,
    pub new_line: Option<usize>,
    pub content: String,
}

struct RepositoryContext {
    root: PathBuf,
    managed_paths: Vec<String>,
    warning: Option<String>,
}

#[derive(Default)]
struct ProjectMetadata {
    branch: Option<String>,
    head_hash: Option<String>,
    head_short_hash: Option<String>,
    head_subject: Option<String>,
}

pub fn inspect_project(request: &GitProjectRequest) -> GitProjectStatus {
    load_project_context(request, 1).status
}

pub fn load_project_context(request: &GitProjectRequest, limit: usize) -> GitProjectContext {
    let context = match discover_repository(request) {
        Ok(context) => context,
        Err(error) => {
            return GitProjectContext {
                status: GitProjectStatus::unavailable(error),
                revisions: Vec::new(),
            }
        }
    };

    let (metadata, path_statuses, tracked_stats, staged, revisions) = std::thread::scope(|scope| {
        let metadata = scope.spawn(|| project_metadata(&context.root));
        let path_statuses =
            scope.spawn(|| managed_path_statuses(&context.root, &context.managed_paths));
        let tracked_stats =
            scope.spawn(|| tracked_change_stats(&context.root, &context.managed_paths));
        let staged = scope.spawn(|| has_staged_changes(&context.root));
        let revisions = scope.spawn(|| revisions_for_context(&context, limit));
        (
            metadata
                .join()
                .unwrap_or_else(|_| Err("读取 Git 元数据失败".to_string())),
            path_statuses
                .join()
                .unwrap_or_else(|_| Err("读取 Git 文件状态失败".to_string())),
            tracked_stats.join().unwrap_or((0, 0)),
            staged.join().unwrap_or(Ok(false)),
            revisions
                .join()
                .unwrap_or_else(|_| Err("读取 Git 历史失败".to_string())),
        )
    });

    let metadata = metadata.unwrap_or_default();
    let path_statuses = path_statuses.unwrap_or_default();
    let changed_paths = context
        .managed_paths
        .iter()
        .filter(|path| path_statuses.contains_key(path.as_str()))
        .cloned()
        .collect();
    let (mut additions, deletions) = tracked_stats;
    for path in &context.managed_paths {
        if path_statuses.get(path).is_some_and(|code| code == "??") {
            additions += std::fs::read_to_string(context.root.join(path))
                .map(|content| content.lines().count())
                .unwrap_or(0);
        }
    }

    GitProjectContext {
        status: GitProjectStatus {
            available: true,
            repo_root: Some(context.root.to_string_lossy().to_string()),
            branch: metadata.branch,
            head_hash: metadata.head_hash,
            head_short_hash: metadata.head_short_hash,
            head_subject: metadata.head_subject,
            managed_paths: context.managed_paths,
            changed_paths,
            additions,
            deletions,
            has_staged_changes: staged.unwrap_or(false),
            warning: context.warning,
        },
        revisions: revisions.unwrap_or_default(),
    }
}

pub fn list_revisions(
    request: &GitProjectRequest,
    limit: usize,
) -> Result<Vec<GitRevision>, String> {
    let context = discover_repository(request)?;
    revisions_for_context(&context, limit)
}

fn revisions_for_context(
    context: &RepositoryContext,
    limit: usize,
) -> Result<Vec<GitRevision>, String> {
    let limit = limit.clamp(1, 100).to_string();
    let mut args = vec![
        "log".to_string(),
        format!("--max-count={limit}"),
        "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e".to_string(),
        "--".to_string(),
    ];
    args.extend(context.managed_paths.iter().cloned());
    let output = git_text_owned(&context.root, &args).unwrap_or_default();

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

pub fn review_project(request: &GitProjectRequest) -> Result<GitReviewReport, String> {
    let context = discover_repository(request)?;
    let (metadata, base_ref, statuses, tracked_paths) = std::thread::scope(|scope| {
        let metadata = scope.spawn(|| project_metadata(&context.root));
        let base_ref = scope.spawn(|| {
            git_text(
                &context.root,
                &[
                    "rev-parse",
                    "--abbrev-ref",
                    "--symbolic-full-name",
                    "@{upstream}",
                ],
            )
            .ok()
        });
        let statuses = scope.spawn(|| managed_path_statuses(&context.root, &context.managed_paths));
        let tracked_paths = scope.spawn(|| tracked_paths(&context.root, &context.managed_paths));
        (
            metadata
                .join()
                .unwrap_or_else(|_| Err("读取 Git 元数据失败".to_string())),
            base_ref.join().unwrap_or(None),
            statuses
                .join()
                .unwrap_or_else(|_| Err("读取 Git 文件状态失败".to_string())),
            tracked_paths
                .join()
                .unwrap_or_else(|_| Err("读取 Git 跟踪状态失败".to_string())),
        )
    });
    let metadata = metadata.unwrap_or_default();
    let branch = metadata
        .branch
        .unwrap_or_else(|| "HEAD (detached)".to_string());
    let has_head = metadata.head_hash.is_some();
    let statuses = statuses?;
    let tracked_paths = tracked_paths?;
    let files = std::thread::scope(|scope| {
        let root = &context.root;
        let mut jobs = Vec::new();
        for path in &context.managed_paths {
            let Some(code) = statuses.get(path) else {
                continue;
            };
            let is_tracked = tracked_paths.contains(path);
            jobs.push(scope.spawn(move || review_file(root, path, code, has_head, is_tracked)));
        }
        jobs.into_iter()
            .map(|job| {
                job.join()
                    .unwrap_or_else(|_| Err("生成 Git 差异失败".to_string()))
            })
            .collect::<Result<Vec<_>, _>>()
    })?;

    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    Ok(GitReviewReport {
        repo_root: context.root.to_string_lossy().to_string(),
        branch,
        base_ref,
        additions,
        deletions,
        files,
    })
}

pub fn load_worktree_file(
    request: &GitProjectRequest,
    path: &str,
) -> Result<GitWorktreeFileContent, String> {
    let (context, file_path) = editable_worktree_file(request, path)?;
    let metadata = std::fs::metadata(&file_path)
        .map_err(|error| format!("读取文件信息失败 {}：{error}", file_path.display()))?;
    if metadata.len() > MAX_WORKTREE_EDITOR_BYTES as u64 {
        return Err(format!(
            "文件超过内置编辑器的 16 MiB 限制：{}",
            file_path.display()
        ));
    }
    let current_content = std::fs::read_to_string(&file_path)
        .map_err(|error| format!("读取工作区文件失败 {}：{error}", file_path.display()))?;
    let original_content = if git_success(&context.root, &["rev-parse", "--verify", "HEAD"]).is_ok()
        && git_success(&context.root, &["ls-files", "--error-unmatch", "--", path]).is_ok()
    {
        git_raw_text(&context.root, &["show".to_string(), format!("HEAD:{path}")])?
    } else {
        String::new()
    };
    Ok(GitWorktreeFileContent {
        path: path.to_string(),
        original_content,
        current_content,
    })
}

pub fn save_worktree_file(
    request: &GitProjectRequest,
    path: &str,
    content: &str,
) -> Result<(), String> {
    if content.len() > MAX_WORKTREE_EDITOR_BYTES {
        return Err("文件超过内置编辑器的 16 MiB 限制".to_string());
    }
    let document = serde_json::from_str::<Value>(content)
        .map_err(|error| format!("JSON 格式错误，未保存：{error}"))?;
    if !document.is_object() {
        return Err("配置根节点必须是 JSON 对象，未保存".to_string());
    }
    let (_, file_path) = editable_worktree_file(request, path)?;
    std::fs::write(&file_path, content)
        .map_err(|error| format!("保存工作区文件失败 {}：{error}", file_path.display()))
}

fn editable_worktree_file(
    request: &GitProjectRequest,
    path: &str,
) -> Result<(RepositoryContext, PathBuf), String> {
    let context = discover_repository(request)?;
    if !context.managed_paths.iter().any(|managed| managed == path) {
        return Err("只能编辑当前项目明确受管的配置文件".to_string());
    }
    if !path_has_changes(&context.root, path) {
        return Err("只能编辑当前未提交状态的文件".to_string());
    }
    let file_path = context.root.join(path);
    if !file_path.is_file() {
        return Err(format!("工作区文件不存在或已删除：{}", file_path.display()));
    }
    Ok((context, file_path))
}

pub fn review_revision(
    request: &GitProjectRequest,
    revision: &str,
) -> Result<GitReviewReport, String> {
    validate_revision(revision)?;
    let context = discover_repository(request)?;
    let revision = revision_details(&context.root, revision)?;
    let parent = git_text(
        &context.root,
        &["rev-parse", &format!("{}^", revision.hash)],
    )
    .ok();
    let base = parent
        .as_deref()
        .unwrap_or("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    let statuses =
        revision_path_statuses(&context.root, base, &revision.hash, &context.managed_paths)?;
    let files = std::thread::scope(|scope| {
        let root = &context.root;
        let revision_hash = &revision.hash;
        let mut jobs = Vec::new();
        for path in &context.managed_paths {
            let Some(status) = statuses.get(path) else {
                continue;
            };
            jobs.push(scope.spawn(move || {
                let mut args = vec![
                    "diff".to_string(),
                    "--no-ext-diff".to_string(),
                    "--no-color".to_string(),
                    "--unified=3".to_string(),
                    base.to_string(),
                    revision_hash.to_string(),
                    "--".to_string(),
                    path.clone(),
                ];
                let diff = git_raw_text_owned(root, &mut args)?;
                Ok(parse_unified_diff(path, status, &diff))
            }));
        }
        jobs.into_iter()
            .map(|job| {
                job.join()
                    .unwrap_or_else(|_| Err("生成历史版本差异失败".to_string()))
            })
            .collect::<Result<Vec<_>, _>>()
    })?;
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    Ok(GitReviewReport {
        repo_root: context.root.to_string_lossy().to_string(),
        branch: revision.short_hash,
        base_ref: Some(
            parent
                .map(|hash| hash.chars().take(7).collect())
                .unwrap_or_else(|| "空版本".to_string()),
        ),
        additions,
        deletions,
        files,
    })
}

fn review_file(
    root: &Path,
    path: &str,
    code: &str,
    has_head: bool,
    is_tracked: bool,
) -> Result<GitReviewFile, String> {
    let file_path = root.join(path);
    if !has_head || !is_tracked {
        let content = std::fs::read_to_string(&file_path)
            .map_err(|error| format!("读取新增配置文件失败 {}：{error}", file_path.display()))?;
        return Ok(added_file_review(path, &content));
    }

    let args = vec![
        "diff".to_string(),
        "--no-ext-diff".to_string(),
        "--no-color".to_string(),
        "--unified=3".to_string(),
        "HEAD".to_string(),
        "--".to_string(),
        path.to_string(),
    ];
    let diff = git_raw_text(root, &args)?;
    Ok(parse_unified_diff(path, &status_name(code), &diff))
}

fn added_file_review(path: &str, content: &str) -> GitReviewFile {
    let lines: Vec<_> = content
        .lines()
        .enumerate()
        .map(|(index, content)| GitDiffLine {
            kind: "addition".to_string(),
            old_line: None,
            new_line: Some(index + 1),
            content: content.to_string(),
        })
        .collect();
    let additions = lines.len();
    GitReviewFile {
        path: path.to_string(),
        status: "added".to_string(),
        additions,
        deletions: 0,
        hunks: vec![GitDiffHunk {
            header: format!("@@ -0,0 +1,{additions} @@"),
            old_start: 0,
            new_start: 1,
            lines,
        }],
    }
}

fn parse_unified_diff(path: &str, status: &str, diff: &str) -> GitReviewFile {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<GitDiffHunk> = None;
    let mut old_line = 0usize;
    let mut new_line = 0usize;
    let mut additions = 0usize;
    let mut deletions = 0usize;

    for line in diff.lines() {
        if line.starts_with("@@ ") {
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            let (old_start, new_start) = parse_hunk_starts(line);
            old_line = old_start;
            new_line = new_start;
            current_hunk = Some(GitDiffHunk {
                header: line.to_string(),
                old_start,
                new_start,
                lines: Vec::new(),
            });
            continue;
        }

        let Some(hunk) = current_hunk.as_mut() else {
            continue;
        };
        if line.starts_with("\\ No newline at end of file") {
            continue;
        }

        let (kind, line_old, line_new, content) = if let Some(content) = line.strip_prefix('+') {
            let current = new_line;
            new_line += 1;
            additions += 1;
            ("addition", None, Some(current), content)
        } else if let Some(content) = line.strip_prefix('-') {
            let current = old_line;
            old_line += 1;
            deletions += 1;
            ("deletion", Some(current), None, content)
        } else {
            let content = line.strip_prefix(' ').unwrap_or(line);
            let current_old = old_line;
            let current_new = new_line;
            old_line += 1;
            new_line += 1;
            ("context", Some(current_old), Some(current_new), content)
        };
        hunk.lines.push(GitDiffLine {
            kind: kind.to_string(),
            old_line: line_old,
            new_line: line_new,
            content: content.to_string(),
        });
    }
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    GitReviewFile {
        path: path.to_string(),
        status: status.to_string(),
        additions,
        deletions,
        hunks,
    }
}

fn parse_hunk_starts(header: &str) -> (usize, usize) {
    let mut parts = header.split_whitespace();
    let _marker = parts.next();
    let old_start = parts
        .next()
        .and_then(|part| part.trim_start_matches('-').split(',').next())
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let new_start = parts
        .next()
        .and_then(|part| part.trim_start_matches('+').split(',').next())
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    (old_start, new_start)
}

fn status_name(code: &str) -> String {
    if code.contains('D') {
        "deleted".to_string()
    } else if code.contains('A') || code == "??" {
        "added".to_string()
    } else {
        "modified".to_string()
    }
}

fn discover_repository(request: &GitProjectRequest) -> Result<RepositoryContext, String> {
    let project_path = canonical_existing_file(&request.project_path)?;
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "无法确定项目文件所在目录".to_string())?;
    let root =
        find_repository_root(project_dir).ok_or_else(|| "项目路径不在 Git 仓库中".to_string())?;
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

fn find_repository_root(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|directory| directory.join(".git").exists())
        .map(Path::to_path_buf)
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

fn project_metadata(root: &Path) -> Result<ProjectMetadata, String> {
    let output = git_text(
        root,
        &[
            "log",
            "-1",
            "--decorate=short",
            "--format=%H%x1f%h%x1f%s%x1f%D",
        ],
    )?;
    let mut fields = output.splitn(4, '\x1f');
    let head_hash = non_empty(fields.next());
    let head_short_hash = non_empty(fields.next());
    let head_subject = non_empty(fields.next());
    let decorations = fields.next().unwrap_or_default();
    let branch = decorations
        .split(", ")
        .find_map(|decoration| decoration.strip_prefix("HEAD -> "))
        .map(str::to_string)
        .or_else(|| head_hash.as_ref().map(|_| "HEAD (detached)".to_string()));
    Ok(ProjectMetadata {
        branch,
        head_hash,
        head_short_hash,
        head_subject,
    })
}

fn managed_path_statuses(root: &Path, paths: &[String]) -> Result<HashMap<String, String>, String> {
    let mut args = vec![
        "status".to_string(),
        "--porcelain=v1".to_string(),
        "-z".to_string(),
        "--untracked-files=all".to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    let output = git_raw_text(root, &args)?;
    let managed: HashSet<_> = paths.iter().map(String::as_str).collect();
    let mut statuses = HashMap::new();
    let mut records = output.split('\0');
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let code = &record[..2];
        let path = &record[3..];
        if managed.contains(path) {
            statuses.insert(path.to_string(), code.to_string());
        }
        if code.contains('R') || code.contains('C') {
            let _ = records.next();
        }
    }
    Ok(statuses)
}

fn revision_path_statuses(
    root: &Path,
    base: &str,
    revision: &str,
    paths: &[String],
) -> Result<HashMap<String, String>, String> {
    let mut args = vec![
        "diff".to_string(),
        "--name-status".to_string(),
        "-z".to_string(),
        base.to_string(),
        revision.to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    let output = git_raw_text(root, &args)?;
    let mut records = output.split('\0');
    let mut statuses = HashMap::new();
    while let Some(code) = records.next() {
        if code.is_empty() {
            continue;
        }
        let Some(path) = records.next() else {
            break;
        };
        let status = match code.chars().next() {
            Some('A') => "added",
            Some('D') => "deleted",
            _ => "modified",
        };
        if code.starts_with('R') || code.starts_with('C') {
            if let Some(new_path) = records.next() {
                statuses.insert(new_path.to_string(), status.to_string());
            }
        } else {
            statuses.insert(path.to_string(), status.to_string());
        }
    }
    Ok(statuses)
}

fn tracked_paths(root: &Path, paths: &[String]) -> Result<HashSet<String>, String> {
    let mut args = vec!["ls-files".to_string(), "-z".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    Ok(git_raw_text(root, &args)?
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect())
}

fn tracked_change_stats(root: &Path, paths: &[String]) -> (usize, usize) {
    let mut additions = 0;
    let mut deletions = 0;

    let mut args = vec![
        "diff".to_string(),
        "--numstat".to_string(),
        "HEAD".to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    if let Ok(output) = git_text_owned(root, &args) {
        for line in output.lines() {
            let mut fields = line.split('\t');
            additions += fields
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            deletions += fields
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
    }

    (additions, deletions)
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

fn git_raw_text_owned(root: &Path, args: &mut [String]) -> Result<String, String> {
    git_raw_text(root, args)
}

fn git_raw_text(root: &Path, args: &[String]) -> Result<String, String> {
    let refs: Vec<_> = args.iter().map(String::as_str).collect();
    let output = git_output(root, &refs)?;
    if !output.status.success() {
        return Err(git_error(&output));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
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
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    #[test]
    #[ignore = "requires JC_GIT_BENCH_PROJECT pointing to a real .jcpro file"]
    fn benchmarks_real_project_context() {
        let project_path = std::env::var("JC_GIT_BENCH_PROJECT")
            .expect("JC_GIT_BENCH_PROJECT must point to a real .jcpro file");
        let sidecar_path = std::env::var("JC_GIT_BENCH_SIDECAR").ok();
        let request = GitProjectRequest {
            project_path,
            sidecar_path,
        };
        let _ = load_project_context(&request, 20);
        let samples: Vec<_> = (0..10)
            .map(|_| {
                let started = Instant::now();
                let context = load_project_context(&request, 20);
                assert!(context.status.available, "{:?}", context.status.warning);
                started.elapsed()
            })
            .collect();
        let total: std::time::Duration = samples.iter().sum();
        println!(
            "project Git context: min={:?}, avg={:?}, max={:?}",
            samples.iter().min().unwrap(),
            total / samples.len() as u32,
            samples.iter().max().unwrap()
        );
        let context = load_project_context(&request, 20);
        if let Some(revision) = context.revisions.first() {
            let started = Instant::now();
            let review = review_revision(&request, &revision.hash).unwrap();
            println!(
                "historical review {}: {:?}, {} managed files",
                revision.short_hash,
                started.elapsed(),
                review.files.len()
            );
        }
    }

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
        let status = inspect_project(&GitProjectRequest {
            project_path: request.project_path.clone(),
            sidecar_path: request.sidecar_path.clone(),
        });
        assert_eq!(status.additions, 2);
        assert_eq!(status.deletions, 1);
        let review = review_project(&GitProjectRequest {
            project_path: request.project_path.clone(),
            sidecar_path: request.sidecar_path.clone(),
        })
        .unwrap();
        assert_eq!(review.files.len(), 2);
        assert_eq!(review.additions, 2);
        assert_eq!(review.deletions, 1);
        assert_eq!(review.files[0].hunks[0].lines[0].kind, "deletion");
        assert_eq!(review.files[0].hunks[0].lines[1].kind, "addition");
        assert_eq!(review.files[1].status, "added");
        assert_eq!(review.files[1].hunks[0].lines[0].new_line, Some(1));
        let report = commit_project(&request).unwrap();
        assert_eq!(
            report.committed_paths,
            vec!["meter.jcpro", "meter.refactor-config.json"]
        );
        assert!(path_has_changes(&root, "notes.txt"));
        let historical_review = review_revision(
            &GitProjectRequest {
                project_path: request.project_path.clone(),
                sidecar_path: request.sidecar_path.clone(),
            },
            &report.hash,
        )
        .unwrap();
        assert_eq!(historical_review.files.len(), 2);
        assert_eq!(historical_review.additions, 2);
        assert_eq!(historical_review.deletions, 1);

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

    #[test]
    fn edits_only_changed_managed_worktree_json_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("jc-git-editor-test-{unique}"));
        fs::create_dir_all(&root).unwrap();
        git_success(&root, &["init"]).unwrap();
        git_success(&root, &["config", "user.name", "JC Test"]).unwrap();
        git_success(&root, &["config", "user.email", "jc@example.invalid"]).unwrap();

        let project = root.join("meter.jcpro");
        let unrelated = root.join("notes.json");
        fs::write(&project, r#"{"config_version":"v1"}"#).unwrap();
        fs::write(&unrelated, r#"{"note":"initial"}"#).unwrap();
        git_success(&root, &["add", "--", "meter.jcpro", "notes.json"]).unwrap();
        git_success(&root, &["commit", "-m", "initial"]).unwrap();
        fs::write(&project, r#"{"config_version":"v2"}"#).unwrap();
        fs::write(&unrelated, r#"{"note":"changed"}"#).unwrap();

        let request = GitProjectRequest {
            project_path: project.to_string_lossy().to_string(),
            sidecar_path: None,
        };
        let content = load_worktree_file(&request, "meter.jcpro").unwrap();
        assert!(content.original_content.contains("v1"));
        assert!(content.current_content.contains("v2"));
        save_worktree_file(&request, "meter.jcpro", r#"{"config_version":"v3"}"#).unwrap();
        assert!(fs::read_to_string(&project).unwrap().contains("v3"));

        let invalid = save_worktree_file(&request, "meter.jcpro", "not json").unwrap_err();
        assert!(invalid.contains("JSON 格式错误"));
        assert!(fs::read_to_string(&project).unwrap().contains("v3"));

        let unmanaged = load_worktree_file(&request, "notes.json").unwrap_err();
        assert!(unmanaged.contains("明确受管"));

        save_worktree_file(&request, "meter.jcpro", r#"{"config_version":"v1"}"#).unwrap();
        let unchanged = load_worktree_file(&request, "meter.jcpro").unwrap_err();
        assert!(unchanged.contains("未提交状态"));

        fs::remove_dir_all(root).unwrap();
    }
}

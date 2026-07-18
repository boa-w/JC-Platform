//! Project recovery drafts stored outside the WebView browser quota.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const RECOVERY_DIRECTORY: &str = "recovery";
const RECOVERY_FILE: &str = "project-draft.json";
const RECOVERY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecoveryDraft {
    pub schema_version: u32,
    pub project_path: String,
    pub project_name: String,
    pub saved_at: String,
    pub document: Value,
}

fn draft_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RECOVERY_DIRECTORY).join(RECOVERY_FILE)
}

fn validate_draft(draft: ProjectRecoveryDraft) -> Result<ProjectRecoveryDraft, String> {
    if draft.schema_version != RECOVERY_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported recovery draft version: {}.",
            draft.schema_version
        ));
    }
    if draft.project_path.trim().is_empty() {
        return Err("Recovery draft project path is empty.".to_string());
    }
    Ok(draft)
}

pub fn load_project_recovery_draft(
    app_data_dir: &Path,
) -> Result<Option<ProjectRecoveryDraft>, String> {
    let path = draft_path(app_data_dir);
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read recovery draft: {error}")),
    };
    let draft = serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse recovery draft: {error}"))?;
    validate_draft(draft).map(Some)
}

pub fn save_project_recovery_draft(
    app_data_dir: &Path,
    draft: ProjectRecoveryDraft,
) -> Result<(), String> {
    let draft = validate_draft(draft)?;
    let path = draft_path(app_data_dir);
    let parent = path
        .parent()
        .ok_or_else(|| "Recovery draft directory is unavailable.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create recovery draft directory: {error}"))?;
    let content = serde_json::to_vec(&draft)
        .map_err(|error| format!("Failed to serialize recovery draft: {error}"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Failed to create temporary recovery draft: {error}"))?;
    temporary
        .write_all(&content)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Failed to write temporary recovery draft: {error}"))?;
    temporary
        .persist(path)
        .map_err(|error| format!("Failed to replace recovery draft: {}", error.error))?;
    Ok(())
}

pub fn clear_project_recovery_draft(
    app_data_dir: &Path,
    project_path: Option<&str>,
) -> Result<bool, String> {
    let path = draft_path(app_data_dir);
    if let Some(expected_path) = project_path {
        let Some(stored) = load_project_recovery_draft(app_data_dir)? else {
            return Ok(false);
        };
        if !same_project_path(&stored.project_path, expected_path) {
            return Ok(false);
        }
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("Failed to remove recovery draft: {error}")),
    }
}

fn same_project_path(left: &str, right: &str) -> bool {
    let left = left.trim().replace('\\', "/");
    let right = right.trim().replace('\\', "/");
    let windows_path = left.get(1..3) == Some(":/") || left.starts_with("//");
    if windows_path {
        left.eq_ignore_ascii_case(&right)
    } else {
        left == right
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "jc-platform-recovery-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ))
    }

    fn sample_draft(path: &str) -> ProjectRecoveryDraft {
        ProjectRecoveryDraft {
            schema_version: 1,
            project_path: path.to_string(),
            project_name: "Meter".to_string(),
            saved_at: "2026-07-18T00:00:00.000Z".to_string(),
            document: json!({ "project": { "name": "Meter" } }),
        }
    }

    #[test]
    fn round_trips_and_selectively_clears_a_draft() {
        let root = test_root();
        save_project_recovery_draft(&root, sample_draft("D:\\Projects\\Meter.jcpro"))
            .expect("draft should save");

        let loaded = load_project_recovery_draft(&root)
            .expect("draft should load")
            .expect("draft should exist");
        assert_eq!(loaded.project_name, "Meter");

        let mut updated = sample_draft("D:\\Projects\\Meter.jcpro");
        updated.project_name = "Meter 2".to_string();
        save_project_recovery_draft(&root, updated).expect("draft should replace atomically");
        assert_eq!(
            load_project_recovery_draft(&root)
                .expect("updated draft should load")
                .expect("updated draft should exist")
                .project_name,
            "Meter 2"
        );
        assert!(
            !clear_project_recovery_draft(&root, Some("D:/Projects/Other.jcpro"))
                .expect("mismatched clear should not fail")
        );
        assert!(
            clear_project_recovery_draft(&root, Some("d:/projects/meter.jcpro"))
                .expect("matching draft should clear")
        );
        assert!(load_project_recovery_draft(&root)
            .expect("missing draft should not fail")
            .is_none());
        fs::remove_dir_all(root).expect("test directory should clear");
    }

    #[test]
    fn rejects_invalid_schema_versions() {
        let root = test_root();
        let mut draft = sample_draft("D:/Projects/Meter.jcpro");
        draft.schema_version = 2;
        let error = save_project_recovery_draft(&root, draft).expect_err("version should fail");
        assert!(error.contains("Unsupported recovery draft version"));
    }
}

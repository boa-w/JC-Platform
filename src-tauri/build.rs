use std::path::Path;
use std::process::Command;

fn main() {
    emit_git_commit_hash();
    tauri_build::build();
}

fn emit_git_commit_hash() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let repo_root = Path::new(&manifest_dir)
        .parent()
        .unwrap_or_else(|| Path::new(&manifest_dir));

    println!(
        "cargo:rerun-if-changed={}",
        repo_root.join(".git/HEAD").display()
    );
    emit_git_ref_rerun_hint(repo_root);

    let commit_hash = Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .current_dir(repo_root)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|hash| hash.trim().to_string())
        .filter(|hash| !hash.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=JC_GIT_COMMIT_HASH={commit_hash}");
}

fn emit_git_ref_rerun_hint(repo_root: &Path) {
    let head_path = repo_root.join(".git/HEAD");
    let Ok(head) = std::fs::read_to_string(&head_path) else {
        return;
    };

    let Some(ref_path) = head.strip_prefix("ref: ").map(str::trim) else {
        return;
    };

    println!(
        "cargo:rerun-if-changed={}",
        repo_root.join(".git").join(ref_path).display()
    );
}

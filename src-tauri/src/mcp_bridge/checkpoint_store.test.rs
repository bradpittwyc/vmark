//! Tests for `checkpoint_store.rs` — creation, permissions and size reporting
//! for the MCP checkpoint file. The command wrapper only resolves app data and
//! joins a fixed name, so the behaviour lives in `ensure_private_file`.

use super::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn creates_the_file_when_absent_and_reports_its_size() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("mcp-checkpoints.jsonl");

    assert_eq!(ensure_private_file(&path).unwrap(), 0);
    assert!(path.exists());

    fs::write(&path, "12345").unwrap();
    assert_eq!(ensure_private_file(&path).unwrap(), 5);
}

#[test]
fn creates_missing_parent_directories() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("nested").join("mcp-checkpoints.jsonl");

    ensure_private_file(&path).unwrap();

    assert!(path.exists());
}

#[test]
fn an_append_never_truncates_existing_history() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("mcp-checkpoints.jsonl");
    fs::write(&path, "line\n").unwrap();

    ensure_private_file(&path).unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "line\n");
}

#[cfg(unix)]
#[test]
fn a_new_file_is_created_owner_only() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempdir().unwrap();
    let path = dir.path().join("mcp-checkpoints.jsonl");

    ensure_private_file(&path).unwrap();

    let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(
        mode, 0o600,
        "the checkpoint log must not be group/world readable"
    );
}

#[cfg(unix)]
#[test]
fn an_existing_wider_file_is_tightened() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempdir().unwrap();
    let path = dir.path().join("mcp-checkpoints.jsonl");
    fs::write(&path, "x").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

    ensure_private_file(&path).unwrap();

    let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

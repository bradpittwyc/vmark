//! MCP checkpoint store — the app-data file behind the edit-checkpoint history.
//!
//! Purpose: own the security posture of `mcp-checkpoints.jsonl`, which the
//! frontend writes through the fs plugin. The frontend owns the JSONL format and
//! retention; this module makes sure the file exists at a path the caller cannot
//! choose, and that it is `0600` on Unix before the first line is appended.
//!
//! Key decisions:
//!   - The command takes no path. The only path it can touch is the app-data
//!     directory joined with the fixed file name, so a compromised webview
//!     cannot use it to chmod or create arbitrary files.
//!   - An existing file left wider by an older release is tightened on the
//!     first call of every session, not only when the file is created.
//!   - `0600` matches the other app-data files (`mcp-port`, workspace configs).
//!     On Windows the app-data directory's ACL is the boundary; there is no
//!     Unix mode to set.
//!
//! @coordinates-with stores/mcpCheckpointPersistence.ts — the writer; the file
//!   name here and `FILE_NAME` there must stay identical
//! @module mcp_bridge/checkpoint_store

use std::io;
use std::path::Path;

use serde::Serialize;

use crate::command_error::CommandError;

/// File name under the app-data directory. Must match `FILE_NAME` in
/// `src/stores/mcpCheckpointPersistence.ts`.
pub(super) const CHECKPOINT_FILE: &str = "mcp-checkpoints.jsonl";

/// Where the checkpoint log lives and how large it currently is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointStoreInfo {
    pub path: String,
    pub size_bytes: u64,
}

/// Create the checkpoint file if needed, make it owner-only, and report where
/// it is and how large it is.
///
/// # Errors
/// `io` when the directory or file cannot be created, opened or inspected.
#[tauri::command]
pub async fn mcp_checkpoint_store_init<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<CheckpointStoreInfo, CommandError> {
    let dir = crate::app_paths::app_data_dir(&app).map_err(CommandError::internal)?;
    let path = dir.join(CHECKPOINT_FILE);
    let size_bytes = ensure_private_file(&path)
        .map_err(|e| CommandError::io(format!("cannot prepare checkpoint store: {e}")))?;
    Ok(CheckpointStoreInfo {
        path: path.to_string_lossy().into_owned(),
        size_bytes,
    })
}

/// Open (creating if needed) `path` in append mode, set its mode to `0600` on
/// Unix, and return its current length. Append mode is load-bearing: opening
/// without it would truncate the history this function exists to protect.
fn ensure_private_file(path: &Path) -> io::Result<u64> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // Applies only when this call creates the file; the set_permissions
        // below covers files an older release left at 0644.
        options.mode(0o600);
    }

    let file = options.open(path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(file.metadata()?.len())
}

#[cfg(test)]
#[path = "checkpoint_store.test.rs"]
mod tests;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncEvent {
    Started {
        timestamp: String,
    },
    Progress {
        source: SyncSource,
        status: ProgressStatus,
        message: String,
    },
    SourceCompleted {
        source: SyncSource,
        new_events: usize,
        updated_events: usize,
    },
    Completed {
        total_new: usize,
        total_updated: usize,
        duration_ms: u128,
    },
    Failed {
        source: Option<SyncSource>,
        error: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncSource {
    Calendar,
    Git,
    Browser,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProgressStatus {
    Starting,
    InProgress,
    Completed,
    Failed,
}

pub fn emit_sync_event(app: &AppHandle, event: SyncEvent) {
    if let Err(e) = app.emit("sync-event", &event) {
        eprintln!("Failed to emit sync event: {}", e);
    }
}

pub fn emit_sync_started(app: &AppHandle) {
    emit_sync_event(
        app,
        SyncEvent::Started {
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    );
}

pub fn emit_sync_progress(
    app: &AppHandle,
    source: SyncSource,
    status: ProgressStatus,
    message: String,
) {
    emit_sync_event(
        app,
        SyncEvent::Progress {
            source,
            status,
            message,
        },
    );
}

pub fn emit_source_completed(
    app: &AppHandle,
    source: SyncSource,
    new_events: usize,
    updated_events: usize,
) {
    emit_sync_event(
        app,
        SyncEvent::SourceCompleted {
            source,
            new_events,
            updated_events,
        },
    );
}

pub fn emit_sync_completed(
    app: &AppHandle,
    total_new: usize,
    total_updated: usize,
    duration_ms: u128,
) {
    emit_sync_event(
        app,
        SyncEvent::Completed {
            total_new,
            total_updated,
            duration_ms,
        },
    );
}

pub fn emit_sync_failed(app: &AppHandle, source: Option<SyncSource>, error: String) {
    emit_sync_event(app, SyncEvent::Failed { source, error });
}

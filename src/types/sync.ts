// Sync event types - must match Rust definitions in sync_events.rs

export type SyncSource = "calendar" | "git" | "browser";

export type ProgressStatus =
  | "starting"
  | "in_progress"
  | "completed"
  | "failed";

export type SyncEvent =
  | { type: "started"; timestamp: string }
  | {
      type: "progress";
      source: SyncSource;
      status: ProgressStatus;
      message: string;
    }
  | {
      type: "source_completed";
      source: SyncSource;
      new_events: number;
      updated_events: number;
    }
  | {
      type: "completed";
      total_new: number;
      total_updated: number;
      duration_ms: number;
    }
  | { type: "cancelled" }
  | {
      type: "failed";
      source?: SyncSource;
      error: string;
    };

export interface SyncState {
  inProgress: boolean;
  lastSyncTime: string | null;
  currentSource: SyncSource | null;
  progress: Map<
    SyncSource,
    { new: number; updated: number; status: ProgressStatus }
  >;
  errors: Array<{ source?: SyncSource; error: string }>;
}

export const initialSyncState: SyncState = {
  inProgress: false,
  lastSyncTime: null,
  currentSource: null,
  progress: new Map(),
  errors: [],
};

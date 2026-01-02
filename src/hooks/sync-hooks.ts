import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SyncEvent, SyncState, initialSyncState } from "@/types/sync";
import type { CalendarPermissionStatus } from "@/types/event";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const FOCUS_DEBOUNCE_MS = 500;
const MIN_SYNC_INTERVAL_MS = 10 * 1000;

/**
 * Hook to manage sync state and trigger syncs.
 * Listens to sync events and maintains sync state.
 */
export function useSyncManager() {
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<SyncEvent>("sync-event", (event) => {
        const payload = event.payload;

        switch (payload.type) {
          case "started":
            setSyncState((prev) => ({
              ...prev,
              inProgress: true,
              errors: [],
              progress: new Map(),
            }));
            break;

          case "progress":
            setSyncState((prev) => ({
              ...prev,
              currentSource: payload.source,
            }));
            break;

          case "source_completed":
            setSyncState((prev) => {
              const newProgress = new Map(prev.progress);
              newProgress.set(payload.source, {
                new: payload.new_events,
                updated: payload.updated_events,
                status: "completed",
              });
              return { ...prev, progress: newProgress };
            });
            break;

          case "completed":
            setSyncState((prev) => ({
              ...prev,
              inProgress: false,
              lastSyncTime: new Date().toISOString(),
              currentSource: null,
            }));
            break;

          case "failed":
            setSyncState((prev) => ({
              ...prev,
              inProgress: false,
              errors: [
                ...prev.errors,
                { source: payload.source, error: payload.error },
              ],
            }));
            break;
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      await invoke("sync_all_sources");
    } catch (error) {
      console.error("Failed to trigger sync:", error);
      setSyncState((prev) => ({
        ...prev,
        inProgress: false,
        errors: [
          ...prev.errors,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      }));
    }
  }, []);

  return { syncState, triggerSync };
}

/**
 * Hook to listen for sync completion and call a callback.
 * Useful for refetching data when sync completes.
 */
export function useSyncComplete(onComplete: () => void) {
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen("sync-event", (event) => {
        const payload = event.payload as { type: string };
        if (payload.type === "completed") {
          onComplete();
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [onComplete]);
}

/**
 * Hook to manage auto-sync behavior.
 * Handles calendar permissions, triggers syncs on startup/interval/focus,
 * and exposes sync state and manual trigger.
 */
export function useAutoSync() {
  const [permissionStatus, setPermissionStatus] =
    useState<CalendarPermissionStatus>("NotDetermined");
  const [isChecking, setIsChecking] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const focusDebounceRef = useRef<number | null>(null);
  const lastSyncAttemptRef = useRef<number>(0);

  const { syncState, triggerSync } = useSyncManager();
  const syncStateRef = useRef(syncState);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const performSync = useCallback(
    async (source: string) => {
      const now = Date.now();
      const timeSinceLastAttempt = now - lastSyncAttemptRef.current;

      if (timeSinceLastAttempt < MIN_SYNC_INTERVAL_MS) {
        console.log(`Skipping ${source} sync - too soon since last attempt`);
        return;
      }

      if (syncStateRef.current.inProgress) {
        console.log(`Skipping ${source} sync - sync already in progress`);
        return;
      }

      lastSyncAttemptRef.current = now;
      console.log(`Triggering ${source} sync...`);
      await triggerSync();
    },
    [triggerSync]
  );

  const checkPermission = useCallback(async () => {
    try {
      const status = await invoke<CalendarPermissionStatus>(
        "check_calendar_permission_status"
      );
      setPermissionStatus(status);
      return status;
    } catch (err) {
      console.error("Error checking calendar permission:", err);
      setPermissionStatus("NotDetermined");
      return "NotDetermined";
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      const status = await checkPermission();

      if (status !== "FullAccess") {
        console.log("Calendar permission not granted, auto-sync disabled");
        return;
      }

      await performSync("startup");

      intervalRef.current = window.setInterval(() => {
        performSync("interval");
      }, SYNC_INTERVAL_MS);

      const appWindow = getCurrentWindow();
      const unlisten = await appWindow.onFocusChanged(
        ({ payload: focused }) => {
          if (!focused) return;

          if (focusDebounceRef.current) {
            window.clearTimeout(focusDebounceRef.current);
          }

          focusDebounceRef.current = window.setTimeout(() => {
            performSync("focus");
            focusDebounceRef.current = null;
          }, FOCUS_DEBOUNCE_MS);
        }
      );

      return () => {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (focusDebounceRef.current) {
          window.clearTimeout(focusDebounceRef.current);
          focusDebounceRef.current = null;
        }
        unlisten();
      };
    }

    const cleanup = initialize();
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [checkPermission, performSync]);

  return {
    permissionStatus,
    isChecking,
    syncState,
    triggerSync,
  };
}

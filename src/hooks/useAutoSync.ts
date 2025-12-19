import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CalendarPermissionStatus, SyncStatus } from "../types/event";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FOCUS_DEBOUNCE_MS = 500; // Debounce window focus events

export function useAutoSync() {
  const [permissionStatus, setPermissionStatus] =
    useState<CalendarPermissionStatus>("NotDetermined");
  const [isChecking, setIsChecking] = useState(true);
  const [syncCounter, setSyncCounter] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const focusDebounceRef = useRef<number | null>(null);
  const lastSyncAttemptRef = useRef<number>(0);

  // Check if sync is already in progress to prevent duplicates
  async function canSync(): Promise<boolean> {
    try {
      const status = await invoke<SyncStatus>("get_sync_status");
      return !status.sync_in_progress;
    } catch (err) {
      console.error("Error checking sync status:", err);
      return false;
    }
  }

  // Perform the actual sync
  async function performSync(source: string) {
    const now = Date.now();
    const timeSinceLastAttempt = now - lastSyncAttemptRef.current;

    // Prevent syncs within 10 seconds of each other
    if (timeSinceLastAttempt < 10000) {
      console.log(`Skipping ${source} sync - too soon since last attempt`);
      return;
    }

    if (!(await canSync())) {
      console.log(`Skipping ${source} sync - sync already in progress`);
      return;
    }

    lastSyncAttemptRef.current = now;

    try {
      console.log(`Triggering ${source} sync...`);
      await invoke("sync_all_sources");
      console.log(`${source} sync completed`);
      setSyncCounter((c) => c + 1); // Increment to trigger re-renders
    } catch (err) {
      console.error(`Error during ${source} sync:`, err);
    }
  }

  // Check permission status
  async function checkPermission() {
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
  }

  useEffect(() => {
    // Initial permission check and setup
    async function initialize() {
      const status = await checkPermission();

      // Only set up auto-sync if we have full access
      if (status !== "FullAccess") {
        console.log("Calendar permission not granted, auto-sync disabled");
        return;
      }

      // Trigger initial sync on startup
      await performSync("startup");

      // Set up 15-minute interval sync
      intervalRef.current = window.setInterval(() => {
        performSync("interval");
      }, SYNC_INTERVAL_MS);

      // Set up window focus listener
      const appWindow = getCurrentWindow();
      const unlisten = await appWindow.onFocusChanged(
        ({ payload: focused }) => {
          if (!focused) return;

          // Debounce focus events
          if (focusDebounceRef.current) {
            window.clearTimeout(focusDebounceRef.current);
          }

          focusDebounceRef.current = window.setTimeout(() => {
            performSync("focus");
            focusDebounceRef.current = null;
          }, FOCUS_DEBOUNCE_MS);
        }
      );

      // Cleanup function
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
  }, []);

  return {
    permissionStatus,
    isChecking,
    syncCounter, // Used to trigger re-renders in child components
  };
}

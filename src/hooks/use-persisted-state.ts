import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadValue() {
      try {
        const stored = await invoke<string | null>("get_setting", { key });
        if (stored !== null) {
          setValue(JSON.parse(stored));
        }
      } catch (err) {
        console.error(`Error loading setting ${key}:`, err);
      } finally {
        setIsLoaded(true);
      }
    }
    loadValue();
  }, [key]);

  const persistValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      if (isLoaded) {
        invoke("set_setting", {
          key,
          value: JSON.stringify(newValue),
        }).catch((err) => {
          console.error(`Error saving setting ${key}:`, err);
        });
      }
    },
    [key, isLoaded]
  );

  return [value, persistValue, isLoaded];
}

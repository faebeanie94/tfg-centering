import { useCallback, useEffect, useState } from 'react';

export interface AppSettings {
  handleColor: string;
  borderFillColor: string;
  outerEdgeColor: string;
  autoCapture: boolean;
  levelIndicators: boolean;
  autoCaptureDelayMs: number;
}

const STORAGE_KEY = 'tfg-centering-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  handleColor: '#facc15',
  borderFillColor: '#22c55e',
  outerEdgeColor: '#22c55e',
  autoCapture: true,
  levelIndicators: true,
  autoCaptureDelayMs: 1500,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSettings, resetSettings };
}

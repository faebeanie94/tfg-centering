import { useCallback, useEffect, useState } from 'react';

export interface AppSettings {
  handleColor: string;
  borderFillColor: string;
  outerEdgeColor: string;
  autoCapture: boolean;
  levelIndicators: boolean;
  autoCaptureDelayMs: number;
  torchEnabled: boolean;
  macroMode: boolean;
  /** Phone-to-card distance the scanner guide is calibrated for (cm). */
  scanDistanceCm: 12 | 20 | 30;
  /** Bottom of frame blocked by phone stand (0.2 = small, 0.32 = typical, 0.45 = large). */
  scanObstructionBottom: number;
  /** Display-only negative view while aligning borders. */
  invertColors: boolean;
}

const STORAGE_KEY = 'tfg-centering-settings';

export const SCAN_OBSTRUCTION_OPTIONS = [
  { label: 'None', value: 0 },
  { label: 'Small stand (~20%)', value: 0.2 },
  { label: 'Phone on box (~32%)', value: 0.32 },
  { label: 'Large stand (~45%)', value: 0.45 },
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  handleColor: '#facc15',
  borderFillColor: '#78c285',
  outerEdgeColor: '#78c285',
  autoCapture: true,
  levelIndicators: true,
  autoCaptureDelayMs: 1500,
  torchEnabled: false,
  macroMode: false,
  scanDistanceCm: 20,
  scanObstructionBottom: 0.32,
  invertColors: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (![12, 20, 30].includes(parsed.scanDistanceCm)) parsed.scanDistanceCm = 20;
    if (typeof parsed.scanObstructionBottom !== 'number') parsed.scanObstructionBottom = 0.32;
    parsed.scanObstructionBottom = Math.max(0, Math.min(0.5, parsed.scanObstructionBottom));
    return parsed;
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

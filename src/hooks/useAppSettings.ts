import { useCallback, useEffect, useState } from 'react';
import {
  clampCardMm,
  DEFAULT_CARD_FORMAT_SETTING,
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
  isCardFormatSetting,
  type CardFormatSetting,
} from '../lib/card-sizes';

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
  /**
   * Physical card size for mm / warp / scanner guide.
   * `ask` = not selected → show post-capture picker only.
   */
  cardFormat: CardFormatSetting;
  /** Used when cardFormat is `custom`. */
  customWidthMm: number;
  customHeightMm: number;
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
  scanObstructionBottom: 0,
  invertColors: false,
  cardFormat: DEFAULT_CARD_FORMAT_SETTING,
  customWidthMm: DEFAULT_CUSTOM_WIDTH_MM,
  customHeightMm: DEFAULT_CUSTOM_HEIGHT_MM,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (![12, 20, 30].includes(parsed.scanDistanceCm)) parsed.scanDistanceCm = 20;
    if (typeof parsed.scanObstructionBottom !== 'number') parsed.scanObstructionBottom = 0;
    parsed.scanObstructionBottom = Math.max(0, Math.min(0.5, parsed.scanObstructionBottom));
    // Old default reserved the bottom third for a phone stand, which parked a
    // tiny dashed guide on the card. One-time reset of that shipped default.
    try {
      if (localStorage.getItem('tfg-guide-obstruction-v2') !== '1') {
        if (parsed.scanObstructionBottom === 0.32) parsed.scanObstructionBottom = 0;
        localStorage.setItem('tfg-guide-obstruction-v2', '1');
      }
    } catch {
      /* ignore */
    }
    if (!isCardFormatSetting(parsed.cardFormat)) parsed.cardFormat = DEFAULT_CARD_FORMAT_SETTING;
    parsed.customWidthMm = clampCardMm(Number(parsed.customWidthMm));
    parsed.customHeightMm = clampCardMm(Number(parsed.customHeightMm));
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

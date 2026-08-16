/** Physical trading-card formats used for absolute mm + aspect. */

/** Concrete size the user has chosen for a session or in settings. */
export type CardFormatId = 'pokemon' | 'sports' | 'yugioh' | 'custom';

/**
 * Settings value: a concrete format, or `ask` to prompt after each capture.
 * Post-capture picker only appears when settings use `ask`.
 */
export type CardFormatSetting = CardFormatId | 'ask';

export interface CardFormat {
  id: CardFormatId;
  label: string;
  /** Short label for banners / chips. */
  shortLabel: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

/**
 * Presets. Pokémon and modern sports cards share poker size;
 * Yu-Gi-Oh uses the smaller Japanese size.
 */
export const CARD_FORMAT_PRESETS: Record<Exclude<CardFormatId, 'custom'>, CardFormat> = {
  pokemon: {
    id: 'pokemon',
    label: 'Pokémon / standard TCG',
    shortLabel: 'Pokémon',
    widthMm: 63.5,
    heightMm: 88.9,
    description: '63.5 × 88.9 mm (2.5″ × 3.5″) — Pokémon, MTG, One Piece, etc.',
  },
  sports: {
    id: 'sports',
    label: 'Sports cards',
    shortLabel: 'Sports',
    widthMm: 63.5,
    heightMm: 88.9,
    description: '63.5 × 88.9 mm (2.5″ × 3.5″) — baseball, basketball, football, etc.',
  },
  yugioh: {
    id: 'yugioh',
    label: 'Yu-Gi-Oh!',
    shortLabel: 'Yu-Gi-Oh!',
    widthMm: 59,
    heightMm: 86,
    description: '59 × 86 mm (Japanese / small size)',
  },
};

export const CARD_FORMAT_PRESET_OPTIONS = Object.values(CARD_FORMAT_PRESETS);

/** Default when a concrete size is required but none was chosen yet (scanner guide). */
export const DEFAULT_CARD_FORMAT_ID: CardFormatId = 'pokemon';

/** New installs: ask after capture until the user sets a size in Settings. */
export const DEFAULT_CARD_FORMAT_SETTING: CardFormatSetting = 'ask';

export const DEFAULT_CUSTOM_WIDTH_MM = 63.5;
export const DEFAULT_CUSTOM_HEIGHT_MM = 88.9;

/** Reasonable bounds for custom manufactured card size (mm). */
export const CUSTOM_SIZE_MIN_MM = 40;
export const CUSTOM_SIZE_MAX_MM = 120;

export function isCardFormatId(value: unknown): value is CardFormatId {
  return value === 'pokemon' || value === 'sports' || value === 'yugioh' || value === 'custom';
}

export function isCardFormatSetting(value: unknown): value is CardFormatSetting {
  return value === 'ask' || isCardFormatId(value);
}

export function clampCardMm(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CUSTOM_WIDTH_MM;
  return Math.min(CUSTOM_SIZE_MAX_MM, Math.max(CUSTOM_SIZE_MIN_MM, Math.round(n * 10) / 10));
}

export interface CardSizeSelection {
  cardFormat: CardFormatId;
  customWidthMm?: number;
  customHeightMm?: number;
}

/** Resolve the effective physical size for mm / aspect calculations. */
export function resolveCardFormat(selection: CardSizeSelection): CardFormat {
  if (selection.cardFormat === 'custom') {
    const widthMm = clampCardMm(selection.customWidthMm ?? DEFAULT_CUSTOM_WIDTH_MM);
    const heightMm = clampCardMm(selection.customHeightMm ?? DEFAULT_CUSTOM_HEIGHT_MM);
    return {
      id: 'custom',
      label: 'Custom',
      shortLabel: 'Custom',
      widthMm,
      heightMm,
      description: `${widthMm} × ${heightMm} mm`,
    };
  }
  return CARD_FORMAT_PRESETS[selection.cardFormat] ?? CARD_FORMAT_PRESETS.pokemon;
}

/**
 * Size used while scanning / auto-cropping when Settings is `ask`
 * (no concrete size yet). Poker-size is the common case.
 */
export function fallbackCardFormatForDetection(
  customWidthMm?: number,
  customHeightMm?: number,
): CardFormat {
  return resolveCardFormat({
    cardFormat: DEFAULT_CARD_FORMAT_ID,
    customWidthMm,
    customHeightMm,
  });
}

export function cardAspect(format: CardFormat): number {
  return format.widthMm / Math.max(format.heightMm, 1e-9);
}

export function formatCardSizeMm(format: CardFormat): string {
  return `${format.widthMm}×${format.heightMm} mm`;
}

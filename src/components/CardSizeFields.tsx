import { useState } from 'react';
import {
  CARD_FORMAT_PRESET_OPTIONS,
  CUSTOM_SIZE_MAX_MM,
  CUSTOM_SIZE_MIN_MM,
  clampCardMm,
  formatCardSizeMm,
  resolveCardFormat,
  type CardFormatId,
  type CardFormatSetting,
  type CardSizeSelection,
} from '../lib/card-sizes';

export interface CardSizeFieldsValue {
  cardFormat: CardFormatSetting;
  customWidthMm: number;
  customHeightMm: number;
}

interface CardSizeFieldsProps {
  value: CardSizeFieldsValue;
  onChange: (patch: Partial<CardSizeFieldsValue>) => void;
  /** When true, include the “Ask after capture” option (Settings only). */
  allowAsk?: boolean;
  /** Compact layout for the post-capture screen. */
  compact?: boolean;
}

export function CardSizeFields({
  value,
  onChange,
  allowAsk = false,
  compact = false,
}: CardSizeFieldsProps) {
  const showCustom = value.cardFormat === 'custom';
  const preview =
    value.cardFormat !== 'ask'
      ? resolveCardFormat({
          cardFormat: value.cardFormat,
          customWidthMm: value.customWidthMm,
          customHeightMm: value.customHeightMm,
        })
      : null;

  return (
    <div className={`card-size-fields${compact ? ' compact' : ''}`}>
      <label className="settings-field">
        <span className="settings-field-label">Card size</span>
        <select
          className="settings-select"
          value={value.cardFormat}
          onChange={(e) => onChange({ cardFormat: e.target.value as CardFormatSetting })}
        >
          {allowAsk && <option value="ask">Ask after each photo</option>}
          {CARD_FORMAT_PRESET_OPTIONS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} ({formatCardSizeMm(preset)})
            </option>
          ))}
          <option value="custom">Custom size…</option>
        </select>
      </label>

      {showCustom && (
        <div className="card-size-custom-row">
          <label className="settings-field card-size-custom-field">
            <span className="settings-field-label">Width (mm)</span>
            <input
              type="number"
              className="settings-select card-size-number"
              min={CUSTOM_SIZE_MIN_MM}
              max={CUSTOM_SIZE_MAX_MM}
              step={0.1}
              value={value.customWidthMm}
              onChange={(e) => onChange({ customWidthMm: clampCardMm(Number(e.target.value)) })}
            />
          </label>
          <label className="settings-field card-size-custom-field">
            <span className="settings-field-label">Height (mm)</span>
            <input
              type="number"
              className="settings-select card-size-number"
              min={CUSTOM_SIZE_MIN_MM}
              max={CUSTOM_SIZE_MAX_MM}
              step={0.1}
              value={value.customHeightMm}
              onChange={(e) => onChange({ customHeightMm: clampCardMm(Number(e.target.value)) })}
            />
          </label>
        </div>
      )}

      {preview && (
        <p className="settings-hint">
          {preview.description}. mm borders use this manufactured size when the green box is on the
          card edges.
        </p>
      )}
      {allowAsk && value.cardFormat === 'ask' && (
        <p className="settings-hint">
          You’ll choose Pokémon, sports, Yu-Gi-Oh!, or a custom size right after each photo.
        </p>
      )}
    </div>
  );
}

interface CardSizePickerScreenProps {
  initial: CardSizeSelection;
  imageSrc?: string | null;
  onConfirm: (selection: CardSizeSelection) => void;
  onCancel: () => void;
}

/** Full-screen picker shown only when Settings card size is “Ask after each photo”. */
export function CardSizePickerScreen({
  initial,
  imageSrc,
  onConfirm,
  onCancel,
}: CardSizePickerScreenProps) {
  const [cardFormat, setCardFormat] = useState<CardFormatId>(initial.cardFormat);
  const [customWidthMm, setCustomWidthMm] = useState(initial.customWidthMm ?? 63.5);
  const [customHeightMm, setCustomHeightMm] = useState(initial.customHeightMm ?? 88.9);

  function confirm() {
    onConfirm({
      cardFormat,
      customWidthMm,
      customHeightMm,
    });
  }

  return (
    <div className="card-size-picker">
      <div className="card-size-picker-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          ← Cancel
        </button>
        <h2>Card size</h2>
      </div>
      {imageSrc && (
        <div className="card-size-picker-preview">
          <img src={imageSrc} alt="Captured card" />
        </div>
      )}
      <div className="card-size-picker-body">
        <p className="card-size-picker-lead">
          Which card did you just scan? This sets absolute mm and warp aspect for this photo.
        </p>
        <CardSizeFields
          compact
          value={{ cardFormat, customWidthMm, customHeightMm }}
          onChange={(patch) => {
            if (patch.cardFormat != null && patch.cardFormat !== 'ask') {
              setCardFormat(patch.cardFormat);
            }
            if (patch.customWidthMm != null) setCustomWidthMm(patch.customWidthMm);
            if (patch.customHeightMm != null) setCustomHeightMm(patch.customHeightMm);
          }}
        />
        <button type="button" className="btn btn-primary btn-block" onClick={confirm}>
          Continue
        </button>
      </div>
    </div>
  );
}

/** Build a concrete selection from settings when format is already chosen. */
export function selectionFromSettings(settings: {
  cardFormat: CardFormatSetting;
  customWidthMm: number;
  customHeightMm: number;
}): CardSizeSelection | null {
  if (settings.cardFormat === 'ask') return null;
  return {
    cardFormat: settings.cardFormat,
    customWidthMm: settings.customWidthMm,
    customHeightMm: settings.customHeightMm,
  };
}

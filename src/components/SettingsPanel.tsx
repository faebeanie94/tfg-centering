import { useState } from 'react';
import type { AppSettings } from '../hooks/useAppSettings';
import { DEFAULT_SETTINGS, SCAN_OBSTRUCTION_OPTIONS } from '../hooks/useAppSettings';
import { SCAN_DISTANCE_OPTIONS } from '../lib/card-edge-detect';
import { getAppBuildLabel, refreshAppToLatest } from '../lib/app-update';

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

const COLOR_PRESETS = [
  { label: 'Green', value: '#22c55e' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Cyan', value: '#06b6d4' },
];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="color-field">
      <span className="color-field-label">{label}</span>
      <div className="color-field-controls">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <input
          type="text"
          className="color-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
        />
      </div>
      <div className="color-presets">
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`color-swatch ${value === p.value ? 'active' : ''}`}
            style={{ background: p.value }}
            title={p.label}
            onClick={() => onChange(p.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ open, settings, onChange, onClose }: SettingsPanelProps) {
  const [refreshing, setRefreshing] = useState(false);

  if (!open) return null;

  async function handleRefreshApp() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshAppToLatest();
    } catch {
      setRefreshing(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3>Appearance</h3>
          <ColorField
            label="Arrow handle colour"
            value={settings.handleColor}
            onChange={(v) => onChange({ handleColor: v })}
          />
          <ColorField
            label="Border fill colour"
            value={settings.borderFillColor}
            onChange={(v) => onChange({ borderFillColor: v })}
          />
          <ColorField
            label="Card edge colour"
            value={settings.outerEdgeColor}
            onChange={(v) => onChange({ outerEdgeColor: v })}
          />
          <label className="toggle-row">
            <span>Invert image colours</span>
            <input
              type="checkbox"
              checked={settings.invertColors}
              onChange={(e) => onChange({ invertColors: e.target.checked })}
            />
          </label>
          <p className="settings-hint">Display only — helps see borders on dark or light cards. Exports stay normal.</p>
        </section>

        <section className="settings-section">
          <h3>Scanner</h3>
          <label className="settings-field">
            <span className="settings-field-label">Scan distance</span>
            <select
              className="settings-select"
              value={settings.scanDistanceCm}
              onChange={(e) => onChange({ scanDistanceCm: Number(e.target.value) as AppSettings['scanDistanceCm'] })}
            >
              {SCAN_DISTANCE_OPTIONS.map((cm) => (
                <option key={cm} value={cm}>
                  {cm} cm{cm === 20 ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">
            Sets the guide frame size for your working height. Use 20 cm when the phone is about 20 cm above the card.
          </p>
          <label className="settings-field">
            <span className="settings-field-label">Phone stand / box at bottom</span>
            <select
              className="settings-select"
              value={settings.scanObstructionBottom}
              onChange={(e) => onChange({ scanObstructionBottom: Number(e.target.value) })}
            >
              {SCAN_OBSTRUCTION_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">
            Keeps the guide above your phone stand. The guide also follows your card once detected.
          </p>
          <label className="toggle-row">
            <span>Level indicators</span>
            <input
              type="checkbox"
              checked={settings.levelIndicators}
              onChange={(e) => onChange({ levelIndicators: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Auto-capture when level (1.5s)</span>
            <input
              type="checkbox"
              checked={settings.autoCapture}
              onChange={(e) => onChange({ autoCapture: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Torch (flashlight)</span>
            <input
              type="checkbox"
              checked={settings.torchEnabled}
              onChange={(e) => onChange({ torchEnabled: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Macro / close focus</span>
            <input
              type="checkbox"
              checked={settings.macroMode}
              onChange={(e) => onChange({ macroMode: e.target.checked })}
            />
          </label>
          <p className="settings-hint">Torch and macro depend on your device. Toggle them during capture too.</p>
        </section>

        <section className="settings-section">
          <h3>App</h3>
          <p className="settings-build">Build: {getAppBuildLabel()}</p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={refreshing}
            onClick={() => void handleRefreshApp()}
          >
            {refreshing ? 'Refreshing…' : 'Refresh app'}
          </button>
          <p className="settings-hint">
            Reloads the latest version from the server. Does not clear your saved library, settings, or graded
            cards.
          </p>
        </section>

        <div className="settings-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onChange(DEFAULT_SETTINGS)}>
            Reset to defaults
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

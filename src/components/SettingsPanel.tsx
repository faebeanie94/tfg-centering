import type { AppSettings } from '../hooks/useAppSettings';
import { DEFAULT_SETTINGS } from '../hooks/useAppSettings';

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
  if (!open) return null;

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
        </section>

        <section className="settings-section">
          <h3>Scanner</h3>
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

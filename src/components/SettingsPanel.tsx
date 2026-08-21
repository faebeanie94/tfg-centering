import { useState } from 'react';
import type { AppSettings } from '../hooks/useAppSettings';
import { DEFAULT_SETTINGS, SCAN_OBSTRUCTION_OPTIONS } from '../hooks/useAppSettings';
import { getAppBuildLabel, refreshAppToLatest } from '../lib/app-update';
import { CardSizeFields } from './CardSizeFields';
import { BackfillCenteringView } from './BackfillCenteringView';
import type { SubmissionFolder } from '../lib/folder-submission';

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  submission?: SubmissionFolder | null;
}

const COLOR_PRESETS = [
  { label: 'Grade', value: '#78c285' },
  { label: 'Alpha', value: '#cb3687' },
  { label: 'Bravo', value: '#49a3e1' },
  { label: 'Error', value: '#e77d31' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Accent', value: '#06b6d4' },
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

export function SettingsPanel({ open, settings, onChange, onClose, submission }: SettingsPanelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [showingBackfill, setShowingBackfill] = useState(false);

  if (!open) return null;

  if (showingBackfill && submission) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
          <BackfillCenteringView
            submission={submission}
            onClose={() => setShowingBackfill(false)}
          />
        </div>
      </div>
    );
  }

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
          <h3>Card size</h3>
          <CardSizeFields
            allowAsk
            value={{
              cardFormat: settings.cardFormat,
              customWidthMm: settings.customWidthMm,
              customHeightMm: settings.customHeightMm,
            }}
            onChange={(patch) => onChange(patch)}
          />
        </section>

        <section className="settings-section">
          <h3>Scanner</h3>
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
            Phone on a box as a stand: keep “Phone on box (~32%)” so the dashed frame sits in the
            clear upper two-thirds. Detection ignores the blocked bottom band (the box itself).
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

        {submission && submission.type === 'api' && (
          <section className="settings-section">
            <h3>Submission Data</h3>
            <p className="settings-hint">
              Backfill centering measurements from your saved card library into this submission.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setShowingBackfill(true)}
            >
              Backfill Centering Measurements
            </button>
          </section>
        )}

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

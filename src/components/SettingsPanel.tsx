import { useState } from 'react';
import type { AppSettings } from '../hooks/useAppSettings';
import { DEFAULT_SETTINGS, SCAN_OBSTRUCTION_OPTIONS } from '../hooks/useAppSettings';
import { getAppBuildLabel, refreshAppToLatest } from '../lib/app-update';
import { CardSizeFields } from './CardSizeFields';
import type { SubmissionFolder } from '../lib/folder-submission';
import {
  BUILT_IN_PROFILES,
  BORDERED_PROFILE_ID,
  isValidTarget,
  newCustomProfileId,
  type LayoutProfile,
} from '../lib/layout-profiles';

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

function LayoutProfilesSection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const custom = settings.customLayoutProfiles;

  function update(id: string, patch: Partial<LayoutProfile>) {
    onChange({ customLayoutProfiles: custom.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function remove(id: string) {
    onChange({
      customLayoutProfiles: custom.filter((p) => p.id !== id),
      layoutProfileId: settings.layoutProfileId === id ? BORDERED_PROFILE_ID : settings.layoutProfileId,
    });
  }

  function add() {
    onChange({
      customLayoutProfiles: [
        ...custom,
        { id: newCustomProfileId(), label: 'New borderless layout', tbTarget: 50, lrTarget: 50 },
      ],
    });
  }

  function targetInput(p: LayoutProfile, key: 'tbTarget' | 'lrTarget') {
    return (
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min="1"
        max="99"
        defaultValue={p[key]}
        aria-label={key === 'tbTarget' ? `${p.label} top target %` : `${p.label} left target %`}
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (isValidTarget(n)) update(p.id, { [key]: Math.round(n * 10) / 10 });
          else e.target.value = String(p[key]);
        }}
      />
    );
  }

  return (
    <section className="settings-section">
      <h3>Borderless layouts</h3>
      <p className="settings-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Targets are the top % and left % a perfectly cut copy reads when the yellow box is on the
        layout's reference points. The front grade uses 50 + (measured − target), so your normal
        thresholds still apply. Pick the layout in the Border Editor; the back is always 50/50.
      </p>
      <div className="layout-profile-list">
        <div className="layout-profile-item">
          <span className="layout-profile-head">Layout</span>
          <span className="layout-profile-head">Top %</span>
          <span className="layout-profile-head">Left %</span>
          <span />
        </div>
        {BUILT_IN_PROFILES.filter((p) => p.id !== BORDERED_PROFILE_ID).map((p) => (
          <div key={p.id} className="layout-profile-item" title={p.source}>
            <span className="settings-field-label">{p.label}</span>
            <span>{p.tbTarget.toFixed(1)}</span>
            <span>{p.lrTarget.toFixed(1)}</span>
            <span className="layout-profile-head">built-in</span>
          </div>
        ))}
        {custom.map((p) => (
          <div key={p.id} className="layout-profile-item" title={p.source}>
            <input
              type="text"
              defaultValue={p.label}
              aria-label="Layout name"
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label) update(p.id, { label });
                else e.target.value = p.label;
              }}
            />
            {targetInput(p, 'tbTarget')}
            {targetInput(p, 'lrTarget')}
            <button type="button" className="btn btn-secondary btn-small" onClick={() => remove(p.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-block" onClick={add}>
        Add layout
      </button>
      <label className="settings-field" style={{ marginTop: 16 }}>
        <span className="settings-field-label">Card lookup service URL</span>
        <input
          className="settings-select"
          type="url"
          inputMode="url"
          placeholder="https://lookup.tfg.cards"
          defaultValue={settings.cardLookupUrl}
          onBlur={(e) => onChange({ cardLookupUrl: e.target.value.trim().replace(/\/+$/, '') })}
        />
      </label>
      <p className="settings-hint" style={{ marginTop: 0 }}>
        With a URL set, the Border Editor can look a card up by game, set and number and pick its
        layout automatically. Leave empty to hide the lookup.
      </p>
      <p className="settings-hint">
        Quickest way to add one: load a Scryfall image or a perfectly cut copy, place the yellow box on
        the reference points, and tap “Set target” in the Border Editor.
      </p>
    </section>
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
            label="Outer arrow handle colour"
            value={settings.handleColor}
            onChange={(v) => onChange({ handleColor: v })}
          />
          <ColorField
            label="Inner arrow handle colour"
            value={settings.innerEdgeColor}
            onChange={(v) => onChange({ innerEdgeColor: v })}
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

        <LayoutProfilesSection settings={settings} onChange={onChange} />

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
          <button type="button" className="btn btn-secondary" onClick={() =>
              onChange({
                ...DEFAULT_SETTINGS,
                customLayoutProfiles: settings.customLayoutProfiles,
                cardLookupUrl: settings.cardLookupUrl,
              })
            }>
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

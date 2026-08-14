interface LevelCrosshairProps {
  level: {
    isLevel: boolean;
    tiltFromFlat: number | null;
    roll: number | null;
    supported: boolean;
    permissionGranted: boolean;
  };
  progress?: number;
}

export function LevelCrosshair({ level, progress = 0 }: LevelCrosshairProps) {
  const { isLevel, tiltFromFlat, roll, supported, permissionGranted } = level;
  const color = isLevel ? '#78c285' : '#e77d31';

  return (
    <div className="level-overlay">
      {progress > 0 && (
        <svg className="level-progress-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#78c285"
            strokeWidth="4"
            strokeDasharray={`${progress * 276} 276`}
            transform="rotate(-90 50 50)"
          />
        </svg>
      )}

      <svg className="level-crosshair" viewBox="0 0 200 200" aria-hidden="true">
        <line x1="100" y1="20" x2="100" y2="80" stroke={color} strokeWidth="2" />
        <line x1="100" y1="120" x2="100" y2="180" stroke={color} strokeWidth="2" />
        <line x1="20" y1="100" x2="80" y2="100" stroke={color} strokeWidth="2" />
        <line x1="120" y1="100" x2="180" y2="100" stroke={color} strokeWidth="2" />
        <circle cx="100" cy="100" r="8" fill="none" stroke={color} strokeWidth="2" />
        <rect x="60" y="60" width="80" height="80" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
      </svg>

      <div className={`level-status ${isLevel ? 'level-ok' : 'level-bad'}`}>
        {!permissionGranted
          ? 'Motion access needed for level — allow in Settings or capture manually'
          : isLevel
            ? progress > 0
              ? 'Hold steady…'
              : 'Level — ready to capture'
            : 'Hold phone parallel to card'}
      </div>

      {supported && permissionGranted && tiltFromFlat !== null && roll !== null && (
        <div className="level-debug">
          Flat: {tiltFromFlat.toFixed(1)}° · Roll: {roll.toFixed(1)}°
        </div>
      )}

      {supported && !permissionGranted && (
        <div className="level-debug">Allow motion access when prompted</div>
      )}

      {!supported && (
        <div className="level-debug">Level sensor unavailable — align manually</div>
      )}
    </div>
  );
}

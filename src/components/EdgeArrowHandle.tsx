type Edge = 'left' | 'right' | 'top' | 'bottom';

interface EdgeArrowHandleProps {
  edge: Edge;
  color?: string;
  slot?: 'inner' | 'outer';
  onPointerDown: (e: React.PointerEvent) => void;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function EdgeIcon({ edge, slot = 'outer' }: { edge: Edge; slot?: 'inner' | 'outer' }) {
  const arrow = '#212529';
  const text = '#212529';
  const label = slot === 'inner' ? 'in' : 'out';

  if (edge === 'left') {
    return (
      <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden>
        <path d="M14 10 L6 10 M6 10 L9 7 M6 10 L9 13" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="20" y="12" fontSize="7" fontWeight="600" textAnchor="middle" fill={text}>{label}</text>
      </svg>
    );
  }

  if (edge === 'right') {
    return (
      <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden>
        <text x="8" y="12" fontSize="7" fontWeight="600" textAnchor="middle" fill={text}>{label}</text>
        <path d="M14 10 L22 10 M22 10 L19 7 M22 10 L19 13" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (edge === 'top') {
    return (
      <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden>
        <path d="M10 14 L10 6 M10 6 L7 9 M10 6 L13 9" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="10" y="24" fontSize="7" fontWeight="600" textAnchor="middle" fill={text}>{label}</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden>
      <text x="10" y="7" fontSize="7" fontWeight="600" textAnchor="middle" fill={text}>{label}</text>
      <path d="M10 14 L10 22 M10 22 L7 19 M10 22 L13 19" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EdgeArrowHandle({ edge, color = '#facc15', slot = 'outer', onPointerDown }: EdgeArrowHandleProps) {
  return (
    <div
      className={`edge-handle edge-handle-${edge}`}
      style={{ backgroundColor: color }}
      onPointerDown={onPointerDown}
    >
      <EdgeIcon edge={edge} slot={slot} />
    </div>
  );
}

export function edgeHandleStyle(
  edge: Edge,
  rect: RectLike,
  scale: number,
  slot: 'outer' | 'inner' = 'outer',
): React.CSSProperties {
  const hw = edge === 'left' || edge === 'right' ? 36 : 28;
  const hh = edge === 'top' || edge === 'bottom' ? 36 : 28;
  /** Stagger outer/inner handles along the edge so they stay visible. */
  const outerAlong = 0.3;
  const innerAlong = 0.7;

  switch (edge) {
    case 'left': {
      const along = slot === 'outer' ? outerAlong : innerAlong;
      return { left: rect.x * scale - hw / 2, top: (rect.y + rect.height * along) * scale - hh / 2 };
    }
    case 'right': {
      const along = slot === 'outer' ? innerAlong : outerAlong;
      return {
        left: (rect.x + rect.width) * scale - hw / 2,
        top: (rect.y + rect.height * along) * scale - hh / 2,
      };
    }
    case 'top': {
      const along = slot === 'outer' ? outerAlong : innerAlong;
      return { left: (rect.x + rect.width * along) * scale - hw / 2, top: rect.y * scale - hh / 2 };
    }
    case 'bottom': {
      const along = slot === 'outer' ? innerAlong : outerAlong;
      return {
        left: (rect.x + rect.width * along) * scale - hw / 2,
        top: (rect.y + rect.height) * scale - hh / 2,
      };
    }
  }
}

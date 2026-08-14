type Edge = 'left' | 'right' | 'top' | 'bottom';

interface EdgeArrowHandleProps {
  edge: Edge;
  color?: string;
  onPointerDown: (e: React.PointerEvent) => void;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function EdgeIcon({ edge }: { edge: Edge }) {
  const line = '#212529';
  const arrow = '#212529';

  if (edge === 'left') {
    return (
      <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden>
        <path d="M14 10 L6 10 M6 10 L9 7 M6 10 L9 13" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="18" y1="4" x2="18" y2="16" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="22" y1="4" x2="22" y2="16" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (edge === 'right') {
    return (
      <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden>
        <line x1="6" y1="4" x2="6" y2="16" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="10" y1="4" x2="10" y2="16" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M14 10 L22 10 M22 10 L19 7 M22 10 L19 13" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (edge === 'top') {
    return (
      <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden>
        <path d="M10 14 L10 6 M10 6 L7 9 M10 6 L13 9" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="4" y1="18" x2="16" y2="18" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="4" y1="22" x2="16" y2="22" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden>
      <line x1="4" y1="6" x2="16" y2="6" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4" y1="10" x2="16" y2="10" stroke={line} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 14 L10 22 M10 22 L7 19 M10 22 L13 19" stroke={arrow} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EdgeArrowHandle({ edge, color = '#facc15', onPointerDown }: EdgeArrowHandleProps) {
  return (
    <div
      className={`edge-handle edge-handle-${edge}`}
      style={{ backgroundColor: color }}
      onPointerDown={onPointerDown}
    >
      <EdgeIcon edge={edge} />
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

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

const MIN_ZOOM = 1;

interface Point {
  x: number;
  y: number;
}

interface PointerSample {
  id: number;
  x: number;
  y: number;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Pinch-to-zoom (up to maxZoom) and one-finger pan when zoomed in. */
export function usePinchZoom(viewportRef: RefObject<HTMLElement | null>, maxZoom = 15) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, PointerSample>>(new Map());
  const gestureRef = useRef<
    | { kind: 'pinch'; startZoom: number; startPan: Point; startDistance: number; startMid: Point }
    | { kind: 'pan'; startPan: Point; startPointer: Point }
    | null
  >(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    pointersRef.current.clear();
    gestureRef.current = null;
  }, []);

  const applyZoomPan = useCallback(
    (newZoom: number, newPan: Point) => {
      const z = Math.max(MIN_ZOOM, Math.min(maxZoom, newZoom));
      const p = z <= MIN_ZOOM ? { x: 0, y: 0 } : newPan;
      setZoom(z);
      setPan(p);
      zoomRef.current = z;
      panRef.current = p;
    },
    [maxZoom],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];

    if (pts.length === 2) {
      gestureRef.current = {
        kind: 'pinch',
        startZoom: zoomRef.current,
        startPan: { ...panRef.current },
        startDistance: distance(pts[0], pts[1]),
        startMid: midpoint(pts[0], pts[1]),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (pts.length === 1 && zoomRef.current > MIN_ZOOM) {
      gestureRef.current = {
        kind: 'pan',
        startPan: { ...panRef.current },
        startPointer: { x: e.clientX, y: e.clientY },
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

      const gesture = gestureRef.current;
      const vp = viewportRef.current;
      if (!gesture || !vp) return;

      const vpRect = vp.getBoundingClientRect();
      const origin = { x: vpRect.width / 2, y: vpRect.height / 2 };

      if (gesture.kind === 'pinch') {
        const pts = [...pointersRef.current.values()];
        if (pts.length < 2) return;

        const mid = midpoint(pts[0], pts[1]);
        const midLocal = {
          x: mid.x - vpRect.left - origin.x,
          y: mid.y - vpRect.top - origin.y,
        };
        const startMidLocal = {
          x: gesture.startMid.x - vpRect.left - origin.x,
          y: gesture.startMid.y - vpRect.top - origin.y,
        };

        const dist = distance(pts[0], pts[1]);
        const newZoom = gesture.startZoom * (dist / gesture.startDistance);

        const wx = (startMidLocal.x - gesture.startPan.x) / gesture.startZoom;
        const wy = (startMidLocal.y - gesture.startPan.y) / gesture.startZoom;
        applyZoomPan(newZoom, {
          x: midLocal.x - wx * newZoom,
          y: midLocal.y - wy * newZoom,
        });
      } else if (gesture.kind === 'pan') {
        applyZoomPan(zoomRef.current, {
          x: gesture.startPan.x + (e.clientX - gesture.startPointer.x),
          y: gesture.startPan.y + (e.clientY - gesture.startPointer.y),
        });
      }
    },
    [applyZoomPan, viewportRef],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      if (pointersRef.current.size === 0) {
        gestureRef.current = null;
        if (zoomRef.current <= MIN_ZOOM) applyZoomPan(1, { x: 0, y: 0 });
        return;
      }

      if (pointersRef.current.size === 1 && gestureRef.current?.kind === 'pinch') {
        const remaining = [...pointersRef.current.values()][0];
        gestureRef.current = {
          kind: 'pan',
          startPan: { ...panRef.current },
          startPointer: { x: remaining.x, y: remaining.y },
        };
      }
    },
    [applyZoomPan],
  );

  const layerStyle: CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: 'center center',
  };

  return {
    zoom,
    pan,
    reset,
    layerStyle,
    viewportHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}

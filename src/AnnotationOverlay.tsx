import { useCallback, useEffect, useRef, useState } from 'react';
import OpenSeadragon from 'openseadragon';
import type { Annotation } from './types';

export type DrawMode = 'point' | 'rect' | 'polygon' | null;

type Pt = [number, number];

interface Props {
  viewer: OpenSeadragon.Viewer;
  annotations: Annotation[];
  /** Active draw tool; null = pan/zoom only (overlay is click-through). */
  drawMode: DrawMode;
  /** Checklist item to bind the next annotation to. */
  itemId: string | null;
  onCreate: (a: Omit<Annotation, 'id'>) => void;
  onDrawEnd: () => void;
}

/** Min shape size in image px so stray clicks don't create invisible specks. */
const MIN_PX = 30;

export function AnnotationOverlay({
  viewer,
  annotations,
  drawMode,
  itemId,
  onCreate,
  onDrawEnd,
}: Props) {
  const [tick, setTick] = useState(0);
  const [rectStart, setRectStart] = useState<Pt | null>(null);
  const [rectCur, setRectCur] = useState<Pt | null>(null);
  const [polyPts, setPolyPts] = useState<Pt[]>([]);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // Repaint SVG whenever the viewport moves.
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    for (const ev of ['animation', 'animation-finish', 'resize', 'open', 'rotate'] as const) {
      viewer.addHandler(ev, bump);
    }
    return () => {
      for (const ev of ['animation', 'animation-finish', 'resize', 'open', 'rotate'] as const) {
        viewer.removeHandler(ev, bump);
      }
    };
  }, [viewer]);

  // While drawing, OSD's own mouse navigation is off so gestures draw shapes.
  useEffect(() => {
    viewer.setMouseNavEnabled(!drawMode);
    return () => {
      viewer.setMouseNavEnabled(true);
    };
  }, [viewer, drawMode]);

  const toImage = useCallback(
    (e: { clientX: number; clientY: number }): Pt | null => {
      const box = layerRef.current?.getBoundingClientRect();
      if (!box) return null;
      const p = viewer.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(e.clientX - box.left, e.clientY - box.top),
      );
      return [p.x, p.y];
    },
    [viewer],
  );

  const cancelDraft = useCallback(() => {
    setRectStart(null);
    setRectCur(null);
    setPolyPts([]);
  }, []);

  const finish = useCallback(() => {
    cancelDraft();
    onDrawEnd();
  }, [cancelDraft, onDrawEnd]);

  // Reset the in-progress draft whenever the tool changes (render-time adjust).
  const [prevMode, setPrevMode] = useState(drawMode);
  if (prevMode !== drawMode) {
    setPrevMode(drawMode);
    cancelDraft();
  }

  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'Enter' && drawMode === 'polygon' && polyPts.length >= 3) {
        onCreate({ type: 'polygon', points: polyPts, itemId, note: '' });
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, polyPts, itemId, onCreate, finish]);

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toImage(e);
    if (!p) return;
    downAt.current = { x: e.clientX, y: e.clientY };
    if (drawMode === 'rect') {
      setRectStart(p);
      setRectCur(p);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drawMode === 'rect' && rectStart) {
      const p = toImage(e);
      if (p) setRectCur(p);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const moved = downAt.current
      ? Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y)
      : 0;
    downAt.current = null;
    const p = toImage(e);
    if (drawMode === 'point' && moved < 6 && p) {
      onCreate({ type: 'point', points: [p], itemId, note: '' });
      finish();
    } else if (drawMode === 'rect' && rectStart && rectCur) {
      const [x1, y1] = rectStart;
      const [x2, y2] = rectCur;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w >= MIN_PX && h >= MIN_PX) {
        onCreate({
          type: 'rect',
          points: [
            [Math.min(x1, x2), Math.min(y1, y2)],
            [Math.max(x1, x2), Math.max(y1, y2)],
          ],
          itemId,
          note: '',
        });
      }
      finish();
    } else if (drawMode === 'polygon' && moved < 6 && p) {
      // Near-click on the first vertex closes the polygon (screen-space threshold).
      const first = polyPts[0];
      const box = layerRef.current?.getBoundingClientRect();
      const closePx =
        first && box
          ? Math.hypot(e.clientX - box.left - px(first)[0], e.clientY - box.top - px(first)[1])
          : Infinity;
      if (polyPts.length >= 3 && closePx < 12) {
        onCreate({ type: 'polygon', points: polyPts, itemId, note: '' });
        finish();
      } else {
        setPolyPts([...polyPts, p]);
      }
    }
  };

  const onDoubleClick = () => {
    if (drawMode === 'polygon' && polyPts.length >= 3) {
      onCreate({ type: 'polygon', points: polyPts, itemId, note: '' });
      finish();
    }
  };

  const px = useCallback(
    ([x, y]: Pt): Pt => {
      const p = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(x, y));
      return [p.x, p.y];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer, tick],
  );

  const shape = (a: Annotation, i: number) => {
    const pts = a.points.map(px);
    if (a.type === 'point') {
      const [cx, cy] = pts[0]!;
      return (
        <g key={a.id}>
          <circle cx={cx} cy={cy} r={9} className="anno-dot" />
          <text x={cx + 12} y={cy + 4} className="anno-num">
            {i + 1}
          </text>
        </g>
      );
    }
    if (a.type === 'rect') {
      const [x1, y1] = pts[0]!;
      const [x2, y2] = pts[1]!;
      return (
        <rect key={a.id} x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="anno-shape" />
      );
    }
    return (
      <polygon key={a.id} points={pts.map((p) => p.join(',')).join(' ')} className="anno-shape" />
    );
  };

  const draft = () => {
    if (drawMode === 'rect' && rectStart && rectCur) {
      const [x1, y1] = px(rectStart);
      const [x2, y2] = px(rectCur);
      return (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          className="anno-draft"
        />
      );
    }
    if (drawMode === 'polygon' && polyPts.length) {
      const pts = polyPts.map(px);
      return (
        <>
          <polyline points={pts.map((p) => p.join(',')).join(' ')} className="anno-draft" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4} className="anno-vertex" />
          ))}
        </>
      );
    }
    return null;
  };

  return (
    <div
      ref={layerRef}
      className={`anno-layer${drawMode ? ' drawing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <svg className="anno-svg">
        {annotations.map((a, i) => shape(a, i))}
        {draft()}
      </svg>
    </div>
  );
}

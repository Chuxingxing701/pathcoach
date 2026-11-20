import { useEffect, useRef, useState, type ReactNode } from 'react';
import OpenSeadragon from 'openseadragon';
import type { CaseMeta } from './types';
import { strings, useT } from './i18n';

const MAGS = [2, 4, 10, 20, 40] as const;
/** Nice round scale-bar lengths (µm), largest first. */
const SCALE_STEPS_UM = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/** Equivalent objective magnification, assuming 10x ≈ 1.0 µm/px on screen. */
function zoomToMag(viewer: OpenSeadragon.Viewer, mpp: number): number {
  const imageZoom = viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
  return (10 / mpp) * imageZoom;
}

function magToZoom(viewer: OpenSeadragon.Viewer, mpp: number, mag: number): number {
  return viewer.viewport.imageToViewportZoom((mag * mpp) / 10);
}

/** Smoothly zoom to an equivalent objective magnification (2/4/10/20/40). */
export function setMag(viewer: OpenSeadragon.Viewer, mpp: number, mag: number): void {
  viewer.viewport.zoomTo(magToZoom(viewer, mpp, mag));
}

/** Pan/zoom so the bounding box of the given image-pixel points fills the view. */
export function fitImagePoints(viewer: OpenSeadragon.Viewer, points: [number, number][]): void {
  if (!points.length) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = Math.max(
    200,
    0.25 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
  );
  const rect = viewer.viewport.imageToViewportRectangle(
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + 2 * pad,
    Math.max(...ys) - Math.min(...ys) + 2 * pad,
  );
  viewer.viewport.fitBounds(rect);
}

export function SlideViewer({
  slide,
  onViewerReady,
  children,
}: {
  slide: CaseMeta;
  /** Called with the viewer once the slide opens, and null on teardown. */
  onViewerReady?: (viewer: OpenSeadragon.Viewer | null) => void;
  /** Extra absolutely-positioned layers inside the viewer frame (e.g. annotations). */
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const readyRef = useRef(onViewerReady);
  useEffect(() => {
    readyRef.current = onViewerReady;
  });
  const t = useT();
  const [view, setView] = useState<{
    mag: number;
    fieldUm: number;
    scale: { um: number; px: number } | null;
  }>({
    mag: 0,
    fieldUm: 0,
    scale: null,
  });
  const { mpp, dzi } = slide.tiles;

  useEffect(() => {
    if (!el.current) return;
    const viewer = OpenSeadragon({
      element: el.current,
      tileSources: dzi,
      crossOriginPolicy: 'Anonymous',
      prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@6/build/openseadragon/images/',
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      showNavigationControl: false,
      maxZoomPixelRatio: 2,
      visibilityRatio: 0.5,
      placeholderFillStyle: '#ffffff',
      gestureSettingsMouse: { clickToZoom: false },
    });
    const update = () => {
      const mag = zoomToMag(viewer, mpp);
      const pxPerUm = mag / 10;
      const step = SCALE_STEPS_UM.find((um) => um * pxPerUm <= 160 && um * pxPerUm >= 12) ?? null;
      setView({
        mag,
        fieldUm: (viewer.container.clientWidth * 10) / mag,
        scale: step === null ? null : { um: step, px: step * pxPerUm },
      });
    };
    viewer.addHandler('animation', update);
    viewer.addHandler('animation-finish', update);
    viewer.addHandler('open', update);
    viewerRef.current = viewer;
    readyRef.current?.(viewer);
    return () => {
      readyRef.current?.(null);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [dzi, mpp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const viewer = viewerRef.current;
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (!viewer || idx < 0 || e.target instanceof HTMLInputElement) return;
      viewer.viewport.zoomTo(magToZoom(viewer, mpp, MAGS[idx]!));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mpp]);

  const goTo = (m: number) => {
    const viewer = viewerRef.current;
    if (viewer) viewer.viewport.zoomTo(magToZoom(viewer, mpp, m));
  };

  const { mag, fieldUm, scale } = view;

  return (
    <div className="viewer">
      <div ref={el} className="viewer-canvas" data-testid="slide-viewer" />
      <div className="viewer-toolbar">
        <span className="mag" title={t(strings.equivMag)}>
          {mag ? `≈${mag.toFixed(mag < 10 ? 1 : 0)}×` : '–'}
        </span>
        {MAGS.map((m, i) => (
          <button key={m} onClick={() => goTo(m)} title={`key ${i + 1}`}>
            {m}×
          </button>
        ))}
        {fieldUm > 0 && (
          <span className="scale">
            {t(strings.field)} ≈ {Math.round(fieldUm)} µm
          </span>
        )}
      </div>
      {scale && (
        <div className="scalebar">
          <i style={{ width: scale.px }} />
          {scale.um >= 1000 ? `${scale.um / 1000} mm` : `${scale.um} µm`}
        </div>
      )}
      {children}
    </div>
  );
}

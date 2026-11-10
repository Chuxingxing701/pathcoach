import { useEffect, useRef, useState } from 'react';
import OpenSeadragon from 'openseadragon';
import type { CaseMeta } from './types';
import { strings, useT } from './i18n';

const MAGS = [2, 4, 10, 20, 40] as const;

/** Equivalent objective magnification, assuming 10x ≈ 1.0 µm/px on screen. */
function zoomToMag(viewer: OpenSeadragon.Viewer, mpp: number): number {
  const imageZoom = viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
  return (10 / mpp) * imageZoom;
}

function magToZoom(viewer: OpenSeadragon.Viewer, mpp: number, mag: number): number {
  return viewer.viewport.imageToViewportZoom((mag * mpp) / 10);
}

export function SlideViewer({ slide }: { slide: CaseMeta }) {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const t = useT();
  const [view, setView] = useState({ mag: 0, fieldUm: 0 });
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
      setView({ mag, fieldUm: (viewer.container.clientWidth * 10) / mag });
    };
    viewer.addHandler('animation', update);
    viewer.addHandler('animation-finish', update);
    viewer.addHandler('open', update);
    viewerRef.current = viewer;
    return () => {
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

  const { mag, fieldUm } = view;

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
    </div>
  );
}

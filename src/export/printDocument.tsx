import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import WhiteboardDrawing from '../components/WhiteboardDrawing';
import type { KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';
import { drawMissionMap, hasMissionMapContent, type MissionMapLabels, type MissionMapScene } from '../utils/missionMapRaster';
import { mapLabels } from '../utils/kneeboardRenderer';

export type PrintMapState = 'loading' | 'ready' | 'error';

interface PrintDocumentProps {
  pages: readonly KneeboardPage[];
  /** Mission name and the view label, both already translated. */
  title: string;
  viewLabel: string;
  t: KneeboardTranslate;
  /** Reports the combined state of every map on the document (loading until all are drawn). */
  onMapStateChange?: (state: PrintMapState) => void;
}

/**
 * The printable briefing document (A4 portrait, SPEC F9). It is mounted at all times
 * by the shell and hidden on screen, so Ctrl+P from any screen prints the same
 * material as the export screen. Maps that are not drawn yet print as a "準備中"
 * text, and a map without its basemap prints the overlay with "地図背景なし", so
 * printing is never blocked.
 */
export default function PrintDocument({ pages, title, viewLabel, t, onMapStateChange }: PrintDocumentProps) {
  const mapCount = pages.filter(page => page.kind === 'map').length;
  const [mapStates, setMapStates] = useState<Record<number, PrintMapState>>({});
  const combined = combineMapStates(mapStates, mapCount);

  useEffect(() => {
    onMapStateChange?.(combined);
  }, [combined, onMapStateChange]);

  const labels = useMemo<MissionMapLabels>(() => mapLabels(t), [t]);

  let mapIndex = 0;
  return (
    <div className="print-document">
      <header className="print-document-head">
        <h1>{title}</h1>
        <p>{viewLabel}</p>
      </header>
      {pages.map((page, pageIndex) => {
        if (page.kind === 'map') {
          const index = mapIndex;
          mapIndex += 1;
          return (
            <section key={`page-${pageIndex}`} className="print-page print-map-page">
              <h2>{page.title}</h2>
              <PrintMap
                scene={page.scene}
                labels={labels}
                onState={state => setMapStates(current => (current[index] === state ? current : { ...current, [index]: state }))}
                loadingText={t('export:ui.mapPreparing')}
              />
            </section>
          );
        }
        if (page.kind === 'whiteboard') {
          return (
            <section key={`page-${pageIndex}`} className="print-page print-whiteboard-page">
              <h2>{page.title}</h2>
              <p className="print-notes">{page.data.notes.trim() || t('export:label.noWhiteboardNotes')}</p>
              {page.data.strokes.length > 0 && (
                <WhiteboardDrawing
                  className="print-whiteboard-board"
                  strokes={page.data.strokes}
                  label={t('export:label.whiteboard')}
                />
              )}
            </section>
          );
        }
        return (
          <section key={`page-${pageIndex}`} className="print-page">
            <h2>{page.title}</h2>
            {page.sections.map((section, sectionIndex) => (
              <PrintSection key={`section-${sectionIndex}`} section={section} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function PrintSection({ section }: { section: KneeboardSection }) {
  return (
    <div className="print-section">
      <h3>{section.heading}</h3>
      {section.table ? (
        <table className="print-table">
          <thead>
            <tr>{section.table.header.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr>
          </thead>
          <tbody>
            {section.table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="print-lines">
          {section.lines.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      )}
    </div>
  );
}

function PrintMap({ scene, labels, onState, loadingText }: {
  scene: MissionMapScene;
  labels: MissionMapLabels;
  onState: (state: PrintMapState) => void;
  loadingText: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onStateRef = useRef(onState);
  const [ready, setReady] = useState<PrintMapState>('loading');

  // The parent passes a new callback on every render; the drawing effect reads the latest one.
  useEffect(() => {
    onStateRef.current = onState;
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      setReady('error');
      onStateRef.current('error');
      return;
    }
    // `active` turns false when the scene or labels change, or the map unmounts. A draw still
    // waiting for its basemap then does nothing, so it cannot paint over the newer draw.
    let active = true;
    setReady('loading');
    onStateRef.current('loading');
    void (async () => {
      let state: PrintMapState = 'error';
      try {
        const result = await drawMissionMap(context, scene, 0, 0, canvas.width, canvas.height, labels, {
          isCurrent: () => active,
        });
        state = result.background || !hasMissionMapContent(scene) ? 'ready' : 'error';
      } catch {
        state = 'error';
      }
      if (active) {
        setReady(state);
        onStateRef.current(state);
      }
    })();
    return () => {
      active = false;
    };
  }, [scene, labels]);

  return (
    <div className="print-map-frame">
      <canvas ref={canvasRef} className="print-map-canvas" width={1536} height={1024} aria-label={labels.routes} />
      {ready !== 'ready' && <p className="print-map-status">{ready === 'error' ? labels.basemapUnavailable : loadingText}</p>}
    </div>
  );
}

function combineMapStates(states: Record<number, PrintMapState>, mapCount: number): PrintMapState {
  if (mapCount === 0) return 'ready';
  let state: PrintMapState = 'ready';
  for (let index = 0; index < mapCount; index += 1) {
    const value = states[index] ?? 'loading';
    if (value === 'error') return 'error';
    if (value === 'loading') state = 'loading';
  }
  return state;
}

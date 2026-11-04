import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import WhiteboardDrawing from '../components/WhiteboardDrawing';
import type { KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';
import { drawMissionMap, mapDrawFailed, type MissionMapLabels, type MissionMapScene } from '../utils/missionMapRaster';
import { mapLabels } from '../utils/kneeboardRenderer';
import { freeTextLines } from './kneeboardPlan';

interface PrintDocumentProps {
  pages: readonly KneeboardPage[];
  /** Mission name and the view label, both already translated. */
  title: string;
  viewLabel: string;
  t: KneeboardTranslate;
  /**
   * Whether the map pages may be drawn (decision 7). Until it is true, a map page says that it is
   * being prepared and no tile is requested, so reading the mission alone costs nothing.
   */
  drawMaps: boolean;
}

/**
 * The printable briefing document (A4 portrait, SPEC F9). It is mounted at all times
 * by the shell and hidden on screen, so Ctrl+P from any screen prints the same
 * material as the export screen. Maps that are not drawn yet print as a "準備中"
 * text, and a map without its basemap prints the overlay with "地図背景なし", so
 * printing is never blocked.
 */
export default function PrintDocument({ pages, title, viewLabel, t, drawMaps }: PrintDocumentProps) {
  const labels = useMemo<MissionMapLabels>(() => mapLabels(t), [t]);
  const keys = pageKeys(pages);

  return (
    <div className="print-document">
      <header className="print-document-head">
        <h1>{title}</h1>
        <p>{viewLabel}</p>
      </header>
      {pages.map((page, pageIndex) => {
        if (page.kind === 'map') {
          return (
            <section key={keys[pageIndex]} className="print-page print-map-page">
              <h2>{page.title}</h2>
              <PrintMap
                scene={page.scene}
                labels={labels}
                drawMaps={drawMaps}
                deferredText={t('export:ui.mapDeferred')}
                loadingText={t('export:ui.mapPreparing')}
              />
              {page.pins.length > 0 && (
                <div className="print-section print-map-pins">
                  <h3>{t('export:label.mapPins')}</h3>
                  <ul className="print-lines">
                    {page.pins.map((pin, index) => (
                      <li key={index}><strong>{pin.label}</strong>{pin.notes ? `: ${pin.notes}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        }
        if (page.kind === 'whiteboard') {
          // The notes are free text, kept as written like the other free text (the first line's indentation too).
          const notes = freeTextLines(page.data.notes);
          return (
            <section key={keys[pageIndex]} className="print-page print-whiteboard-page">
              <h2>{page.title}</h2>
              {notes.length > 0
                ? <pre className="print-pre print-notes">{notes.join('\n')}</pre>
                : <p className="print-notes">{t('export:label.noWhiteboardNotes')}</p>}
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
          <section key={keys[pageIndex]} className="print-page">
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
      {section.preformatted ? (
        // Free text keeps its blank lines and the spaces that line up its columns (print.css: .print-pre).
        <pre className="print-pre">{section.lines.join('\n')}</pre>
      ) : section.table ? (
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

/**
 * A key per page that stays with the page when another page is added before it. A map keeps its key by
 * its place among the pages of its kind, so a page added before it does not mount the map again.
 */
function pageKeys(pages: readonly KneeboardPage[]): string[] {
  const counts = new Map<string, number>();
  return pages.map(page => {
    const count = counts.get(page.kind) ?? 0;
    counts.set(page.kind, count + 1);
    return `${page.kind}-${count}`;
  });
}

type MapStatus ='deferred' | 'loading' | 'ready' | 'error';

function PrintMap({ scene, labels, drawMaps, deferredText, loadingText }: {
  scene: MissionMapScene;
  labels: MissionMapLabels;
  drawMaps: boolean;
  deferredText: string;
  loadingText: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<MapStatus>(drawMaps ? 'loading' : 'deferred');
  // The draw is keyed by what the map shows, not by object identity. The export model is rebuilt when an
  // unrelated setting changes (the theme, for example), and the same map must not be drawn again then.
  const sceneKey = useMemo(() => JSON.stringify(scene), [scene]);
  // Read by the drawing effect below. Declared first, so it runs first in the same commit.
  const sceneRef = useRef(scene);
  useLayoutEffect(() => {
    sceneRef.current = scene;
  });

  useLayoutEffect(() => {
    if (!drawMaps) {
      setStatus('deferred');
      return undefined;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      setStatus('error');
      return undefined;
    }
    // `active` turns false when the map is drawn again or unmounts. A draw still waiting for its tiles then
    // stops before it paints, so it cannot paint over the newer draw.
    let active = true;
    const drawn = sceneRef.current;
    setStatus('loading');
    void (async () => {
      let next: MapStatus = 'error';
      try {
        const result = await drawMissionMap(context, drawn, 0, 0, canvas.width, canvas.height, labels, {
          isCurrent: () => active,
        });
        next = mapDrawFailed(drawn, result) ? 'error' : 'ready';
      } catch {
        next = 'error';
      }
      if (active) setStatus(next);
    })();
    return () => {
      active = false;
    };
  }, [drawMaps, sceneKey, labels]);

  return (
    <div className="print-map-frame">
      <canvas ref={canvasRef} className="print-map-canvas" width={1536} height={1024} aria-label={labels.routes} />
      {status === 'deferred' && <p className="print-map-status">{deferredText}</p>}
      {status === 'loading' && <p className="print-map-status">{loadingText}</p>}
      {status === 'error' && <p className="print-map-status">{labels.basemapUnavailable}</p>}
    </div>
  );
}

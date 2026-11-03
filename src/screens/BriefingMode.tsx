// Owner: P4 (概要とブリーフィング). Full-screen briefing (SPEC 5.1 F8, 1.3).
// Contract: default export, no props. Opened from the shell header ("ブリーフィング開始").
// Data comes from useMission() (view, side, viewMode, settings, notes) only. The start
// step lets the presenter include weather, navlog, threats (creator only), the map and the
// notes; the rest follows settings.briefingSections. Keys: ← → PageUp/PageDown Home End,
// F (full screen), Esc (leave). Keys are ignored while typing in a field.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildBriefingSlides, type BriefingSlide, type SlideCell, type Translate } from '../briefing/slides';
import { MapPanel } from '../map/MapPanel';
import { EmptyState } from '../shell/EmptyState';
import { Unresolved } from '../shell/Unresolved';
import { useMission } from '../shell/MissionContext';
import { useUnits } from '../shell/units';
import { useWorkspace } from '../shell/workspace';
import { BRIEFING_SECTIONS } from '../utils/briefingSections';

/** Sections the presenter can switch on or off at the start (F8). */
const TOGGLE_SECTIONS = ['weather', 'route', 'threats', 'map', 'notes'] as const;
type ToggleSection = typeof TOGGLE_SECTIONS[number];

/**
 * Starting state of a toggle. The saved setting decides when the section list can hold the
 * section. A section the list cannot hold yet (weather and route until P3 extends it) starts on,
 * so the navlog is not silently missing from a default briefing.
 */
function initialInclusion(section: ToggleSection, saved: ReadonlySet<string>): boolean {
  if (!(BRIEFING_SECTIONS as readonly string[]).includes(section)) return true;
  return saved.has(section);
}

/** Moves keyboard focus into the show, so the next Tab starts at its first control. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function exitFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  } catch {
    // The browser has no Fullscreen API; the slides still work in the window.
  }
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  } catch {
    // The browser has no Fullscreen API; the slides still work in the window.
  }
}

function clampIndex(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(Math.max(value, 0), total - 1);
}

export default function BriefingMode() {
  const { t } = useTranslation(['briefing', 'shell']);
  const { view, side, viewMode, settings, notes } = useMission();
  const { setScreen } = useWorkspace();
  const units = useUnits();

  const [toggles, setToggles] = useState<Record<ToggleSection, boolean>>(() => {
    const saved = new Set<string>(settings.briefingSections);
    return {
      weather: initialInclusion('weather', saved),
      route: initialInclusion('route', saved),
      threats: viewMode === 'creator' && initialInclusion('threats', saved),
      map: initialInclusion('map', saved),
      notes: initialInclusion('notes', saved),
    };
  });
  const [deck, setDeck] = useState<BriefingSlide[] | null>(null);
  const [index, setIndex] = useState(0);

  const total = deck?.length ?? 0;
  const viewLabel = t(`shell:view.${viewMode}`);
  const translate: Translate = (key, values) => String(t(key, values));

  const exit = useCallback(() => {
    exitFullscreen();
    setScreen('overview');
  }, [setScreen]);

  useEffect(() => {
    if (!deck) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          setIndex(current => clampIndex(current + 1, total));
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          setIndex(current => clampIndex(current - 1, total));
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(clampIndex(total - 1, total));
          break;
        case 'Escape':
          exit();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deck, total, exit]);

  // Leaving the screen (or the mission) also leaves full screen.
  useEffect(() => () => exitFullscreen(), []);

  if (!deck) {
    return (
      <section className="briefing-start" aria-labelledby="briefing-start-title">
        <h2 id="briefing-start-title">{t('briefing:start.title')}</h2>
        <p className="briefing-start-view">
          {t('briefing:start.view')}: <strong>{viewLabel}</strong>
        </p>
        <p className="briefing-muted">{t('briefing:start.hint')}</p>
        <fieldset className="briefing-start-include">
          <legend>{t('briefing:start.include')}</legend>
          {TOGGLE_SECTIONS.map(id => (id === 'threats' && viewMode !== 'creator' ? null : (
            <label key={id} className="briefing-check">
              <input
                type="checkbox"
                checked={toggles[id]}
                onChange={event => setToggles(current => ({ ...current, [id]: event.target.checked }))}
              />
              <span>{t(`briefing:section.${id}`)}</span>
            </label>
          )))}
          {viewMode !== 'creator' && <p className="briefing-muted">{t('briefing:start.threatsPilotHidden')}</p>}
        </fieldset>
        <div className="briefing-start-actions">
          <button type="button" className="briefing-button" onClick={() => setScreen('overview')}>
            {t('briefing:start.cancel')}
          </button>
          <button
            type="button"
            className="briefing-button is-primary"
            onClick={() => {
              const sections = new Set<string>(settings.briefingSections);
              for (const id of TOGGLE_SECTIONS) {
                if (toggles[id]) sections.add(id);
                else sections.delete(id);
              }
              setDeck(buildBriefingSlides({
                view,
                side,
                viewMode,
                sections,
                notes: notes.smeac,
                units,
                t: translate,
              }));
              setIndex(0);
            }}
          >
            {t('briefing:start.begin')}
          </button>
        </div>
      </section>
    );
  }

  if (deck.length === 0) {
    return <EmptyShow onExit={exit} />;
  }

  return <BriefingSlides deck={deck} index={index} onIndex={setIndex} onExit={exit} viewLabel={viewLabel} />;
}

function EmptyShow({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['briefing']);
  const regionRef = useFocusOnMount<HTMLDivElement>();
  return (
    <div ref={regionRef} tabIndex={-1} className="briefing briefing-empty" role="region" aria-label={t('briefing:title')}>
      <EmptyState title={t('briefing:empty.title')} body={t('briefing:empty.body')} />
      <footer className="briefing-footer">
        <button type="button" className="briefing-button" onClick={onExit}>{t('briefing:nav.exit')}</button>
      </footer>
    </div>
  );
}

interface BriefingSlidesProps {
  deck: BriefingSlide[];
  index: number;
  onIndex: (index: number) => void;
  onExit: () => void;
  viewLabel: string;
}

/** The running slide show: header, contents, stage and footer. Lives over the shell (fixed, full window). */
function BriefingSlides({ deck, index, onIndex, onExit, viewLabel }: BriefingSlidesProps) {
  const { t } = useTranslation(['briefing']);
  const regionRef = useFocusOnMount<HTMLDivElement>();
  const current = deck[index];
  const total = deck.length;

  // Contents entries: one per run of slides that share a section (route slides repeat per flight).
  const groups: { section: string; first: number }[] = [];
  deck.forEach((slide, position) => {
    const last = groups[groups.length - 1];
    if (!last || last.section !== slide.section) groups.push({ section: slide.section, first: position });
  });
  const activeGroup = groups.reduce((active, group, position) => (group.first <= index ? position : active), 0);

  return (
    <div ref={regionRef} tabIndex={-1} className="briefing" role="region" aria-label={t('briefing:title')}>
      <header className="briefing-bar">
        <span className="briefing-bar-title">{current.title}</span>
        <span className="briefing-bar-count" aria-live="polite">
          {t('briefing:nav.counter', { current: index + 1, total })}
        </span>
        <span className="briefing-bar-view">{viewLabel}</span>
      </header>
      <div className="briefing-body">
        <nav className="briefing-toc" aria-label={t('briefing:nav.contents')}>
          <ol>
            {groups.map((group, position) => (
              <li key={`${group.section}-${group.first}`}>
                <button
                  type="button"
                  className="briefing-toc-item"
                  aria-current={position === activeGroup ? 'step' : undefined}
                  onClick={() => onIndex(group.first)}
                >
                  {t(`briefing:section.${group.section}`)}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="briefing-stage">
          {/* The 16:9 frame fits the stage; a slide that is taller than the frame scrolls inside it. */}
          <div className="briefing-canvas">
            <SlideView slide={current} />
          </div>
        </div>
      </div>
      <footer className="briefing-footer">
        <button
          type="button"
          className="briefing-button"
          disabled={index === 0}
          onClick={() => onIndex(Math.max(index - 1, 0))}
        >
          {t('briefing:nav.prev')}
        </button>
        <button
          type="button"
          className="briefing-button is-primary"
          disabled={index >= total - 1}
          onClick={() => onIndex(Math.min(index + 1, total - 1))}
        >
          {t('briefing:nav.next')}
        </button>
        {/* The number is in the top bar (live region) and here, as SPEC 1.3 places it. */}
        <span className="briefing-footer-count">{t('briefing:nav.counter', { current: index + 1, total })}</span>
        <button type="button" className="briefing-button briefing-exit" onClick={onExit}>
          {t('briefing:nav.exit')}
        </button>
      </footer>
    </div>
  );
}

function renderCell(cell: SlideCell) {
  return typeof cell === 'string' ? cell : <Unresolved xy={cell.xy} />;
}

function SlideView({ slide }: { slide: BriefingSlide }) {
  return (
    <article className="briefing-slide">
      <h2 className="briefing-slide-title">{slide.title}</h2>
      {slide.pairs && (
        <dl className="briefing-pairs">
          {slide.pairs.map(pair => (
            <div key={pair.label}>
              <dt>{pair.label}</dt>
              <dd>{pair.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {slide.table && (
        <div className="briefing-table-wrap">
          <table className="briefing-table">
            <thead>
              <tr>
                {slide.table.headers.map((header, column) => (
                  <th key={column} scope="col">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slide.table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column}>{renderCell(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {slide.text && <p className="briefing-text">{slide.text}</p>}
      {slide.map && (
        <div className="briefing-map">
          {/* All flights: MapPanel has no flight filter yet, so the caption says so. */}
          <p className="briefing-map-caption">{slide.map.caption}</p>
          <div className="briefing-map-frame">
            <MapPanel readOnly height="100%" />
          </div>
        </div>
      )}
    </article>
  );
}

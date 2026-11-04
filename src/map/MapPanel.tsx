import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { LatLngBounds, Map as LeafletMap } from 'leaflet';
import { Circle, LayerGroup, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPanelProps } from '../types/screen';
import type { Drawing, Flight, MapAnnotation, MapPinAnnotation, MapStrokeAnnotation, MissionData, RoutePoint, TriggerZone } from '../types/mission';
import { useMission } from '../shell/MissionContext';
import { formatDistance } from '../utils/units';
import { DEFAULT_MAP_UI, useWorkspace } from '../shell/workspace';
import type { MapTool, RouteFocus } from '../shell/workspace';
import { parseFlightKey } from '../utils/flightKey';
import { Notice } from '../shell/Notice';
import { Segmented } from '../shell/Segmented';
import { SideMark } from '../shell/SideMark';
import { Unresolved } from '../shell/Unresolved';
import {
  MAX_MAP_ANNOTATIONS,
  MAX_MAP_LABEL_LENGTH,
  MAX_MAP_NOTE_LENGTH,
  MAX_MAP_POINTS_TOTAL,
  MAX_MAP_STROKE_POINTS,
  replaceMapAnnotation,
} from '../utils/notes';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  dcsColorToCss,
  getDcsCoordinate,
  isResolvedLatLon,
  isSupportedTheatre,
  resolveEntityPosition,
} from './geometry';
import type { LatLon } from './geometry';
import { buildDcsRows, buildMapModel, collectBounds, flightBounds } from './mapModel';
import type { CoalitionKey, FlightEntry, MapModel } from './mapModel';
import { isLayerAvailable, isLayerOn, layerGroupsFor, LAYER_DEFS } from './mapLayers';
import type { LayerGroupId, LayerId } from './mapLayers';
import {
  checkAdd,
  createAnnotationId,
  nextPinNumber,
  PointerGestures,
  pinNumberPattern,
  removeAnnotation,
  restoreAnnotation,
  strokePointTotal,
  truncateLabel,
  undoLast,
} from './annotationTools';
import type { AnnotationRejection, RemovedAnnotation } from './annotationTools';
import { focusIcon, markIcon, MARK_GLYPHS, supportIcon, SUPPORT_CODES, userPinIcon, waypointIcon } from './icons';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Order of the sides in the legend: the two coalitions, then neutral. */
const LEGEND_SIDES: readonly CoalitionKey[] = ['blue', 'red', 'neutral'];
/** Layers that draw a coalition mark (the shape carries the side, D1). */
const MARK_LAYERS: readonly LayerId[] = ['navpoints', 'airbases', 'bullseye', 'support', 'enemies'];

/** Background tiles: loading until the first tile arrives, then ready, or failed when a tile errors. */
type BackgroundState = 'loading' | 'ready' | 'failed';

/**
 * The four ink swatches (tokens --ink-1 to --ink-4). MapUi.color keeps the token name, so a theme change
 * recolours the ink the user picked. Each swatch has its own shape, so they stay apart without colour.
 */
const INK_SWATCHES = [
  { id: 'ink1', token: '--ink-1', glyph: '■' },
  { id: 'ink2', token: '--ink-2', glyph: '◆' },
  { id: 'ink3', token: '--ink-3', glyph: '▲' },
  { id: 'ink4', token: '--ink-4', glyph: '●' },
] as const;
const DEFAULT_INK_TOKEN = '--ink-1';
/** Sentinel for the default pin number, replaced by a capture group when the pin name pattern is built. */
const PIN_NUMBER_SENTINEL = 987654321;

/** Route picked in the route table, resolved to its point. The map marks it and pans there only when it is out of view. */
interface RouteFocusTarget {
  point: LatLon;
  title: string;
}

/** Last removal that 元に戻す can undo: one annotation, or every annotation after "注釈をすべて消す". */
type Removal =
  | { kind: 'one'; removed: RemovedAnnotation }
  | { kind: 'all'; annotations: MapAnnotation[] };

function isInkToken(color: string): boolean {
  return INK_SWATCHES.some(swatch => swatch.token === color);
}

/** The flight of the view that a key names (any coalition), or null when it is not in the view. */
function findFlightInView(view: MissionData, key: string | null): Flight | null {
  const parsed = parseFlightKey(key);
  if (!parsed) return null;
  return view.coalitions[parsed.side].flights.find(flight => flight.groupId === parsed.groupId) ?? null;
}

/** Pattern of the default pin names in the current language. */
function pinPatternFor(t: TFunction): RegExp {
  return pinNumberPattern(String(t('map:annotations.defaultPin', { count: PIN_NUMBER_SENTINEL })), PIN_NUMBER_SENTINEL);
}

/**
 * Whole-map fit (initial mount, flight selection, "全体表示", "この機だけ地図に" and "全機を表示に戻す").
 * Annotation edits never change this.
 */
interface FitRequest {
  id: number;
  target: 'all' | 'flight' | 'solo';
}

interface FitBounds {
  all: LatLngBounds;
  flight: LatLngBounds | null;
  /** The route of the solo flight ("この機だけ地図に"), or null when no flight is shown alone. */
  solo: LatLngBounds | null;
}

function resolveToken(token: string): string {
  if (typeof document === 'undefined') return DEFAULT_MAP_UI.color;
  const value = document.defaultView?.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || DEFAULT_MAP_UI.color;
}

/**
 * The value for an <input type="color">, which takes only #rrggbb. A stored colour in another form
 * shows the blue ink token instead, so the swatch is one the user can actually pick.
 */
function colorInputValue(color: string): string {
  if (HEX_COLOR.test(color)) return color;
  const token = resolveToken(DEFAULT_INK_TOKEN);
  return HEX_COLOR.test(token) ? token : DEFAULT_MAP_UI.color;
}

/** Narrow widths (below 768px) start with the legend folded, so it does not cover the annotation tools. */
function isNarrowViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
}

/** Sides that have at least one mark drawn with the given layers on. The legend lists only these shapes. */
function drawnMarkSides(model: MapModel, theatre: string, shown: (id: LayerId) => boolean): Set<CoalitionKey> {
  const sides = new Set<CoalitionKey>();
  if (shown('navpoints')) {
    for (const { side, item } of model.navPoints) {
      if (isResolvedLatLon(item.latlon, item.latlonResolved)) sides.add(side);
    }
  }
  if (shown('airbases')) {
    for (const { side, item } of model.airbases) {
      if (isResolvedLatLon(item.latlon, item.latlonResolved)) sides.add(side);
    }
  }
  if (shown('bullseye')) {
    for (const entry of model.bullseyes) {
      if (entry.latlon) sides.add(entry.side);
    }
  }
  if (shown('support')) {
    for (const { side, item } of model.support) {
      if (resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position)) sides.add(side);
    }
  }
  if (shown('enemies')) {
    for (const { side, item } of model.groups) {
      if (resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position)) sides.add(side);
    }
  }
  return sides;
}

/** The units group is named for its contents: pilot view has no threat layers (SPEC 5.1). */
function groupHeading(id: LayerGroupId, layers: readonly LayerId[], t: TFunction): string {
  const hasCreatorOnly = layers.some(layer => LAYER_DEFS[layer].creatorOnly);
  return id === 'units' && !hasCreatorOnly ? t('map:layers.group.unitsSupport') : t(`map:layers.group.${id}`);
}

/** Gives the panel's controls (the "pin at the centre" button) the Leaflet map. */
function MapHandle({ target }: { target: { current: LeafletMap | null } }) {
  const map = useMap();
  useEffect(() => {
    target.current = map;
    return () => {
      target.current = null;
    };
  }, [map, target]);
  return null;
}

/**
 * True when the user asked the system for less motion. Leaflet animates pans and fits in JavaScript, which the CSS
 * rule for reduced motion does not reach, so the calls pass animate: false instead (SPEC 4.1, A11Y-9).
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fitMap(map: LeafletMap, bounds: LatLngBounds | null): void {
  const animate = !prefersReducedMotion();
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12, animate });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate });
  }
}

function rejectionText(t: TFunction, rejection: AnnotationRejection): string {
  if (rejection.reason === 'annotations') return t('map:tools.limit.annotations', { max: rejection.limit });
  if (rejection.reason === 'strokePoints') return t('map:tools.limit.strokePoints', { max: rejection.limit });
  return t('map:tools.limit.totalPoints', { max: rejection.limit, remaining: rejection.remaining });
}

export function MapPanel({ readOnly = false, height = '100%', focusFlightKey }: MapPanelProps) {
  const { t } = useTranslation();
  const { mission, view, settings, side, viewMode, setNotes, storageFailed } = useMission();
  const { flightKey: selectedKey, setFlightKey, setScreen, mapUi, setMapUi, routeFocus: pickedPoint } = useWorkspace();
  // Threat and detection ranges follow the distance unit of the display settings, as the threats screen does (W7).
  const distance = (meters: number) => formatDistance(meters, settings.distanceUnit);
  const theatre = view.meta.theatre;
  const supported = isSupportedTheatre(theatre);
  // The solo view belongs to the map screen. The read-only briefing map follows its focus flight instead (Lead decision 4).
  const soloKey = readOnly ? null : mapUi.soloFlightKey;
  const model = useMemo<MapModel>(
    () => buildMapModel(view, side, viewMode, soloKey),
    [view, side, viewMode, soloKey],
  );
  const annotations = mission.userNotes.mapAnnotations;
  const editable = !readOnly && supported;
  const shown = (id: LayerId) => isLayerAvailable(id, viewMode) && isLayerOn(mapUi.layers, id);
  // Annotations are edited only while their layer is on: a hidden annotation cannot be picked or undone.
  const annotationsOn = editable && shown('annotations');
  const tool: MapTool = annotationsOn ? mapUi.tool : 'move';
  // Route picks change the flight selection only in the move tool of an editable map. The read-only briefing map
  // never changes the selection, so a press there cannot move the briefing to another screen (the pin and line tools place only their mark, T9).
  const selectable = !readOnly && tool === 'move';
  // The ink is the token the user picked (the default is --ink-1). The stored colour is the resolved value.
  const inkToken = isInkToken(mapUi.color) ? mapUi.color : DEFAULT_INK_TOKEN;
  const ink = resolveToken(inkToken);

  // The flight the map centres on. A read-only map (the briefing) shows every flight unless a focus is given,
  // so null and undefined both mean every flight there. The editable map uses the workspace selection when
  // focusFlightKey is undefined (the map screen, the flight screen). A string focuses that flight and dims the others.
  const focusKey = readOnly
    ? (focusFlightKey ?? null)
    : focusFlightKey === undefined ? selectedKey : focusFlightKey;
  const dimOthers = typeof focusFlightKey === 'string';
  // The point picked in the route table is an editing aid: the read-only briefing map never draws it (W3). The
  // workspace drops the pick when another flight is chosen, so it never marks a flight the user left.
  const routeFocus = readOnly ? null : pickedPoint;
  const isHighlighted = (routeKey: string) => routeKey === focusKey || routeKey === routeFocus?.flightKey;

  const [removal, setRemoval] = useState<Removal | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);
  const [rejection, setRejection] = useState<AnnotationRejection | null>(null);
  const [background, setBackground] = useState<BackgroundState>('loading');
  // Narrow widths start with the legend folded and the layers sheet shut, so neither covers the map.
  const [legendOpen] = useState(() => !isNarrowViewport());
  const [layersOpen] = useState(() => !isNarrowViewport());
  const mapRef = useRef<LeafletMap | null>(null);

  // Turning the base map back on starts a fresh loading state (the old failure may be gone).
  useEffect(() => {
    setBackground(settings.mapBackground ? 'loading' : 'ready');
  }, [settings.mapBackground]);

  const bounds = useMemo<FitBounds>(() => ({
    all: collectBounds(model, theatre),
    flight: focusKey ? flightBounds(model, focusKey) : null,
    solo: soloKey ? flightBounds(model, soloKey) : null,
  }), [model, theatre, focusKey, soloKey]);

  // A map that opens with a solo flight (from the flight screen's "この機だけ地図に") fits that flight at once.
  const [fit, setFit] = useState<FitRequest>(() => ({ id: 1, target: soloKey ? 'solo' : focusKey ? 'flight' : 'all' }));
  const lastKey = useRef(focusKey);
  useEffect(() => {
    if (lastKey.current === focusKey) return;
    lastKey.current = focusKey;
    setFit(previous => ({ id: previous.id + 1, target: focusKey ? 'flight' : 'all' }));
  }, [focusKey]);
  // Lead decision: "この機だけ地図に" fits the solo flight, and "全機を表示に戻す" fits every flight again.
  // Declared after the selection fit, so a change of both in one render ends on the solo target.
  const lastSolo = useRef(soloKey);
  useEffect(() => {
    if (lastSolo.current === soloKey) return;
    lastSolo.current = soloKey;
    setFit(previous => ({ id: previous.id + 1, target: soloKey ? 'solo' : 'all' }));
  }, [soloKey]);

  // The route point picked in the route table. Only the marker and (when out of view) the pan follow it; no refit.
  const focusTarget = useMemo<RouteFocusTarget | null>(() => {
    if (!routeFocus) return null;
    const entry = model.flights.find(candidate => candidate.routeKey === routeFocus.flightKey);
    const waypoint = entry?.flight.route[routeFocus.routeIndex];
    if (!entry || !waypoint || !isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) return null;
    return {
      point: waypoint.latlon,
      title: `${entry.flight.callsign || entry.flight.name}: ${waypoint.name}`,
    };
  }, [routeFocus, model]);

  // "この機だけ地図に" banner: names the flight and offers to show every flight again.
  const soloFlight = soloKey ? findFlightInView(view, soloKey) : null;
  const showAllFlights = () => setMapUi(previous => ({ ...previous, soloFlightKey: null }));

  // Escape returns to move, except while the user is typing in a field or while the clear confirmation is open
  // (that Escape closes the confirmation instead).
  useEffect(() => {
    if (!editable || tool === 'move') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirmingClear || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // An Escape inside a dialog (the settings drawer) or a menu closes that layer, not the map tool (A11Y-7).
      if (target instanceof Element && target.closest('[role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      setMapUi(previous => ({ ...previous, tool: 'move' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, tool, setMapUi, confirmingClear]);

  // Opening the clear confirmation moves focus to its safe choice (やめる). Escape or やめる closes it and returns
  // focus to the button that opened it.
  useEffect(() => {
    if (!confirmingClear) return undefined;
    keepButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setConfirmingClear(false);
      clearButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmingClear]);

  const sideLabel = (value: CoalitionKey) => t(`shell:side.${value}`);

  const setLayer = (id: LayerId, on: boolean) => {
    setMapUi(previous => ({ ...previous, layers: { ...previous.layers, [id]: on } }));
  };
  /** An empty map of layer states means every layer takes its default (SPEC F12 "レイヤーを戻す"). */
  const restoreLayers = () => setMapUi(previous => ({ ...previous, layers: {} }));
  const anyLayerOn = layerGroupsFor(viewMode).some(group => group.layers.some(id => shown(id)));
  // The map's own zoom control is off (it sat under the layers panel); these buttons sit in the top-right stack.
  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const setTool = (next: MapTool) => {
    setMapUi(previous => ({ ...previous, tool: next }));
    setRejection(null);
  };

  const commit = (next: MapAnnotation[]) => setNotes({ ...mission.userNotes, mapAnnotations: next });
  /** Adds the annotation when it fits. Returns whether it was added. */
  const addAnnotation = (candidate: MapAnnotation): boolean => {
    const check = checkAdd(annotations, candidate);
    if (!check.ok) {
      setRejection(check);
      return false;
    }
    setRejection(null);
    setRemoval(null);
    commit([...annotations, candidate]);
    return true;
  };
  const addPin = (at: LatLon) => {
    const number = nextPinNumber(annotations, pinPatternFor(t));
    addAnnotation({
      id: createAnnotationId('pin'),
      kind: 'pin',
      position: at,
      label: t('map:annotations.defaultPin', { count: number }),
      notes: '',
      color: ink,
    });
  };
  const pinAtCentre = () => {
    const centre = mapRef.current?.getCenter();
    if (centre) addPin([centre.lat, centre.lng]);
  };
  const addStroke = (points: LatLon[]): boolean => addAnnotation({
    id: createAnnotationId('stroke'),
    kind: 'stroke',
    points,
    color: ink,
    width: 4,
  });
  /** A line that reaches the point limit ends there; this says so, after the line is kept. */
  const strokeLimitReached = () => {
    setRejection({ ok: false, reason: 'strokePoints', limit: MAX_MAP_STROKE_POINTS, remaining: 0 });
  };
  const removeById = (id: string) => {
    const result = removeAnnotation(annotations, id);
    if (!result.removed) return;
    setRemoval({ kind: 'one', removed: result.removed });
    setRejection(null);
    commit(result.next);
  };
  const updateAnnotation = (next: MapAnnotation) => commit(replaceMapAnnotation(annotations, next));
  const undo = () => {
    const result = undoLast(annotations);
    if (!result.removed) return;
    setRemoval({ kind: 'one', removed: result.removed });
    setRejection(null);
    commit(result.next);
  };
  /** "注釈をすべて消す" after the user confirmed. One step of 元に戻す brings every annotation back. */
  const clearAll = () => {
    if (annotations.length === 0) return;
    setRemoval({ kind: 'all', annotations });
    setRejection(null);
    setConfirmingClear(false);
    commit([]);
  };
  const restore = () => {
    if (!removal) return;
    if (removal.kind === 'all') {
      if (annotations.length > 0) return;
      setRemoval(null);
      setRejection(null);
      commit(removal.annotations);
      return;
    }
    const result = restoreAnnotation(annotations, removal.removed);
    if (!result.ok) {
      setRejection(result);
      return;
    }
    setRemoval(null);
    setRejection(null);
    commit(result.next);
  };

  const selectFlight = (key: string) => setFlightKey(key);
  const openFlight = (key: string) => {
    setFlightKey(key);
    setScreen('flights');
  };
  const fitAll = () => setFit(previous => ({ id: previous.id + 1, target: 'all' }));

  if (!supported) {
    const rows = buildDcsRows(model);
    return (
      <div className="map-panel map-panel-unsupported" style={{ height }}>
        <div className="map-unsupported">
          <Notice tone="warning" title={t('map:unsupported.title', { theatre })}>
            <p>{t('map:unsupported.body')}</p>
          </Notice>
          <div className="map-dcs-table-wrap">
            <table className="map-dcs-table">
              <caption>{t('map:unsupported.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('map:unsupported.col.side')}</th>
                  <th scope="col">{t('map:unsupported.col.kind')}</th>
                  <th scope="col">{t('map:unsupported.col.name')}</th>
                  <th scope="col" className="num">X</th>
                  <th scope="col" className="num">Y</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td><SideMark side={row.side} /></td>
                    <td>{t(`map:unsupported.kind.${row.kind}`)}</td>
                    <td>{row.name}</td>
                    <td className="num">{Math.round(row.xy[0])}</td>
                    <td className="num">{Math.round(row.xy[1])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const undoKey = annotations.length === 0
    ? 'map:tools.undoNone'
    : annotations[annotations.length - 1].kind === 'pin' ? 'map:tools.undoPin' : 'map:tools.undoLine';
  const toolOptions = (['move', 'pin', 'line'] as const).map(value => ({ value, label: t(`map:tools.${value}`) }));
  const offMap = model.unresolved;

  // The legend lists what the view draws: route lines for the sides that have flights (so pilot view
  // never names the opposing side, D1), and mark shapes for the sides that have marks drawn.
  const routeSides = LEGEND_SIDES.filter(value => model.flights.some(entry => entry.side === value));
  const markSides = drawnMarkSides(model, theatre, shown);
  const showShapes = MARK_LAYERS.some(shown) && LEGEND_SIDES.some(value => markSides.has(value));
  const legend = (
    <details className="map-overlay map-legend" open={legendOpen}>
      <summary>{t('map:legend.title')}</summary>
      <ul className="map-legend-list" aria-label={t('map:legend.title')}>
        {shown('flights') && routeSides.map(value => (
          <LegendItem key={`route-${value}`} sampleClass={`map-route-${value}`} label={t('map:legend.route', { side: sideLabel(value) })} />
        ))}
        {showShapes && (
          <li className="map-legend-item map-legend-shapes">
            <span>{t('map:legend.shapes')}</span>
            {LEGEND_SIDES.filter(value => markSides.has(value)).map(value => (
              <span key={`shape-${value}`} className="map-legend-shape">
                <span className={`map-mark map-mark-${value}`} aria-hidden="true" />
                <span>{t(`map:legend.shape.${value}`)}</span>
              </span>
            ))}
          </li>
        )}
        {shown('navpoints') && (
          <LegendItem label={t('map:legend.navpoint')}>
            <span className="map-mark map-mark-neutral"><span className="map-mark-glyph">{MARK_GLYPHS.navpoint}</span></span>
          </LegendItem>
        )}
        {shown('airbases') && (
          <LegendItem label={t('map:legend.airbase')}>
            <span className="map-mark map-mark-neutral"><span className="map-mark-glyph">{MARK_GLYPHS.airbase}</span></span>
          </LegendItem>
        )}
        {shown('bullseye') && (
          <LegendItem label={t('map:legend.bullseye')}>
            <span className="map-mark map-mark-neutral"><span className="map-mark-glyph">{MARK_GLYPHS.bullseye}</span></span>
          </LegendItem>
        )}
        {shown('support') && (
          <LegendItem label={t('map:legend.support')}>
            <span className="map-mark map-mark-wide map-mark-neutral">
              <span className="map-mark-glyph map-mark-code">{SUPPORT_CODES.tanker}</span>
            </span>
          </LegendItem>
        )}
        {shown('threats') && <LegendItem sampleClass="map-range-threat" label={t('map:legend.threat')} />}
        {shown('detection') && <LegendItem sampleClass="map-range-detection" label={t('map:legend.detection')} />}
        {shown('enemies') && (
          <LegendItem label={t('map:legend.enemy')}>
            <span className="map-mark map-mark-neutral" />
          </LegendItem>
        )}
        {shown('zones') && <LegendItem sampleClass="map-zone" label={t('map:legend.zone')} />}
        {shown('drawings') && <LegendItem sampleClass="map-drawing-default" label={t('map:legend.drawing')} />}
        {shown('annotations') && (
          <LegendItem label={t('map:legend.annotation')}>
            <span className="map-user-pin-body"><span className="map-user-pin-mark">✎</span></span>
          </LegendItem>
        )}
      </ul>
    </details>
  );

  return (
    <div
      className="map-panel"
      style={{ height }}
      data-read-only={readOnly ? 'true' : undefined}
      data-tool={editable ? tool : undefined}
    >
      <MapContainer className="map-canvas" center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom={true} zoomControl={false}>
        <MapHandle target={mapRef} />
        <RouteFocusPan selection={routeFocus} point={focusTarget?.point ?? null} />
        {settings.mapBackground && (
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            eventHandlers={{
              tileload: () => setBackground('ready'),
              tileerror: () => setBackground('failed'),
            }}
          />
        )}
        <FitController request={fit} bounds={bounds} />
        {annotationsOn && tool !== 'move' && (
          <AnnotationPointer
            tool={tool}
            color={ink}
            onPin={addPin}
            onStroke={addStroke}
            onStrokeLimit={strokeLimitReached}
          />
        )}

        {shown('bullseye') && model.bullseyes.map(entry => {
          if (!entry.latlon) return null;
          const title = `${sideLabel(entry.side)} Bullseye`;
          return (
            <Marker key={`bullseye-${entry.side}-${title}`} position={entry.latlon} icon={markIcon('bullseye', entry.side)} title={title} alt={title}>
              <Popup>{title}</Popup>
            </Marker>
          );
        })}

        {shown('navpoints') && (
          <LayerGroup>
            {model.navPoints.map(({ side: owner, item }) => {
              if (!isResolvedLatLon(item.latlon, item.latlonResolved)) return null;
              const title = `${sideLabel(owner)} NavPoint ${item.index}: ${item.name}`;
              return (
                <Marker key={`np-${owner}-${item.index}-${title}`} position={item.latlon} icon={markIcon('navpoint', owner)} title={title} alt={title}>
                  <Popup>{title}</Popup>
                </Marker>
              );
            })}
          </LayerGroup>
        )}

        {shown('airbases') && (
          <LayerGroup>
            {model.airbases.map(({ side: owner, item }) => {
              if (!isResolvedLatLon(item.latlon, item.latlonResolved)) return null;
              const name = item.name || t('map:airbase.fallback', { id: item.id });
              const title = `${sideLabel(owner)} ${name}`;
              return (
                <Marker key={`ab-${owner}-${item.id}-${title}`} position={item.latlon} icon={markIcon('airbase', owner)} title={title} alt={title}>
                  <Popup>{title}</Popup>
                </Marker>
              );
            })}
          </LayerGroup>
        )}

        {shown('flights') && model.flights.map(entry => (
          <FlightRoute
            key={`${entry.side}-${entry.flight.groupId}`}
            entry={entry}
            highlighted={isHighlighted(entry.routeKey)}
            dimmed={dimOthers && !isHighlighted(entry.routeKey)}
            selectable={selectable}
            onSelect={selectFlight}
            onOpen={readOnly ? undefined : openFlight}
          />
        ))}

        {focusTarget && shown('flights') && (
          <Marker
            position={focusTarget.point}
            icon={focusIcon()}
            interactive={false}
            zIndexOffset={1000}
            title={focusTarget.title}
            alt={focusTarget.title}
          />
        )}

        {shown('zones') && model.zones.map((zone, index) => (
          <ZoneLayer key={`zone-${zone.zoneId}-${index}`} zone={zone} theatre={theatre} />
        ))}

        {shown('drawings') && model.drawings.map((drawing, index) => (
          <DrawingLayer key={`drawing-${drawing.layer}-${index}`} drawing={drawing} theatre={theatre} />
        ))}

        {shown('support') && model.support.map(({ side: owner, item }, index) => {
          const position = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
          if (!position) return null;
          const title = `${sideLabel(owner)} ${t(`map:support.kind.${item.kind}`, { defaultValue: item.kind })}: ${item.callsign}`;
          return (
            <Marker key={`support-${owner}-${index}-${title}`} position={position} icon={supportIcon(item.kind, owner)} title={title} alt={title}>
              <Popup>{title}</Popup>
            </Marker>
          );
        })}

        {shown('threats') && model.groups.map(({ side: owner, item }, index) => {
          const position = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
          const range = item.threatRange;
          if (!position || range === undefined || range <= 0) return null;
          return (
            <Circle key={`threat-${owner}-${index}`} center={position} radius={range} className={`map-range map-range-threat map-range-${owner}`}>
              <Popup>{t('map:popup.threat', { side: sideLabel(owner), type: item.type, range: distance(range) })}</Popup>
            </Circle>
          );
        })}

        {shown('detection') && model.groups.map(({ side: owner, item }, index) => {
          const position = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
          const range = item.detectionRange;
          if (!position || range === undefined || range <= 0) return null;
          return (
            <Circle key={`detect-${owner}-${index}`} center={position} radius={range} className={`map-range map-range-detection map-range-${owner}`}>
              <Popup>{t('map:popup.detection', { side: sideLabel(owner), type: item.type, range: distance(range) })}</Popup>
            </Circle>
          );
        })}

        {shown('enemies') && model.groups.map(({ side: owner, item }, index) => {
          const position = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
          if (!position) return null;
          const title = `${sideLabel(owner)} ${item.type} (${item.count})`;
          return (
            <Marker key={`enemy-${owner}-${index}-${title}`} position={position} icon={markIcon('enemy', owner)} title={title} alt={title}>
              <Popup>{t('map:popup.enemy', { side: sideLabel(owner), type: item.type, count: item.count })}</Popup>
            </Marker>
          );
        })}

        {shown('annotations') && (
          <LayerGroup>
            {annotations.map(annotation => annotation.kind === 'stroke' ? (
              <Polyline
                key={annotation.id}
                positions={annotation.points}
                pathOptions={{ color: annotation.color, weight: annotation.width, opacity: 0.9 }}
              >
                {editable ? (
                  <Popup>
                    <StrokeEditor
                      stroke={annotation}
                      onUpdate={updateAnnotation}
                      onDelete={() => removeById(annotation.id)}
                    />
                  </Popup>
                ) : (
                  <Popup>{t('map:annotations.kind.stroke')}</Popup>
                )}
              </Polyline>
            ) : (
              <Marker
                key={`${annotation.id}-${truncateLabel(annotation.label)}`}
                position={annotation.position}
                icon={userPinIcon(annotation.color)}
                title={truncateLabel(annotation.label)}
                alt={truncateLabel(annotation.label)}
              >
                <Popup>
                  {editable ? (
                    <PinEditor
                      pin={annotation}
                      onUpdate={updateAnnotation}
                      onDelete={() => removeById(annotation.id)}
                    />
                  ) : (
                    <div>
                      <strong>{truncateLabel(annotation.label)}</strong>
                      {annotation.notes && <p>{annotation.notes}</p>}
                    </div>
                  )}
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        )}
      </MapContainer>

      <div className="map-overlay map-layers-panel">
        <details className="map-layers" open={layersOpen}>
          <summary>{t('map:layers.title')}</summary>
          {layerGroupsFor(viewMode).map(group => (
            <fieldset key={group.id} className="map-layer-group">
              <legend>{groupHeading(group.id, group.layers, t)}</legend>
              {group.layers.map(id => (
                <label key={id} className="map-layer-toggle">
                  <input
                    type="checkbox"
                    checked={isLayerOn(mapUi.layers, id)}
                    onChange={event => setLayer(id, event.target.checked)}
                  />
                  <span>{t(`map:layers.${id}`)}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </details>
      </div>

      <div className="map-overlay map-topright">
        <div className="map-zoom" role="group" aria-label={t('map:controls.zoom')}>
          <button type="button" className="map-button" aria-label={t('map:controls.zoomIn')} onClick={zoomIn}>+</button>
          <button type="button" className="map-button" aria-label={t('map:controls.zoomOut')} onClick={zoomOut}>−</button>
        </div>
        <button type="button" className="map-button" onClick={fitAll}>{t('map:controls.fitAll')}</button>
        {offMap.length > 0 && (
          <details className="map-offmap">
            <summary>{t('map:controls.offMap', { count: offMap.length })}</summary>
            <ul>
              {offMap.map(entry => (
                <li key={entry.id}>
                  <SideMark side={entry.side} />
                  <span>{entry.label}</span>
                  <Unresolved xy={entry.xy} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {!settings.mapBackground && <span className="map-status">{t('map:controls.backgroundHidden')}</span>}
        {settings.mapBackground && background === 'loading' && (
          <span className="map-status" role="status">{t('map:controls.backgroundLoading')}</span>
        )}
        {settings.mapBackground && background === 'failed' && (
          <span className="map-status" role="status">{t('map:controls.backgroundMissing')}</span>
        )}
      </div>

      {soloFlight && (
        <div className="map-overlay map-solo" role="status">
          <span>{t('map:solo.showing', { callsign: soloFlight.callsign || soloFlight.name })}</span>
          <button type="button" className="map-button" onClick={showAllFlights}>{t('map:solo.showAll')}</button>
        </div>
      )}

      {!anyLayerOn ? (
        <div className="map-empty" role="status">
          <Notice tone="info" title={t('map:empty.noLayers')}>
            <button type="button" className="map-button" onClick={restoreLayers}>{t('map:empty.restoreLayers')}</button>
          </Notice>
        </div>
      ) : !bounds.all.isValid() && (
        <div className="map-empty" role="status">
          <Notice tone="info">{t('map:empty.noPoints')}</Notice>
        </div>
      )}

      {editable && (
        <div className="map-overlay map-tools" role="toolbar" aria-label={t('map:tools.label')}>
          {!annotationsOn && <Notice tone="info">{t('map:tools.hidden')}</Notice>}
          {annotationsOn && (
            <>
          <Segmented label={t('map:tools.label')} options={toolOptions} value={tool} onChange={setTool} />
          <div className="map-swatches" role="group" aria-label={t('map:tools.color')}>
            {INK_SWATCHES.map(swatch => {
              const pressed = swatch.token === inkToken;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  className={`map-swatch map-swatch-${swatch.id}${pressed ? ' is-pressed' : ''}`}
                  aria-pressed={pressed}
                  aria-label={t(`map:tools.colors.${swatch.id}`)}
                  onClick={() => setMapUi(previous => ({ ...previous, color: swatch.token }))}
                >
                  <span className="map-swatch-glyph" aria-hidden="true">{swatch.glyph}</span>
                </button>
              );
            })}
          </div>
          <div className="map-tool-actions">
            <button type="button" disabled={annotations.length === 0} onClick={undo}>{t(undoKey)}</button>
            {removal && <button type="button" onClick={restore}>{t('map:tools.restore')}</button>}
            {tool === 'pin' && <button type="button" onClick={pinAtCentre}>{t('map:tools.pinCentre')}</button>}
            <button
              ref={clearButtonRef}
              type="button"
              disabled={annotations.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              {t('map:tools.clearAll')}
            </button>
          </div>
          {confirmingClear && annotations.length > 0 && (
            <div className="map-confirm" role="group" aria-label={t('map:tools.clearAll')}>
              <p>{t('map:tools.clearConfirm', { count: annotations.length })}</p>
              <div className="map-tool-actions">
                <button type="button" className="map-danger" onClick={clearAll}>{t('map:tools.clearYes')}</button>
                <button
                  ref={keepButtonRef}
                  type="button"
                  onClick={() => {
                    setConfirmingClear(false);
                    clearButtonRef.current?.focus();
                  }}
                >
                  {t('map:tools.clearNo')}
                </button>
              </div>
            </div>
          )}
          <p className="map-tool-help">{t(`map:tools.help.${tool}`)}</p>
          <p className="map-count">{t('map:tools.count', { count: annotations.length, max: MAX_MAP_ANNOTATIONS })}</p>
          <p className="map-count">
            {t('map:tools.pointsLeft', {
              remaining: MAX_MAP_POINTS_TOTAL - strokePointTotal(annotations),
              max: MAX_MAP_POINTS_TOTAL,
            })}
          </p>
          {storageFailed && <Notice tone="warning">{t('map:tools.storageFailed')}</Notice>}
          {rejection && <Notice tone="warning">{rejectionText(t, rejection)}</Notice>}
          {removal && (
            <p className="map-count">
              {removal.kind === 'one'
                ? t('map:tools.removed', { kind: t(`map:annotations.kind.${removal.removed.annotation.kind}`) })
                : t('map:tools.removedAll', { count: removal.annotations.length })}
            </p>
          )}
            </>
          )}
        </div>
      )}

      {legend}
    </div>
  );
}

/**
 * One legend row. A line sample takes a class (the same class as the drawn line); a mark sample is the
 * drawn element itself, so the legend shows the shape that is on the map.
 */
function LegendItem({ sampleClass, label, children }: { sampleClass?: string; label: string; children?: ReactNode }) {
  const classes = ['map-legend-sample', sampleClass, children ? 'map-legend-mark' : undefined].filter(Boolean).join(' ');
  return (
    <li className="map-legend-item">
      <span className={classes} aria-hidden="true">{children}</span>
      <span>{label}</span>
    </li>
  );
}

/**
 * Pans to the route point picked in the route table, only when it is outside the view. The view is never
 * refitted for a route pick (F12). Every pick is a new selection object, so picking the same row again pans again,
 * even though the point itself keeps its identity. The point is read through a ref, so a rebuilt model alone never pans.
 */
function RouteFocusPan({ selection, point }: { selection: RouteFocus | null; point: LatLon | null }) {
  const map = useMap();
  const latest = useRef(point);
  useEffect(() => {
    latest.current = point;
  }, [point]);
  useEffect(() => {
    const target = latest.current;
    if (!selection || !target) return;
    if (!map.getBounds().contains(target)) map.panTo(target, { animate: !prefersReducedMotion() });
  }, [map, selection]);
  return null;
}

/** Applies the fit request. Reads the latest bounds through a ref, so a new bounds value alone never refits. */
function FitController({ request, bounds }: { request: FitRequest; bounds: FitBounds }) {
  const map = useMap();
  const latest = useRef(bounds);
  useEffect(() => {
    latest.current = bounds;
  }, [bounds]);
  useEffect(() => {
    const { all, flight, solo } = latest.current;
    const target = request.target === 'solo' && solo ? solo : request.target === 'flight' && flight ? flight : all;
    fitMap(map, target);
  }, [map, request.id, request.target]);
  return null;
}

interface AnnotationPointerProps {
  tool: 'pin' | 'line';
  color: string;
  onPin: (at: LatLon) => void;
  /** Returns whether the stroke was added. */
  onStroke: (points: LatLon[]) => boolean;
  /** Called after a stroke that ended at the point limit has been added. */
  onStrokeLimit: () => void;
}

/**
 * Pointer input for pins and strokes. Uses pointer events on the map container,
 * so touch and mouse share one path. Two fingers cancel a stroke and pan or zoom.
 * A stroke that reaches the point limit ends there, and the limit is reported.
 */
function AnnotationPointer({ tool, color, onPin, onStroke, onStrokeLimit }: AnnotationPointerProps) {
  const map = useMap();
  const [draft, setDraft] = useState<LatLon[] | null>(null);
  const handlers = useRef({ onPin, onStroke, onStrokeLimit });
  useEffect(() => {
    handlers.current = { onPin, onStroke, onStrokeLimit };
  });

  useEffect(() => {
    const container = map.getContainer();
    const gestures = new PointerGestures(tool, (a, b) => map.distance(a, b));
    const at = (event: PointerEvent): LatLon => {
      const latlng = map.mouseEventToLatLng(event);
      return [latlng.lat, latlng.lng];
    };
    const screen = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
    const onDown = (event: PointerEvent) => {
      // A press on a marker opens its popup (Leaflet's own click); it never starts a pin or a line.
      if (event.target instanceof Element && event.target.closest('.leaflet-control, .leaflet-popup, .leaflet-marker-icon')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gestures.down(event.pointerId, screen(event), at(event));
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an optimisation; drawing still works without it.
      }
      if (tool === 'line') setDraft(gestures.draft);
    };
    const onMove = (event: PointerEvent) => {
      const preview = gestures.move(event.pointerId, screen(event), at(event));
      if (tool === 'line' && gestures.hasReachedLimit(event.pointerId)) {
        const points = gestures.endStroke(event.pointerId);
        setDraft(null);
        if (points && handlers.current.onStroke(points)) handlers.current.onStrokeLimit();
        return;
      }
      if (tool === 'line') setDraft(preview);
    };
    const onUp = (event: PointerEvent) => {
      const result = gestures.up(event.pointerId, screen(event));
      setDraft(gestures.draft);
      if (result.type === 'pin') handlers.current.onPin(result.at);
      if (result.type === 'stroke') handlers.current.onStroke(result.points);
    };
    const onCancel = (event: PointerEvent) => {
      gestures.cancel(event.pointerId);
      setDraft(gestures.draft);
    };

    const previousTouchAction = container.style.touchAction;
    const previousCursor = container.style.cursor;
    if (tool === 'line') {
      map.dragging.disable();
      container.style.touchAction = 'none';
    }
    container.style.cursor = 'crosshair';
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onCancel);
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onCancel);
      map.dragging.enable();
      container.style.touchAction = previousTouchAction;
      container.style.cursor = previousCursor;
      setDraft(null);
    };
  }, [map, tool]);

  return draft && draft.length > 1
    ? <Polyline positions={draft} color={color} weight={4} opacity={0.75} className="map-stroke-preview" />
    : null;
}

/**
 * Runs of consecutive route points that have coordinates. A point without coordinates ends the run,
 * so the line does not bridge the gap; the gap shows on the map instead of a straight false leg.
 */
function routeRuns(route: RoutePoint[]): LatLon[][] {
  const runs: LatLon[][] = [];
  let current: LatLon[] = [];
  for (const waypoint of route) {
    if (isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) {
      current.push(waypoint.latlon);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function FlightRoute({ entry, highlighted, dimmed, selectable, onSelect, onOpen }: {
  entry: FlightEntry;
  /** The selected flight, or the flight of the route focus. */
  highlighted: boolean;
  /** Another flight while one flight is focused (the briefing map). */
  dimmed: boolean;
  /** Whether a press picks the flight (move tool only). */
  selectable: boolean;
  onSelect: (key: string) => void;
  /** Absent on the read-only map, where a popup offers no link to another screen. */
  onOpen?: (key: string) => void;
}) {
  const { t } = useTranslation();
  const { flight, side: owner, key } = entry;
  const label = flight.callsign || flight.name;
  const runs = routeRuns(flight.route);
  const select = selectable && key ? { click: () => onSelect(key) } : undefined;
  const state = `${highlighted ? 'selected' : 'idle'}-${dimmed ? 'dim' : 'full'}`;
  return (
    <>
      {runs.map((run, runIndex) => run.length > 1 && (
        // The key holds the state: react-leaflet does not change a path's class after it is drawn.
        <Polyline
          key={`run-${runIndex}-${state}`}
          positions={run}
          className={`map-route map-route-${owner}${highlighted ? ' is-selected' : ''}${dimmed ? ' is-dim' : ''}`}
          eventHandlers={select}
        />
      ))}
      {flight.route.map((waypoint, routeIndex) => {
        if (!isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) return null;
        const title = `${label}: ${waypoint.name}`;
        return (
          <Marker
            key={`${owner}-${flight.groupId}-wp-${routeIndex}`}
            position={waypoint.latlon}
            icon={waypointIcon(routeIndex + 1, highlighted, dimmed)}
            title={title}
            alt={title}
            eventHandlers={select}
          >
            <Popup>
              <strong>{title}</strong>
              {waypoint.action && <div>{waypoint.action}</div>}
              {key && onOpen && (
                <button type="button" className="map-button" onClick={() => onOpen(key)}>
                  {t('map:popup.openFlight')}
                </button>
              )}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function ZoneLayer({ zone, theatre }: { zone: TriggerZone; theatre: string }) {
  const { t } = useTranslation();
  const color = dcsColorToCss(zone.color);
  const pathOptions = color ? { color, fillColor: color } : {};
  const className = color ? 'map-zone' : 'map-zone map-zone-default';
  const label = t('map:popup.zone', { name: zone.name });
  if (zone.type === 0) {
    const center = getDcsCoordinate(theatre, zone.xy[0], zone.xy[1]);
    if (!center) return null;
    return (
      <Circle center={center} radius={zone.radius} className={className} {...pathOptions}>
        <Popup>{label}</Popup>
      </Circle>
    );
  }
  const positions = (zone.vertices ?? [])
    .map(vertex => getDcsCoordinate(theatre, vertex[0], vertex[1]))
    .filter((position): position is LatLon => position !== null);
  if (positions.length < 2) return null;
  return (
    <Polyline positions={positions} className={className} {...pathOptions}>
      <Popup>{label}</Popup>
    </Polyline>
  );
}

function DrawingLayer({ drawing, theatre }: { drawing: Drawing; theatre: string }) {
  if (!drawing.visible) return null;
  return (
    <LayerGroup>
      {drawing.objects.map((object, index) => {
        const positions = object.points
          .map(point => getDcsCoordinate(theatre, point[0], point[1]))
          .filter((position): position is LatLon => position !== null);
        const key = `${drawing.layer}-${index}`;
        const color = object.color && object.color.trim() !== '' ? object.color.trim() : null;
        const pathOptions = color ? { color, fillColor: object.fillColor || color } : {};
        const className = color ? 'map-drawing' : 'map-drawing map-drawing-default';

        if (object.primitiveType === 'Line') {
          return positions.length > 1
            ? <Polyline key={key} positions={positions} className={className} weight={object.thickness} {...pathOptions} />
            : null;
        }
        if (object.primitiveType === 'Polygon') {
          // A polygon is closed and lightly filled, so its area reads without covering the routes.
          return positions.length > 1
            ? <Polygon key={key} positions={positions} className={className} weight={object.thickness} fillOpacity={0.15} {...pathOptions} />
            : null;
        }
        if (object.primitiveType === 'TextBox') {
          const position = positions[0];
          if (!position) return null;
          return (
            <Marker key={key} position={position} icon={markIcon('navpoint', 'neutral')} title={object.name} alt={object.name}>
              <Popup>{object.name}</Popup>
            </Marker>
          );
        }
        return null;
      })}
    </LayerGroup>
  );
}

function PinEditor({ pin, onUpdate, onDelete }: {
  pin: MapPinAnnotation;
  onUpdate: (pin: MapPinAnnotation) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(pin.label);
  const [notes, setNotes] = useState(pin.notes);
  const [color, setColor] = useState(pin.color);
  const colorInput = colorInputValue(color);
  return (
    <div className="map-pin-editor">
      <label>
        <span>{t('map:annotations.label')}</span>
        <input value={label} maxLength={MAX_MAP_LABEL_LENGTH} onChange={event => setLabel(event.target.value)} />
      </label>
      <label>
        <span>{t('map:annotations.notes')}</span>
        <textarea value={notes} maxLength={MAX_MAP_NOTE_LENGTH} rows={3} onChange={event => setNotes(event.target.value)} />
      </label>
      <label>
        <span>{t('map:annotations.color')}</span>
        <input type="color" value={colorInput} onChange={event => setColor(event.target.value)} />
      </label>
      <div className="map-editor-actions">
        <button type="button" onClick={() => onUpdate({ ...pin, label, notes, color })}>{t('map:annotations.save')}</button>
        <button type="button" className="map-danger" onClick={onDelete}>{t('map:annotations.delete')}</button>
      </div>
    </div>
  );
}

function StrokeEditor({ stroke, onUpdate, onDelete }: {
  stroke: MapStrokeAnnotation;
  onUpdate: (stroke: MapStrokeAnnotation) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [color, setColor] = useState(stroke.color);
  // The width stays as typed while editing (an empty field is allowed); it is clamped on save.
  const [width, setWidth] = useState(String(stroke.width));
  const colorInput = colorInputValue(color);
  const save = () => {
    const parsed = Math.round(Number(width));
    const nextWidth = width.trim() === '' || !Number.isFinite(parsed) ? stroke.width : Math.max(1, Math.min(12, parsed));
    onUpdate({ ...stroke, color, width: nextWidth });
  };
  return (
    <div className="map-pin-editor">
      <label>
        <span>{t('map:annotations.color')}</span>
        <input type="color" value={colorInput} onChange={event => setColor(event.target.value)} />
      </label>
      <label>
        <span>{t('map:annotations.width')}</span>
        <input
          type="number"
          min={1}
          max={12}
          step={1}
          value={width}
          onChange={event => setWidth(event.target.value)}
        />
      </label>
      <div className="map-editor-actions">
        <button type="button" onClick={save}>
          {t('map:annotations.save')}
        </button>
        <button type="button" className="map-danger" onClick={onDelete}>{t('map:annotations.delete')}</button>
      </div>
    </div>
  );
}

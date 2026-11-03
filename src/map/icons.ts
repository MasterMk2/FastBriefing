import L from 'leaflet';
import type { CoalitionKey } from './mapModel';

/**
 * Leaflet icons for the map. Colours and shapes come from CSS classes, which
 * read tokens.css, so a theme change needs no re-render. Only the user's pin
 * colour is an inline style, and it is checked first (it comes from a notes file).
 */

const cache = new Map<string, L.DivIcon>();

function cached(key: string, build: () => L.DivIcon): L.DivIcon {
  const existing = cache.get(key);
  if (existing) return existing;
  const icon = build();
  cache.set(key, icon);
  return icon;
}

/**
 * Route point number. The selected flight's points carry an extra class; the points of the other flights
 * are dimmed when one flight is focused (MapPanelProps.focusFlightKey).
 */
export function waypointIcon(number: number, selected: boolean, dimmed = false): L.DivIcon {
  const classes = ['map-icon', 'map-icon-waypoint'];
  if (selected) classes.push('is-selected');
  if (dimmed) classes.push('is-dim');
  return cached(`wp:${number}:${selected ? 1 : 0}:${dimmed ? 1 : 0}`, () => L.divIcon({
    className: classes.join(' '),
    html: `<span>${number}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  }));
}

/** Ring that marks the route point picked in the route table (routeFocus). It takes no pointer input. */
export function focusIcon(): L.DivIcon {
  return cached('focus', () => L.divIcon({
    className: 'map-icon map-icon-focus',
    html: '<span class="map-focus-ring"></span>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  }));
}

export type MarkKind = 'airbase' | 'navpoint' | 'support' | 'enemy' | 'bullseye';

/** Glyph drawn inside each coalition mark. Exported so the legend draws the same glyphs. */
export const MARK_GLYPHS: Record<MarkKind, string> = {
  airbase: '✈',
  navpoint: '•',
  support: '◎',
  enemy: '',
  bullseye: '◉',
};

/*
 * Leaflet positions its own wrapper with a transform, so the coalition shape
 * (a rotated diamond for red) is drawn on an inner element.
 */

/** Coalition mark: blue square, red diamond, neutral circle (SPEC 1.4). Constant glyphs only. */
export function markIcon(kind: MarkKind, side: CoalitionKey): L.DivIcon {
  return cached(`mark:${kind}:${side}`, () => L.divIcon({
    className: 'map-icon map-icon-mark',
    html: `<span class="map-mark map-mark-${side}"><span class="map-mark-glyph">${MARK_GLYPHS[kind]}</span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  }));
}

/** Support asset glyph: a short text code (tanker, AWACS, carrier, JTAC) with the full name in the marker title. */
/** Short codes for the support kinds. Exported so the legend draws the same codes. */
export const SUPPORT_CODES: Record<string, string> = { tanker: 'TKR', awacs: 'AWC', carrier: 'CVN', jtac: 'JTAC' };

export function supportIcon(kind: string, side: CoalitionKey): L.DivIcon {
  const code = SUPPORT_CODES[kind] ?? '?';
  return cached(`support:${code}:${side}`, () => L.divIcon({
    className: 'map-icon map-icon-mark',
    html: `<span class="map-mark map-mark-wide map-mark-${side}"><span class="map-mark-glyph map-mark-code">${code}</span></span>`,
    iconSize: [34, 22],
    iconAnchor: [17, 11],
  }));
}

/** The user's pin. The colour is used only when it is a plain hex or rgb value; anything else falls back to the theme class. */
export function userPinIcon(color: string): L.DivIcon {
  const safe = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\))$/.test(color) ? color : null;
  const key = `pin:${safe ?? 'default'}`;
  return cached(key, () => L.divIcon({
    className: 'map-icon map-user-pin',
    html: `<span class="map-user-pin-body"${safe ? ` style="background:${safe}"` : ''}><span class="map-user-pin-mark">✎</span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  }));
}

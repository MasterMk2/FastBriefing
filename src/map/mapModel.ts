import L from 'leaflet';
import type {
  AIGroup,
  Airbase,
  Drawing,
  DisplaySettings,
  Flight,
  MissionData,
  NavPoint,
  Side,
  SupportAsset,
  TriggerZone,
} from '../types/mission';
import { flightKey } from '../utils/flightKey';
import {
  extendBoundsByMeters,
  getDcsCoordinate,
  isResolvedLatLon,
  resolveEntityPosition,
} from './geometry';
import type { LatLon } from './geometry';

export type CoalitionKey = Side | 'neutral';
type ViewMode = DisplaySettings['viewMode'];

export interface FlightEntry {
  side: CoalitionKey;
  flight: Flight;
  /** flightKey() for blue and red flights; null for neutral (not selectable). */
  key: string | null;
}

export interface CoalitionItem<T> {
  side: CoalitionKey;
  item: T;
}

export interface BullseyeEntry {
  side: Side;
  xy: [number, number];
  latlon: LatLon | null;
}

export interface UnresolvedEntry {
  id: string;
  side: CoalitionKey;
  label: string;
  xy?: [number, number];
}

/**
 * What the map draws, derived from the displayed view. Opposing coalitions are
 * left out in pilot view (D1); threat and enemy groups exist in creator view only.
 */
export interface MapModel {
  flights: FlightEntry[];
  navPoints: CoalitionItem<NavPoint>[];
  airbases: CoalitionItem<Airbase>[];
  support: CoalitionItem<SupportAsset>[];
  bullseyes: BullseyeEntry[];
  /** AI groups of the coalitions other than the displayed one (creator view only). */
  groups: CoalitionItem<AIGroup>[];
  zones: TriggerZone[];
  drawings: Drawing[];
  /** Points that cannot be placed on the map. Shown as a count and a list, never at [0, 0]. */
  unresolved: UnresolvedEntry[];
}

export interface DcsRow {
  id: string;
  side: CoalitionKey;
  kind: 'waypoint' | 'navPoint' | 'support' | 'bullseye' | 'group';
  name: string;
  xy: [number, number];
}

const BULLSEYE_SIDES: readonly Side[] = ['blue', 'red'];
const COALITIONS: readonly CoalitionKey[] = ['blue', 'red', 'neutral'];

/** Whether a coalition's data is shown. Creator view shows all; pilot view shows the displayed side and neutral (D1). */
export function isCoalitionShown(side: CoalitionKey, shown: Side, viewMode: ViewMode): boolean {
  return viewMode === 'creator' || side === shown || side === 'neutral';
}

export function buildMapModel(view: MissionData, shown: Side, viewMode: ViewMode): MapModel {
  const theatre = view.meta.theatre;
  const model: MapModel = {
    flights: [],
    navPoints: [],
    airbases: [],
    support: [],
    bullseyes: [],
    groups: [],
    zones: viewMode === 'creator' ? view.coalitions.blue.zones : [],
    drawings: view.coalitions.blue.drawings,
    unresolved: [],
  };

  for (const side of COALITIONS) {
    if (!isCoalitionShown(side, shown, viewMode)) continue;
    const coalition = view.coalitions[side];

    for (const flight of coalition.flights) {
      model.flights.push({
        side,
        flight,
        key: side === 'neutral' ? null : flightKey(side, flight.groupId),
      });
      for (const waypoint of flight.route) {
        if (!isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) {
          model.unresolved.push({
            id: `wp:${side}:${flight.groupId}:${waypoint.index}`,
            side,
            label: `${flight.callsign || flight.name}: ${waypoint.name}`,
            xy: waypoint.xy,
          });
        }
      }
    }

    for (const navPoint of coalition.navPoints) {
      model.navPoints.push({ side, item: navPoint });
      if (!isResolvedLatLon(navPoint.latlon, navPoint.latlonResolved)) {
        model.unresolved.push({ id: `np:${side}:${navPoint.index}`, side, label: navPoint.name, xy: navPoint.xy });
      }
    }

    for (const airbase of coalition.airbases) {
      model.airbases.push({ side, item: airbase });
      if (!isResolvedLatLon(airbase.latlon, airbase.latlonResolved)) {
        model.unresolved.push({ id: `ab:${side}:${airbase.id}`, side, label: airbase.name || `#${airbase.id}` });
      }
    }

    for (const asset of coalition.support) {
      model.support.push({ side, item: asset });
      if (!resolveEntityPosition(theatre, asset.latlon, asset.latlonResolved, asset.position)) {
        model.unresolved.push({ id: `sp:${side}:${asset.callsign}`, side, label: asset.callsign, xy: asset.position });
      }
    }

    if (side !== 'neutral') {
      const bullseye = coalition.bullseye;
      const resolved = isResolvedLatLon(bullseye.latlon, bullseye.latlonResolved);
      if (BULLSEYE_SIDES.includes(side)) {
        model.bullseyes.push({ side, xy: bullseye.xy, latlon: resolved ? bullseye.latlon : null });
      }
      if (!resolved) {
        model.unresolved.push({ id: `be:${side}`, side, label: `Bullseye`, xy: bullseye.xy });
      }
    }
  }

  if (viewMode === 'creator') {
    for (const side of COALITIONS) {
      if (side === shown) continue;
      for (const group of view.coalitions[side].aiGroups) {
        model.groups.push({ side, item: group });
        if (!resolveEntityPosition(theatre, group.latlon, group.latlonResolved, group.position)) {
          model.unresolved.push({ id: `ai:${side}:${group.type}:${model.groups.length}`, side, label: group.type, xy: group.position });
        }
      }
    }
  }

  return model;
}

/** Rows for the unsupported-map table: every point that has DCS coordinates. */
export function buildDcsRows(model: MapModel): DcsRow[] {
  const rows: DcsRow[] = [];
  for (const { side, flight } of model.flights) {
    for (const waypoint of flight.route) {
      rows.push({
        id: `wp:${side}:${flight.groupId}:${waypoint.index}`,
        side,
        kind: 'waypoint',
        name: `${flight.callsign || flight.name}: ${waypoint.name}`,
        xy: waypoint.xy,
      });
    }
  }
  for (const { side, item } of model.navPoints) {
    rows.push({ id: `np:${side}:${item.index}`, side, kind: 'navPoint', name: item.name, xy: item.xy });
  }
  for (const { side, item } of model.support) {
    rows.push({ id: `sp:${side}:${item.callsign}`, side, kind: 'support', name: item.callsign, xy: item.position });
  }
  for (const entry of model.bullseyes) {
    rows.push({ id: `be:${entry.side}`, side: entry.side, kind: 'bullseye', name: 'Bullseye', xy: entry.xy });
  }
  for (const { side, item } of model.groups) {
    rows.push({ id: `ai:${side}:${item.type}:${rows.length}`, side, kind: 'group', name: item.type, xy: item.position });
  }
  return rows;
}

/** Bounds of everything drawn, for the whole-map fit. Annotations are left out so adding one never moves the view. */
export function collectBounds(model: MapModel, theatre: string): L.LatLngBounds {
  const bounds = L.latLngBounds([]);
  const addDcs = (x: number, y: number) => {
    const coordinate = getDcsCoordinate(theatre, x, y);
    if (coordinate) bounds.extend(coordinate);
  };

  for (const { flight } of model.flights) {
    for (const waypoint of flight.route) {
      if (isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) bounds.extend(waypoint.latlon);
    }
  }
  for (const { item } of model.navPoints) {
    if (isResolvedLatLon(item.latlon, item.latlonResolved)) bounds.extend(item.latlon);
  }
  for (const { item } of model.airbases) {
    if (isResolvedLatLon(item.latlon, item.latlonResolved)) bounds.extend(item.latlon);
  }
  for (const { item } of model.support) {
    const coordinate = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
    if (coordinate) bounds.extend(coordinate);
  }
  for (const entry of model.bullseyes) {
    if (entry.latlon) bounds.extend(entry.latlon);
  }
  for (const { item } of model.groups) {
    const coordinate = resolveEntityPosition(theatre, item.latlon, item.latlonResolved, item.position);
    if (!coordinate) continue;
    bounds.extend(coordinate);
    if (item.threatRange && item.threatRange > 0) extendBoundsByMeters(bounds, coordinate, item.threatRange);
  }
  for (const zone of model.zones) {
    addDcs(zone.xy[0], zone.xy[1]);
  }
  for (const drawing of model.drawings) {
    if (!drawing.visible) continue;
    for (const object of drawing.objects) {
      for (const point of object.points) addDcs(point[0], point[1]);
    }
  }
  return bounds;
}

/** Bounds of one selected flight's resolved route, or null when the key is not in the model. */
export function flightBounds(model: MapModel, key: string): L.LatLngBounds | null {
  const entry = model.flights.find(candidate => candidate.key === key);
  if (!entry) return null;
  const bounds = L.latLngBounds([]);
  for (const waypoint of entry.flight.route) {
    if (isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved)) bounds.extend(waypoint.latlon);
  }
  return bounds.isValid() ? bounds : null;
}
